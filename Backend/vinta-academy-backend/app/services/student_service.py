"""
Vinta School OS — Student Service
Enrollment, status derivation (paid/due/overdue/unpaid/no_plan), CRUD ops.
The group owns the plan (Class billing config, reached via the primary
enrollment); the subscription records what money actually moved. Status is
never derived from the legacy PaymentPlan/StudentBilling tables.
"""
import uuid
from datetime import date, timedelta
from sqlalchemy import desc, func, or_
from app.extensions import db
from app.models.student import Student, Guardian, Enrollment
from app.models.billing import StudentBilling, StudentSubscription
from app.models.class_room import Class
from app.models.audit import ActivityLog


#: Every status a student can report. The route validates against this and the
#: stats endpoint counts into it, so a new state cannot be added to the API
#: without being counted here too.
STUDENT_STATUSES = ("paid", "due", "overdue", "unpaid", "no_plan")


def _apply_search(query, q: str | None):
    """Narrow ``query`` by the roster's case-insensitive ``q`` match.

    One definition, shared by the list and the stats endpoints. If the two ever
    grew their own copy of this predicate they could drift, and the counts shown
    beside a filtered table would then describe a different set of students than
    the table itself — the kind of disagreement nobody notices until it matters.
    """
    if not q or not q.strip():
        return query

    needle = f"%{q.strip()}%"
    return query.filter(
        or_(
            Student.first_name.ilike(needle),
            Student.last_name.ilike(needle),
            # "first last" typed in one go, e.g. "yacine testman"
            Student.first_name.concat(" ").concat(Student.last_name).ilike(needle),
            Student.phone.ilike(needle),
            Student.parent_phone.ilike(needle),
        )
    )


