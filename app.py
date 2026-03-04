import json
from datetime import datetime
from urllib.parse import parse_qs
from wsgiref.simple_server import make_server

from db import audit, create_case, get_conn, init_db, seed_demo_data
from matching import LEFT_TYPES, RIGHT_TYPES, find_best_matches
from ai_rules import draft_action, explain_unmatched, score_risk, suggest_match_candidates


def json_response(start_response, status_code, payload):
    body = json.dumps(payload).encode('utf-8')
    start_response(f"{status_code} OK", [('Content-Type', 'application/json'), ('Content-Length', str(len(body)))])
    return [body]


def read_json(environ):
    length = int(environ.get('CONTENT_LENGTH') or 0)
    raw = environ['wsgi.input'].read(length) if length else b'{}'
    return json.loads(raw.decode('utf-8') or '{}')


def parse_path(path):
    parts = [p for p in path.split('/') if p]
    return parts


def dashboard():
    with get_conn() as conn:
        kpis = conn.execute(
            """
            SELECT
              (SELECT COUNT(*) FROM reconciliation_cases) AS total_cases,
              (SELECT COUNT(*) FROM reconciliation_cases WHERE status='OPEN') AS open_cases,
              (SELECT COUNT(*) FROM reconciliation_cases WHERE status='EXCEPTION') AS exceptions,
              (SELECT COUNT(*) FROM messages WHERE status='UNMATCHED') AS unmatched_messages,
              (SELECT COUNT(*) FROM reconciliation_matches) AS matches
            """
        ).fetchone()
    return dict(kpis)


def unmatched(query):
    status = query.get('status', ['OPEN'])[0]
    page = int(query.get('page', ['1'])[0])
    page_size = int(query.get('page_size', ['20'])[0])
    offset = (page - 1) * page_size
    with get_conn() as conn:
        rows = conn.execute(
            """
            SELECT c.*, m.ref, m.amount, m.currency, m.value_date,
                CAST(julianday('now') - julianday(c.created_at) AS INTEGER) AS ageing_days
            FROM reconciliation_cases c
            LEFT JOIN messages m ON m.id = c.left_msg_id
            WHERE c.status = ?
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
            """,
            (status, page_size, offset),
        ).fetchall()
    return {'items': [dict(r) for r in rows], 'page': page}


def auto_run(user_id='system'):
    with get_conn() as conn:
        left = [dict(r) for r in conn.execute(f"SELECT * FROM messages WHERE status='UNMATCHED' AND msg_type IN ({','.join('?' for _ in LEFT_TYPES)})", tuple(LEFT_TYPES)).fetchall()]
        right = [dict(r) for r in conn.execute(f"SELECT * FROM messages WHERE status='UNMATCHED' AND msg_type IN ({','.join('?' for _ in RIGHT_TYPES)})", tuple(RIGHT_TYPES)).fetchall()]
        matches = find_best_matches(left, right)

        for cand in matches:
            case_id = create_case(conn, 'MATCH', cand.msg_id_left, cand.msg_id_right, status='MATCHED')
            conn.execute("UPDATE messages SET status='MATCHED' WHERE id IN (?,?)", (cand.msg_id_left, cand.msg_id_right))
            conn.execute("INSERT INTO reconciliation_matches(case_id,msg_id_left,msg_id_right,match_confidence,tolerance_applied,decided_by,rationale) VALUES(?,?,?,?,?,?,?)", (case_id, cand.msg_id_left, cand.msg_id_right, cand.confidence, 0, user_id, cand.rationale))
            conn.execute("UPDATE reconciliation_cases SET status='CLOSED', closed_at=? WHERE id=?", (datetime.utcnow().isoformat(), case_id))
            audit('AUTO_MATCH', user_id, case_id, cand.rationale, conn)

        matched_left_ids = {m.msg_id_left for m in matches}
        for msg in left:
            if msg['id'] not in matched_left_ids:
                existing = conn.execute("SELECT id FROM reconciliation_cases WHERE left_msg_id=? AND status='OPEN'", (msg['id'],)).fetchone()
                if not existing:
                    case_id = create_case(conn, 'UNMATCHED', msg['id'], status='OPEN')
                    audit('UNMATCHED_CASE_CREATED', user_id, case_id, f"left_msg_id={msg['id']}", conn)

    return {'matches_created': len(matches)}


