import io
import json
from pathlib import Path

from db import DB_PATH, get_conn, init_db, seed_demo_data
from ai_rules import explain_unmatched, score_risk, suggest_match_candidates
import importlib.util

_app_spec = importlib.util.spec_from_file_location('swiftcat_wsgi_app', Path(__file__).resolve().parents[1] / 'app.py')
_app_module = importlib.util.module_from_spec(_app_spec)
assert _app_spec and _app_spec.loader
_app_spec.loader.exec_module(_app_module)
app = _app_module.app


def setup_function():
    if Path(DB_PATH).exists():
        Path(DB_PATH).unlink()
    init_db()
    seed_demo_data()


def _request(method, path, payload=None):
    body = json.dumps(payload).encode() if payload is not None else b''
    status_holder = {}

    def start_response(status, headers):
        status_holder['code'] = int(status.split()[0])

    environ = {
        'REQUEST_METHOD': method,
        'PATH_INFO': path,
        'QUERY_STRING': '',
        'CONTENT_LENGTH': str(len(body)),
        'wsgi.input': io.BytesIO(body),
    }
    response = b''.join(app(environ, start_response))
    return status_holder['code'], json.loads(response.decode())


def test_suggest_match_candidates_returns_tolerance_candidate():
    _request('POST', '/reconcile/auto-run')
    _, unmatched = _request('GET', '/reconcile/unmatched')
    case_id = unmatched['items'][0]['id']

    result = suggest_match_candidates(case_id)
    assert result['suggestions']
    assert result['suggestions'][0]['confidence'] >= 0.5


def test_explain_unmatched_mentions_manual_confirmation():
    _request('POST', '/reconcile/auto-run')
    _, unmatched = _request('GET', '/reconcile/unmatched')
    case_id = unmatched['items'][0]['id']

    result = explain_unmatched(case_id)
    assert 'manual confirmation' in result['explanation']


def test_mt700_risk_scoring_flags_compliance_queue():
    result = score_risk({'mt_type': '700', 'text': 'SDN watchlist if possible transhipment allowed'})
    assert result['queue'] == 'Compliance'
    assert result['risk_score'] >= 60


def test_e2e_unmatched_ai_explain_to_tolerance_close_case():
    _request('POST', '/reconcile/auto-run')
    _, unmatched = _request('GET', '/reconcile/unmatched')
    case_id = unmatched['items'][0]['id']

    code, explain = _request('POST', '/ai/explain/unmatched', {'case_id': case_id})
    assert code == 200
    assert explain['case_id'] == case_id

    code, draft = _request('POST', '/ai/draft/action', {'case_id': case_id, 'action_type': 'confirm-match', 'user_id': 'tester'})
    assert code == 200

    action = draft['proposed_action']
    code, _ = _request(action['method'], action['endpoint'], action['payload'])
    assert code == 200

    _, case = _request('GET', f'/reconcile/case/{case_id}')
    assert case['case']['status'] == 'CLOSED'

    with get_conn() as conn:
      ai_actions = conn.execute("SELECT * FROM message_actions WHERE actor='swiftcat_ai' ORDER BY id DESC").fetchall()
    assert ai_actions
