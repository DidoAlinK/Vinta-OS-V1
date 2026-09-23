"""
Runtime probe: GET /sessions?class_id=  (the group-scoped session list).

This is the endpoint a Classrooms card reads to answer "when does this group
next meet", so the probe spends its checks on ordering (the first row must be
the next class), on the lifecycle fields the card menu needs, and on the ways
a caller can get it wrong.

  1. class_id is required              -> 400
  2. happy path                        -> 200, shape, soonest-first
  3. every lifecycle field is present   (the client reads these; the old
                                        shape omitted them all, which is why
                                        the UI kept its own copy in
                                        localStorage)
  4. a foreign academy's group         -> 200 + empty, never a leak, never 404
  5. a bad date / bad limit            -> 400, not 500
  6. status filter and limit           -> honoured
  7. past sessions are excluded by default, included with from=

Throwaway: the sessions it creates are removed at the end, and the removal is
asserted.
"""
import os
import sys
import uuid
from datetime import date, time, timedelta

BACKEND = r"E:\vinta-os-app-essembled-main\Backend\vinta-academy-backend"
os.chdir(BACKEND)
sys.path.insert(0, BACKEND)

from flask_jwt_extended import create_access_token  # noqa: E402

from app import create_app  # noqa: E402
from app.extensions import db  # noqa: E402
from app.models.class_room import Class  # noqa: E402
from app.models.scheduling import Session  # noqa: E402
from app.models.teacher import Teacher  # noqa: E402
from app.models.user import User  # noqa: E402

MARKER = "probe-sessions-list-throwaway"
ACADEMY = "ad6587d5-6fd3-4015-a497-8dd5301b830d"
OTHER_ACADEMY = "50b418a9-97b8-4066-b566-269ceae04ef1"
GROUP = "a41fd3be-807b-45ad-b298-69edb7a0ac21"

app = create_app("development")
results = []


def check(label, cond, detail=""):
    results.append(bool(cond))
    print(f"  [{'PASS' if cond else 'FAIL'}] {label}" + (f" — {detail}" if detail else ""))


