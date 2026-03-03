from __future__ import annotations

import sqlite3
from datetime import date, timedelta
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "swiftcat.db"


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db() -> None:
    conn = get_conn()
    cur = conn.cursor()
    cur.executescript(
        """
        CREATE TABLE IF NOT EXISTS nostro_accounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_no TEXT NOT NULL UNIQUE,
            currency TEXT NOT NULL,
            bank_name TEXT NOT NULL,
            expected_balance REAL NOT NULL,
            current_balance REAL NOT NULL
        );

        CREATE TABLE IF NOT EXISTS nostro_entries (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            account_id INTEGER NOT NULL,
            value_date TEXT NOT NULL,
            amount REAL NOT NULL,
            reference TEXT NOT NULL,
            source TEXT NOT NULL,
            matched INTEGER NOT NULL DEFAULT 0,
            FOREIGN KEY(account_id) REFERENCES nostro_accounts(id)
        );

        CREATE TABLE IF NOT EXISTS integration_connectors (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            connector_type TEXT NOT NULL,
            status TEXT NOT NULL,
            retry_count INTEGER NOT NULL DEFAULT 0,
            last_error TEXT,
            last_sync_at TEXT
        );

        CREATE TABLE IF NOT EXISTS integration_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            connector_id INTEGER NOT NULL,
            status TEXT NOT NULL,
            started_at TEXT NOT NULL,
            ended_at TEXT,
            message TEXT,
            FOREIGN KEY(connector_id) REFERENCES integration_connectors(id)
        );

        CREATE TABLE IF NOT EXISTS case_alerts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL,
            severity TEXT NOT NULL,
            created_at TEXT NOT NULL
        );
        """
    )

    count = cur.execute("SELECT COUNT(*) AS c FROM nostro_accounts").fetchone()["c"]
    if count == 0:
        cur.execute(
            """
            INSERT INTO nostro_accounts(account_no, currency, bank_name, expected_balance, current_balance)
            VALUES (?, ?, ?, ?, ?), (?, ?, ?, ?, ?)
            """,
            (
                "NOSTRO-USD-001",
                "USD",
                "Global Bank A",
                120000.0,
                118500.0,
                "NOSTRO-EUR-007",
                "EUR",
                "Euro Clearhouse",
                98000.0,
                99200.0,
            ),
        )

        acct1 = cur.execute("SELECT id FROM nostro_accounts WHERE account_no='NOSTRO-USD-001'").fetchone()["id"]
        acct2 = cur.execute("SELECT id FROM nostro_accounts WHERE account_no='NOSTRO-EUR-007'").fetchone()["id"]
        today = date.today()
        old = today - timedelta(days=45)
        mid = today - timedelta(days=12)
        cur.execute(
            """
            INSERT INTO nostro_entries(account_id, value_date, amount, reference, source, matched)
            VALUES (?, ?, ?, ?, ?, ?),
                   (?, ?, ?, ?, ?, ?),
                   (?, ?, ?, ?, ?, ?)
            """,
            (
                acct1,
                old.isoformat(),
                -1500.0,
                "MT940/OUT/001",
                "mt940",
                0,
                acct1,
                mid.isoformat(),
                2500.0,
                "MT950/IN/192",
                "mt950",
                1,
                acct2,
                today.isoformat(),
                -800.0,
                "TREASURY/FEE/04",
                "treasury_mock",
                0,
            ),
        )

    cc = cur.execute("SELECT COUNT(*) AS c FROM integration_connectors").fetchone()["c"]
    if cc == 0:
        cur.execute(
            """
            INSERT INTO integration_connectors(name, connector_type, status, retry_count, last_error, last_sync_at)
            VALUES
              ('Treasury/Nostro feed', 'treasury', 'failed', 0, 'Socket timeout', datetime('now', '-2 hours')),
              ('BI export', 'bi_export', 'healthy', 0, NULL, datetime('now', '-1 day')),
              ('Case management', 'case_management', 'healthy', 0, NULL, datetime('now', '-40 minutes'))
            """
        )

    conn.commit()
    conn.close()
