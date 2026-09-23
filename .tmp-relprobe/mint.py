"""Mint a browser session for the preview pane: academy id + an access token.

Throwaway. The app keeps its tokens in localStorage (see lib/api.ts), so the
Browser pane can be signed in by writing exactly what a real login would write.
"""
import os
import sys

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from flask_jwt_extended import create_access_token  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.user import User  # noqa: E402

app = create_app("development")
with app.app_context():
    owner = db.session.query(User).filter_by(role="owner").first()
    print("ACADEMY", owner.academy_id)
    print("USER", owner.id, owner.name)
    print("TOKEN", create_access_token(identity=owner.id))
