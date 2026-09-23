"""
Runtime probe for the Billing Rules toggles on /api/settings/billing-config.

Exercises the real routes through app.test_client():
  1. GET returns all 6 toggles as real booleans
  2. PUT {"absence_consumes_credit": false} persists False and reads back False
  3. PUT {"...": "false"} (string) stores False, not a truthy value   [the bug]
  4. PUT {"...": <junk>} -> 400 naming the field, and nothing is written
  5. unknown fields are ignored; the currency lock warning still fires
  6. auth contract: no token 401, staff token 403 (not 401)

Snapshots every column it touches and restores it in a finally block, then
re-asserts the DB matches the snapshot. Leaves nothing behind.
"""
import os
import sys

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from flask_jwt_extended import create_access_token  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.academy import AcademySettings  # noqa: E402
from app.models.user import User  # noqa: E402

ACADEMY_ID = "ad6587d5-6fd3-4015-a497-8dd5301b830d"
MARKER_STAFF = "probe-throwaway-staff"

TOGGLES = (
    "absence_consumes_credit",
    "count_gap_sessions",
    "restore_credits_on_cancellation",
    "free_session_auto_present",
    "share_credits_across_groups",
    "early_payment_on_extra_sessions",
)
# Every other column the endpoint can write — must come out untouched.
OTHERS = (
    "currency",
    "default_plan_duration",
    "billing_reminder_days_before",
    "due_date_reminder_timing",
    "whatsapp_template",
    "default_credits_per_cycle",
    "allow_rollover_default",
    "allow_makeups_default",
    "default_access_weeks",
    "default_max_groups",
)

app = create_app("development")
results = []


def check(label, cond, detail=""):
    results.append(bool(cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))


