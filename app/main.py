from __future__ import annotations

import csv
import io
import json
from urllib.parse import parse_qs

from .db import get_conn, init_db
from .services import get_ageing, reconcile_candidates, retry_connector

init_db()


def _json(data: object, status: str = "200 OK"):
    return status, [("Content-Type", "application/json")], json.dumps(data).encode("utf-8")


def _html(content: str, status: str = "200 OK"):
    return status, [("Content-Type", "text/html; charset=utf-8")], content.encode("utf-8")


def application(environ, start_response):
    method = environ.get("REQUEST_METHOD", "GET")
    path = environ.get("PATH_INFO", "/")
    query = parse_qs(environ.get("QUERY_STRING", ""))

    if path == "/":
        status, headers, body = ("200 OK", [("Content-Type", "text/plain")], b"SwiftCAT M5 running")

    elif path == "/nostro/accounts" and method == "GET":
        conn = get_conn()
        rows = conn.execute(
            "SELECT id, account_no, currency, bank_name, expected_balance, current_balance, (current_balance - expected_balance) AS variance FROM nostro_accounts"
        ).fetchall()
        conn.close()
        status, headers, body = _json([dict(r) for r in rows])

    elif path.startswith("/nostro/accounts/") and path.endswith("/ageing") and method == "GET":
        account_id = int(path.split("/")[3])
        min_amount = float(query["min_amount"][0]) if "min_amount" in query else None
        status, headers, body = _json({"account_id": account_id, "buckets": get_ageing(account_id, min_amount=min_amount)})

    elif path.startswith("/nostro/accounts/") and path.endswith("/ageing/export") and method == "GET":
        account_id = int(path.split("/")[3])
        min_amount = float(query["min_amount"][0]) if "min_amount" in query else None
        data = get_ageing(account_id, min_amount=min_amount)
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["bucket", "entry_id", "value_date", "age_days", "reference", "source", "amount", "matched"])
        for bucket, details in data.items():
            for e in details["entries"]:
                writer.writerow([bucket, e["id"], e["value_date"], e["age_days"], e["reference"], e["source"], e["amount"], e["matched"]])
        status, headers, body = (
            "200 OK",
            [("Content-Type", "text/csv"), ("Content-Disposition", f"attachment; filename=ageing_account_{account_id}.csv")],
            output.getvalue().encode("utf-8"),
        )

    elif path == "/integrations/connectors" and method == "GET":
        conn = get_conn()
        rows = conn.execute(
            """
            SELECT c.id, c.name, c.connector_type, c.status, c.retry_count, c.last_error, c.last_sync_at,
            (SELECT status FROM integration_runs r WHERE r.connector_id = c.id ORDER BY r.id DESC LIMIT 1) AS last_run_status
            FROM integration_connectors c ORDER BY c.id
            """
        ).fetchall()
        conn.close()
        status, headers, body = _json([dict(r) for r in rows])

    elif path.startswith("/integrations/") and path.endswith("/retry") and method == "POST":
        connector_id = int(path.split("/")[2])
        try:
            status, headers, body = _json(retry_connector(connector_id))
        except ValueError:
            status, headers, body = _json({"detail": "Connector not found"}, status="404 NOT FOUND")

    elif path.startswith("/reconcile/") and path.endswith("/nostro-candidates") and method == "GET":
        account_id = int(path.split("/")[2])
        status, headers, body = _json({"account_id": account_id, "nostro_candidates": reconcile_candidates(account_id)})

    elif path == "/ui/nostro" and method == "GET":
        content = """<html><body><h1>Nostro dashboard</h1><div id='app'></div><script>
fetch('/nostro/accounts').then(r=>r.json()).then(d=>{document.getElementById('app').innerHTML='<pre>'+JSON.stringify(d,null,2)+'</pre>'})
</script></body></html>"""
        status, headers, body = _html(content)

    elif path == "/ui/ageing" and method == "GET":
        content = """<html><body><h1>Ageing report builder</h1><button onclick='load()'>Load</button> <a href='/nostro/accounts/1/ageing/export'>Export CSV</a><pre id='r'></pre><script>
function load(){fetch('/nostro/accounts/1/ageing').then(r=>r.json()).then(d=>{document.getElementById('r').textContent=JSON.stringify(d,null,2)})}
load();</script></body></html>"""
        status, headers, body = _html(content)

    elif path == "/ui/integrations" and method == "GET":
        content = """<html><body><h1>Integrations status page</h1><pre id='r'></pre><script>
async function load(){const d=await (await fetch('/integrations/connectors')).json();document.getElementById('r').textContent=JSON.stringify(d,null,2)}
load();</script></body></html>"""
        status, headers, body = _html(content)

    else:
        status, headers, body = _json({"detail": "Not found"}, status="404 NOT FOUND")

    start_response(status, headers)
    return [body]


if __name__ == "__main__":
    from wsgiref.simple_server import make_server

    server = make_server("0.0.0.0", 8000, application)
    print("Serving on http://0.0.0.0:8000")
    server.serve_forever()