def list_students(
    academy_id: str,
    page: int = 1,
    per_page: int = 50,
    q: str | None = None,
    status: str | None = None,
) -> dict:
    """List students for an academy, with computed status fields.

    ``q`` optionally filters case-insensitively on name and phone fields.
    ``status`` optionally filters on the COMPUTED billing status.

    ``status`` cannot be expressed in SQL. It is derived per student by
    ``_enrich_student`` from the subscription and the governing group's billing
    config; nothing about it is stored on the row. So the two paths are
    genuinely different, and the difference is deliberate:

    * without ``status`` the ``q`` filter and the page slice both happen in SQL
      — the cheap path every ordinary roster load takes;
    * with ``status`` the ``q`` filter still happens in SQL, but then every
      match is enriched, filtered in Python, and only afterwards sliced. That is
      O(roster) per request, and it is the honest price of paging a derived
      value: the alternative is paging the unfiltered set and quietly returning
      short or empty pages to the client.

    ``total`` and ``pages`` describe the filtered set in both paths, so the
    caller's paging arithmetic stays correct either way.
    """
    query = Student.query.filter_by(academy_id=academy_id, is_active=True)
    query = _apply_search(query, q)

    if status is None:
        pagination = query.paginate(page=page, per_page=per_page, error_out=False)

        return {
            "students": [_enrich_student(s) for s in pagination.items],
            "total": pagination.total,
            "page": page,
            "per_page": per_page,
            "pages": pagination.pages,
        }

    matched = [
        enriched
        for enriched in (_enrich_student(s) for s in query.all())
        if enriched["status"] == status
    ]

    total = len(matched)
    # `page` arrives from a query string, so it can be 0 or negative. Clamping
    # the offset rather than trusting it keeps a hand-typed URL from slicing
    # backwards off the end of the list.
    offset = max(page - 1, 0) * per_page
    window = matched[offset : offset + per_page]

    return {
        "students": window,
        "total": total,
        "page": page,
        "per_page": per_page,
        # Ceiling division, and 0 pages for an empty match — the client tests
        # `page >= pages` to know it has reached the end, so an empty result
        # must report 0 rather than 1.
        "pages": ((total + per_page - 1) // per_page) if per_page else 0,
    }


def get_student(student_id: str, academy_id: str) -> dict | None:
    """Get a single student with all related data."""
    student = Student.query.filter_by(id=student_id, academy_id=academy_id, is_active=True).first()
    if not student:
        return None

    data = _enrich_student(student)
    data["guardians"] = [
        {
            "id": g.id,
            "name": g.name,
            "relationship": g.relationship_type,
            "phone": g.phone,
            "is_emergency": g.is_emergency,
        }
        for g in student.guardians
    ]
    data["enrollments"] = [
        {
            "id": e.id,
            "class_id": e.class_id,
            "class_name": e.class_.name if e.class_ else None,
            "status": e.status,
            "enrolled_at": e.enrolled_at.isoformat() if e.enrolled_at else None,
        }
        for e in student.enrollments.filter_by(status="active").all()
    ]
    data["billing_calendar"] = _get_billing_calendar(student.id)
    # The register, month by month, for every group this student is or was in.
    data["attendance_calendar"] = _get_attendance_calendar(
        student.id, student.created_at
    )

    return data


def create_student(academy_id: str, data: dict, created_by: str) -> Student:
    """Create a new student with a default guardian.

    No billing/subscription record is created: a new student has no plan until
    staff record a payment against a course group.
    """
    student = Student(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        first_name=data["first_name"],
        last_name=data["last_name"],
        phone=data.get("phone"),
        parent_phone=data.get("parent_phone"),
        notes=data.get("notes"),
    )
    db.session.add(student)
    db.session.flush()

    # Default guardian
    guardian = Guardian(
        id=str(uuid.uuid4()),
        student_id=student.id,
        name="Parent",
        relationship_type="Parent",
        phone=data.get("parent_phone", ""),
        is_emergency=True,
    )
    db.session.add(guardian)

    # Audit log
    log = ActivityLog(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        user_id=created_by,
        entity_type="student",
        entity_id=student.id,
        action="created",
        description=f"New student enrolled — {student.first_name} {student.last_name}",
    )
    db.session.add(log)
    db.session.flush()

    return student


def update_student(student_id: str, academy_id: str, data: dict) -> Student | None:
    """Update student profile fields."""
    student = Student.query.filter_by(id=student_id, academy_id=academy_id).first()
    if not student:
        return None

    for field in ("first_name", "last_name", "phone", "parent_phone", "notes"):
        if field in data:
            setattr(student, field, data[field])

    db.session.flush()
    return student


def delete_student(student_id: str, academy_id: str, deleted_by: str) -> bool:
    """Soft-delete student and cascade withdraw enrollments."""
    student = Student.query.filter_by(id=student_id, academy_id=academy_id).first()
    if not student:
        return False

    # Withdraw all active enrollments
    enrollments = Enrollment.query.filter_by(student_id=student_id, status="active").all()
    for enrollment in enrollments:
        enrollment.status = "withdrawn"

    # Soft delete: deactivate instead of removing
    student.is_active = False

    # Audit log
    log = ActivityLog(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        user_id=deleted_by,
        entity_type="student",
        entity_id=student_id,
        action="deleted",
        description=f"Student profile removed — {student.first_name} {student.last_name}",
    )
    db.session.add(log)

    db.session.flush()
    return True


def enroll_student(student_id: str, class_id: str, academy_id: str, enrolled_by: str) -> Enrollment:
    """Enroll a student in a class."""
    # Verify student exists and is active
    student = Student.query.filter_by(id=student_id, academy_id=academy_id, is_active=True).first()
    if not student:
        raise ValueError("Student not found or inactive")

    # Check if already enrolled
    existing = Enrollment.query.filter_by(
        student_id=student_id, class_id=class_id, status="active"
    ).first()
    if existing:
        return existing

    # Check class capacity
    from app.models.class_room import Class
    class_ = db.session.get(Class, class_id)
    if not class_:
        raise ValueError("Class not found")

    # A capacity of 0 (or no capacity at all) means "not set", not "full".
    # Class.capacity defaults to 0, so the old `enrolled_count >= capacity`
    # refused EVERY enrollment in a class nobody had given a capacity to —
    # which is most of them. Only a positive number is a real limit.
    if class_.capacity:
        enrolled_count = db.session.query(func.count()).select_from(Enrollment).filter(
            Enrollment.class_id == class_id,
            Enrollment.status == "active"
        ).scalar()
        if enrolled_count >= class_.capacity:
            raise ValueError("Class is at full capacity")

    enrollment = Enrollment(
        id=str(uuid.uuid4()),
        student_id=student_id,
        class_id=class_id,
        status="active",
    )
    db.session.add(enrollment)

    log = ActivityLog(
        id=str(uuid.uuid4()),
        academy_id=academy_id,
        user_id=enrolled_by,
        entity_type="student",
        entity_id=student_id,
        action="enrolled",
        description="Student enrolled in class",
    )
    db.session.add(log)
    db.session.flush()

    return enrollment


def get_student_stats(academy_id: str, q: str | None = None) -> dict:
    """Get aggregate student statistics for the stats rail and filter pills.

    Counts mirror the per-student ``status``. Every student has exactly one
    status, so the five buckets sum to ``total`` — but read ``total`` as the
    size of the matching roster rather than as arithmetic, because that stays
    true if a status is ever added.

    ``q`` narrows the counts using the same predicate as ``list_students``, so
    the pills beside a searched roster describe the students that search
    matched rather than the whole academy. Without it the counts are the whole
    academy's, which is what the page loads on mount.

    Like ``list_students`` this is O(roster): status is derived, not stored, so
    there is no aggregate query that could answer it. It was already walking
    every student before this returned more than the three buckets it counted.
    """
    query = Student.query.filter_by(academy_id=academy_id, is_active=True)
    query = _apply_search(query, q)

    counts = {status: 0 for status in STUDENT_STATUSES}
    students = query.all()

    for student in students:
        status = _resolve_primary_billing(student.id)["status"]
        if status in counts:
            counts[status] += 1

    return {"total": len(students), **counts}


# --- Private Helpers ---

def _enrich_student(student: Student) -> dict:
    """Enrich a student with computed fields derived from the money model."""
    billing = _resolve_primary_billing(student.id)
    sub = billing["subscription"]
    group = billing["group"]
    cycle_end = billing["cycle_end"]

    # Sessions come from the group's credit config, not from the student.
    sessions = None
    sessions_per_month = None
    if (
        group is not None
        and group.billing_model == "CREDIT_BASED"
        and group.credits_per_cycle is not None
    ):
        sessions_per_month = int(group.credits_per_cycle)
        sessions = f"{sessions_per_month} / month"

    # Plan label and price come from the group the student is on: the
    # subscription's group if money was recorded, else their enrolled group.
    plan = None
    plan_amount = None
    group_name = None
    if group is not None:
        kind = {"CREDIT_BASED": "Credit", "TIME_BASED": "Time"}.get(
            group.billing_model, group.billing_model
        )
        plan_amount = int(group.price_da or 0)
        plan = f"{kind} — {plan_amount:,} DA"
        # group.group_name is the sub-group letter; fall back to the class name
        # so it never reads null beside a populated `classes` string.
        group_name = group.group_name or group.name

    # Enrolled classes
    enrollments = Enrollment.query.filter_by(student_id=student.id, status="active").all()
    classes_str = ", ".join([e.class_.name for e in enrollments if e.class_])

    active_enrollment = next((e for e in enrollments if e.status == "active"), None)

    return {
        "id": student.id,
        "first_name": student.first_name,
        "last_name": student.last_name,
        "full_name": student.full_name,
        "phone": student.phone,
        "parent_phone": student.parent_phone,
        "notes": student.notes,
        "status": billing["status"],
        "sessions": sessions,
        "sessions_per_month": sessions_per_month,
        "classes": classes_str,
        "plan": plan,
        "plan_amount": plan_amount,
        "billing_model": group.billing_model if group is not None else None,
        "group_name": group_name,
        "remaining_credits": sub.remaining_credits if sub is not None else None,
        "total_credits": sub.total_credits if sub is not None else None,
        "subscription_id": sub.id if sub is not None else None,
        "renews": cycle_end.isoformat() if cycle_end is not None else None,
        "created_at": student.created_at.isoformat() if student.created_at else None,
        "enrollment_status": active_enrollment.status if active_enrollment else "not_enrolled",
    }


def _get_primary_subscription(student_id: str) -> StudentSubscription | None:
    """Most recent ACTIVE subscription, else the most recent of any status."""
    query = StudentSubscription.query.filter_by(student_id=student_id)

    active = (
        query.filter_by(status="ACTIVE")
        .order_by(desc(StudentSubscription.created_at))
        .first()
    )
    if active is not None:
        return active

    return query.order_by(desc(StudentSubscription.created_at)).first()


def _cycle_end_date(
    sub: StudentSubscription | None, group: Class | None
) -> date | None:
    """End of the subscription's current cycle.

    ``cycle_deadline`` is only written when the group sets ``cycle_week_limit``
    (and that column is nullable with no default), so fall back to the access
    window and finally to ``start + group.access_duration_weeks``.
    """
    if sub is None:
        return None
    if sub.cycle_deadline is not None:
        return sub.cycle_deadline
    if sub.access_end_date is not None:
        return sub.access_end_date
    if group is not None and group.access_duration_weeks:
        start = sub.cycle_start_date or sub.access_start_date
        if start is not None:
            return start + timedelta(weeks=int(group.access_duration_weeks))
    return None


def _covers_date(sub: StudentSubscription, cycle_end: date | None, day: date) -> bool:
    """True when the subscription's window includes ``day`` (or is open-ended)."""
    start = sub.cycle_start_date or sub.access_start_date
    if start is not None and start > day:
        return False
    if cycle_end is not None and cycle_end < day:
        return False
    return True


def _covers_today(sub: StudentSubscription, cycle_end: date | None) -> bool:
    """True when the subscription's window includes today (or is open-ended)."""
    return _covers_date(sub, cycle_end, date.today())


def _derive_status(
    sub: StudentSubscription | None, cycle_end: date | None, enrolled: bool
) -> str:
    """Honest paid/due/overdue/unpaid/no_plan for a student.

    ``enrolled`` is only consulted when there is no subscription: an enrolled
    student does have a plan (their group's), no money has just been recorded
    against it yet.
    """
    if sub is None:
        return "unpaid" if enrolled else "no_plan"
    if sub.status == "SUSPENDED":
        return "overdue"
    if sub.status in ("EXPIRED", "DEPLETED"):
        return "due"
    if sub.status == "ACTIVE" and _covers_today(sub, cycle_end):
        return "paid"
    # ACTIVE but its cycle window has closed, or an unrecognised status.
    return "due"


def _primary_enrollment_group(student_id: str) -> Class | None:
    """Group of the student's most recent active enrollment."""
    enrollment = (
        Enrollment.query.filter_by(student_id=student_id, status="active")
        .order_by(desc(Enrollment.enrolled_at))
        .first()
    )
    if enrollment is None:
        return None
    return enrollment.class_


def _resolve_primary_billing(student_id: str) -> dict:
    """Primary subscription with its group, cycle end and honest status.

    The group is the plan source, and takes precedence as: the subscription's
    group when money has been recorded, else the group the student is enrolled
    in, else None.
    """
    sub = _get_primary_subscription(student_id)

    if sub is None:
        group = _primary_enrollment_group(student_id)
        return {
            "subscription": None,
            "group": group,
            "cycle_end": None,
            "status": _derive_status(None, None, enrolled=group is not None),
        }

    group = db.session.get(Class, sub.group_id)
    cycle_end = _cycle_end_date(sub, group)
    return {
        "subscription": sub,
        "group": group,
        "cycle_end": cycle_end,
        "status": _derive_status(sub, cycle_end, enrolled=group is not None),
    }


def _calendar_status(derived_status: str, amount_da: int, paid_amount: int) -> str:
    """Mirror the honest status, but never claim 'paid' on a 0 DA / 0 paid row."""
    if derived_status == "overdue":
        return "overdue"
    if derived_status == "paid" and (amount_da > 0 or paid_amount > 0):
        return "paid"
    return "due"


def _get_billing_calendar(student_id: str) -> list:
    """Current cycle from the primary subscription, legacy rows as fallback."""
    billing = _resolve_primary_billing(student_id)
    sub = billing["subscription"]

    if sub is not None:
        group = billing["group"]
        cycle_end = billing["cycle_end"]
        amount_da = int(group.price_da or 0) if group is not None else 0
        paid_amount = int(sub.amount_paid_da or 0)
        start = sub.cycle_start_date or sub.access_start_date

        return [
            {
                "id": sub.id,
                "status": _calendar_status(billing["status"], amount_da, paid_amount),
                "cycle_start": start.isoformat() if start is not None else None,
                "cycle_end": cycle_end.isoformat() if cycle_end is not None else None,
                "amount_da": amount_da,
                "paid_amount": paid_amount,
            }
        ]

    # Legacy fallback: rows that carry a cycle start inside the last 4 weeks.
    four_weeks_ago = date.today() - timedelta(weeks=4)
    billings = (
        StudentBilling.query.filter(
            StudentBilling.student_id == student_id,
            StudentBilling.cycle_start >= four_weeks_ago,
        )
        .order_by(StudentBilling.cycle_start)
        .all()
    )

    calendar = []
    for b in billings:
        status = b.status
        # The planted 0 DA / 0 paid row claimed "paid": label it honestly.
        if status == "paid" and int(b.amount_da or 0) == 0 and int(b.paid_amount or 0) == 0:
            status = "due"
        calendar.append(
            {
                "id": b.id,
                "status": status,
                "cycle_start": b.cycle_start.isoformat() if b.cycle_start is not None else None,
                "cycle_end": b.cycle_end.isoformat() if b.cycle_end is not None else None,
                "amount_da": b.amount_da,
                "paid_amount": b.paid_amount,
            }
        )
    return calendar


# --- Attendance calendar ------------------------------------------------
#
# One row per session this student is party to, past and future, with the
# single honest state for that day already decided here. The month grid is a
# rendering of this list; it does not derive anything of its own, because a
# second definition of "did they pay" is a second thing that can be wrong.
#
# Where the facts come from:
#   attendance  SessionStudent.status  — PRESENT/ABSENT, "false until true":
#               a row exists for every enrolled student the moment a session
#               starts, defaulting to ABSENT, so a bare ABSENT with no
#               timestamp means "nobody acted", not "they skipped".
#   payment     the student's subscriptions, evaluated per day against each
#               one's own window. A session is "paid" when some subscription
#               covering that group includes that day.
#   existence   Enrollment.enrolled_at — per group, so a group joined later
#               does not colour days before it.
#
# Nothing here is cached or stored, and nothing writes: the attendance is the
# register itself, so it survives every edit except an academy reset.

# How far ahead upcoming sessions are read. The month grid only ever shows a
# few weeks of grey, and an unbounded read on a group with 12 weeks of
# generated sessions is work nobody asked for.
ATTENDANCE_HORIZON_WEEKS = 8


def _subscriptions_by_group(student_id: str) -> dict:
    """Every subscription of this student, keyed by the group it covers.

    A TIME_BASED bundle covers several groups through ``enrolled_group_ids``,
    so it is filed under each of them. Unlike
    ``billing_service.find_active_subscription`` this does not resolve "what
    covers today" and never transitions a status — a calendar is a read, and a
    read that quietly expires a subscription would be writing.
    """
    subs = (
        StudentSubscription.query.filter_by(student_id=student_id)
        .order_by(desc(StudentSubscription.created_at))
        .all()
    )

    by_group: dict[str, list] = {}
    for sub in subs:
        group_ids = {sub.group_id}
        if sub.billing_model == "TIME_BASED" and isinstance(sub.enrolled_group_ids, list):
            group_ids.update(g for g in sub.enrolled_group_ids if g)
        for group_id in group_ids:
            if group_id:
                by_group.setdefault(group_id, []).append(sub)
    return by_group


def _paid_on(subs: list, group: Class | None, day: date) -> bool:
    """Did any of these subscriptions cover ``group`` on ``day``?

    Coverage is a question about *then*, so it is answered from the
    subscription's own window and not from ``status`` — which is a fact about
    now, and would mark a session from a fully-paid cycle that has since
    expired as unpaid.

    A CANCELLED purchase is the one exclusion: it never took effect, so it
    never covered anything.
    """
    for sub in subs:
        if sub.status == "CANCELLED":
            continue
        cycle_end = _cycle_end_date(sub, group)
        if _covers_date(sub, cycle_end, day):
            return True
    return False


def _session_state(
    *,
    session,
    attendance: str | None,
    has_register_row: bool,
    enrolled_on: date | None,
    paid: bool,
    today: date,
) -> str:
    """The one honest label for "what happened on this day", in priority order.

    Order matters and is the whole point of keeping this in one place:

    cancelled   the group did not meet, whatever the register says
    upcoming    it has not happened yet; the register is empty by design
    not_enrolled  a session of a group this student had not joined yet
    unrecorded  it is past, and no register was ever taken — the class was
                never started, so there is no fact about this student to show.
                Marking it absent would blame them for the desk not running
                the class.
    attended / unpaid / absent   the register, plus whether a plan covered
                the day
    """
    if session.status == "cancelled":
        return "cancelled"
    if session.date >= today and session.status in ("scheduled", "in_progress"):
        return "upcoming"
    if enrolled_on is not None and session.date < enrolled_on:
        return "not_enrolled"
    if not has_register_row:
        return "unrecorded"
    if attendance == "PRESENT":
        return "attended" if paid else "unpaid"
    # ABSENT covers both "the desk marked them away" and "a row exists with
    # nobody having touched it" — the register defaults every enrolled student
    # to ABSENT at start, so the two are not distinguishable from the row
    # alone. Both mean the same thing to the academy: the seat was not used.
    return "absent"


def _get_attendance_calendar(student_id: str, student_created_at=None) -> dict:
    """Every session this student is party to, past and future, with its state.

    The window runs from the day they joined to ``today + 8 weeks``. Nothing is
    stored: the register is the history, so this survives every edit and reset
    except an academy wipe.

    Response::

        {
          "joined_on": "2026-01-05",   # grid dims days before this
          "today": "2026-09-24",
          "entries": [
            { "date", "session_id", "class_id", "class_name",
              "start_time", "end_time", "session_status", "is_free_session",
              "attendance", "covered", "enrolled", "state" }, ...
          ]
        }
    """
    from app.models.attendance import SessionStudent
    from app.models.scheduling import Session

    today = date.today()

    # Every enrollment, withdrawn ones included: `get_student` filters to
    # active for its own list, but a group they left still has sessions they
    # attended, and dropping it would erase that history from the grid.
    enrollments = Enrollment.query.filter_by(student_id=student_id).all()
    enrolled_by_class: dict[str, date] = {}
    for e in enrollments:
        if not e.enrolled_at:
            continue
        day = e.enrolled_at.date()
        current = enrolled_by_class.get(e.class_id)
        if current is None or day < current:
            enrolled_by_class[e.class_id] = day

    register_rows = SessionStudent.query.filter_by(student_id=student_id).all()

    class_ids = set(enrolled_by_class)
    # A group swap or a manual add puts the student on a session of a group
    # they were never enrolled in, and the register row is the only record of
    # it. Their attendance there still belongs on the calendar.
    for row in register_rows:
        session = row.session
        if session is not None:
            class_ids.add(session.class_id)

    joined_days = list(enrolled_by_class.values())
    fallback_join = student_created_at.date() if student_created_at else today
    joined_on = min(joined_days) if joined_days else fallback_join

    if not class_ids:
        return {
            "joined_on": joined_on.isoformat(),
            "today": today.isoformat(),
            "entries": [],
        }

    horizon = today + timedelta(weeks=ATTENDANCE_HORIZON_WEEKS)
    sessions = (
        Session.query.filter(
            Session.class_id.in_(list(class_ids)),
            Session.date >= joined_on,
            Session.date <= horizon,
        )
        .order_by(Session.date, Session.start_time)
        .all()
    )

    attendance_by_session = {row.session_id: row for row in register_rows}
    subs_by_group = _subscriptions_by_group(student_id)
    classes = {c.id: c for c in Class.query.filter(Class.id.in_(list(class_ids))).all()}

    entries = []
    for session in sessions:
        row = attendance_by_session.get(session.id)
        enrolled_on = enrolled_by_class.get(session.class_id)
        group = classes.get(session.class_id)
        paid = _paid_on(subs_by_group.get(session.class_id, []), group, session.date)

        entries.append({
            "date": session.date.isoformat(),
            "session_id": session.id,
            "class_id": session.class_id,
            "class_name": group.name if group is not None else None,
            "start_time": session.start_time.strftime("%H:%M") if session.start_time else None,
            "end_time": session.end_time.strftime("%H:%M") if session.end_time else None,
            "session_status": session.status,
            "is_free_session": bool(session.is_free_session),
            "attendance": row.status if row is not None else None,
            "covered": bool(paid),
            "enrolled": enrolled_on is not None,
            "state": _session_state(
                session=session,
                attendance=row.status if row is not None else None,
                has_register_row=row is not None,
                enrolled_on=enrolled_on,
                paid=paid,
                today=today,
            ),
        })

    return {
        "joined_on": joined_on.isoformat(),
        "today": today.isoformat(),
        "entries": entries,
    }