with app.app_context():
    settings = db.session.query(AcademySettings).filter_by(academy_id=ACADEMY_ID).first()
    assert settings, "no AcademySettings row for the test academy"
    snapshot = {f: getattr(settings, f) for f in TOGGLES + OTHERS}
    print(f"academy under test : {ACADEMY_ID}")
    print(f"original toggles   : { {f: snapshot[f] for f in TOGGLES} }")

    owner = db.session.query(User).filter_by(academy_id=ACADEMY_ID, role="owner").first()
    staff = db.session.query(User).filter_by(academy_id=ACADEMY_ID, role="staff").first()
    print(f"owner / staff      : {owner.email if owner else None} / {staff.email if staff else None}")

    # No staff account exists in either academy, so stand up a throwaway one
    # (marked via `name`) purely to exercise the owner_only -> 403 path.
    seeded_staff_id = None
    if not staff:
        import uuid as _uuid
        staff = User(
            id=str(_uuid.uuid4()),
            academy_id=ACADEMY_ID,
            name=MARKER_STAFF,
            email="probe-throwaway-billing@local",
            role="staff",
            pin_hash=User.hash_pin("0000"),
        )
        db.session.add(staff)
        db.session.commit()
        seeded_staff_id = staff.id
        print(f"seeded throwaway staff {seeded_staff_id}")

    token = create_access_token(identity=owner.id)
    hdr = {"Authorization": f"Bearer {token}", "X-Academy-Id": ACADEMY_ID}
    client = app.test_client()

    def dbval(field):
        # expire first: otherwise the identity map hands back the object the
        # request mutated in-session, which says nothing about what was committed.
        db.session.expire_all()
        return getattr(
            db.session.query(AcademySettings).filter_by(academy_id=ACADEMY_ID).first(), field
        )

    def rawval(field):
        """Read the committed value straight out of the SQLite file, bypassing
        SQLAlchemy entirely — immune to session/identity-map state.

        The URI is relative (sqlite:///vinta_dev.db), and Flask-SQLAlchemy
        resolves that against app.instance_path — NOT the cwd. Resolving it
        against the cwd silently creates an empty database file.
        """
        import sqlite3
        uri = app.config["SQLALCHEMY_DATABASE_URI"].replace("sqlite:///", "")
        if not os.path.isabs(uri):
            uri = os.path.join(app.instance_path, uri)
        assert os.path.exists(uri), f"not the real DB file: {uri}"
        con = sqlite3.connect(uri)
        try:
            return con.execute(
                f"SELECT {field} FROM academy_settings WHERE academy_id = ?", (ACADEMY_ID,)
            ).fetchone()[0]
        finally:
            con.close()

    try:
        # ---- 1. GET shape -------------------------------------------------
        print("\n1. GET /api/settings/billing-config")
        r = client.get("/api/settings/billing-config", headers=hdr)
        body = r.get_json(silent=True) or {}
        check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
        for f in TOGGLES:
            present = f in body
            is_bool = isinstance(body.get(f), bool)
            check(f"{f} present & bool (={body.get(f)!r})", present and is_bool)
        check("pre-existing fields untouched in response",
              {k: body.get(k) for k in OTHERS} == {k: snapshot[k] for k in OTHERS})

        # ---- 2. real boolean false persists -------------------------------
        print("\n2. PUT real boolean -> persists")
        r = client.put("/api/settings/billing-config", headers=hdr,
                       json={"absence_consumes_credit": False})
        check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
        check(f"DB holds False (got {dbval('absence_consumes_credit')!r})",
              dbval("absence_consumes_credit") is False)
        r = client.get("/api/settings/billing-config", headers=hdr)
        check("visible on subsequent GET as False",
              r.get_json().get("absence_consumes_credit") is False)

        # restore that one to True so the string test starts from True
        client.put("/api/settings/billing-config", headers=hdr,
                   json={"absence_consumes_credit": snapshot["absence_consumes_credit"]})

        # ---- 3. string "false" must not store truthy ----------------------
        print('\n3. PUT string "false" -> must be False, not truthy')
        before = dbval("absence_consumes_credit")
        check(f"starts truthy (={before!r}) so a buggy setattr would stay truthy", before is True)
        r = client.put("/api/settings/billing-config", headers=hdr,
                       json={"absence_consumes_credit": "false"})
        check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
        after = dbval("absence_consumes_credit")
        check(f"DB holds False (got {after!r})", after is False)
        check(f"raw SQLite file holds 0 (got {rawval('absence_consumes_credit')!r})",
              rawval("absence_consumes_credit") == 0)
        r = client.get("/api/settings/billing-config", headers=hdr)
        check("GET reports False", r.get_json().get("absence_consumes_credit") is False)

        # string "true" and int 0 / 1 round-trip too
        for raw, want in (("true", True), (0, False), (1, True)):
            client.put("/api/settings/billing-config", headers=hdr,
                       json={"absence_consumes_credit": raw})
            got = dbval("absence_consumes_credit")
            check(f"PUT {raw!r} -> {want!r} (got {got!r})", got is want)
        client.put("/api/settings/billing-config", headers=hdr,
                   json={"absence_consumes_credit": snapshot["absence_consumes_credit"]})

        # ---- 4. junk -> 400 naming the field, nothing written -------------
        print("\n4. PUT non-boolean junk -> 400 naming the field")
        for field, junk in (("count_gap_sessions", "yes"),
                            ("share_credits_across_groups", 2),
                            ("absence_consumes_credit", None),
                            ("early_payment_on_extra_sessions", [1])):
            r = client.put("/api/settings/billing-config", headers=hdr, json={field: junk})
            err = (r.get_json(silent=True) or {}).get("error", "")
            check(f"{field}={junk!r} -> 400 (got {r.status_code})", r.status_code == 400)
            check(f"error names {field} ({err!r})", field in err)

        # a 400 must not leave a partial write behind. The payload lists a valid
        # toggle BEFORE the junk one, so a naive "apply as we go" would have
        # already set it in the session by the time we bail.
        r = client.put("/api/settings/billing-config", headers=hdr,
                       json={"count_gap_sessions": True, "share_credits_across_groups": "junk"})
        check(f"mixed payload -> 400 (got {r.status_code})", r.status_code == 400)
        check(f"no partial write via ORM: count_gap_sessions (got {dbval('count_gap_sessions')!r})",
              dbval("count_gap_sessions") is snapshot["count_gap_sessions"])
        check(f"no partial write in the DB file: count_gap_sessions (raw={rawval('count_gap_sessions')!r})",
              rawval("count_gap_sessions") in (0, snapshot["count_gap_sessions"]))

        # ---- 5. unknown ignored, currency warning intact -------------------
        print("\n5. unknown fields ignored; currency lock warning intact")
        r = client.put("/api/settings/billing-config", headers=hdr,
                       json={"not_a_field": 123, "absence_consumes_credit": True})
        check(f"unknown field -> 200 (got {r.status_code})", r.status_code == 200)
        check("known field in same payload still applied",
              dbval("absence_consumes_credit") is True)
        r = client.put("/api/settings/billing-config", headers=hdr, json={"currency": "USD"})
        body = r.get_json(silent=True) or {}
        check(f"currency=USD -> 200 (got {r.status_code})", r.status_code == 200)
        check(f"warning present ({body.get('warning')!r})", bool(body.get("warning")))
        check(f"currency still DZD (got {dbval('currency')!r})", dbval("currency") == "DZD")
        client.put("/api/settings/billing-config", headers=hdr,
                   json={"absence_consumes_credit": snapshot["absence_consumes_credit"]})

        # ---- 6. auth contract --------------------------------------------
        print("\n6. auth contract")
        r = client.get("/api/settings/billing-config")
        check(f"no token -> 401 (got {r.status_code})", r.status_code == 401)
        if staff:
            shdr = {"Authorization": f"Bearer {create_access_token(identity=staff.id)}",
                    "X-Academy-Id": ACADEMY_ID}
            r = client.put("/api/settings/billing-config", headers=shdr,
                           json={"absence_consumes_credit": False})
            check(f"staff token -> 403, not 401 (got {r.status_code})", r.status_code == 403)
            check("staff write did not land",
                  dbval("absence_consumes_credit") is snapshot["absence_consumes_credit"])
            r = client.get("/api/settings/billing-config", headers=shdr)
            check(f"staff GET -> 403 (got {r.status_code})", r.status_code == 403)
        else:
            print("  SKIP: no staff user in the test academy")

    finally:
        # ---- restore ------------------------------------------------------
        settings = db.session.query(AcademySettings).filter_by(academy_id=ACADEMY_ID).first()
        for field, value in snapshot.items():
            setattr(settings, field, value)
        if seeded_staff_id:
            seeded = db.session.get(User, seeded_staff_id)
            if seeded:
                db.session.delete(seeded)
        db.session.commit()

    # ---- verify the restore ------------------------------------------------
    print("\nrestore")
    settings = db.session.query(AcademySettings).filter_by(academy_id=ACADEMY_ID).first()
    for field, value in snapshot.items():
        now = getattr(settings, field)
        check(f"{field} back to {value!r} (got {now!r})", now == value)
    print("\nraw SQLite file after restore (bypasses SQLAlchemy):")
    for field in TOGGLES:
        raw = rawval(field)
        expected = 1 if snapshot[field] else 0
        check(f"  {field}: {raw!r} (expect {expected})", raw == expected)
    leftover = db.session.query(User).filter(User.name == MARKER_STAFF).count()
    check(f"throwaway staff removed (leftover={leftover})", leftover == 0)

print("\n" + "=" * 52)
print(f"RESULT: {sum(results)}/{len(results)} checks passed"
      f" — {'ALL PASS' if results and all(results) else 'SEE FAILURES ABOVE'}")
