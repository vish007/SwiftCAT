import sqlite3
from contextlib import contextmanager
from datetime import datetime, timedelta
from pathlib import Path

DB_PATH = Path(__file__).parent / "swiftcat.db"


def _conn():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


@contextmanager
def get_conn():
    conn = _conn()
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_conn() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                msg_type TEXT NOT NULL,
                ref TEXT,
                amount REAL NOT NULL,
                currency TEXT NOT NULL,
                value_date TEXT NOT NULL,
                bic TEXT NOT NULL,
                status TEXT NOT NULL DEFAULT 'UNMATCHED',
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS reconciliation_cases (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                type TEXT NOT NULL,
                status TEXT NOT NULL,
                owner TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                closed_at TEXT,
                sla_due_at TEXT,
                left_msg_id INTEGER,
                right_msg_id INTEGER,
                FOREIGN KEY(left_msg_id) REFERENCES messages(id),
                FOREIGN KEY(right_msg_id) REFERENCES messages(id)
            );

            CREATE TABLE IF NOT EXISTS reconciliation_matches (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL,
                msg_id_left INTEGER NOT NULL,
                msg_id_right INTEGER NOT NULL,
                match_confidence REAL NOT NULL,
                tolerance_applied REAL NOT NULL DEFAULT 0,
                decided_by TEXT NOT NULL,
                rationale TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(case_id) REFERENCES reconciliation_cases(id)
            );

            CREATE TABLE IF NOT EXISTS exception_comments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER NOT NULL,
                user_id TEXT NOT NULL,
                comment TEXT NOT NULL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(case_id) REFERENCES reconciliation_cases(id)
            );

            CREATE TABLE IF NOT EXISTS message_actions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                case_id INTEGER,
                action TEXT NOT NULL,
                actor TEXT NOT NULL,
                details TEXT,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY(case_id) REFERENCES reconciliation_cases(id)
            );
            """
        )


def seed_demo_data():
    with get_conn() as conn:
        count = conn.execute("SELECT COUNT(*) c FROM messages").fetchone()["c"]
        if count:
            return
        messages = [
            ("103", "REF-EXACT-1", 1000.0, "USD", "2026-01-10", "BICAAA"),
            ("940", "REF-EXACT-1", 1000.0, "USD", "2026-01-10", "BICBBB"),
            ("202", "REF-FUZZY-1", 250.0, "EUR", "2026-01-11", "BICAAA"),
            ("950", "OTHER-REF", 250.0, "EUR", "2026-01-12", "BICBBB"),
            ("910", "REF-UNMATCHED", 700.0, "GBP", "2026-01-13", "BICAAA"),
            ("950", "REF-TOL-1", 650.0, "GBP", "2026-01-14", "BICBBB"),
            ("700", "LC-SANCTION-01", 50000.0, "USD", "2026-01-15", "BICAAA"),
        ]
        conn.executemany(
            "INSERT INTO messages(msg_type, ref, amount, currency, value_date, bic) VALUES(?,?,?,?,?,?)",
            messages,
        )


def audit(action: str, actor: str, case_id: int | None, details: str, conn: sqlite3.Connection | None = None):
    if conn is not None:
        conn.execute(
            "INSERT INTO message_actions(case_id, action, actor, details) VALUES(?,?,?,?)",
            (case_id, action, actor, details),
        )
        return
    with get_conn() as managed_conn:
        managed_conn.execute(
            "INSERT INTO message_actions(case_id, action, actor, details) VALUES(?,?,?,?)",
            (case_id, action, actor, details),
        )


def create_case(conn: sqlite3.Connection, case_type: str, left_msg_id: int | None = None, right_msg_id: int | None = None, status: str = "OPEN", owner: str | None = None):
    sla_due = (datetime.utcnow() + timedelta(days=2)).isoformat()
    cur = conn.execute(
        "INSERT INTO reconciliation_cases(type,status,owner,sla_due_at,left_msg_id,right_msg_id) VALUES(?,?,?,?,?,?)",
        (case_type, status, owner, sla_due, left_msg_id, right_msg_id),
    )
    return cur.lastrowid
