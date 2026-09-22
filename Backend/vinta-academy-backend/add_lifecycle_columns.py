"""
Additive migration — billing relations, session lifecycle, billing toggles.

Adds the columns introduced by:

  * Teacher.email / Teacher.status                     (teacher profile)
  * AcademySettings billing-rule toggles (6 of them)   (per-academy edge cases)
  * Session lifecycle + free-session + cancel reason   ("a class does not exist
                                                        until it starts")
  * SessionStudent rebuild                             ("false until true")

WHY A SCRIPT AND NOT ALEMBIC
    `migrations/versions/` is stale — it does not even contain `payout_records`,
    and the running schema comes from `db.create_all()`. `create_all()` creates
    missing *tables* but never adds a missing *column*, so every new column
    needs an explicit ALTER. This follows the same idempotent pattern as
    `fix_db.py`, but unlike that script it resolves the database from
    `DATABASE_URL` instead of hardcoding a filename — `fix_db.py` points at
    `vinta_school_dev.db` while the app actually opens `vinta_dev.db`, so it has
    been patching a file nothing reads.

IDEMPOTENT — safe to run repeatedly. Prints exactly what it changed.
Run from anywhere:   py add_lifecycle_columns.py
"""

import os
import sqlite3
import sys
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))

# ----------------------------------------------------------------------------
# Columns to add: (table, column, sqlite column definition)
# ----------------------------------------------------------------------------
NEW_COLUMNS = [
    # ── teachers ──────────────────────────────────────────────────────────
    # email is nullable in the DB so existing rows survive; the API layer
    # enforces it as required + format-valid + unique per academy.
    ("teachers", "email", "VARCHAR(255)"),
    ("teachers", "status", "VARCHAR(8) NOT NULL DEFAULT 'ACTIVE'"),

    # ── academy_settings — Billing Rules toggles ──────────────────────────
    # Defaults are the documented policy for an academy that never opens
    # Settings. server_default here matches the model's server_default.
    ("academy_settings", "absence_consumes_credit",
     "BOOLEAN NOT NULL DEFAULT 1"),
    ("academy_settings", "count_gap_sessions",
     "BOOLEAN NOT NULL DEFAULT 0"),
    ("academy_settings", "restore_credits_on_cancellation",
     "BOOLEAN NOT NULL DEFAULT 0"),
    ("academy_settings", "free_session_auto_present",
     "BOOLEAN NOT NULL DEFAULT 1"),
    ("academy_settings", "share_credits_across_groups",
     "BOOLEAN NOT NULL DEFAULT 0"),
    ("academy_settings", "early_payment_on_extra_sessions",
     "BOOLEAN NOT NULL DEFAULT 1"),

    # ── sessions — lifecycle ──────────────────────────────────────────────
    ("sessions", "actual_start_time", "DATETIME"),
    ("sessions", "actual_end_time", "DATETIME"),
    ("sessions", "started_by_staff_id", "VARCHAR(36)"),
    ("sessions", "ended_by_staff_id", "VARCHAR(36)"),
    ("sessions", "is_free_session", "BOOLEAN NOT NULL DEFAULT 0"),
    ("sessions", "cancelled_reason", "VARCHAR(20)"),
]

# ----------------------------------------------------------------------------
# Indexes / constraints that ALTER TABLE cannot express
# ----------------------------------------------------------------------------
NEW_INDEXES = [
    (
        "uq_teacher_email_per_academy",
        "CREATE UNIQUE INDEX IF NOT EXISTS uq_teacher_email_per_academy "
        "ON teachers (academy_id, email)",
        "teachers",
        "email",
    ),
]

# ----------------------------------------------------------------------------
# session_students needs a rebuild, not an ALTER.
#
#   * `status` shipped defaulting to 'PRESENT' while `is_present` defaulted to
#     0 — every auto-created row was simultaneously absent and present.
#   * `payment_status` stored a hardcoded 'paid' that nobody computed. Whether a
#     student has paid is owned by their subscription; a second copy on this row
#     could only ever drift from it, so the column is gone.
#
# SQLite cannot change a column default or drop a column, so the table is
# rebuilt. Rows are COPIED, and each row's status is re-derived from
# `is_present` so the two columns agree afterwards.
# ----------------------------------------------------------------------------
SESSION_STUDENTS_NEW = """
    CREATE TABLE session_students__new (
        id VARCHAR(36) NOT NULL,
        session_id VARCHAR(36) NOT NULL,
        student_id VARCHAR(36) NOT NULL,
        is_present BOOLEAN,
        checked_in_at DATETIME,
        checked_out_at DATETIME,
        checked_in_by VARCHAR(36),
        status VARCHAR(20) NOT NULL DEFAULT 'ABSENT',
        is_group_swap BOOLEAN NOT NULL DEFAULT 0,
        timestamp DATETIME,
        created_at DATETIME,
        PRIMARY KEY (id),
        FOREIGN KEY(session_id) REFERENCES sessions (id),
        FOREIGN KEY(student_id) REFERENCES students (id),
        FOREIGN KEY(checked_in_by) REFERENCES users (id)
    )
"""


