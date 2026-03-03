from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from urllib.parse import urlparse

from swiftcat.service import (
    ai_draft_action,
    ai_explain_unmatched,
    ai_risk_score,
    ai_suggest_match_candidates,
    business_apply_tolerance,
    business_close_case,
    business_confirm_match,
    business_create_exception,
    business_escalate,
    get_message_api,
    list_messages_api,
    message_actions_api,
    reset_api,
)

ROOT = Path(__file__).parent


class SwiftCatHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        parsed = urlparse(self.path)
        path = parsed.path
        if path == "/":
            self._html(self._render_page("dashboard"))
            return
        if path == "/nostro-ageing":
            self._html(self._render_page("nostro"))
            return
        if path.startswith("/messages/"):
            self._html(self._render_page("message_detail", path.split("/")[-1]))
            return
        if path.startswith("/api/messages/"):
            data, code = get_message_api(path.split("/")[-1])
            self._json(data, code)
            return
        if path == "/api/message-actions":
            data, code = message_actions_api()
            self._json(data, code)
            return
        if path.startswith("/static/"):
            self._static(path)
            return
        self._json({"error": "not found"}, 404)

    def do_POST(self):
        path = urlparse(self.path).path
        payload = self._read_json()
        routes = {
            "/ai/suggest/match-candidates": ai_suggest_match_candidates,
            "/ai/explain/unmatched": ai_explain_unmatched,
            "/ai/risk/score": ai_risk_score,
            "/ai/draft/action": ai_draft_action,
            "/business/confirm-match": business_confirm_match,
            "/business/escalate": business_escalate,
            "/business/create-exception": business_create_exception,
            "/business/apply-tolerance": business_apply_tolerance,
            "/business/close-case": business_close_case,
            "/admin/reset": reset_api,
        }
        handler = routes.get(path)
        if not handler:
            self._json({"error": "not found"}, 404)
            return

        result = handler(payload) if path != "/admin/reset" else handler()
        if isinstance(result, tuple):
            body, code = result
        else:
            body, code = result, 200
        self._json(body, code)

    def _render_page(self, page: str, message_id: str = "msg-100"):
        messages, _ = list_messages_api()
        msg_map = {m["id"]: m for m in messages}
        message = msg_map.get(message_id, messages[0])
        rows = "".join(
            f"<tr><td><a href='/messages/{m['id']}'>{m['id']}</a></td><td>{m['type']}</td><td>{m['status']}</td>"
            + (f"<td><span class='risk-pill' data-risk-message='{m['id']}'>pending</span></td>" if m["type"] == "MT700" else "<td></td>")
            + "</tr>"
            for m in messages
        )
        chips = {
            "dashboard": "<button onclick=\"runInsight('suggest')\">Suggest top match</button>",
            "message_detail": "<button onclick=\"runInsight('explain')\">Explain why unmatched</button><button onclick=\"runInsight('risk')\">Risk score</button>",
            "nostro": "<button onclick=\"runInsight('draft')\">Draft action</button>",
        }[page]
        body = {
            "dashboard": f"<h1>Reconcile Dashboard</h1><section class='insights-panel'><h2>AI Insights</h2><pre id='insights-output'>Run a chip to fetch suggestions.</pre></section><table><tr><th>ID</th><th>Type</th><th>Status</th><th>Risk</th></tr>{rows}</table>",
            "message_detail": f"<h1>Message Detail: {message['id']}</h1><section class='insights-panel'><h2>AI Insights</h2><pre id='insights-output'>Use Explain why unmatched or Risk score.</pre></section><ul><li>Type: {message['type']}</li><li>Status: <span id='message-status'>{message['status']}</span></li><li>Queue: <span id='message-queue'>{message['queue']}</span></li></ul><button onclick='confirmSuggestedMatch()'>Confirm suggested match (audited)</button>",
            "nostro": "<h1>Nostro Ageing</h1><section class='insights-panel'><h2>AI Insights</h2><pre id='insights-output'>Draft actions for ageing items.</pre></section>",
        }[page]
        return f"""<!doctype html><html><head><meta charset='utf-8'><title>SwiftCAT M6</title><link rel='stylesheet' href='/static/app.css'></head>
<body><nav><a href='/'>Reconcile Dashboard</a><a href='/nostro-ageing'>Nostro Ageing</a><a href='/messages/msg-100'>Message Detail</a></nav>
<div class='prompt-chips'>{chips}</div><main>{body}</main>
<aside id='ai-widget'><h3>SwiftCAT AI Assistant</h3><div id='ai-log'></div><input id='ai-input' placeholder='Ask AI assistant'><button onclick='sendChat()'>Send</button></aside>
<script>window.currentPage='{page}';window.messageId='{message['id']}';</script><script src='/static/app.js'></script></body></html>"""

    def _static(self, path: str):
        file = ROOT / path.lstrip("/")
        if not file.exists():
            self._json({"error": "not found"}, 404)
            return
        content = file.read_bytes()
        if file.suffix == ".js":
            ctype = "application/javascript"
        else:
            ctype = "text/css"
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.end_headers()
        self.wfile.write(content)

    def _read_json(self):
        length = int(self.headers.get("Content-Length", 0))
        if not length:
            return {}
        return json.loads(self.rfile.read(length).decode("utf-8"))

    def _json(self, data, code=200):
        body = json.dumps(data).encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def _html(self, content, code=200):
        self.send_response(code)
        self.send_header("Content-Type", "text/html")
        self.end_headers()
        self.wfile.write(content.encode("utf-8"))


def run_server(port: int = 5000):
    server = HTTPServer(("0.0.0.0", port), SwiftCatHandler)
    server.serve_forever()


if __name__ == "__main__":
    run_server(5000)
