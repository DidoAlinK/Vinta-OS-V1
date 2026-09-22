"""
Schema step — activity_logs.user_id becomes nullable.

WHY
    The audit trail has always meant "no human did this" to be expressible —
    the reader renders a missing user as "System" (`audit_service`
    : `log.user.name if log.user else "System"`). The writer instead tried to
    say it with the string ``"system"``, which the foreign key to ``users.id``
    forbids, and SQLite runs with ``PRAGMA foreign_keys=ON``. So every
    automatic audit write raised an IntegrityError and killed the request:

      * POST /api/attendance/auto-checkout      (auto check-out)
      * POST /api/billing/check-overdue         (overdue sweep)
      * POST /api/attendance/guest-checkin      (checked_in_by is None)
      * POST /api/attendance/check-out          (a free session's
                                                 auto-filled row has no
                                                 checked-in-by)
      * POST /api/sessions/<id>/end             (finalise → auto check-out)

    NULL is the honest representation, so the column stops refusing it.

WHY A SCRIPT AND NOT ALEMBIC
    `migrations/versions/` is stale and the running schema comes from
    `db.create_all()`, which creates missing *tables* but never relaxes an
    existing *column*. Same pattern as `add_lifecycle_columns.py`.

WHY A REBUILD
    SQLite cannot drop a NOT NULL constraint. `activity_logs` is a leaf table
    (nothing has a foreign key pointing at it), so rebuilding it is safe.
    Rows are COPIED verbatim — this migration does not reinterpret any data.

IDEMPOTENT — safe to run repeatedly.
Run from anywhere:   py nullable_activity_log_actor.py
"""

import os
import sqlite3
import sys
from urllib.parse import urlparse

HERE = os.path.dirname(os.path.abspath(__file__))

# Mirrors the live table exactly, with user_id relaxed to nullable.
ACTIVITY_LOGS_NEW = """
    CREATE TABLE activity_logs__new (
        id VARCHAR(36) NOT NULL,
        academy_id VARCHAR(36) NOT NULL,
        user_id VARCHAR(36),
        entity_type VARCHAR(50) NOT NULL,
        entity_id VARCHAR(36) NOT NULL,
        action VARCHAR(50) NOT NULL,
        description TEXT,
        metadata JSON,
        created_at DATETIME NOT NULL,
        PRIMARY KEY (id),
        FOREIGN KEY(academy_id) REFERENCES academies (id),
        FOREIGN KEY(user_id) REFERENCES users (id)
    )
"""

# Columns copied across, in the table's own order. `metadata` is the DB name
# of the model's `log_metadata` attribute.
COLUMNS = (
    "id, academy_id, user_id, entity_type, entity_id, action, "
    "description, metadata, created_at"
)


def resolve_db_path() -> str:
    """Resolve the SQLite file the app actually opens, from DATABASE_URL."""
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
        return parsed.netloc
    name = parsed.path.lstrip("/")
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

    cur.execute("PRAGMA table_info(activity_logs)")
    cols = {row[1]: row for row in cur.fetchall()}
    if not cols:
        print("FATAL: activity_logs is missing.")
        sys.exit(1)

    # PRAGMA table_info: index 3 is notnull.
    already_nullable = cols["user_id"][3] == 0
    if already_nullable:
        print("[have] activity_logs.user_id is already nullable.")
        conn.close()
        return

    cur.execute("SELECT COUNT(*) FROM activity_logs")
    rows = cur.fetchone()[0]
    print(f"Rebuilding activity_logs ({rows} row(s) to carry over)")

    try:
        cur.execute("DROP TABLE IF EXISTS activity_logs__new")
        cur.execute(ACTIVITY_LOGS_NEW)
        if rows:
            cur.execute(
                f"INSERT INTO activity_logs__new ({COLUMNS}) "
                f"SELECT {COLUMNS} FROM activity_logs"
            )
            copied = cur.rowcount
            if copied != rows:
                raise sqlite3.OperationalError(
                    f"copied {copied} of {rows} rows — refusing to drop the original"
                )
        cur.execute("DROP TABLE activity_logs")
        cur.execute("ALTER TABLE activity_logs__new RENAME TO activity_logs")
        print("  [OK  ] rebuilt: user_id is nullable")
    except sqlite3.OperationalError as exc:
        print(f"  [FAIL] rebuild: {exc}")
        conn.rollback()
        conn.close()
        sys.exit(1)

    conn.commit()

    # --- verify -------------------------------------------------------------
    print("\n-- verify --")
    cur.execute("PRAGMA table_info(activity_logs)")
    after = {row[1]: row for row in cur.fetchall()}
    print(f"  [{'ok ' if after['user_id'][3] == 0 else 'MISSING'}] "
          "activity_logs.user_id nullable")
    cur.execute("SELECT COUNT(*) FROM activity_logs")
    print(f"  [{'ok ' if cur.fetchone()[0] == rows else 'MISSING'}] "
          f"{rows} row(s) preserved")
    cur.execute("PRAGMA foreign_key_list(activity_logs)")
    fks = cur.fetchall()
    print(f"  [{'ok ' if len(fks) == 2 else 'MISSING'}] "
          f"{len(fks)} foreign key(s) intact")

    conn.close()
    print("\nDone. Restart the Flask server.")


if __name__ == "__main__":
    main()
