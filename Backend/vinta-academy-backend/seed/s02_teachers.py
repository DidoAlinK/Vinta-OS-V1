"""
s02_teachers — the teaching staff.

Owns: the 7 teachers, one per subject, plus the TeacherSubject links.

Reads from ctx: ``academy_id``, ``subject_ids``.
Adds to ctx: ``teacher_ids`` (subject name -> Teacher id).

Every value is drawn from ``ctx["rng"]`` and every primary key from
``helpers.new_id(rng)``, so two ``--fresh`` runs produce the same 7 rows.
Names are distinct by construction (``pools.pick_many`` samples without
replacement), and emails are de-duplicated by suffixing a digit — never by
re-drawing, which would make the result depend on how many times the rng
happened to be asked.
"""

from seed.config import ACADEMY_EMAIL, SUBJECTS
from seed.helpers import log, new_id
from seed.pools import (
    FAMILY_NAMES,
    FEMALE_FIRST_NAMES,
    MALE_FIRST_NAMES,
    email_slug,
    phone,
    pick_many,
)

MODULE = "s02_teachers"

#: 4 male / 3 female before the shuffle: a staff room, not a quota.
GENDER_SPLIT = ("male",) * 4 + ("female",) * 3

#: 4 hourly / 3 per-student. The two legacy contract flavours are both in
#: play because s07 has code paths for each.
CONTRACT_SPLIT = ("hourly",) * 4 + ("per_student",) * 3

#: 3 / 2 / 2 — every commission model the enum offers, none of them a
#: singleton, so a filter on any one of the three still returns rows.
COMMISSION_SPLIT = (
    "PERCENTAGE",
    "PERCENTAGE",
    "PERCENTAGE",
    "FLAT_HOURLY",
    "FLAT_HOURLY",
    "FIXED_SESSION",
    "FIXED_SESSION",
)

#: commission_value by commission_type: (min, max), inclusive. PERCENTAGE is a
#: percent (25–40 %), the other two are DZD. All three fit the Integer column.
COMMISSION_RANGES = {
    "PERCENTAGE": (25, 40),
    "FLAT_HOURLY": (800, 2000),
    "FIXED_SESSION": (350, 700),
}

HOURLY_RATE_MIN = 1000
HOURLY_RATE_MAX = 2500
PER_STUDENT_RATE_MIN = 500
PER_STUDENT_RATE_MAX = 900

#: Remarks for the handful of teachers that carry one. Most teachers have
#: nothing written against them; three of the seven get a line.
TEACHER_NOTES = (
    "Disponible le samedi matin uniquement.",
    "Ancienne enseignante au lycée — à l'aise avec les 3ème.",
    "Préfère les créneaux de fin de journée.",
    "Assure aussi les remplacements d'urgence.",
    "Demande à ne pas dépasser 20 élèves par groupe.",
    "Douze ans d'expérience, référence pour la préparation du BAC.",
)

#: How many of the 7 get a row in Teacher.notes.
NOTED_TEACHERS = 3


def run(ctx: dict) -> dict:
    """Create the teachers. Mutates ``ctx`` in place; returns counts."""
    # Imported inside run(): importing app.* at module import time would drag
    # in the Flask app before seed/run.py has set DATABASE_URL.
    from app.extensions import db
    from app.models import Teacher

    # TeacherSubject is not re-exported from app.models/__init__.py.
    from app.models.teacher import TeacherSubject

    rng = ctx["rng"]
    academy_id = ctx["academy_id"]
    subject_ids = ctx["subject_ids"]

    subjects = list(SUBJECTS)
    # Teachers live on the same domain as the academy's own address, so the
    # domain stays a single derived value rather than a second constant.
    domain = ACADEMY_EMAIL.split("@", 1)[1]

    # --- identities: 7 distinct people, genders mixed ---------------------
    genders = list(GENDER_SPLIT)
    rng.shuffle(genders)
    male_firsts = iter(
        pick_many(rng, MALE_FIRST_NAMES, genders.count("male"))
    )
    female_firsts = iter(
        pick_many(rng, FEMALE_FIRST_NAMES, genders.count("female"))
    )
    first_names = [
        next(male_firsts) if gender == "male" else next(female_firsts)
        for gender in genders
    ]
    # Distinct family names too: two "Amine Benali"s in one staff room would
    # also collide on email.
    last_names = pick_many(rng, FAMILY_NAMES, len(subjects))

    # --- contract and commission flavours, spread across the 7 ------------
    contracts = list(CONTRACT_SPLIT)
    rng.shuffle(contracts)
    commissions = list(COMMISSION_SPLIT)
    rng.shuffle(commissions)

    # --- notes: 3 of the 7, one distinct remark each ----------------------
    notes_for = dict(
        zip(
            pick_many(rng, subjects, NOTED_TEACHERS),
            pick_many(rng, TEACHER_NOTES, NOTED_TEACHERS),
        )
    )

    # --- emails: unique per academy, never by re-drawing ------------------
    used_emails = set()

    def make_email(first, last):
        """``prenom.nom@<academy domain>``, disambiguated with a digit.

        ``first``+``last`` are distinct for all 7, so the loop body normally
        runs once; it exists so a future pool edit cannot produce the
        duplicate that would trip uq_teacher_email_per_academy mid-run.
        """
        base = email_slug(f"{first} {last}")
        candidate = base
        suffix = 2
        while candidate in used_emails:
            candidate = f"{base}{suffix}"
            suffix += 1
        used_emails.add(candidate)
        return f"{candidate}@{domain}"

    # --- build ------------------------------------------------------------
    teachers = []
    links = []
    teacher_ids = {}

    for name, first, last, contract, commission in zip(
        subjects, first_names, last_names, contracts, commissions
    ):
        if contract == "hourly":
            # hourly_rate is the rate for hourly contracts; a per-student
            # contract has no hourly figure to quote, so it stays NULL.
            hourly_rate = rng.randint(HOURLY_RATE_MIN, HOURLY_RATE_MAX)
            per_student_rate = None
        else:
            hourly_rate = None
            per_student_rate = rng.randint(
                PER_STUDENT_RATE_MIN, PER_STUDENT_RATE_MAX
            )

        low, high = COMMISSION_RANGES[commission]
        commission_value = rng.randint(low, high)

        teacher = Teacher(
            id=new_id(rng),
            academy_id=academy_id,
            first_name=first,
            last_name=last,
            phone=phone(rng),
            email=make_email(first, last),
            status="ACTIVE",
            subject=name,
            notes=notes_for.get(name),
            contract_type=contract,
            hourly_rate=hourly_rate,
            per_student_rate=per_student_rate,
            commission_type=commission,
            commission_value=commission_value,
        )
        teachers.append(teacher)
        teacher_ids[name] = teacher.id

    # --- junction rows: one subject per teacher ---------------------------
    # Pair by subject name so the link cannot drift from Teacher.subject.
    for name, teacher in zip(subjects, teachers):
        links.append(
            TeacherSubject(teacher_id=teacher.id, subject_id=subject_ids[name])
        )

    db.session.add_all(teachers + links)
    db.session.commit()

    ctx["teacher_ids"] = teacher_ids

    counts = {"teachers": len(teachers), "teacher_subjects": len(links)}
    log(f"[{MODULE}] {counts}")
    return counts
