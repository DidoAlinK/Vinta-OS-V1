"""
s06_sessions — every class meeting, past, present and future.

Owns: ``Session`` rows and the ``SessionStudent`` attendance rows beneath them.

Reads from ctx: ``academy_id``, ``staff_ids``.
Adds to ctx: ``session_ids``, ``roster_session_ids``.

The lifecycle is the whole point of this module, and the model is explicit
about it: *"a class does not exist until it starts"*. So the three states are
generated to actually differ, not just to be spelled differently:

* **scheduled** — in the future. Locked: no attendance rows, no money, no
  actual times. Its roster does not exist yet.
* **in_progress** — running *right now*. ``actual_start_time`` is set and
  ``actual_end_time`` is null. The roster exists and is half-marked: the desk
  has flipped the students who arrived, and everyone else is still the
  untouched ``ABSENT`` / ``timestamp IS NULL`` row the model describes.
* **conducted** — finished. Both actual times set, roster fully marked, and
  absences carry a null ``timestamp`` because nobody acted on them.

That last detail is the one that makes ``timestamp`` mean something. A seed
that stamps every row makes the column's own comment a lie.
"""

from collections import defaultdict
from datetime import date, datetime, time, timedelta

from seed.config import ACADEMY_WEEKEND_DAY, HISTORY_MONTHS, TEMPORARY_CLASSES, TODAY
from seed.helpers import bulk_insert, log, new_id
from seed.pools import pick

MODULE = "s06_sessions"

#: How far either side of TODAY the timetable is laid down.
HISTORY_DAYS = 30 * HISTORY_MONTHS
FUTURE_DAYS = 21

#: The wall clock the seed pretends it is. Sessions that have finished by now
#: are history, the ones running right now are in_progress, and the rest are
#: still ahead.
NOW = datetime(2026, 9, 28, 15, 30)

#: Share of past sessions that were called off.
CANCEL_RATE = 0.05

#: Share of past sessions recorded under the legacy ``completed`` value, which
#: the model keeps for older rows. Worth having: a demo that never produces it
#: will never exercise the code that still reads it.
LEGACY_COMPLETED_RATE = 0.08

CANCEL_REASONS = ("TEACHER_ABSENT", "CANCELLED_BY_STAFF", "OTHER")

#: Attendance is a property of the child, not of the day: most students turn up
#: almost always, a few are chronically away.
ATTENDANCE_FLOOR = 0.74
ATTENDANCE_SPREAD = 0.24

#: Where the one-off classes sit in the day. They have no Schedule row, which
#: is precisely why ``Session.schedule_id`` is nullable.
CUSTOM_BLOCK = (time(10, 0), time(12, 0))

#: How many sick days to lay down for the TEACHER_ABSENT cascade.
TEACHER_ABSENT_DAYS = 3


def _dates_for(day_of_week, start, end):
    """Every date in ``[start, end]`` falling on ``day_of_week``.

    ``day_of_week`` is the model's own indexing — 0 is Sunday — which is one
    off from Python's ``date.weekday()``.
    """
    cursor = start
    while (cursor.weekday() + 1) % 7 != day_of_week:
        cursor += timedelta(days=1)
        if cursor > end:
            return []
    out = []
    while cursor <= end:
        out.append(cursor)
        cursor += timedelta(days=7)
    return out


def _at(day, moment):
    """``date`` + ``time`` -> ``datetime``."""
    return datetime.combine(day, moment)


def _off_weekend(day):
    """Nudge a one-off session off the academy's closed day.

    The recurring timetable can never land here — s03 only ever places slots on
    teaching days — but a one-off is dated by arithmetic (TODAY + 60 days), and
    60 mod 7 walks a Monday onto a Friday. Shifting by a day keeps the horizon
    the brief asked for without inventing a class on the weekend.
    """
    return day + timedelta(days=1) if (day.weekday() + 1) % 7 == ACADEMY_WEEKEND_DAY else day


