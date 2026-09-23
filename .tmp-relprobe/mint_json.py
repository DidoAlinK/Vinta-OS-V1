"""Write the minted session to a file the preview page can fetch.

Throwaway, and deleted the moment the browser check is done. The token is
written straight from the encoder into the JSON, so nothing is retyped and
nothing can be silently corrupted on the way in.

The file lands in the Vite `public/` dir, which is served at the site root —
that is the only reason it is there. It is NOT gitignored, so it must not
outlive this check.
"""
import json
import os
import sys

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
OUT = r"E:\vinta-os-app-essembled-main\vinta-school-os\public\__session.json"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from flask_jwt_extended import create_access_token  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.user import User  # noqa: E402

app = create_app("development")
with app.app_context():
    owner = db.session.query(User).filter_by(role="owner").first()
    with open(OUT, "w", encoding="utf-8") as fh:
        json.dump({
            "token": create_access_token(identity=owner.id),
            "academy_id": owner.academy_id,
        }, fh)
    print("wrote", OUT)
    print("bytes", os.path.getsize(OUT))
