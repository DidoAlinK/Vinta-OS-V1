"""
s03_classes — the weekly groups and their recurring slots.

Owns: 28 weekly groups (7 teachers × 4) plus the edge-case classes, plus the
Schedule rows that say when each one meets.

Reads from ctx: ``academy_id``, ``subject_ids``, ``classroom_ids``, plus
whatever s02 leaves behind (teachers).
Adds to ctx: ``class_ids``, ``weekly_class_ids``, ``edge_class_ids``,
``schedule_ids``.

Every fact a later module needs is stored in a *column* — price, credits,
subject, teacher, class_type, billing_model all live on ``classes`` — so a
module run with ``--only sNN`` and an empty ctx can still find what it needs
by querying. Nothing load-bearing lives only in ctx.
"""

from datetime import datetime, time

from seed.config import (
    GROUP_PLAN,
    PER_SESSION_RATE_MAX,
    PER_SESSION_RATE_MIN,
    SUBJECT_COLORS,
    SESSIONS_PER_MONTH_CHOICES,
    TEMPORARY_CLASSES,
)
from seed.helpers import log, new_id
from seed.pools import pick

MODULE = "s03_classes"

#: Sessions per month -> how many weekly slots that group meets in. A group
#: sold as 12 sessions a month cannot meet once a week and honour that, so the
#: slot count rises with the credit count.
SLOTS_BY_CREDITS = {4: 1, 6: 2, 8: 2, 12: 3}

#: Days the academy runs. 5 is Friday — ``Academy.weekend_day`` — and is never
#: scheduled.
TEACHING_DAYS = (0, 1, 2, 3, 4, 6)

#: Indexed by ``Schedule.day_of_week`` (0 = Sunday).
DAY_LABELS = ("Dim", "Lun", "Mar", "Mer", "Jeu", "Ven", "Sam")

#: Two-hour teaching blocks, on the hour, 08:00-20:00.
BLOCKS = ((8, 10), (10, 12), (12, 14), (14, 16), (16, 18), (18, 20))

#: (per_session_rate, credits_per_cycle) pairs that guarantee the price
#: extremes and the 4/6/8/12 coverage the brief asks for. Drawn at random these
#: would only *probably* appear, and a seed that misses its own edge cases is
#: not much use. 14 forced pairs + 14 drawn = the 28 weekly groups.
FORCED_PRICING = (
    (500, 4),    # floor   -> 2 000 DA/month
    (900, 4),    # ceiling -> 3 600 DA/month
    (600, 4),
    (700, 4),
    (550, 6),
    (650, 6),
    (800, 6),
    (720, 6),
    (580, 8),
    (680, 8),
    (780, 8),
    (880, 8),
    (560, 12),
    (900, 12),   # top of the range at the highest session count
)

#: The groups are all created when the academy opens.
CLASS_CREATED_AT = datetime(2026, 6, 1, 9, 0)

#: Names of the three one-off classes, in ``config.TEMPORARY_CLASSES`` order.
TEMPORARY_SUBJECTS = ("Math", "Français", "Anglais")


def _class_name(subject, level, group_name, single):
    """``"Math — 1er Lycée"``, or ``"Math — 3ème Lycée (B)"`` when ambiguous."""
    if single:
        return f"{subject} — {level}"
    return f"{subject} — {level} ({group_name})"


def _pricing_pairs(rng):
    """The 28 (rate, credits) pairs, forced ones included, shuffled."""
    extra = [
        (rng.randint(PER_SESSION_RATE_MIN, PER_SESSION_RATE_MAX),
         pick(rng, SESSIONS_PER_MONTH_CHOICES))
        for _ in range(28 - len(FORCED_PRICING))
    ]
    pairs = list(FORCED_PRICING) + extra
    rng.shuffle(pairs)
    return pairs


