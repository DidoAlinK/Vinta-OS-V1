"""
s04_students — the roll: 489 students and the people to ring in an emergency.

Owns: ``Student`` rows and their ``Guardian`` rows.

Reads from ctx: ``academy_id``.
Adds to ctx: ``student_ids``.

Two details are deliberate rather than incidental:

* **Backdating.** A real academy fills up over a year, not on one afternoon, so
  ``created_at`` is spread across the preceding twelve months. Nothing reads it
  yet, but a register where every child joined on the same day is the kind of
  thing that quietly makes a demo look fake.
* **Siblings.** Eighteen pairs share a surname *and* a parent phone. That is
  what makes the "remise fratrie" and shared-payer paths in billing reachable
  at all, and it is the shape a guardian lookup has to survive.
"""

from datetime import datetime, time as dtime, timedelta

from seed.config import STUDENT_COUNT, TODAY
from seed.helpers import bulk_insert, log
from seed.pools import (
    FAMILY_NAMES,
    FEMALE_FIRST_NAMES,
    MALE_FIRST_NAMES,
    NOTE_SNIPPETS,
    phone,
    pick,
    pick_many,
)

MODULE = "s04_students"

#: How many of the 489 arrive as one of a sibling pair.
SIBLING_PAIRS = 18

#: Students explicitly marked inactive (left the academy), so the "inactive"
#: path is always present no matter how the random draw falls.
FORCED_INACTIVE = 8

#: Roughly how many students have no phone of their own.
NO_PHONE_RATE = 0.30

#: Roughly how many acquire a second guardian.
TWO_GUARDIAN_RATE = 0.15

#: Secondary guardians, used when a student has more than one. "Père"/"Mère"
#: are reserved for the primary contact.
SECONDARY_RELATIONSHIPS = (
    "Oncle",
    "Tante",
    "Tuteur",
    "Grand-père",
    "Grand-mère",
    "Frère aîné",
)

#: How far back the intake is spread.
INTAKE_WINDOW_DAYS = 365


def _join_date(rng):
    """A deterministic intake date somewhere in the last twelve months."""
    days_back = rng.randrange(0, INTAKE_WINDOW_DAYS)
    day = TODAY - timedelta(days=days_back)
    return datetime(day.year, day.month, day.day, rng.randrange(9, 18), rng.randrange(60))


def _guardian_name(rng, student, relationship):
    """A parent shares the child's surname; anyone else is their own person."""
    if relationship == "Père":
        return f"{pick(rng, MALE_FIRST_NAMES)} {student.last_name}"
    if relationship == "Mère":
        return f"{pick(rng, FEMALE_FIRST_NAMES)} {student.last_name}"
    return f"{pick(rng, MALE_FIRST_NAMES + FEMALE_FIRST_NAMES)} {pick(rng, FAMILY_NAMES)}"


def run(ctx: dict) -> dict:
    """Create the students and their guardians. Returns counts."""
    from app.extensions import db
    from app.models.student import Guardian, Student

    rng = ctx["rng"]
    academy_id = ctx["academy_id"]

    # ------------------------------------------------------------ identities
    # Sibling pairs are laid down first and deliberately: same surname, same
    # home number, two different children.
    roster = []  # (first_name, last_name, shared_parent_phone_or_None, join_date)
    family_names = pick_many(rng, FAMILY_NAMES, SIBLING_PAIRS)
    for family_name in family_names:
        shared_phone = phone(rng)
        joined = _join_date(rng)
        # One of each sex, so a pair is not always two brothers.
        for gender in rng.sample(("male", "female"), 2):
            pool = MALE_FIRST_NAMES if gender == "male" else FEMALE_FIRST_NAMES
            roster.append((pick(rng, pool), family_name, shared_phone, joined))

    while len(roster) < STUDENT_COUNT:
        gender = "male" if rng.random() < 0.5 else "female"
        pool = MALE_FIRST_NAMES if gender == "male" else FEMALE_FIRST_NAMES
        roster.append(
            (pick(rng, pool), pick(rng, FAMILY_NAMES), None, _join_date(rng))
        )

    roster = roster[:STUDENT_COUNT]
    rng.shuffle(roster)

    students = []
    for index, (first_name, last_name, shared_phone, joined) in enumerate(roster):
        parent_phone = shared_phone or phone(rng)
        students.append(
            Student(
                academy_id=academy_id,
                first_name=first_name,
                last_name=last_name,
                phone=None if rng.random() < NO_PHONE_RATE else phone(rng),
                parent_phone=parent_phone,
                notes=pick(rng, NOTE_SNIPPETS),
                is_active=index >= FORCED_INACTIVE and rng.random() > 0.03,
                created_at=joined,
                updated_at=joined,
            )
        )

    bulk_insert(db, students, chunk=500, rng=rng)

    # ------------------------------------------------------------- guardians
    guardians = []
    for student in students:
        primary_relationship = "Père" if rng.random() < 0.5 else "Mère"
        primary = Guardian(
            student_id=student.id,
            name=_guardian_name(rng, student, primary_relationship),
            relationship_type=primary_relationship,
            phone=student.parent_phone,
            is_emergency=True,
            created_at=student.created_at,
        )

        secondary = None
        if rng.random() < TWO_GUARDIAN_RATE:
            secondary = Guardian(
                student_id=student.id,
                name=_guardian_name(rng, student, "Tuteur"),
                relationship_type=pick(rng, SECONDARY_RELATIONSHIPS),
                phone=student.parent_phone if rng.random() < 0.4 else phone(rng),
                is_emergency=False,
                created_at=student.created_at,
            )
            # A third of the time the second contact is the one to call first —
            # otherwise "emergency contact" always means "first row inserted".
            if rng.random() < 0.34:
                primary.is_emergency = False
                secondary.is_emergency = True

        guardians.append(primary)
        if secondary is not None:
            guardians.append(secondary)

    bulk_insert(db, guardians, chunk=500, rng=rng)

    ctx["student_ids"] = [s.id for s in students]

    two_guardian = len(guardians) - len(students)
    log(
        f"[{MODULE}] {len(students)} students, {len(guardians)} guardians "
        f"({two_guardian} students with a second contact)"
    )
    return {"students": len(students), "guardians": len(guardians)}
