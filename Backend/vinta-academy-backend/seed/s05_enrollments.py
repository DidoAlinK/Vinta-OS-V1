"""
s05_enrollments — who is enrolled in what, and what they bought.

Owns: ``Enrollment`` rows and the ``StudentSubscription`` rows that follow from
them.

Reads from ctx: ``academy_id``, ``staff_ids``; students (s04) and groups (s03)
are read from the database so this module also works under ``--only s05``.
Adds to ctx: ``enrollment_ids``, ``subscription_ids``.

Three rules shape the whole module:

* **One to four classes, never more.** Each student is given a target first,
  and *every* enrolment counts against it — including the edge-case offers.
  Adding the free trial on top of a full timetable is how a student ends up
  taking five classes, which is exactly the kind of thing the brief asks a seed
  not to do.
* **A student takes distinct subjects.** Sampling classes freely would put one
  child in three different Math groups, which no timetable would ever do. Up to
  four subjects are chosen first, then one group within each. A student on the
  Physique trial therefore does not also take a regular Physique group — the
  trial *is* their Physique.
* **Capacity is real.** A group that is full is not offered, and a student who
  cannot be placed in any group keeps the subjects they did get rather than
  overflowing a room.
"""

import calendar
from collections import defaultdict
from datetime import timedelta

from seed.config import PAYMENT_METHODS, REGULAR_GROUP_NAMES, TODAY
from seed.helpers import bulk_insert, log
from seed.pools import pick

MODULE = "s05_enrollments"

#: Distribution of "how many classes does this student take", as
#: (class_count, weight). Most take two; a tenth take the full four.
CLASS_COUNT_MIX = ((1, 30), (2, 35), (3, 25), (4, 10))

#: How many students are also put on the two edge-case offers.
FREE_TRIAL_STUDENTS = 15
TIME_BASED_STUDENTS = 20

#: A small share of enrolments are not in good standing.
WITHDRAWN_RATE = 0.04

#: Subscription statuses forced onto the front of the list, so that every value
#: the column documents is reachable from a demo. The remainder are ACTIVE,
#: with a few randomly overdue.
FORCED_STATUSES = (
    ("EXPIRED", 6),
    ("OVERDUE", 6),
    ("DEPLETED", 8),
    ("CANCELLED", 6),
    ("SUSPENDED", 5),
)


def _weighted_count(rng):
    """How many classes one student takes, per ``CLASS_COUNT_MIX``."""
    total = sum(weight for _, weight in CLASS_COUNT_MIX)
    roll = rng.randrange(total)
    running = 0
    for count, weight in CLASS_COUNT_MIX:
        running += weight
        if roll < running:
            return count
    return CLASS_COUNT_MIX[-1][0]


def _cycle_bounds():
    """The current monthly cycle: first and last day of TODAY's month."""
    start = TODAY.replace(day=1)
    end = TODAY.replace(day=calendar.monthrange(TODAY.year, TODAY.month)[1])
    return start, end


