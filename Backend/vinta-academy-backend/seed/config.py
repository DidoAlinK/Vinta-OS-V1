"""
seed.config — every constant the seeder uses.

Nothing here imports from ``app.*``: this module is loaded by ``seed/run.py``
*before* ``DATABASE_URL`` is resolved by ``app.config.BaseConfig``, so it has
to stay free of application imports.

Determinism rules for the whole package:
  * every random choice comes from ``ctx["rng"]`` (seeded with ``RNG_SEED``);
  * "today" is the constant ``TODAY``, never ``date.today()``.
"""

from datetime import date

# --------------------------------------------------------------------------
# Target database
# --------------------------------------------------------------------------

#: Filename of the seed database. A *relative* sqlite URL is resolved by
#: Flask-SQLAlchemy against the app instance path, so this lands in
#: ``instance/vinta_seed.db`` — never the user's ``vinta_dev.db``.
DB_FILENAME = "vinta_seed.db"

#: The URL ``seed/run.py`` puts into ``DATABASE_URL`` before importing app.*
DB_URL = f"sqlite:///{DB_FILENAME}"

# --------------------------------------------------------------------------
# Determinism
# --------------------------------------------------------------------------

RNG_SEED = 20260928

#: The day the generated data is anchored to. Constant by design.
TODAY = date(2026, 9, 28)

#: Months of history generated before TODAY (s06 owns the sessions).
HISTORY_MONTHS = 3

# --------------------------------------------------------------------------
# Volume
# --------------------------------------------------------------------------

STUDENT_COUNT = 489

#: 7 teachers x 4 groups = 28 weekly groups (s03).
GROUPS_PER_TEACHER = 4

#: Composition of one teacher's four groups: one 1er, one 2ème, two 3ème.
#: The two 3ème groups of the same subject are told apart by group_name "A"
#: and "B"; the single 1er / 2ème group each get "A".
GROUP_PLAN = (
    ("1er Lycée", "A"),
    ("2ème Lycée", "A"),
    ("3ème Lycée", "A"),
    ("3ème Lycée", "B"),
)

LEVELS = ("1er Lycée", "2ème Lycée", "3ème Lycée")

#: ``group_name`` values used by the 28 regular groups. The edge-case classes
#: (free, time-based, the three stages) use ``E1``…``E5`` instead, so
#: "the regular timetable" is one query — ``group_name IN ('A','B')`` —
#: rather than something a caller has to reconstruct from names or prices.
REGULAR_GROUP_NAMES = ("A", "B")

#: Sessions a group holds per month. Chosen per class in s03.
SESSIONS_PER_MONTH_CHOICES = (4, 6, 8, 12)

#: Teacher pay per conducted session, in DZD. Used by s07 payouts.
PER_SESSION_RATE_MIN = 500
PER_SESSION_RATE_MAX = 900

# --------------------------------------------------------------------------
# Subjects — names, and one distinct calendar colour each
# --------------------------------------------------------------------------

SUBJECTS = (
    "Math",
    "Physique",
    "Science",
    "Arabe",
    "Français",
    "Anglais",
    "Philo",
)

SUBJECT_COLORS = {
    "Math": "#b3872a",
    "Physique": "#2a6fb3",
    "Science": "#2ab37b",
    "Arabe": "#8c2ab3",
    "Français": "#b32a5e",
    "Anglais": "#b3582a",
    "Philo": "#4a4ab3",
}

#: General-purpose tasteful palette for ``helpers.hex_color(rng)``.
PALETTE = (
    "#2a6fb3",
    "#b3872a",
    "#2ab37b",
    "#8c2ab3",
    "#b32a5e",
    "#b3582a",
    "#4a4ab3",
    "#2ab3b3",
    "#7aa327",
    "#a32a2a",
)

# --------------------------------------------------------------------------
# Academy identity
# --------------------------------------------------------------------------

ACADEMY_NAME = "Académie El Feth"
ACADEMY_ADDRESS = "12, Rue des Frères Bouadou, Bir Mourad Raïs, Alger 16000"
ACADEMY_PHONE = "+213661204080"
ACADEMY_EMAIL = "contact@academie-el-feth.dz"
ACADEMY_WEEKEND_DAY = 5  # Friday, per the model's own comment
ACADEMY_CURRENT_TERM = "2026 — Trimestre 1"

#: Physical rooms. s01 creates a random 6–8 of these.
ROOM_NAMES = (
    "Salle Ibn Khaldoun",
    "Salle El Khawarizmi",
    "Salle Ibn Sina",
    "Salle Emir Abdelkader",
    "Salle Ahmed Zabana",
    "Salle Mohamed Boudiaf",
    "Salle Assia Djebar",
    "Salle Frantz Fanon",
)
CLASSROOM_COUNT_MIN = 6
CLASSROOM_COUNT_MAX = 8
CLASSROOM_CAPACITY_MIN = 25
CLASSROOM_CAPACITY_MAX = 60

# --------------------------------------------------------------------------
# Accounts created by s01 (see README for the login cheat-sheet)
# --------------------------------------------------------------------------

OWNER_NAME = "Yacine Benali"
OWNER_EMAIL = "direction@academie-el-feth.dz"
OWNER_PIN = "1234"
OWNER_PASSWORD = "owner1234"

#: Two staff accounts. ``staff_ids`` in ctx is in this order.
STAFF = (
    {
        "name": "Nadia Meziane",
        "email": "nadia.meziane@academie-el-feth.dz",
        "pin": "1111",
    },
    {
        "name": "Sofiane Haddad",
        "email": "sofiane.haddad@academie-el-feth.dz",
        "pin": "2222",
    },
)

# --------------------------------------------------------------------------
# Money
# --------------------------------------------------------------------------

CURRENCIES = ("DZD",)
PAYMENT_METHODS = ("CASH", "CCP", "BARIDI_MOB")

SUBSCRIPTION_TIER = "pro"
SUBSCRIPTION_STATUS = "active"
SETTINGS_CURRENCY = "DZD"
SETTINGS_LANGUAGE = "fr"
DEFAULT_CREDITS_PER_CYCLE = 4

#: Representative monthly price per sessions-per-month tier, in DZD.
#: 800 DA per session across the board: inside [PER_SESSION_RATE_MIN,
#: PER_SESSION_RATE_MAX], and a clean number for later money modules to
#: derive from. Plans are named "<n> séances / mois", 30 days each.
PLAN_AMOUNTS = {
    4: 3200,
    6: 4800,
    8: 6400,
    12: 9600,
}
PLAN_DURATION_DAYS = 30
PLAN_NAME_TEMPLATE = "{n} séances / mois"

# --------------------------------------------------------------------------
# One-off classes
# --------------------------------------------------------------------------

#: Temporary classes: (exact ``Class.name``, day offset from TODAY). s03
#: creates the Class rows; s06 creates each one's single Session at
#: ``TODAY + offset``. Three horizons, because "a class that has not happened
#: yet" and "a class that already happened" are different code paths: one is
#: scheduled and locked, the other is conducted and carries money.
TEMPORARY_CLASSES = (
    ("Stage de révision — Math (vacances)", -21),
    ("Atelier d'expression — Français", 7),
    ("Stage de perfectionnement — Anglais", 60),
)
