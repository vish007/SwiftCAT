from __future__ import annotations

from dataclasses import asdict, dataclass
from datetime import date

from db import get_conn

SANCTIONS_KEYWORDS = {"sanction", "embargo", "restricted", "sdn", "watchlist"}
SOFT_CLAUSE_KEYWORDS = {"if possible", "best effort", "where available", "subject to"}


@dataclass
class MatchSuggestion:
    linked_message_id: int
    confidence: float
    rationale: str


def _days_between(a: str, b: str) -> int:
    return abs((date.fromisoformat(a) - date.fromisoformat(b)).days)


def suggest_match_candidates(case_id: int) -> dict:
    with get_conn() as conn:
        case = conn.execute("SELECT * FROM reconciliation_cases WHERE id=?", (case_id,)).fetchone()
        if not case or not case["left_msg_id"]:
            return {"case_id": case_id, "suggestions": []}
        left = conn.execute("SELECT * FROM messages WHERE id=?", (case["left_msg_id"],)).fetchone()
        rights = conn.execute(
            "SELECT * FROM messages WHERE status='UNMATCHED' AND msg_type IN ('940','950') AND id != ?",
            (left["id"],),
        ).fetchall()

    suggestions: list[MatchSuggestion] = []
    for right in rights:
        if left["currency"] != right["currency"]:
            continue
        if left["amount"] == right["amount"] and left["ref"] == right["ref"]:
            suggestions.append(MatchSuggestion(right["id"], 0.99, "Exact ref+amount+currency"))
            continue

        amount_gap = abs(left["amount"] - right["amount"])
        day_gap = _days_between(left["value_date"], right["value_date"])
        if amount_gap <= 500 and day_gap <= 2:
            score = round(max(0.5, 0.9 - (amount_gap / 1000) - (day_gap * 0.05)), 2)
            suggestions.append(
                MatchSuggestion(
                    right["id"],
                    score,
                    f"Close amount gap ({amount_gap:.2f}) and value date window ({day_gap}d)",
                )
            )

    suggestions.sort(key=lambda s: s.confidence, reverse=True)
    return {"case_id": case_id, "suggestions": [asdict(s) for s in suggestions[:3]]}


def explain_unmatched(case_id: int) -> dict:
    with get_conn() as conn:
        case = conn.execute("SELECT * FROM reconciliation_cases WHERE id=?", (case_id,)).fetchone()
        if not case or not case["left_msg_id"]:
            return {"case_id": case_id, "explanation": "No case/message context found."}
        left = conn.execute("SELECT * FROM messages WHERE id=?", (case["left_msg_id"],)).fetchone()
        candidate_count = conn.execute(
            "SELECT COUNT(*) c FROM messages WHERE status='UNMATCHED' AND msg_type IN ('940','950') AND currency=?",
            (left["currency"],),
        ).fetchone()["c"]

    explanation = (
        f"Case {case_id} remains unmatched because no statement-side message met strict match criteria "
        f"for reference '{left['ref']}' and amount {left['amount']} {left['currency']}. "
        f"{candidate_count} unmatched statement messages exist in the same currency; "
        "a tolerance-based manual confirmation may be required."
    )
    factors = [
        "reference mismatch",
        "exact amount not found" if candidate_count else "no same-currency candidates",
        "requires human confirmation before settlement impact",
    ]
    return {"case_id": case_id, "explanation": explanation, "factors": factors}


def score_risk(payload: dict) -> dict:
    text = (payload.get("text") or "").lower()
    mt_type = payload.get("mt_type", "")

    factors: list[str] = []
    score = 0

    if mt_type == "700":
        score += 30
        factors.append("Category-7 LC baseline")

    if any(word in text for word in SANCTIONS_KEYWORDS):
        score += 45
        factors.append("Sanctions keyword hit")

    if any(word in text for word in SOFT_CLAUSE_KEYWORDS):
        score += 20
        factors.append("Soft clause language")

    score = min(score, 100)
    queue = "Compliance" if score >= 60 else "Operations"
    note = "Route to Compliance queue" if queue == "Compliance" else "No elevated LC sanctions signal"

    return {"risk_score": score, "queue": queue, "factors": factors, "note": note}


def draft_action(payload: dict) -> dict:
    action_type = payload.get("action_type", "confirm-match")
    case_id = int(payload.get("case_id", 0))
    user_id = payload.get("user_id", "ui-user")

    if action_type == "confirm-match":
        suggestion = suggest_match_candidates(case_id)
        top = suggestion["suggestions"][0] if suggestion["suggestions"] else None
        if not top:
            return {
                "proposed_action": {
                    "endpoint": f"/reconcile/case/{case_id}/create-exception",
                    "method": "POST",
                    "payload": {"user_id": user_id, "reason": "no viable AI match candidate"},
                },
                "rationale": "No robust match candidates; escalate as exception.",
            }
        return {
            "proposed_action": {
                "endpoint": f"/reconcile/case/{case_id}/confirm-match",
                "method": "POST",
                "payload": {
                    "right_msg_id": top["linked_message_id"],
                    "user_id": user_id,
                    "tolerance": 500.0,
                },
            },
            "rationale": f"Proposed tolerance confirmation using candidate #{top['linked_message_id']} ({top['rationale']}).",
        }

    return {
        "proposed_action": {
            "endpoint": f"/reconcile/case/{case_id}/create-exception",
            "method": "POST",
            "payload": {"user_id": user_id, "reason": "manual review requested"},
        },
        "rationale": "Fallback route to exception workflow.",
    }
