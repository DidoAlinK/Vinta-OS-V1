"""Create (or remove) a throwaway staff profile for the browser check.

The app's profile picker requires a PIN for every profile, and the only two
profiles in this database are the user's own owners. Their PIN is theirs and
guessing at it would trip the rate limiter on a real account, so the browser
check gets its own profile instead — one that is deleted again the moment the
check is done, by `remove()` below.

  py make_staff.py make     -> create, print the id
  py make_staff.py remove   -> delete it and anything it wrote
"""
import os
import sys
import uuid

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.audit import ActivityLog  # noqa: E402
from app.models.user import User  # noqa: E402

MARKER = "ZZ Browser Check (throwaway)"
ACADEMY = "ad6587d5-6fd3-4015-a497-8dd5301b830d"
PIN = "4321"

app = create_app("development")
action = sys.argv[1] if len(sys.argv) > 1 else "make"

with app.app_context():
    if action == "make":
        existing = db.session.query(User).filter_by(name=MARKER).first()
        if existing:
            print("already exists:", existing.id)
            sys.exit(0)
        u = User(
            id=str(uuid.uuid4()),
            academy_id=ACADEMY,
            name=MARKER,
            email="zz-browser-check@example.invalid",
            role="staff",
            pin_hash=User.hash_pin(PIN),
        )
        db.session.add(u)
        db.session.commit()
        print("created:", u.id, "pin:", PIN)
    else:
        users = db.session.query(User).filter_by(name=MARKER).all()
        ids = [u.id for u in users]
        if not ids:
            print("nothing to remove")
            sys.exit(0)
        # A staff PIN check writes an audit row naming the user; removing the
        # user without it would leave a dangling reference.
        logs = db.session.query(ActivityLog).filter(
            ActivityLog.user_id.in_(ids)
        ).delete(synchronize_session=False)
        n = db.session.query(User).filter(User.id.in_(ids)).delete(
            synchronize_session=False
        )
        db.session.commit()
        print(f"removed {n} user(s), {logs} log row(s)")
        left = db.session.query(User).filter_by(name=MARKER).count()
        print("remaining:", left)