def _reserve_windows(rng, class_index, wanted, teacher_id, teacher_busy, rooms, room_busy):
    """Pick ``wanted`` conflict-free (day, block, room) triples for one group.

    Walks the week starting from a class-dependent offset so that groups do not
    all pile into the same first window, and skips any window where this
    teacher is already teaching or where no room is free.
    """
    windows = [(d, b) for d in TEACHING_DAYS for b in range(len(BLOCKS))]
    taken = []

    for step in range(len(windows)):
        if len(taken) == wanted:
            break
        day, block = windows[(class_index * 5 + step) % len(windows)]
        if (teacher_id, day, block) in teacher_busy:
            continue
        if any(day == d and block == b for d, b, _ in taken):
            continue

        room = next(
            (r for r in rooms if (r, day, block) not in room_busy), None
        )
        if room is None:
            continue

        room_busy.add((room, day, block))
        teacher_busy.add((teacher_id, day, block))
        taken.append((day, block, room))

    return taken


def _dedicated_time(windows):
    """``"Dim 10:00-12:00, Mer 14:00-16:00"`` from the reserved triples."""
    parts = []
    for day, block, _room in sorted(windows):
        start, end = BLOCKS[block]
        parts.append(f"{DAY_LABELS[day]} {start:02d}:00-{end:02d}:00")
    return ", ".join(parts)


