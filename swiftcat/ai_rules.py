from __future__ import annotations

from dataclasses import dataclass

SANCTIONS_KEYWORDS = {"sanctioned", "restricted", "embargo", "blocked"}
SOFT_CLAUSE_KEYWORDS = {"soft clause", "waivable", "discretionary"}


@dataclass
class MatchSuggestion:
    transaction_id: str
    score: float
    rationale: str


def suggest_match_candidates(payload: dict) -> dict:
    message = payload.get("message", {})
    candidates = message.get("candidate_transactions", [])
    if not candidates:
        return {"suggestions": [], "rationale": "No candidate transactions available."}

    ranked = sorted(candidates, key=lambda x: x.get("score", 0), reverse=True)
    top = ranked[0]
    rationale = (
        f"Highest deterministic score {top['score']:.2f} based on amount/reference proximity "
        f"for {message.get('id', 'message')}."
    )
    return {
        "suggestions": [
            MatchSuggestion(
                transaction_id=top["id"],
                score=top.get("score", 0),
                rationale=rationale,
            ).__dict__
        ],
        "rationale": rationale,
    }


def explain_unmatched(payload: dict) -> dict:
    message = payload.get("message", {})
    candidates = message.get("candidate_transactions", [])
    if not candidates:
        return {
            "explanation": "No ledger candidates share amount/reference features. Message remains unmatched.",
            "recommended_next_step": "Escalate to exception queue.",
        }
    best = max(candidates, key=lambda c: c.get("score", 0))
    if best.get("score", 0) < 0.9:
        explanation = (
            f"Best candidate {best['id']} scored {best['score']:.2f}, below 0.90 confidence threshold."
        )
    else:
        explanation = f"Candidate {best['id']} is close but missing confirmation metadata."
    return {
        "explanation": explanation,
        "recommended_next_step": "Apply tolerance or request confirmation.",
    }


def risk_score(payload: dict) -> dict:
    message = payload.get("message", {})
    text = message.get("text", "").lower()
    triggered = []

    if message.get("type") == "MT700":
        triggered.append("Category-7 Letter of Credit")
    if any(keyword in text for keyword in SANCTIONS_KEYWORDS):
        triggered.append("Sanctions keyword detected")
    if any(keyword in text for keyword in SOFT_CLAUSE_KEYWORDS):
        triggered.append("Soft clause language detected")

    score = min(100, 20 * len(triggered))
    recommended_queue = "Compliance" if score >= 40 else "Trade Ops"

    return {
        "risk_score": score,
        "triggered_factors": triggered,
        "recommended_queue": recommended_queue,
        "notes": "Deterministic risk score for Category-7 demo.",
    }


def draft_action(payload: dict) -> dict:
    action = payload.get("action", "escalate")
    message = payload.get("message", {})

    if action == "confirm_match":
        suggestions = suggest_match_candidates({"message": message})
        best = suggestions["suggestions"][0] if suggestions["suggestions"] else None
        return {
            "proposed_action": "confirm_match",
            "payload": {
                "message_id": message.get("id"),
                "transaction_id": best["transaction_id"] if best else None,
            },
            "rationale": suggestions["rationale"],
        }

    risk = risk_score({"message": message})
    return {
        "proposed_action": "escalate",
        "payload": {
            "message_id": message.get("id"),
            "queue": risk["recommended_queue"],
        },
        "rationale": f"Escalate due to risk factors: {', '.join(risk['triggered_factors']) or 'none'}.",
    }
