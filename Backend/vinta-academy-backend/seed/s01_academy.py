"""
s01_academy — the tenant root: everything every later module hangs off.

Owns: Academy, AcademySettings, Subscription (SaaS tier), the 3 User accounts
(1 owner + 2 staff), the 7 Subjects, the 6–8 Classrooms, and the generic
PaymentPlan rows.

This is the only module that may be run on an empty database, and the only one
whose output later modules cannot do without. It is **not** idempotent: run it
against a fresh database (``run.py --fresh``), never twice into the same file.

Everything is written in one transaction and committed once, at the end.
"""

from datetime import datetime, time, timedelta

from seed.config import (
    ACADEMY_ADDRESS,
    ACADEMY_CURRENT_TERM,
    ACADEMY_EMAIL,
    ACADEMY_NAME,
    ACADEMY_PHONE,
    ACADEMY_WEEKEND_DAY,
    CLASSROOM_CAPACITY_MAX,
    CLASSROOM_CAPACITY_MIN,
    CLASSROOM_COUNT_MAX,
    CLASSROOM_COUNT_MIN,
    DEFAULT_CREDITS_PER_CYCLE,
    OWNER_EMAIL,
    OWNER_NAME,
    OWNER_PASSWORD,
    OWNER_PIN,
    PLAN_AMOUNTS,
    PLAN_DURATION_DAYS,
    PLAN_NAME_TEMPLATE,
    ROOM_NAMES,
    SESSIONS_PER_MONTH_CHOICES,
    SETTINGS_CURRENCY,
    SETTINGS_LANGUAGE,
    STAFF,
    SUBJECT_COLORS,
    SUBJECTS,
    SUBSCRIPTION_STATUS,
    SUBSCRIPTION_TIER,
    TODAY,
)
from seed.helpers import hex_color, log, new_id
from seed.pools import phone, pick_many

MODULE = "s01_academy"


def run(ctx: dict) -> dict:
    """Create the academy root. Mutates ``ctx`` in place; returns counts."""
    # Imported inside run(): importing app.* at module import time would drag
    # in the Flask app before seed/run.py has set DATABASE_URL.
    from app.extensions import db
    from app.models import (
        Academy,
        AcademySettings,
        Classroom,
        PaymentPlan,
        Subject,
        Subscription,
        User,
    )

    rng = ctx["rng"]

    # Ids are drawn from the rng (helpers.new_id) rather than left to the
    # models' uuid4 defaults, so two runs produce the same database.
    # --- 1. Academy -------------------------------------------------------
    academy = Academy(
        id=new_id(rng),
        name=ACADEMY_NAME,
        phone=ACADEMY_PHONE,
        email=ACADEMY_EMAIL,
        address=ACADEMY_ADDRESS,
        weekend_day=ACADEMY_WEEKEND_DAY,
        current_term=ACADEMY_CURRENT_TERM,
    )
    db.session.add(academy)
    db.session.flush()  # materialise academy.id for the rows below
    ctx["academy_id"] = academy.id

    # --- 2. AcademySettings ----------------------------------------------
    # Billing toggles are left at their model defaults on purpose: the seed
    # should not quietly change how the academy bills. Only the three values
    # the rest of the data assumes are set explicitly.
    db.session.add(
        AcademySettings(
            id=new_id(rng),
            academy_id=academy.id,
            currency=SETTINGS_CURRENCY,
            default_credits_per_cycle=DEFAULT_CREDITS_PER_CYCLE,
            default_language=SETTINGS_LANGUAGE,
        )
    )

    # --- 3. SaaS subscription --------------------------------------------
    db.session.add(
        Subscription(
            id=new_id(rng),
            academy_id=academy.id,
            tier=SUBSCRIPTION_TIER,
            status=SUBSCRIPTION_STATUS,
            expires_at=datetime.combine(TODAY + timedelta(days=365), time(23, 59, 59)),
        )
    )

    # --- 4. Users: exactly one owner, exactly two staff -------------------
    owner = User(
        id=new_id(rng),
        academy_id=academy.id,
        name=OWNER_NAME,
        email=User.normalize_email(OWNER_EMAIL),
        phone=phone(rng),
        role="owner",
        pin_hash=User.hash_pin(OWNER_PIN),
        picture={"type": "preset", "colors": [hex_color(rng), hex_color(rng)]},
        is_active=True,
    )
    owner.set_password(OWNER_PASSWORD)
    db.session.add(owner)

    staff_users = []
    for staff in STAFF:
        user = User(
            id=new_id(rng),
            academy_id=academy.id,
            name=staff["name"],
            email=User.normalize_email(staff["email"]),
            phone=phone(rng),
            role="staff",
            pin_hash=User.hash_pin(staff["pin"]),
            picture={"type": "preset", "colors": [hex_color(rng), hex_color(rng)]},
            is_active=True,
        )
        db.session.add(user)
        staff_users.append(user)

    db.session.flush()
    ctx["owner_id"] = owner.id
    ctx["staff_ids"] = [u.id for u in staff_users]
    ctx["user_ids"] = [owner.id] + ctx["staff_ids"]

    # --- 5. Subjects: one per name, each with its own colour --------------
    subjects = [
        Subject(
            id=new_id(rng),
            academy_id=academy.id,
            name=name,
            color=SUBJECT_COLORS[name],
        )
        for name in SUBJECTS
    ]
    db.session.add_all(subjects)
    db.session.flush()
    ctx["subject_ids"] = {s.name: s.id for s in subjects}

    # --- 6. Classrooms ----------------------------------------------------
    room_count = rng.randint(CLASSROOM_COUNT_MIN, CLASSROOM_COUNT_MAX)
    classrooms = [
        Classroom(
            id=new_id(rng),
            academy_id=academy.id,
            name=name,
            capacity=rng.randint(CLASSROOM_CAPACITY_MIN, CLASSROOM_CAPACITY_MAX),
        )
        for name in pick_many(rng, ROOM_NAMES, room_count)
    ]
    db.session.add_all(classrooms)
    db.session.flush()
    ctx["classroom_ids"] = [c.id for c in classrooms]

    # --- 7. Generic payment plans ----------------------------------------
    # One per sessions-per-month tier, priced at PLAN_AMOUNTS. A later module
    # that needs a class-specific price creates its own PaymentPlan row and
    # adds it to ctx["plan_ids"] under its own (sessions, amount) key.
    plans = []
    plan_by_key = {}
    for sessions in SESSIONS_PER_MONTH_CHOICES:
        amount = PLAN_AMOUNTS[sessions]
        plan = PaymentPlan(
            id=new_id(rng),
            academy_id=academy.id,
            name=PLAN_NAME_TEMPLATE.format(n=sessions),
            duration_days=PLAN_DURATION_DAYS,
            amount_da=amount,
        )
        db.session.add(plan)
        plans.append(plan)
        plan_by_key[(sessions, amount)] = plan
    db.session.flush()
    ctx["plan_ids"] = {key: plan.id for key, plan in plan_by_key.items()}

    # --- commit once ------------------------------------------------------
    db.session.commit()

    counts = {
        "academies": 1,
        "academy_settings": 1,
        "subscriptions": 1,
        "users": 1 + len(staff_users),
        "subjects": len(subjects),
        "classrooms": len(classrooms),
        "payment_plans": len(plans),
    }
    log(f"[{MODULE}] academy={academy.id} owner={owner.id} {counts}")
    return counts