def resolve_db_path() -> str:
    """Resolve the SQLite file the app actually opens, from DATABASE_URL."""
    # Prefer an explicitly-set env var, else read backend/.env
    url = os.environ.get("DATABASE_URL")
    if not url:
        env_path = os.path.join(HERE, ".env")
        if os.path.exists(env_path):
            with open(env_path, encoding="utf-8", errors="replace") as fh:
                for line in fh:
                    line = line.strip()
                    if line.startswith("DATABASE_URL="):
                        url = line.split("=", 1)[1].strip().strip('"').strip("'")
                        break

    if not url:
        print("FATAL: no DATABASE_URL found in environment or backend/.env")
        sys.exit(1)

    if not url.startswith("sqlite"):
        print(f"FATAL: this migration only handles SQLite. DATABASE_URL={url}")
        sys.exit(1)

    parsed = urlparse(url)
    if parsed.netloc and parsed.netloc != "":
        return parsed.netloc          # sqlite:////abs/path.db
    name = parsed.path.lstrip("/")     # sqlite:///vinta_dev.db -> vinta_dev.db
    # Flask resolves a relative SQLite path against the app's instance folder.
    return os.path.join(HERE, "instance", os.path.basename(name))


def main() -> None:
    db_path = resolve_db_path()
    print(f"Database: {db_path}")

    if not os.path.exists(db_path):
        print("FATAL: database file not found.")
        sys.exit(1)

    conn = sqlite3.connect(db_path)
    cur = conn.cursor()

    # --- 1. columns ---------------------------------------------------------
    print("\n-- columns --")
    added = 0
    for table, column, definition in NEW_COLUMNS:
        cur.execute(f"PRAGMA table_info({table})")
        existing = {row[1] for row in cur.fetchall()}
        if not existing:
            print(f"  [SKIP] table missing: {table}")
            continue
        if column in existing:
            print(f"  [have] {table}.{column}")
            continue
        try:
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            added += 1
            print(f"  [ADD ] {table}.{column} {definition}")
        except sqlite3.OperationalError as exc:
            print(f"  [FAIL] {table}.{column}: {exc}")

    # --- 2. indexes ---------------------------------------------------------
    print("\n-- indexes --")
    for name, ddl, table, column in NEW_INDEXES:
        cur.execute(f"PRAGMA table_info({table})")
        cols = {row[1] for row in cur.fetchall()}
        if column not in cols:
            print(f"  [SKIP] {name}: {table}.{column} does not exist yet")
            continue
        try:
            cur.execute(ddl)
            print(f"  [OK  ] {name}")
        except sqlite3.OperationalError as exc:
            print(f"  [FAIL] {name}: {exc}")

    # --- 3. session_students rebuild ---------------------------------------
    print("\n-- session_students --")
    cur.execute("PRAGMA table_info(session_students)")
    ss_cols = {row[1]: row for row in cur.fetchall()}

    if not ss_cols:
        print("  [SKIP] table missing")
    else:
        needs_rebuild = (
            "payment_status" in ss_cols
            or ss_cols.get("status", (None,) * 5)[4] != "'ABSENT'"
        )
        if not needs_rebuild:
            print("  [have] already rebuilt")
        else:
            cur.execute("SELECT COUNT(*) FROM session_students")
            rows = cur.fetchone()[0]
            print(f"  rebuilding ({rows} row(s) to carry over)")
            try:
                cur.execute("DROP TABLE IF EXISTS session_students__new")
                cur.execute(SESSION_STUDENTS_NEW)
                if rows:
                    # Re-derive status from is_present so the two can't disagree.
                    cur.execute("""
                        INSERT INTO session_students__new
                            (id, session_id, student_id, is_present,
                             checked_in_at, checked_out_at, checked_in_by,
                             status, is_group_swap, timestamp, created_at)
                        SELECT
                            id, session_id, student_id, is_present,
                            checked_in_at, checked_out_at, checked_in_by,
                            CASE WHEN is_present = 1 THEN 'PRESENT' ELSE 'ABSENT' END,
                            COALESCE(is_group_swap, 0), timestamp, created_at
                        FROM session_students
                    """)
                cur.execute("DROP TABLE session_students")
                cur.execute(
                    "ALTER TABLE session_students__new RENAME TO session_students"
                )
                print("  [OK  ] rebuilt: status defaults ABSENT, payment_status dropped")
            except sqlite3.OperationalError as exc:
                print(f"  [FAIL] rebuild: {exc}")

    conn.commit()

    # --- 4. verify ----------------------------------------------------------
    print("\n-- verify --")
    for table, column, _ in NEW_COLUMNS:
        cur.execute(f"PRAGMA table_info({table})")
        cols = {row[1] for row in cur.fetchall()}
        mark = "ok " if column in cols else "MISSING"
        print(f"  [{mark}] {table}.{column}")

    conn.close()
    print(f"\nDone. {added} column(s) added.")
    print("Restart the Flask server.")


if __name__ == "__main__":
    main()
