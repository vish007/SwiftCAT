from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime
from pathlib import Path

from .db import get_conn

EXPORT_DIR = Path(__file__).resolve().parent.parent / "exports"


def age_in_days(value_date: str) -> int:
    dt = date.fromisoformat(value_date)
    return (date.today() - dt).days


def get_ageing(account_id: int, min_amount: float | None = None) -> dict:
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, value_date, amount, reference, source, matched FROM nostro_entries WHERE account_id = ?",
        (account_id,),
    ).fetchall()
    conn.close()

    buckets = defaultdict(lambda: {"count": 0, "total": 0.0, "entries": []})
    for row in rows:
        amount = float(row["amount"])
        if min_amount is not None and abs(amount) < min_amount:
            continue

        age = age_in_days(row["value_date"])
        if age <= 7:
            key = "0-7"
        elif age <= 30:
            key = "8-30"
        elif age <= 60:
            key = "31-60"
        else:
            key = "61+"

        buckets[key]["count"] += 1
        buckets[key]["total"] += amount
        buckets[key]["entries"].append(
            {
                "id": row["id"],
                "age_days": age,
                "value_date": row["value_date"],
                "amount": amount,
                "reference": row["reference"],
                "source": row["source"],
                "matched": bool(row["matched"]),
            }
        )

    return dict(buckets)


def run_treasury_feed(connector_id: int) -> dict:
    conn = get_conn()
    conn.execute(
        "INSERT INTO integration_runs(connector_id, status, started_at, ended_at, message) VALUES (?, 'success', datetime('now'), datetime('now'), ?)",
        (connector_id, "Treasury mock sync completed"),
    )
    conn.execute(
        "UPDATE integration_connectors SET status='healthy', last_error=NULL, last_sync_at=datetime('now') WHERE id=?",
        (connector_id,),
    )
    conn.commit()
    conn.close()
    return {"message": "Treasury mock sync completed"}


def run_bi_export(connector_id: int) -> dict:
    EXPORT_DIR.mkdir(exist_ok=True)
    filename = EXPORT_DIR / f"bi_export_{datetime.utcnow().strftime('%Y%m%d%H%M%S')}.txt"
    filename.write_text("mock-bi-export\nstatus=ok\n", encoding="utf-8")

    conn = get_conn()
    conn.execute(
        "INSERT INTO integration_runs(connector_id, status, started_at, ended_at, message) VALUES (?, 'success', datetime('now'), datetime('now'), ?)",
        (connector_id, f"Wrote export file {filename.name}"),
    )
    conn.execute(
        "UPDATE integration_connectors SET status='healthy', last_error=NULL, last_sync_at=datetime('now') WHERE id=?",
        (connector_id,),
    )
    conn.commit()
    conn.close()
    return {"message": f"Wrote export file {filename.name}", "file": str(filename)}


def run_case_management(connector_id: int) -> dict:
    conn = get_conn()
    conn.execute(
        "INSERT INTO case_alerts(title, severity, created_at) VALUES ('Unmatched Nostro entry', 'medium', datetime('now'))"
    )
    conn.execute(
        "INSERT INTO integration_runs(connector_id, status, started_at, ended_at, message) VALUES (?, 'success', datetime('now'), datetime('now'), ?)",
        (connector_id, "Pushed alerts to case management mock"),
    )
    conn.execute(
        "UPDATE integration_connectors SET status='healthy', last_error=NULL, last_sync_at=datetime('now') WHERE id=?",
        (connector_id,),
    )
    conn.commit()
    conn.close()
    return {"message": "Pushed alerts to case management mock"}


def retry_connector(connector_id: int) -> dict:
    conn = get_conn()
    row = conn.execute(
        "SELECT id, name, connector_type, retry_count FROM integration_connectors WHERE id = ?",
        (connector_id,),
    ).fetchone()
    conn.close()
    if row is None:
        raise ValueError("Connector not found")

    conn = get_conn()
    conn.execute(
        "UPDATE integration_connectors SET retry_count = retry_count + 1 WHERE id = ?",
        (connector_id,),
    )
    conn.commit()
    conn.close()

    if row["connector_type"] == "treasury":
        result = run_treasury_feed(connector_id)
    elif row["connector_type"] == "bi_export":
        result = run_bi_export(connector_id)
    else:
        result = run_case_management(connector_id)

    return {"connector_id": connector_id, "result": result}


def reconcile_candidates(account_id: int) -> list[dict]:
    conn = get_conn()
    rows = conn.execute(
        "SELECT id, reference, amount, value_date FROM nostro_entries WHERE account_id = ? AND matched = 0 ORDER BY value_date",
        (account_id,),
    ).fetchall()
    conn.close()
    return [dict(r) for r in rows]
