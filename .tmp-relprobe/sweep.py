"""Read-only: every row in the DB whose created/updated stamp lands in the
window my earlier test clicks ran in.

Rather than guess which tables a start or an end writes to — and miss one —
this walks the real schema and looks at the stamps. A money table nobody
thought of is exactly the one worth finding.
"""
import os
import sys
from datetime import datetime

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from sqlalchemy import inspect  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402

# The window the clicks ran in. Wide enough to catch a stamp written a moment
# before or after the session timestamps themselves.
LO = datetime(2026, 9, 23, 6, 55, 0)
HI = datetime(2026, 9, 23, 7, 10, 0)

app = create_app("development")
with app.app_context():
    insp = inspect(db.engine)
    total = 0
    for table in sorted(insp.get_table_names()):
        cols = {c["name"] for c in insp.get_columns(table)}
        stamps = [c for c in ("created_at", "updated_at", "timestamp", "occurred_at")
                  if c in cols]
        if not stamps:
            continue
        where = " OR ".join(f"{c} >= :lo AND {c} <= :hi" for c in stamps)
        try:
            rows = db.session.execute(
                db.text(f"SELECT * FROM {table} WHERE {where}"),
                {"lo": LO, "hi": HI},
            ).mappings().all()
        except Exception as exc:  # a table with an odd stamp type
            print(f"  ! {table}: {type(exc).__name__}")
            continue
        if not rows:
            continue
        total += len(rows)
        print(f"{table}: {len(rows)} row(s)")
        for r in rows:
            keys = [k for k in r.keys() if k in ("id", "session_id", "student_id",
                                                 "student_subscription_id", "status",
                                                 "remaining_credits", "amount_da",
                                                 "action", "description", "created_at",
                                                 "updated_at")]
            print("   " + " | ".join(f"{k}={r[k]}" for k in keys))
    print(f"\nTOTAL rows touched in window: {total}")
