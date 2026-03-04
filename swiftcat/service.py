from __future__ import annotations

from datetime import datetime, timezone

from swiftcat.ai_rules import draft_action, explain_unmatched, risk_score, suggest_match_candidates
from swiftcat.store import STORE, add_action, get_message, list_messages, reset_store


def ai_suggest_match_candidates(payload: dict):
    return suggest_match_candidates(payload)


def ai_explain_unmatched(payload: dict):
    return explain_unmatched(payload)


def ai_risk_score(payload: dict):
    return risk_score(payload)


def ai_draft_action(payload: dict):
    return draft_action(payload)


def business_confirm_match(payload: dict):
    message = get_message(payload["message_id"])
    if not message:
        return {"error": "Message not found"}, 404
    message["status"] = "matched"
    message["matched_transaction_id"] = payload.get("transaction_id")
    _audit_ai(payload)
    add_action(payload["message_id"], payload.get("user_id", "analyst"), "confirm_match", {"transaction_id": payload.get("transaction_id")})
    return {"status": "ok", "message": message}, 200


def business_escalate(payload: dict):
    message = get_message(payload["message_id"])
    if not message:
        return {"error": "Message not found"}, 404
    message["queue"] = payload.get("queue", "Compliance")
    message["status"] = "escalated"
    _audit_ai(payload)
    add_action(payload["message_id"], payload.get("user_id", "analyst"), "escalate", {"queue": message["queue"]})
    return {"status": "ok", "message": message}, 200


def business_create_exception(payload: dict):
    message = get_message(payload["message_id"])
    if not message:
        return {"error": "Message not found"}, 404
    message["status"] = "exception"
    _audit_ai(payload)
    add_action(payload["message_id"], payload.get("user_id", "analyst"), "create_exception", {"reason": payload.get("reason", "Manual review")})
    return {"status": "ok", "message": message}, 200


def business_apply_tolerance(payload: dict):
    message = get_message(payload["message_id"])
    if not message:
        return {"error": "Message not found"}, 404
    message["tolerance_applied"] = payload.get("tolerance", 0)
    message["status"] = "ready_to_close"
    add_action(payload["message_id"], payload.get("user_id", "analyst"), "apply_tolerance", {"tolerance": payload.get("tolerance", 0)})
    return {"status": "ok", "message": message}, 200


def business_close_case(payload: dict):
    message = get_message(payload["message_id"])
    if not message:
        return {"error": "Message not found"}, 404
    message["status"] = "closed"
    add_action(payload["message_id"], payload.get("user_id", "analyst"), "close_case", {"closed_at": datetime.now(timezone.utc).isoformat()})
    return {"status": "ok", "message": message}, 200


def get_message_api(message_id: str):
    message = get_message(message_id)
    if not message:
        return {"error": "Message not found"}, 404
    return message, 200


def message_actions_api():
    return STORE["message_actions"], 200


def list_messages_api():
    return list_messages(), 200


def reset_api():
    reset_store()
    return {"status": "ok"}, 200


def _audit_ai(payload: dict):
    if payload.get("ai_rationale"):
        add_action(payload["message_id"], "swiftcat_ai", "ai_rationale", {"rationale": payload["ai_rationale"]})