def run(ctx: dict) -> dict:
    """Create the enrolments and subscriptions. Returns counts."""
    from app.extensions import db
    from app.models.billing import StudentSubscription
    from app.models.class_room import Class
    from app.models.student import Enrollment, Student
    from app.models.user import User

    rng = ctx["rng"]
    academy_id = ctx["academy_id"]

    students = (
        db.session.query(Student)
        .filter_by(academy_id=academy_id)
        .order_by(Student.created_at, Student.id)
        .all()
    )
    classes = db.session.query(Class).filter_by(academy_id=academy_id).all()

    staff_ids = list(ctx.get("staff_ids") or [])
    if not staff_ids:
        staff_ids = [
            u.id
            for u in db.session.query(User)
            .filter_by(academy_id=academy_id)
            .order_by(User.created_at)
            .all()
        ]

    regular = [c for c in classes if c.group_name in REGULAR_GROUP_NAMES]
    by_id = {c.id: c for c in classes}
    by_subject = defaultdict(list)
    for klass in regular:
        by_subject[klass.subject].append(klass)
    for options in by_subject.values():
        options.sort(key=lambda c: c.name)

    placed = defaultdict(int)

    # Each student's total class budget, and what they have spent it on so far.
    # ``taken`` is the single source of truth for the 1..4 rule: the edge-case
    # offers below write to it too, so an offer can never overrun the budget.
    targets = {s.id: _weighted_count(rng) for s in students}
    taken = defaultdict(list)  # student_id -> [(class, subject)]
    enrolled_at_floor = {s.id: s.created_at for s in students}

    def _joined(student, spread):
        """An enrolment date shortly after the student first joined."""
        when = enrolled_at_floor[student.id] + timedelta(
            days=rng.randrange(0, spread), hours=rng.randrange(9, 18)
        )
        return student.created_at if when.date() > TODAY else when

    def _record(student, klass, when, status):
        placed[klass.id] += 1
        taken[student.id].append((klass, klass.subject))
        enrollments.append(
            Enrollment(
                student_id=student.id,
                class_id=klass.id,
                enrolled_at=when,
                status=status,
                created_at=when,
            )
        )

    enrollments = []

    # The two edge-case offers, placed first and deliberately rather than left
    # to chance. Placing them first is what lets them claim a budget slot
    # instead of being bolted on at the end.
    free_class = next((c for c in classes if c.price_da == 0), None)
    time_based = next((c for c in classes if c.billing_model == "TIME_BASED"), None)
    for klass, count in (
        (free_class, FREE_TRIAL_STUDENTS),
        (time_based, TIME_BASED_STUDENTS),
    ):
        if klass is None:
            continue
        eligible = [
            s
            for s in students
            if len(taken[s.id]) < targets[s.id]
            and klass.subject not in {subject for _, subject in taken[s.id]}
        ]
        for student in rng.sample(eligible, min(count, len(eligible))):
            _record(student, klass, _joined(student, 20), "active")

    for student in students:
        budget = targets[student.id] - len(taken[student.id])
        if budget <= 0:
            continue
        used_subjects = {subject for _, subject in taken[student.id]}
        candidates = [s for s in by_subject if s not in used_subjects]
        rng.shuffle(candidates)
        chosen_subjects = candidates[:budget]

        for subject in chosen_subjects:
            open_groups = [
                c for c in by_subject[subject] if placed[c.id] < c.capacity
            ]
            if not open_groups:
                # This subject is full; try to swap in another that is not.
                spares = [
                    s
                    for s in by_subject
                    if s not in used_subjects and any(
                        placed[c.id] < c.capacity for c in by_subject[s]
                    )
                ]
                if not spares:
                    continue
                subject = pick(rng, spares)
                open_groups = [
                    c for c in by_subject[subject] if placed[c.id] < c.capacity
                ]

            klass = pick(rng, open_groups)
            used_subjects.add(subject)
            status = "withdrawn" if rng.random() < WITHDRAWN_RATE else "active"
            _record(student, klass, _joined(student, 30), status)

    bulk_insert(db, enrollments, chunk=500, rng=rng)

    # ---------------------------------------------------------- subscriptions
    cycle_start, cycle_end = _cycle_bounds()
    access_end = cycle_start + timedelta(weeks=4)

    statuses = []
    for name, count in FORCED_STATUSES:
        statuses.extend([name] * count)

    # Scatter the forced statuses rather than letting them land on the first N
    # rows. ``enrollments`` is in student order, so taking them in sequence
    # would put every EXPIRED subscription on the half-dozen oldest students
    # and make the arrears look like one family's problem.
    forced = {}
    if statuses:
        slots = list(range(len(enrollments)))
        rng.shuffle(slots)
        forced = dict(zip(slots[: len(statuses)], statuses))

    subscriptions = []
    for index, enrollment in enumerate(enrollments):
        klass = by_id[enrollment.class_id]
        total = max(1, klass.credits_per_cycle or 1)

        if index in forced:
            status = forced[index]
        else:
            status = "OVERDUE" if rng.random() < 0.04 else "ACTIVE"

        if status in ("EXPIRED", "DEPLETED"):
            remaining = 0
        elif status == "ACTIVE":
            remaining = rng.randint(1, total)
        else:
            remaining = rng.randint(0, total)

        if status in ("OVERDUE", "CANCELLED", "SUSPENDED"):
            # In arrears or cancelled: part-paid or nothing.
            amount_paid = int(klass.price_da * rng.choice((0.0, 0.5, 0.75)))
        elif enrollment.status == "withdrawn":
            amount_paid = int(klass.price_da * 0.5)
        else:
            amount_paid = klass.price_da

        subscriptions.append(
            StudentSubscription(
                academy_id=academy_id,
                enrollment_id=enrollment.id,
                student_id=enrollment.student_id,
                group_id=klass.id,
                billing_model=klass.billing_model,
                total_credits=total,
                remaining_credits=remaining,
                cycle_start_date=cycle_start,
                cycle_deadline=cycle_end,
                access_start_date=cycle_start,
                access_end_date=access_end,
                max_groups_included=1,
                enrolled_group_ids=[klass.id],
                amount_paid_da=amount_paid,
                payment_method=pick(rng, PAYMENT_METHODS),
                recorded_by_staff_id=pick(rng, staff_ids) if staff_ids else None,
                makeup_credits=1 if rng.random() < 0.12 else 0,
                status=status,
                created_at=enrollment.enrolled_at,
                updated_at=enrollment.enrolled_at,
            )
        )

    bulk_insert(db, subscriptions, chunk=500, rng=rng)

    ctx["enrollment_ids"] = [e.id for e in enrollments]
    ctx["subscription_ids"] = [s.id for s in subscriptions]

    size = max(placed.values()) if placed else 0
    log(
        f"[{MODULE}] {len(enrollments)} enrolments, {len(subscriptions)} subscriptions, "
        f"largest group {size}"
    )
    return {"enrollments": len(enrollments), "subscriptions": len(subscriptions)}