def run(ctx: dict) -> dict:
    """Create sessions and attendance. Returns counts."""
    from app.extensions import db
    from app.models.attendance import SessionStudent
    from app.models.class_room import Class, Classroom
    from app.models.scheduling import Schedule, Session
    from app.models.student import Enrollment
    from app.models.user import User

    rng = ctx["rng"]
    academy_id = ctx["academy_id"]

    classes = {c.id: c for c in db.session.query(Class).filter_by(academy_id=academy_id).all()}
    rooms = db.session.query(Classroom).filter_by(academy_id=academy_id).all()

    # Neither Schedule nor Enrollment carries an academy_id — both reach the
    # academy through their class — so they are scoped by the ids just loaded.
    schedules = (
        db.session.query(Schedule).filter(Schedule.class_id.in_(classes)).all()
        if classes
        else []
    )

    staff_ids = list(ctx.get("staff_ids") or [])
    if not staff_ids:
        staff_ids = [
            u.id
            for u in db.session.query(User)
            .filter_by(academy_id=academy_id)
            .order_by(User.created_at)
            .all()
        ]

    schedule_by_class = defaultdict(list)
    for slot in schedules:
        schedule_by_class[slot.class_id].append(slot)

    # Which students belong to which group, and from when. A session's roster
    # is only the students who had already joined *on that date* — otherwise
    # a session three months back is attended by children who enrolled in
    # September, which is the sort of thing that makes a demo fall apart the
    # moment someone opens the register.
    enrolments_by_class = defaultdict(list)
    enrolled_rows = (
        db.session.query(Enrollment).filter(Enrollment.class_id.in_(classes)).all()
        if classes
        else []
    )
    for enrollment in enrolled_rows:
        enrolments_by_class[enrollment.class_id].append(
            (enrollment.enrolled_at, enrollment.student_id)
        )
    for rows in enrolments_by_class.values():
        rows.sort(key=lambda pair: pair[0])

    # Absenteeism per child, drawn once so it is stable across the term.
    attendance_bias = {}

    window_start = TODAY - timedelta(days=HISTORY_DAYS)
    window_end = TODAY + timedelta(days=FUTURE_DAYS)

    sessions = []
    cancel_cursor = 0

    def _add(klass, day, start, end, schedule_id, classroom_id):
        """Build one session, with its status and times decided by when it is."""
        nonlocal cancel_cursor
        planned_start = _at(day, start)
        planned_end = _at(day, end)

        status = "scheduled"
        reason = None
        actual_start = actual_end = None

        if planned_end <= NOW:
            # Already over. Mostly taught; occasionally called off.
            if rng.random() < CANCEL_RATE:
                status = "cancelled"
                reason = CANCEL_REASONS[cancel_cursor % len(CANCEL_REASONS)]
                cancel_cursor += 1
            else:
                status = (
                    "completed" if rng.random() < LEGACY_COMPLETED_RATE else "conducted"
                )
                # The doors open a little late and the class runs a little long
                # or a little short, as they do.
                actual_start = planned_start + timedelta(minutes=rng.randint(-2, 9))
                actual_end = planned_end + timedelta(minutes=rng.randint(-6, 16))
        elif planned_start <= NOW < planned_end:
            status = "in_progress"
            actual_start = planned_start + timedelta(minutes=rng.randint(-2, 6))

        row = Session(
            id=new_id(rng),
            academy_id=academy_id,
            class_id=klass.id,
            schedule_id=schedule_id,
            teacher_id=klass.teacher_id,
            classroom_id=classroom_id,
            date=day,
            start_time=start,
            end_time=end,
            subject=klass.subject,
            status=status,
            actual_start_time=actual_start,
            actual_end_time=actual_end,
            started_by_staff_id=(
                pick(rng, staff_ids) if staff_ids and actual_start else None
            ),
            ended_by_staff_id=(
                pick(rng, staff_ids) if staff_ids and actual_end else None
            ),
            is_free_session=klass.price_da == 0,
            cancelled_reason=reason,
            created_at=_at(day, start) - timedelta(days=7),
        )
        sessions.append(row)
        return row

    # ------------------------------------------------------- recurring groups
    for klass in sorted(classes.values(), key=lambda c: c.name):
        if klass.class_type != "weekly":
            continue
        for slot in schedule_by_class.get(klass.id, []):
            for day in _dates_for(slot.day_of_week, window_start, window_end):
                _add(
                    klass,
                    day,
                    slot.start_time,
                    slot.end_time,
                    slot.id,
                    slot.classroom_id,
                )

    # ------------------------------------------------------- one-off classes
    # Each has exactly one session, at TODAY + its configured offset. One has
    # already happened, one is next week, one is two months out.
    one_off_by_name = {
        c.name: c for c in classes.values() if c.class_type == "temporary"
    }
    for name, offset in TEMPORARY_CLASSES:
        klass = one_off_by_name.get(name)
        if klass is None:
            continue
        day = _off_weekend(TODAY + timedelta(days=offset))
        room = pick(rng, rooms) if rooms else None
        _add(klass, day, CUSTOM_BLOCK[0], CUSTOM_BLOCK[1], None, room.id if room else None)

    # ------------------------------------------------- teacher-absent cascade
    # The model gives TEACHER_ABSENT an extra meaning: that day's remaining
    # sessions for that teacher are off too. This is laid down deliberately
    # rather than left to the 5% random draw — a sick day needs a teacher with
    # two sessions on one date, which is rare enough that chance alone would
    # never produce it, and it is the branch the model documents most fully.
    by_teacher_day = defaultdict(list)
    for row in sessions:
        by_teacher_day[(row.teacher_id, row.date)].append(row)

    absent_days = sorted(
        key
        for key, group in by_teacher_day.items()
        if len(group) >= 2 and key[1] < TODAY
    )

    cascaded = 0
    for teacher_id, day in rng.sample(absent_days, min(TEACHER_ABSENT_DAYS, len(absent_days))):
        for row in by_teacher_day[(teacher_id, day)]:
            row.status = "cancelled"
            row.cancelled_reason = "TEACHER_ABSENT"
            row.actual_start_time = None
            row.actual_end_time = None
            row.started_by_staff_id = None
            row.ended_by_staff_id = None
            cascaded += 1

    bulk_insert(db, sessions, chunk=500, rng=rng)

    # ------------------------------------------------------------- attendance
    # Only sessions that actually started have a roster. A future session's
    # students do not exist yet — that is the documented rule, and it is also
    # the thing that makes "scheduled" mean something more than a colour.
    by_class_sessions = defaultdict(list)
    for row in sessions:
        by_class_sessions[row.class_id].append(row)

    total_roster = 0
    present_total = 0

    for class_id, group in by_class_sessions.items():
        roster_pool = enrolments_by_class.get(class_id, [])
        if not roster_pool:
            continue
        rows = []
        for session in sorted(group, key=lambda r: r.date):
            if session.status not in ("conducted", "completed", "in_progress"):
                continue

            live = session.status == "in_progress"
            # Everyone who had joined by this date was on the register.
            attendees = [
                student_id
                for enrolled_at, student_id in roster_pool
                if enrolled_at.date() <= session.date
            ]
            for student_id in attendees:
                bias = attendance_bias.get(student_id)
                if bias is None:
                    bias = ATTENDANCE_FLOOR + rng.random() * ATTENDANCE_SPREAD
                    attendance_bias[student_id] = bias

                if live:
                    # The desk is still at work: some are marked, and the rest
                    # are exactly as the model leaves them — absent, untouched.
                    if rng.random() >= 0.40:
                        rows.append(
                            SessionStudent(
                                session_id=session.id,
                                student_id=student_id,
                                is_present=False,
                                status="ABSENT",
                                is_group_swap=False,
                                timestamp=None,
                                created_at=session.actual_start_time,
                            )
                        )
                        continue

                present = rng.random() < bias
                if present:
                    arrived = session.actual_start_time + timedelta(
                        minutes=rng.randint(-3, 14)
                    )
                    left = (session.actual_end_time or session.actual_start_time) + timedelta(
                        minutes=rng.randint(-4, 10)
                    )
                    rows.append(
                        SessionStudent(
                            session_id=session.id,
                            student_id=student_id,
                            is_present=True,
                            status="PRESENT",
                            checked_in_at=arrived,
                            checked_out_at=left,
                            checked_in_by=pick(rng, staff_ids) if staff_ids else None,
                            is_group_swap=rng.random() < 0.03,
                            timestamp=arrived,
                            created_at=session.actual_start_time,
                        )
                    )
                    present_total += 1
                else:
                    # Nobody acted on an absence, so the timestamp stays null.
                    rows.append(
                        SessionStudent(
                            session_id=session.id,
                            student_id=student_id,
                            is_present=False,
                            status="ABSENT",
                            is_group_swap=False,
                            timestamp=None,
                            created_at=session.actual_start_time,
                        )
                    )

        if rows:
            bulk_insert(db, rows, chunk=2000, rng=rng)
            total_roster += len(rows)

    ctx["session_ids"] = [s.id for s in sessions]
    ctx["roster_session_ids"] = [
        s.id for s in sessions if s.status in ("conducted", "completed", "in_progress")
    ]

    counts = defaultdict(int)
    for row in sessions:
        counts[row.status] += 1

    log(
        f"[{MODULE}] {len(sessions)} sessions "
        f"({dict(counts)}), {total_roster} attendance rows "
        f"({present_total} present), {cascaded} cascaded cancellations"
    )
    return {
        "sessions": len(sessions),
        "attendance": total_roster,
        "present": present_total,
    }
