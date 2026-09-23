"""
Runtime probe for the Teacher Profile Update work.

Exercises POST /api/teachers, PUT /api/teachers/<id> and the read endpoints
through flask's test client against the real SQLite dev database.

Nothing pre-existing is modified: every teacher the probe needs is created by
the probe itself and tagged with notes=MARKER, and pre-existing teacher rows
are never PUT. At the end the teachers / users / activity_logs tables are
compared row-for-row against a snapshot taken before the run.

Run:  PYTHONIOENCODING=utf-8 py -3 .tmp-teacherprobe/verify_teachers.py
"""
import os
import sys
import uuid

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from flask_jwt_extended import create_access_token  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.academy import Academy  # noqa: E402
from app.models.audit import ActivityLog  # noqa: E402
from app.models.teacher import Teacher  # noqa: E402
from app.models.user import User  # noqa: E402

ACADEMY = "ad6587d5-6fd3-4015-a497-8dd5301b830d"
MARKER = "probe-teacher-throwaway"

app = create_app("development")
results = []


def check(label, cond, detail=""):
    results.append(bool(cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))


def body(r):
    try:
        return r.get_json(silent=True) or {}
    except Exception:
        return {}


def snapshot():
    """
    Row-level snapshot of every table the probe could touch.

    Sorted in Python rather than by SQL, so a row that was deleted and
    re-inserted (gaining a new rowid) still compares equal.
    """
    return {
        table: sorted(tuple(r) for r in db.session.execute(
            db.text(f"select * from {table}")).all())
        for table in ("teachers", "users", "activity_logs", "teacher_subjects",
                      "sessions", "classes")
    }


