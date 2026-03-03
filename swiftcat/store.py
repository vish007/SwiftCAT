from __future__ import annotations

from copy import deepcopy

INITIAL_STORE = {
    "messages": {
        "msg-100": {
            "id": "msg-100",
            "type": "MT103",
            "status": "unmatched",
            "amount": 100000,
            "currency": "USD",
            "counterparty": "ALPHA BANK",
            "reference": "REF-ALPHA-01",
            "queue": "Reconciliation",
            "candidate_transactions": [
                {"id": "txn-901", "amount": 100005, "reference": "REF-ALPHA-01", "score": 0.94},
                {"id": "txn-902", "amount": 99500, "reference": "REF-ALPHA-99", "score": 0.68},
            ],
        },
        "msg-700": {
            "id": "msg-700",
            "type": "MT700",
            "status": "unmatched",
            "amount": 300000,
            "currency": "EUR",
            "counterparty": "OMEGA TRADE",
            "reference": "LC-77-RED",
            "queue": "Trade Ops",
            "text": "Soft clause accepted. goods may include restricted dual-use components for sanctioned region.",
            "candidate_transactions": [],
        },
    },
    "message_actions": [],
}

STORE = deepcopy(INITIAL_STORE)


def list_messages():
    return list(STORE["messages"].values())


def get_message(message_id: str):
    return STORE["messages"].get(message_id)


def add_action(message_id: str, user_id: str, action_type: str, details: dict):
    STORE["message_actions"].append(
        {
            "message_id": message_id,
            "user_id": user_id,
            "action_type": action_type,
            "details": details,
        }
    )


def reset_store():
    STORE.clear()
    STORE.update(deepcopy(INITIAL_STORE))
