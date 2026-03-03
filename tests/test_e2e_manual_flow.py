import io
import json
from pathlib import Path

from app import app
from db import DB_PATH, init_db, seed_demo_data


def setup_function():
    if Path(DB_PATH).exists():
        Path(DB_PATH).unlink()
    init_db()
    seed_demo_data()


def request(method, path, payload=None):
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


def test_unmatched_to_manual_match_to_close():
    code, _ = request('POST', '/reconcile/auto-run')
    assert code == 200

    _, unmatched = request('GET', '/reconcile/unmatched')
    assert len(unmatched['items']) >= 1
    case_id = unmatched['items'][0]['id']

    code, _ = request('POST', f'/reconcile/case/{case_id}/confirm-match', {
        'right_msg_id': 4,
        'user_id': 'tester',
        'tolerance': 500.0,
    })
    assert code == 200

    _, case = request('GET', f'/reconcile/case/{case_id}')
    assert case['case']['status'] == 'CLOSED'