def confirm_match(case_id, payload):
    with get_conn() as conn:
        case = conn.execute('SELECT * FROM reconciliation_cases WHERE id=?', (case_id,)).fetchone()
        if not case:
            return 404, {'error': 'case not found'}
        left_msg_id = case['left_msg_id']
        left = conn.execute('SELECT * FROM messages WHERE id=?', (left_msg_id,)).fetchone()
        right = conn.execute('SELECT * FROM messages WHERE id=?', (payload['right_msg_id'],)).fetchone()
        if not left or not right:
            return 400, {'error': 'invalid message ids'}
        diff_amount = abs(left['amount'] - right['amount'])
        if diff_amount > payload.get('tolerance', 0):
            return 400, {'error': 'amount difference exceeds tolerance'}
        conn.execute("UPDATE reconciliation_cases SET right_msg_id=?, status='CLOSED', closed_at=? WHERE id=?", (payload['right_msg_id'], datetime.utcnow().isoformat(), case_id))
        conn.execute("UPDATE messages SET status='MATCHED' WHERE id IN (?,?)", (left_msg_id, payload['right_msg_id']))
        confidence = 0.95 if diff_amount == 0 else 0.75
        conn.execute("INSERT INTO reconciliation_matches(case_id,msg_id_left,msg_id_right,match_confidence,tolerance_applied,decided_by,rationale) VALUES(?,?,?,?,?,?,?)", (case_id, left_msg_id, payload['right_msg_id'], confidence, payload.get('tolerance', 0), payload['user_id'], 'manual confirmation'))
    audit('MANUAL_MATCH_CONFIRMED', payload['user_id'], case_id, f"right_msg_id={payload['right_msg_id']};tolerance={payload.get('tolerance', 0)}")
    return 200, {'case_id': case_id, 'status': 'CLOSED'}


def create_exception(case_id, payload):
    with get_conn() as conn:
        case = conn.execute('SELECT id FROM reconciliation_cases WHERE id=?', (case_id,)).fetchone()
        if not case:
            return 404, {'error': 'case not found'}
        conn.execute("UPDATE reconciliation_cases SET status='EXCEPTION' WHERE id=?", (case_id,))
    audit('EXCEPTION_CREATED', payload['user_id'], case_id, payload['reason'])
    return 200, {'case_id': case_id, 'status': 'EXCEPTION'}


def assign(case_id, payload):
    with get_conn() as conn:
        conn.execute("UPDATE reconciliation_cases SET owner=? WHERE id=?", (payload['owner'], case_id))
    audit('CASE_ASSIGNED', payload['user_id'], case_id, f"owner={payload['owner']}")
    return {'case_id': case_id, 'owner': payload['owner']}


def comment(case_id, payload):
    with get_conn() as conn:
        conn.execute("INSERT INTO exception_comments(case_id,user_id,comment) VALUES(?,?,?)", (case_id, payload['user_id'], payload['comment']))
    audit('EXCEPTION_COMMENTED', payload['user_id'], case_id, payload['comment'])
    return {'case_id': case_id, 'commented': True}


def close(case_id, payload):
    with get_conn() as conn:
        conn.execute("UPDATE reconciliation_cases SET status='CLOSED', closed_at=? WHERE id=?", (datetime.utcnow().isoformat(), case_id))
    audit('CASE_CLOSED', payload['user_id'], case_id, 'closed by user')
    return {'case_id': case_id, 'status': 'CLOSED'}


def get_case(case_id):
    with get_conn() as conn:
        case = conn.execute("SELECT * FROM reconciliation_cases WHERE id=?", (case_id,)).fetchone()
        if not case:
            return None
        comments = conn.execute("SELECT * FROM exception_comments WHERE case_id=? ORDER BY created_at", (case_id,)).fetchall()
        left = conn.execute("SELECT * FROM messages WHERE id=?", (case['left_msg_id'],)).fetchone() if case['left_msg_id'] else None
        right = conn.execute("SELECT * FROM messages WHERE id=?", (case['right_msg_id'],)).fetchone() if case['right_msg_id'] else None
    return {'case': dict(case), 'left': dict(left) if left else None, 'right': dict(right) if right else None, 'comments': [dict(c) for c in comments]}


def render_index():
    return render_static('static/index.html')




