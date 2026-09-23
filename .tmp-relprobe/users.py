"""List the academy's users and roles. Throwaway, read-only."""
import os
import sys

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.user import User  # noqa: E402

app = create_app("development")
with app.app_context():
    for u in db.session.query(User).all():
        print(f"{str(u.role):8} {u.name!r:20} academy={u.academy_id} id={u.id}")