def run(ctx: dict) -> dict:
    """Create the groups and schedules. Mutates ``ctx`` in place; returns counts."""
    from app.extensions import db
    from app.models.class_room import Class, Classroom
    from app.models.scheduling import Schedule
    from app.models.teacher import Teacher

    rng = ctx["rng"]
    academy_id = ctx["academy_id"]

    teachers = (
        db.session.query(Teacher)
        .filter_by(academy_id=academy_id)
        .order_by(Teacher.subject)
        .all()
    )
    teacher_by_subject = {t.subject: t for t in teachers}

    rooms = list(ctx.get("classroom_ids") or [])
    if not rooms:
        rooms = [
            c.id
            for c in db.session.query(Classroom)
            .filter_by(academy_id=academy_id)
            .order_by(Classroom.name)
            .all()
        ]

    pairs = _pricing_pairs(rng)
    teacher_busy = set()
    room_busy = set()

    classes = []
    schedules = []
    class_ids = {}
    weekly_class_ids = []
    edge_class_ids = {}

    # ---------------------------------------------------------------- Part A
    # The 28 weekly groups: each teacher gets one 1er, one 2ème, two 3ème.
    slot_index = 0
    for subject in sorted(teacher_by_subject):
        teacher = teacher_by_subject[subject]
        for level, group_name in GROUP_PLAN:
            single = sum(1 for lv, _ in GROUP_PLAN if lv == level) == 1
            rate, credits = pairs[slot_index]
            slot_index += 1

            name = _class_name(subject, level, group_name, single)
            klass = Class(
                academy_id=academy_id,
                name=name,
                subject=subject,
                color=SUBJECT_COLORS.get(subject),
                teacher_id=teacher.id,
                capacity=rng.randint(30, 60),
                academic_level=level,
                group_name=group_name,
                billing_model="CREDIT_BASED",
                price_da=rate * credits,
                credits_per_cycle=credits,
                cycle_week_limit=4 if credits in (4, 6) else None,
                allow_rollover=slot_index <= 2,
                allow_makeups=True,
                access_duration_weeks=4,
                max_groups_included=1,
                enforce_attendance=rng.random() < 0.15,
                attendance_threshold=0.75,
                class_type="weekly",
                notes=f"{rate} DA/séance × {credits} séances",
                created_at=CLASS_CREATED_AT,
                updated_at=CLASS_CREATED_AT,
            )
            classes.append(klass)
            weekly_class_ids.append(klass)

    # ---------------------------------------------------------------- Part B
    # Edge-case classes. These are what the brief means by "test edge cases":
    # a free offer, a time-based offer, and one-off classes whose sessions sit
    # in the past, next week, and two months out.
    free_class = Class(
        academy_id=academy_id,
        name="Séance d'essai — Physique",
        subject="Physique",
        color=SUBJECT_COLORS.get("Physique"),
        teacher_id=teacher_by_subject["Physique"].id,
        capacity=24,
        academic_level="Tous niveaux",
        group_name="E1",
        billing_model="CREDIT_BASED",
        price_da=0,
        credits_per_cycle=1,
        allow_makeups=True,
        access_duration_weeks=1,
        max_groups_included=1,
        class_type="weekly",
        notes="Gratuit — aucune facturation, aucune séance décomptée.",
        created_at=CLASS_CREATED_AT,
        updated_at=CLASS_CREATED_AT,
    )
    classes.append(free_class)

    time_based = Class(
        academy_id=academy_id,
        name="Cours intensif — Philo (trimestre)",
        subject="Philo",
        color=SUBJECT_COLORS.get("Philo"),
        teacher_id=teacher_by_subject["Philo"].id,
        capacity=40,
        academic_level="3ème Lycée",
        group_name="E2",
        billing_model="TIME_BASED",
        price_da=14000,
        credits_per_cycle=12,
        allow_makeups=True,
        access_duration_weeks=12,
        max_groups_included=1,
        class_type="weekly",
        notes="Accès trimestriel, 12 semaines.",
        created_at=CLASS_CREATED_AT,
        updated_at=CLASS_CREATED_AT,
    )
    classes.append(time_based)

    temporary = []
    for edge_index, ((temp_name, offset), subject) in enumerate(
        zip(TEMPORARY_CLASSES, TEMPORARY_SUBJECTS), start=3
    ):
        temp = Class(
            academy_id=academy_id,
            name=temp_name,
            subject=subject,
            color=SUBJECT_COLORS.get(subject),
            teacher_id=teacher_by_subject[subject].id,
            capacity=30,
            academic_level="Tous niveaux",
            group_name=f"E{edge_index}",
            billing_model="CREDIT_BASED",
            price_da=2500,
            credits_per_cycle=4,
            allow_makeups=False,
            access_duration_weeks=1,
            max_groups_included=1,
            class_type="temporary",
            notes=f"Stage ponctuel — J{offset:+d}.",
            created_at=CLASS_CREATED_AT,
            updated_at=CLASS_CREATED_AT,
        )
        temporary.append(temp)
        classes.append(temp)

    for klass in classes:
        klass.id = new_id(rng)
        db.session.add(klass)
    db.session.commit()

    edge_class_ids["free"] = free_class.id
    edge_class_ids["time_based"] = time_based.id
    for temp, label in zip(temporary, ("temporary_past", "temporary_near", "temporary_future")):
        edge_class_ids[label] = temp.id
    for klass in classes:
        class_ids[klass.name] = klass.id

    # ---------------------------------------------------------------- Part D
    # Weekly slots for the recurring groups. Temporary classes get none: they
    # are one-offs, and s06 places their single session by date instead.
    schedulable = [k for k in classes if k.class_type == "weekly"]
    schedule_ids = {}
    for index, klass in enumerate(schedulable):
        wanted = SLOTS_BY_CREDITS.get(klass.credits_per_cycle, 1)
        windows = _reserve_windows(
            rng, index, wanted, klass.teacher_id, teacher_busy, rooms, room_busy
        )
        ids = []
        for day, block, room in windows:
            start, end = BLOCKS[block]
            row = Schedule(
                id=new_id(rng),
                class_id=klass.id,
                classroom_id=room,
                day_of_week=day,
                start_time=time(start, 0),
                end_time=time(end, 0),
                created_at=CLASS_CREATED_AT,
            )
            schedules.append(row)
            ids.append(row.id)
        schedule_ids[klass.id] = ids
        if windows:
            klass.dedicated_time = _dedicated_time(windows)

    db.session.bulk_save_objects(schedules)
    db.session.commit()

    ctx["class_ids"] = class_ids
    ctx["weekly_class_ids"] = [k.id for k in classes if k.class_type == "weekly"]
    ctx["edge_class_ids"] = edge_class_ids
    ctx["schedule_ids"] = schedule_ids

    log(
        f"[{MODULE}] {len(classes)} classes "
        f"({len(weekly_class_ids)} weekly, {len(classes) - len(weekly_class_ids)} edge), "
        f"{len(schedules)} schedule slots"
    )
    return {"classes": len(classes), "schedules": len(schedules)}