def render_static(path: str):
    with open(path, 'rb') as f:
        return f.read()


def ai_log(case_id: int | None, action: str, details: str):
    audit(action, 'swiftcat_ai', case_id, details)
def app(environ, start_response):
    init_db()
    seed_demo_data()
    method = environ['REQUEST_METHOD']
    path = environ.get('PATH_INFO', '/')
    query = parse_qs(environ.get('QUERY_STRING', ''))
    parts = parse_path(path)

    if method == 'GET' and path == '/':
        body = render_index()
        start_response('200 OK', [('Content-Type', 'text/html; charset=utf-8')])
        return [body]
    if method == 'GET' and path == '/reconcile/dashboard':
        return json_response(start_response, 200, dashboard())
    if method == 'GET' and path == '/reconcile/unmatched':
        return json_response(start_response, 200, unmatched(query))
    if method == 'POST' and path == '/reconcile/auto-run':
        return json_response(start_response, 200, auto_run())
    if len(parts) == 4 and parts[:2] == ['reconcile', 'case']:
        case_id = int(parts[2])
        action = parts[3]
        if method == 'GET' and action.isdigit():
            pass
    if len(parts) == 3 and parts[:2] == ['reconcile', 'case'] and method == 'GET':
        case = get_case(int(parts[2]))
        if not case:
            return json_response(start_response, 404, {'error': 'case not found'})
        return json_response(start_response, 200, case)
    if method == 'GET' and path == '/message':
        body = render_static('static/message.html')
        start_response('200 OK', [('Content-Type', 'text/html; charset=utf-8')])
        return [body]
    if method == 'GET' and path == '/nostro-ageing':
        body = render_static('static/nostro_ageing.html')
        start_response('200 OK', [('Content-Type', 'text/html; charset=utf-8')])
        return [body]
    if method == 'GET' and path.startswith('/static/'):
        file_path = path.lstrip('/')
        content_type = 'text/plain'
        if file_path.endswith('.js'):
            content_type = 'application/javascript'
        elif file_path.endswith('.html'):
            content_type = 'text/html; charset=utf-8'
        elif file_path.endswith('.css'):
            content_type = 'text/css'
        body = render_static(file_path)
        start_response('200 OK', [('Content-Type', content_type)])
        return [body]

    if method == 'POST' and path == '/ai/suggest/match-candidates':
        payload = read_json(environ)
        response = suggest_match_candidates(int(payload.get('case_id', 0)))
        ai_log(response.get('case_id'), 'AI_SUGGEST_MATCH', json.dumps(response))
        return json_response(start_response, 200, response)
    if method == 'POST' and path == '/ai/explain/unmatched':
        payload = read_json(environ)
        response = explain_unmatched(int(payload.get('case_id', 0)))
        ai_log(response.get('case_id'), 'AI_EXPLAIN_UNMATCHED', response['explanation'])
        return json_response(start_response, 200, response)
    if method == 'POST' and path == '/ai/risk/score':
        payload = read_json(environ)
        response = score_risk(payload)
        ai_log(None, 'AI_RISK_SCORE', json.dumps(response))
        return json_response(start_response, 200, response)
    if method == 'POST' and path == '/ai/draft/action':
        payload = read_json(environ)
        response = draft_action(payload)
        ai_log(int(payload.get('case_id', 0) or 0), 'AI_DRAFT_ACTION', response['rationale'])
        return json_response(start_response, 200, response)

    if len(parts) == 4 and parts[:2] == ['reconcile', 'case'] and method == 'POST':
        case_id = int(parts[2])
        payload = read_json(environ)
        action = parts[3]
        if action == 'confirm-match':
            status, resp = confirm_match(case_id, payload)
            return json_response(start_response, status, resp)
        if action == 'create-exception':
            status, resp = create_exception(case_id, payload)
            return json_response(start_response, status, resp)
        if action == 'assign':
            return json_response(start_response, 200, assign(case_id, payload))
        if action == 'comment':
            return json_response(start_response, 200, comment(case_id, payload))
        if action == 'close':
            return json_response(start_response, 200, close(case_id, payload))

    return json_response(start_response, 404, {'error': 'not found'})


if __name__ == '__main__':
    init_db()
    seed_demo_data()
    with make_server('0.0.0.0', 8000, app) as httpd:
        print('Serving on 8000...')
        httpd.serve_forever()
