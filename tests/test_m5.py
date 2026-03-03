import io
import json
from pathlib import Path

from app.db import DB_PATH

if DB_PATH.exists():
    DB_PATH.unlink()

from app.main import application  # noqa: E402


def call_app(path: str, method: str = 'GET', query: str = ''):
    status_headers = {}

    def start_response(status, headers):
        status_headers['status'] = status
        status_headers['headers'] = dict(headers)

    environ = {
        'REQUEST_METHOD': method,
        'PATH_INFO': path,
        'QUERY_STRING': query,
        'wsgi.input': io.BytesIO(b''),
    }
    body = b''.join(application(environ, start_response))
    return status_headers['status'], status_headers['headers'], body


def test_ageing_has_over_30_bucket():
    status, _, body = call_app('/nostro/accounts/1/ageing')
    assert status.startswith('200')
    parsed = json.loads(body)
    assert '31-60' in parsed['buckets']


def test_connector_retry_turns_failed_to_healthy():
    status, _, body = call_app('/integrations/connectors')
    assert status.startswith('200')
    data = json.loads(body)
    treasury = next(c for c in data if c['connector_type'] == 'treasury')
    assert treasury['status'] == 'failed'

    retry_status, _, _ = call_app(f"/integrations/{treasury['id']}/retry", method='POST')
    assert retry_status.startswith('200')

    _, _, after_body = call_app('/integrations/connectors')
    after = json.loads(after_body)
    treasury_after = next(c for c in after if c['connector_type'] == 'treasury')
    assert treasury_after['status'] == 'healthy'
    assert treasury_after['retry_count'] == treasury['retry_count'] + 1


def test_reconcile_module_references_nostro_entries():
    status, _, body = call_app('/reconcile/1/nostro-candidates')
    assert status.startswith('200')
    entries = json.loads(body)['nostro_candidates']
    assert any(e['reference'].startswith('MT940') for e in entries)


def test_bi_export_mock_writes_file():
    _, _, body = call_app('/integrations/connectors')
    connectors = json.loads(body)
    bi = next(c for c in connectors if c['connector_type'] == 'bi_export')
    _, _, retry_body = call_app(f"/integrations/{bi['id']}/retry", method='POST')
    payload = json.loads(retry_body)
    assert Path(payload['result']['file']).exists()