with app.app_context():
    owner = db.session.query(User).filter_by(role="owner", academy_id=ACADEMY).first()
    group = db.session.get(Class, GROUP)
    teacher = db.session.query(Teacher).filter_by(academy_id=ACADEMY).first()
    other_group = db.session.query(Class).filter_by(academy_id=OTHER_ACADEMY).first()

    hdr = {
        "Authorization": f"Bearer {create_access_token(identity=owner.id)}",
        "X-Academy-Id": ACADEMY,
    }
    client = app.test_client()

    # how many sessions this group already has from today forward
    print(f"group {group.name!r}, teacher={(teacher.full_name if teacher else None)!r}")
    pre_existing = db.session.query(Session).filter(
        Session.academy_id == ACADEMY,
        Session.class_id == GROUP,
        Session.date >= date.today(),
    ).count()
    print(f"pre-existing sessions today-or-later: {pre_existing}")

    # three throwaway sessions out of order on purpose, plus one in the past
    today = date.today()
    made = []
    for offset_days, hour in ((2, 11), (1, 9), (5, 8)):
        s = Session(
            id=str(uuid.uuid4()), academy_id=ACADEMY, class_id=GROUP,
            teacher_id=group.teacher_id or (teacher.id if teacher else None),
            date=today + timedelta(days=offset_days),
            start_time=time(hour, 0), end_time=time(hour + 1, 0),
            subject=MARKER, status="scheduled", is_free_session=False,
        )
        db.session.add(s); made.append(s)
    past = Session(
        id=str(uuid.uuid4()), academy_id=ACADEMY, class_id=GROUP,
        teacher_id=group.teacher_id or (teacher.id if teacher else None),
        date=today - timedelta(days=3),
        start_time=time(9, 0), end_time=time(10, 0),
        subject=MARKER, status="conducted", is_free_session=False,
    )
    db.session.add(past); made.append(past)
    # a cancelled one, to prove the status filter.
    # `cancelled_reason` is an enum (TEACHER_ABSENT / CANCELLED_BY_STAFF /
    # OTHER) and SQLAlchemy coerces it while loading ANY session row — so an
    # off-enum value here would not just fail this insert, it would take out
    # every session read in the app. Hence a real member of the enum.
    cancelled = Session(
        id=str(uuid.uuid4()), academy_id=ACADEMY, class_id=GROUP,
        teacher_id=group.teacher_id or (teacher.id if teacher else None),
        date=today + timedelta(days=3),
        start_time=time(14, 0), end_time=time(15, 0),
        subject=MARKER, status="cancelled", is_free_session=True,
        cancelled_reason="OTHER",
    )
    db.session.add(cancelled); made.append(cancelled)
    db.session.commit()

    # ---------- 1. class_id required ----------
    print("\n--- class_id ---")
    r = client.get("/api/sessions", headers=hdr)
    check(f"no class_id -> 400 (got {r.status_code})", r.status_code == 400,
          f"{(r.get_json(silent=True) or {}).get('error')}")

    # ---------- 2. happy path ----------
    print("\n--- happy path ---")
    r = client.get(f"/api/sessions?class_id={GROUP}", headers=hdr)
    body = r.get_json(silent=True) or {}
    rows = body.get("sessions", [])
    check(f"HTTP 200 (got {r.status_code})", r.status_code == 200)
    check("returns a sessions list", isinstance(rows, list), f"{type(rows).__name__}")
    check("total matches len", body.get("total") == len(rows))
    keys = sorted(rows[0].keys()) if rows else []
    print(f"    {len(rows)} row(s); keys: {keys}")

    probe_rows = [x for x in rows if x.get("subject") == MARKER]
    check("the throwaway sessions are all present", len(probe_rows) == 4,
          f"got {len(probe_rows)}")

    order = [(x["date"], x["start_time"]) for x in rows]
    check("ordered soonest-first", order == sorted(order), f"{order[:5]}")
    check("the first row is the soonest upcoming class",
          rows and rows[0]["date"] == (today + timedelta(days=1)).isoformat(),
          f"first={rows[0]['date'] if rows else None}, "
          f"expected={(today + timedelta(days=1)).isoformat()}")

    # ---------- 3. lifecycle fields ----------
    print("\n--- the lifecycle fields the card menu reads ---")
    for field in ("id", "class_id", "class_name", "teacher_name", "date",
                  "start_time", "end_time", "status", "subject", "color",
                  "is_free_session", "actual_start_time", "actual_end_time",
                  "schedule_id", "started_by_staff_id", "ended_by_staff_id",
                  "cancelled_reason"):
        check(f"row carries {field!r}", rows and field in rows[0])

    free_row = next((x for x in probe_rows if x["is_free_session"]), None)
    check("is_free_session round-trips true", free_row is not None)
    check("cancelled_reason round-trips", free_row is not None and
          free_row.get("cancelled_reason") == "OTHER",
          f"{free_row.get('cancelled_reason') if free_row else None}")
    check("actual_start_time is null for a class that never started",
          all(x.get("actual_start_time") is None for x in probe_rows))

    # ---------- 4. cross-tenant ----------
    # Two separate properties, and they fail differently: the header check is
    # tenant_required refusing a mismatched academy outright, while the id
    # check is this query's own scoping. A foreign class id under OUR academy
    # is the interesting one — it must come back empty, not 403 and not 404,
    # because the query is scoped by academy and there is nothing to leak.
    print("\n--- another academy ---")
    r = client.get(f"/api/sessions?class_id={GROUP}", headers={
        "Authorization": hdr["Authorization"], "X-Academy-Id": OTHER_ACADEMY,
    })
    check(f"a mismatched X-Academy-Id is refused (got {r.status_code})",
          r.status_code in (401, 403), f"{(r.get_json(silent=True) or {}).get('error')}")

    if other_group:
        r = client.get(f"/api/sessions?class_id={other_group.id}", headers=hdr)
        check(f"another academy's group -> 200 (got {r.status_code})", r.status_code == 200)
        check("and leaks no rows", (r.get_json(silent=True) or {}).get("total") == 0,
              f"total={(r.get_json(silent=True) or {}).get('total')}")
    else:
        print("    (no group in the other academy to test against — skipped)")

    # ---------- 5. bad input ----------
    print("\n--- bad input is a 400, never a 500 ---")
    for label, url in (
        ("bad from", f"/api/sessions?class_id={GROUP}&from=not-a-date"),
        ("bad to", f"/api/sessions?class_id={GROUP}&to=13/13/2026"),
        ("bad limit", f"/api/sessions?class_id={GROUP}&limit=lots"),
    ):
        r = client.get(url, headers=hdr)
        check(f"{label} -> 400 (got {r.status_code})", r.status_code == 400,
              f"{(r.get_json(silent=True) or {}).get('error')}")

    # ---------- 6. status filter + limit ----------
    print("\n--- status filter and limit ---")
    r = client.get(f"/api/sessions?class_id={GROUP}&status=scheduled", headers=hdr)
    rows_s = (r.get_json(silent=True) or {}).get("sessions", [])
    check("status=scheduled returns only scheduled",
          rows_s and all(x["status"] == "scheduled" for x in rows_s),
          f"{sorted({x['status'] for x in rows_s})}")
    r = client.get(f"/api/sessions?class_id={GROUP}&status=cancelled,conducted",
                   headers=hdr)
    rows_c = (r.get_json(silent=True) or {}).get("sessions", [])
    check("comma-separated statuses work",
          rows_c and all(x["status"] in ("cancelled", "conducted") for x in rows_c),
          f"{sorted({x['status'] for x in rows_c})}")
    r = client.get(f"/api/sessions?class_id={GROUP}&limit=1", headers=hdr)
    check("limit=1 honoured",
          len((r.get_json(silent=True) or {}).get("sessions", [])) == 1)
    # limit=0 must clamp up to 1, not return nothing and not be passed through
    # as a bare LIMIT 0 that silently looks like "this group has no sessions".
    r = client.get(f"/api/sessions?class_id={GROUP}&limit=0", headers=hdr)
    check("limit=0 clamps to 1 rather than returning nothing",
          len((r.get_json(silent=True) or {}).get("sessions", [])) == 1,
          f"got {len((r.get_json(silent=True) or {}).get('sessions', []))}")
    r = client.get(f"/api/sessions?class_id={GROUP}&limit=9999", headers=hdr)
    check("an absurd limit is capped, not honoured blindly",
          r.status_code == 200 and
          len((r.get_json(silent=True) or {}).get("sessions", [])) <= 200)

    # ---------- 7. the past ----------
    print("\n--- past sessions ---")
    check("a past session is excluded by default",
          all(x["date"] >= today.isoformat() for x in rows),
          f"oldest={min((x['date'] for x in rows), default=None)}")
    r = client.get(
        f"/api/sessions?class_id={GROUP}&from={today - timedelta(days=7)}",
        headers=hdr)
    rows_p = (r.get_json(silent=True) or {}).get("sessions", [])
    check("from= reaches back into history",
          any(x["id"] == past.id for x in rows_p))

    # ---------- cleanup ----------
    print("\ncleanup")
    ids = [s.id for s in made]
    db.session.query(__import__(
        "app.models.attendance", fromlist=["SessionStudent"]
    ).SessionStudent).filter(
        __import__("app.models.attendance", fromlist=["SessionStudent"]
                   ).SessionStudent.session_id.in_(ids)
    ).delete(synchronize_session=False)
    n = db.session.query(Session).filter(Session.id.in_(ids)).delete(
        synchronize_session=False)
    db.session.commit()
    print(f"  removed {n} session(s)")

    print("\nrestore")
    db.session.expire_all()
    check("no throwaway sessions left",
          db.session.query(Session).filter(Session.subject == MARKER).count() == 0)
    remaining = db.session.query(Session).filter(
        Session.academy_id == ACADEMY,
        Session.class_id == GROUP,
        Session.date >= date.today(),
    ).count()
    check("group back to its pre-probe session count",
          remaining == pre_existing, f"{pre_existing} -> {remaining}")

print("\n" + "=" * 52)
print(f"RESULT: {sum(results)}/{len(results)} checks passed"
      f" — {'ALL PASS' if results and all(results) else 'SEE FAILURES ABOVE'}")