with app.app_context():
    # ── sweep leftovers from an interrupted previous run ──────────────────
    for row in User.query.filter(User.name == MARKER).all():
        db.session.delete(row)
    for row in Teacher.query.filter(Teacher.notes == MARKER).all():
        db.session.delete(row)
    db.session.commit()

    before = snapshot()
    base = {t: len(rows) for t, rows in before.items()}
    print(f"baseline rows: {base}")

    owner = User.query.filter_by(email="a@a.c").first()
    other_academy = Academy.query.filter(Academy.id != ACADEMY).first()
    other_owner = User.query.filter_by(
        academy_id=other_academy.id, role="owner"
    ).first() if other_academy else None
    print(f"academy under test : {ACADEMY}")
    print(f"owner              : {owner.email} / {owner.role}")
    print(f"second academy     : {other_academy.name} ({other_owner.email})")

    # ── throwaway non-owner staff ─────────────────────────────────────────
    # ACTIVE on purpose: tenant_required rejects inactive users with 403
    # before the route runs, so an inactive one could never prove the
    # commission gate.
    staff = User(
        id=str(uuid.uuid4()),
        academy_id=ACADEMY,
        name=MARKER,
        email="probe-staff-throwaway@example.test",
        role="staff",
        pin_hash=User.hash_pin("1234"),
        is_active=True,
    )
    db.session.add(staff)
    db.session.commit()
    staff_id = staff.id
    print(f"throwaway staff    : {staff_id}\n")

    H_OWNER = {
        "Authorization": f"Bearer {create_access_token(identity=owner.id)}",
        "X-Academy-Id": ACADEMY,
    }
    H_STAFF = {
        "Authorization": f"Bearer {create_access_token(identity=staff_id)}",
        "X-Academy-Id": ACADEMY,
    }
    H_OTHER = {
        "Authorization": f"Bearer {create_access_token(identity=other_owner.id)}",
        "X-Academy-Id": other_academy.id,
    } if other_owner else None

    client = app.test_client()
    tag = uuid.uuid4().hex[:8]
    email_a = f"probe-{tag}-a@example.test"
    email_b = f"probe-{tag}-b@example.test"
    created_ids = []

    # ══ 1. CREATE — email required + format ═══════════════════════════════
    print("── CREATE: email required / format ──")
    r = client.post("/api/teachers",
                    json={"first_name": "Probe", "last_name": "One"}, headers=H_OWNER)
    check("POST without email -> 400", r.status_code == 400,
          f"got {r.status_code} {body(r)}")

    r = client.post("/api/teachers",
                    json={"first_name": "Probe", "last_name": "One", "email": ""},
                    headers=H_OWNER)
    check("POST empty email -> 400", r.status_code == 400,
          f"got {r.status_code} {body(r)}")

    for bad in ("not-an-email", "a@b", "a b@c.com", "a@b.c", "@example.test",
                "probe@example", "probe@.test", "x" * 250 + "@example.test"):
        r = client.post("/api/teachers",
                        json={"first_name": "Probe", "last_name": "One", "email": bad},
                        headers=H_OWNER)
        check(f"POST malformed email {bad[:26]!r} -> 400", r.status_code == 400,
              f"got {r.status_code} {body(r)}")

    r = client.post("/api/teachers",
                    json={"first_name": "Probe", "last_name": "One", "email": None},
                    headers=H_OWNER)
    check("POST email:null -> 400", r.status_code == 400, f"got {r.status_code}")

    # ══ 2. CREATE — happy path + per-academy uniqueness ═══════════════════
    print("\n── CREATE: happy path + uniqueness ──")
    r = client.post("/api/teachers",
                    json={"first_name": "Probe", "last_name": "One",
                          "email": email_a.upper(), "phone": "+213555000111",
                          "notes": MARKER},
                    headers=H_OWNER)
    check("POST valid -> 201", r.status_code == 201, f"got {r.status_code} {body(r)}")
    teacher_id = body(r).get("id")
    if teacher_id:
        created_ids.append(teacher_id)
    check("response echoes email (normalised lower-case)", body(r).get("email") == email_a,
          f"got {body(r).get('email')!r}")
    check("response status defaults to ACTIVE", body(r).get("status") == "ACTIVE",
          f"got {body(r).get('status')!r}")
    check("response carries commission defaults",
          body(r).get("commission_type") == "PERCENTAGE"
          and body(r).get("commission_value") == 30,
          f"got {body(r).get('commission_type')}/{body(r).get('commission_value')}")

    r = client.post("/api/teachers",
                    json={"first_name": "Probe", "last_name": "Two", "email": email_a,
                          "notes": MARKER},
                    headers=H_OWNER)
    check("POST duplicate email -> 409 (not 500)", r.status_code == 409,
          f"got {r.status_code} {body(r)}")
    check("409 body explains the clash", "already exists" in str(body(r).get("error", "")),
          f"got {body(r).get('error')!r}")

    r = client.post("/api/teachers",
                    json={"first_name": "Probe", "last_name": "Two",
                          "email": email_a.upper(), "notes": MARKER},
                    headers=H_OWNER)
    check("POST duplicate email differing only by case -> 409",
          r.status_code == 409, f"got {r.status_code} {body(r)}")

    r = client.post("/api/teachers",
                    json={"first_name": "Probe", "last_name": "Two",
                          "email": f"  {email_a}  ", "notes": MARKER},
                    headers=H_OWNER)
    check("POST duplicate email with whitespace padding -> 409",
          r.status_code == 409, f"got {r.status_code}")

    r = client.post("/api/teachers",
                    json={"first_name": "Probe", "last_name": "One",
                          "email": email_b.upper(), "notes": MARKER},
                    headers=H_OWNER)
    check("POST second valid teacher -> 201", r.status_code == 201,
          f"got {r.status_code} {body(r)}")
    teacher_b_id = body(r).get("id")
    if teacher_b_id:
        created_ids.append(teacher_b_id)

    if H_OTHER:
        r = client.post("/api/teachers",
                        json={"first_name": "Probe", "last_name": "Cross",
                              "email": email_a, "notes": MARKER},
                        headers=H_OTHER)
        check("POST same email in ANOTHER academy -> 201 (scoped per academy)",
              r.status_code == 201, f"got {r.status_code} {body(r)}")
        if body(r).get("id"):
            created_ids.append(body(r)["id"])

    # ══ 3. UPDATE — status ════════════════════════════════════════════════
    print("\n── UPDATE: status ──")
    for bad in ("garbage", "active", "Active", "DELETED", "", None, 1, True):
        r = client.put(f"/api/teachers/{teacher_id}", json={"status": bad}, headers=H_OWNER)
        check(f"PUT status={bad!r} -> 400", r.status_code == 400,
              f"got {r.status_code} {body(r)}")

    r = client.put(f"/api/teachers/{teacher_id}", json={"status": "INACTIVE"}, headers=H_OWNER)
    check("PUT status=INACTIVE -> 200", r.status_code == 200,
          f"got {r.status_code} {body(r)}")
    check("response reflects INACTIVE", body(r).get("status") == "INACTIVE",
          f"got {body(r).get('status')!r}")

    # ══ 4. READ endpoints with an INACTIVE teacher ════════════════════════
    print("\n── READ: INACTIVE stays in listings/history, filterable ──")
    r = client.get("/api/teachers", headers=H_OWNER)
    rows = body(r).get("teachers", [])
    ids = [t.get("id") for t in rows]
    check("GET /api/teachers (no filter) -> 200", r.status_code == 200, f"got {r.status_code}")
    check("unfiltered list still contains the INACTIVE teacher (management view)",
          teacher_id in ids, f"listed={len(ids)}")
    check("unfiltered list still contains the pre-existing email-less teachers",
          all(any(t.get("id") == e for t in rows)
              for e in [r0[0] for r0 in before["teachers"]]), "both present")

    r = client.get("/api/teachers?status=ACTIVE", headers=H_OWNER)
    ids = [t.get("id") for t in body(r).get("teachers", [])]
    check("GET ?status=ACTIVE -> 200 and excludes it (picker view)",
          r.status_code == 200 and teacher_id not in ids, f"got {r.status_code}")
    check("GET ?status=ACTIVE still lists the other teachers", len(ids) >= 3, f"len={len(ids)}")

    r = client.get("/api/teachers?status=INACTIVE", headers=H_OWNER)
    ids = [t.get("id") for t in body(r).get("teachers", [])]
    check("GET ?status=INACTIVE -> returns exactly the INACTIVE ones",
          r.status_code == 200 and ids == [teacher_id], f"got {r.status_code} ids={ids}")

    r = client.get("/api/teachers?status=BOGUS", headers=H_OWNER)
    check("GET ?status=BOGUS -> 400", r.status_code == 400, f"got {r.status_code}")

    r = client.get(f"/api/teachers/{teacher_id}", headers=H_OWNER)
    check("GET one for an INACTIVE teacher -> 200 (history kept)", r.status_code == 200,
          f"got {r.status_code}")
    check("profile carries email + status + commission",
          body(r).get("email") == email_a and body(r).get("status") == "INACTIVE"
          and "commission_type" in body(r),
          f"email={body(r).get('email')!r} status={body(r).get('status')!r}")

    r = client.get("/api/teachers/stats", headers=H_OWNER)
    check("GET /api/teachers/stats still 200", r.status_code == 200, f"got {r.status_code}")

    # A pre-existing teacher has email NULL — the read paths must not choke.
    legacy_id = before["teachers"][0][0]
    r = client.get(f"/api/teachers/{legacy_id}", headers=H_OWNER)
    check("GET one for a legacy email-less teacher -> 200", r.status_code == 200,
          f"got {r.status_code}")

    # ══ 5. COMMISSION — range validation ══════════════════════════════════
    print("\n── COMMISSION: range validation (owner) ──")
    cases = [
        ({"commission_type": "PERCENTAGE", "commission_value": 150}, 400),
        ({"commission_type": "PERCENTAGE", "commission_value": 101}, 400),
        ({"commission_type": "PERCENTAGE", "commission_value": -1}, 400),
        ({"commission_value": 150}, 400),                      # inherits PERCENTAGE
        ({"commission_value": -5}, 400),
        ({"commission_value": "abc"}, 400),
        ({"commission_value": 12.5}, 400),
        ({"commission_value": True}, 400),
        ({"commission_value": None}, 400),
        ({"commission_type": "BOGUS", "commission_value": 10}, 400),
        ({"commission_type": "percentage", "commission_value": 10}, 400),
        ({"commission_type": "FLAT_HOURLY", "commission_value": 2_000_000}, 400),
        ({"commission_type": "FIXED_SESSION", "commission_value": 5_000_000}, 400),
        ({"commission_type": "PERCENTAGE", "commission_value": 0}, 200),
        ({"commission_type": "PERCENTAGE", "commission_value": 100}, 200),
        ({"commission_type": "FLAT_HOURLY", "commission_value": 2500}, 200),
        ({"commission_type": "FIXED_SESSION", "commission_value": 800}, 200),
        ({"commission_type": "FLAT_HOURLY", "commission_value": 1_000_000}, 200),
    ]
    for payload, expected in cases:
        r = client.put(f"/api/teachers/{teacher_id}", json=payload, headers=H_OWNER)
        check(f"PUT {payload} -> {expected}", r.status_code == expected,
              f"got {r.status_code} {body(r).get('error', '')}")
        if expected == 400 and r.status_code == 400:
            err = str(body(r).get("error", ""))
            field = "commission_type" if "commission_type" in payload else "commission_value"
            check(f"   400 names the field {field!r}", field in err, f"err={err!r}")

    r = client.put(f"/api/teachers/{teacher_id}",
                   json={"commission_type": "PERCENTAGE", "commission_value": 150},
                   headers=H_OWNER)
    err = str(body(r).get("error", ""))
    check("out-of-range % message names field AND range 0-100",
          "commission_value" in err and "0" in err and "100" in err, f"err={err!r}")

    # ══ 6. COMMISSION — owner-only ════════════════════════════════════════
    print("\n── COMMISSION: owner-only gate ──")
    before_row = db.session.get(Teacher, teacher_id)
    before_pair = (before_row.commission_type, before_row.commission_value)
    before_name = before_row.first_name

    r = client.put(f"/api/teachers/{teacher_id}",
                   json={"commission_type": "PERCENTAGE", "commission_value": 99},
                   headers=H_STAFF)
    check("non-owner PUT commission -> 403", r.status_code == 403,
          f"got {r.status_code} {body(r)}")
    err = str(body(r).get("error", ""))
    check("403 explains commission editing is owner-only",
          "owner" in err.lower() and "commission" in err.lower(), f"err={err!r}")

    r = client.put(f"/api/teachers/{teacher_id}", json={"commission_value": 99}, headers=H_STAFF)
    check("non-owner PUT bare commission_value -> 403", r.status_code == 403,
          f"got {r.status_code} {body(r)}")

    r = client.put(f"/api/teachers/{teacher_id}", json={"commission_type": "PERCENTAGE"},
                   headers=H_STAFF)
    check("non-owner PUT bare commission_type -> 403", r.status_code == 403,
          f"got {r.status_code}")

    r = client.post("/api/teachers",
                    json={"first_name": "Probe", "last_name": "Staff",
                          "email": f"probe-{tag}-staff@example.test",
                          "commission_value": 90, "notes": MARKER},
                    headers=H_STAFF)
    check("non-owner POST with commission -> 403", r.status_code == 403,
          f"got {r.status_code} {body(r)}")

    r = client.put(f"/api/teachers/{teacher_id}",
                   json={"first_name": "Renamed-By-Staff", "phone": "+213555999888"},
                   headers=H_STAFF)
    check("non-owner PUT without commission -> 200 (route stays callable)",
          r.status_code == 200, f"got {r.status_code} {body(r)}")
    db.session.expire_all()
    check("non-owner rename actually applied",
          db.session.get(Teacher, teacher_id).first_name == "Renamed-By-Staff")

    after_row = db.session.get(Teacher, teacher_id)
    check("commission untouched by the refused attempts",
          (after_row.commission_type, after_row.commission_value) == before_pair,
          f"before={before_pair} after={(after_row.commission_type, after_row.commission_value)}")

    r = client.put(f"/api/teachers/{teacher_id}", json={"first_name": before_name}, headers=H_OWNER)
    check("owner can rename back -> 200", r.status_code == 200, f"got {r.status_code}")

    # ══ 7. UPDATE — email uniqueness excludes own row ═════════════════════
    print("\n── UPDATE: email ──")
    r = client.put(f"/api/teachers/{teacher_id}", json={"email": "bad-email"}, headers=H_OWNER)
    check("PUT malformed email -> 400", r.status_code == 400, f"got {r.status_code}")

    r = client.put(f"/api/teachers/{teacher_id}", json={"email": ""}, headers=H_OWNER)
    check("PUT empty email -> 400", r.status_code == 400, f"got {r.status_code}")

    r = client.put(f"/api/teachers/{teacher_id}", json={"email": email_a}, headers=H_OWNER)
    check("PUT unchanged own email -> 200 (own row excluded)", r.status_code == 200,
          f"got {r.status_code} {body(r)}")

    r = client.put(f"/api/teachers/{teacher_id}", json={"email": email_a.upper()}, headers=H_OWNER)
    check("PUT own email re-cased -> 200 (own row excluded)", r.status_code == 200,
          f"got {r.status_code}")

    r = client.put(f"/api/teachers/{teacher_id}", json={"email": email_b}, headers=H_OWNER)
    check("PUT email already used by ANOTHER teacher -> 409", r.status_code == 409,
          f"got {r.status_code} {body(r)}")

    r = client.put(f"/api/teachers/{teacher_id}", json={"email": None}, headers=H_OWNER)
    check("PUT email:null -> 400 (an email can be replaced but not cleared)",
          r.status_code == 400, f"got {r.status_code}")
    db.session.expire_all()
    check("refused email writes left the stored email alone",
          db.session.get(Teacher, teacher_id).email == email_a,
          f"email={db.session.get(Teacher, teacher_id).email!r}")

    # ══ 8. Full round-trip ════════════════════════════════════════════════
    print("\n── ROUND TRIP ──")
    email_c = f"probe-{tag}-c@example.test"
    r = client.put(f"/api/teachers/{teacher_id}",
                   json={"email": email_c, "status": "ACTIVE",
                         "commission_type": "FLAT_HOURLY", "commission_value": 1750,
                         "first_name": "Roundtrip", "last_name": "Verified"},
                   headers=H_OWNER)
    check("PUT full profile -> 200", r.status_code == 200, f"got {r.status_code} {body(r)}")

    r = client.get(f"/api/teachers/{teacher_id}", headers=H_OWNER)
    got = body(r)
    check("GET reflects email", got.get("email") == email_c, f"got {got.get('email')!r}")
    check("GET reflects status", got.get("status") == "ACTIVE", f"got {got.get('status')!r}")
    check("GET reflects commission_type", got.get("commission_type") == "FLAT_HOURLY",
          f"got {got.get('commission_type')!r}")
    check("GET reflects commission_value", got.get("commission_value") == 1750,
          f"got {got.get('commission_value')!r}")
    check("GET reflects names", got.get("first_name") == "Roundtrip"
          and got.get("last_name") == "Verified", f"got {got.get('first_name')!r}")

    r = client.get("/api/teachers", headers=H_OWNER)
    row = next((t for t in body(r).get("teachers", []) if t.get("id") == teacher_id), {})
    check("GET list carries email/status/commission",
          row.get("email") == email_c and row.get("status") == "ACTIVE"
          and row.get("commission_value") == 1750,
          f"row={ {k: row.get(k) for k in ('email', 'status', 'commission_value')} }")

    # ══ 9. Auth contract ══════════════════════════════════════════════════
    print("\n── AUTH ──")
    r = client.post("/api/teachers", json={"first_name": "P", "last_name": "Q",
                                           "email": f"probe-{tag}-noauth@example.test",
                                           "notes": MARKER})
    check("POST with no token -> 401", r.status_code == 401, f"got {r.status_code}")
    r = client.put(f"/api/teachers/{teacher_id}", json={"status": "INACTIVE"},
                   headers={"Authorization": H_OWNER["Authorization"]})
    check("PUT without X-Academy-Id -> 400", r.status_code == 400, f"got {r.status_code}")

    # ══ 10. Cleanup ═══════════════════════════════════════════════════════
    print("\n── CLEANUP ──")
    doomed = list(created_ids)
    doomed += [t.id for t in Teacher.query.filter(Teacher.notes == MARKER).all()
               if t.id not in doomed]
    for tid in doomed:
        row = db.session.get(Teacher, tid)
        if row:
            db.session.delete(row)
    for row in ActivityLog.query.filter(ActivityLog.entity_id.in_(doomed)).all():
        db.session.delete(row)
    staff_row = db.session.get(User, staff_id)
    if staff_row:
        db.session.delete(staff_row)
    db.session.commit()
    print(f"removed {len(doomed)} probe teacher(s) and their activity rows")

    after = snapshot()
    for table, rows in before.items():
        check(f"{table}: rows identical to pre-run snapshot",
              after[table] == rows,
              f"before={len(rows)} after={len(after[table])}")

    print(f"\nfinal teachers: "
          f"{[(t.id, t.first_name, t.last_name, t.email, t.status, t.commission_type, t.commission_value) for t in Teacher.query.all()]}")
    print(f"final users   : {[(u.email, u.role, u.is_active) for u in User.query.all()]}")

print("\n" + "=" * 60)
passed = sum(results)
print(f"RESULT: {passed}/{len(results)} checks passed"
      f" — {'ALL PASS' if results and all(results) else 'SEE FAILURES ABOVE'}")
sys.exit(0 if results and all(results) else 1)
