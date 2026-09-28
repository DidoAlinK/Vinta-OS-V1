"""
seed.pools — deterministic text pools and pickers.

Every helper here takes the caller's ``rng`` explicitly. There is deliberately
no module-level ``Random`` instance: a hidden global would let one module's
call order change another module's output, which is exactly the kind of
coupling that makes a seed impossible to reproduce.

Usage::

    from seed.pools import MALE_FIRST_NAMES, pick, phone
    first = pick(ctx["rng"], MALE_FIRST_NAMES)
"""

import re
import unicodedata

# --------------------------------------------------------------------------
# Names — Algerian Arabic, written in their common French/Latin orthography
# --------------------------------------------------------------------------

MALE_FIRST_NAMES = (
    "Yacine",
    "Amine",
    "Bilal",
    "Sofiane",
    "Mohamed",
    "Ahmed",
    "Abdelkader",
    "Karim",
    "Mehdi",
    "Riad",
    "Islam",
    "Anis",
    "Walid",
    "Oussama",
    "Ayoub",
    "Zakaria",
    "Reda",
    "Samy",
    "Nadir",
    "Farid",
    "Hichem",
    "Nabil",
    "Yasser",
    "Lokmane",
    "Abderrahmane",
    "Toufik",
    "Salim",
    "Rachid",
    "Mourad",
    "Kamel",
    "Djamel",
    "Habib",
    "Sidahmed",
    "Ilyes",
    "Aymene",
    "Rami",
    "Chihab",
    "Adel",
    "Anes",
    "Badreddine",
    "Fethi",
    "Ibrahim",
    "Othmane",
    "Yanis",
)

FEMALE_FIRST_NAMES = (
    "Nadia",
    "Yasmine",
    "Lina",
    "Amina",
    "Sara",
    "Meriem",
    "Imene",
    "Rania",
    "Sofia",
    "Kenza",
    "Aya",
    "Nour",
    "Selma",
    "Houda",
    "Warda",
    "Chaima",
    "Dounia",
    "Asma",
    "Imane",
    "Hanane",
    "Souad",
    "Fatima",
    "Zohra",
    "Khadidja",
    "Malika",
    "Nabila",
    "Rym",
    "Sirine",
    "Manel",
    "Lilia",
    "Bouchra",
    "Hayat",
    "Ghania",
    "Zineb",
    "Sana",
    "Souhila",
    "Nourhane",
    "Maya",
    "Salma",
    "Assia",
    "Djihane",
    "Loubna",
    "Farida",
    "Rachida",
)

FAMILY_NAMES = (
    "Benali",
    "Bouzid",
    "Cherif",
    "Haddad",
    "Meziane",
    "Zerrouki",
    "Boumediene",
    "Amrani",
    "Belkacem",
    "Bencheikh",
    "Bensalem",
    "Brahimi",
    "Chaoui",
    "Djebbar",
    "Ferhat",
    "Ghezali",
    "Hamdani",
    "Kaci",
    "Larbi",
    "Madani",
    "Meftah",
    "Merabet",
    "Mokrani",
    "Naceri",
    "Ouali",
    "Rahmani",
    "Saadi",
    "Saidi",
    "Slimani",
    "Taleb",
    "Toumi",
    "Yahiaoui",
    "Zitouni",
    "Benkhelifa",
    "Bennacer",
    "Boukhalfa",
    "Boudiaf",
    "Bounouar",
    "Cherifi",
    "Dahmani",
    "Guerroumi",
    "Hachemi",
    "Henni",
    "Kherbache",
    "Lakhdari",
    "Loucif",
    "Maouche",
    "Meddah",
    "Merzouk",
    "Mimouni",
    "Benyahia",
    "Chikhi",
    "Hadjadj",
    "Kaddour",
    "Lounis",
    "Mansouri",
    "Rahal",
    "Sebaa",
    "Tounsi",
    "Zeggai",
    "Belhadj",
    "Bouchama",
    "Gherbi",
    "Hakem",
    "Nasri",
    "Ould Ali",
    "Boudjema",
    "Cherbal",
    "Harkati",
    "Benmeddour",
)

#: Free-form guardian relationship labels (Guardian.relationship_type).
GUARDIAN_RELATIONSHIPS = (
    "Père",
    "Mère",
    "Tuteur",
    "Oncle",
    "Tante",
    "Grand-père",
    "Grand-mère",
    "Frère aîné",
)

# --------------------------------------------------------------------------
# Student notes
# --------------------------------------------------------------------------

#: Plausible notes for Student.notes. The two ``None`` entries are
#: deliberate: ``Student.notes`` is nullable, and most students have nothing
#: written against them, so pulling straight from this pool gives the right
#: mix of remarks and blanks without the caller special-casing it.
NOTE_SNIPPETS = (
    "Pays monthly",
    "Bourse",
    "Retard fréquent",
    "Deuxième année dans l'académie",
    "Transport assuré par le père",
    "Suivi médical — allergie",
    None,
    "S'inscrit au mois",
    "Remise fratrie appliquée",
    "Changement d'horaire demandé",
    "Payeur : la mère",
    None,
    "Excellent niveau en calcul",
)

# --------------------------------------------------------------------------
# Pickers — all take rng explicitly
# --------------------------------------------------------------------------


def pick(rng, seq):
    """One element of ``seq``, chosen from ``rng``."""
    return rng.choice(seq)


def pick_many(rng, seq, k):
    """``k`` *distinct* elements of ``seq``, in random order.

    Raises ``ValueError`` if ``k`` exceeds the pool — a silent short list
    would be worse than the error.
    """
    return rng.sample(list(seq), k)


def phone(rng):
    """A plausible Algerian mobile number: ``+213`` then 9 digits, first 5/6/7."""
    return "+213" + rng.choice("567") + "".join(
        str(rng.randrange(10)) for _ in range(8)
    )


def email_slug(s):
    """``"Yacine Benali"`` -> ``"yacine.benali"``; accents stripped first.

    Non-alphanumeric runs collapse to a single dot, and leading/trailing dots
    are trimmed, so the result is always a legal local part.
    """
    decomposed = unicodedata.normalize("NFKD", s or "")
    ascii_only = decomposed.encode("ascii", "ignore").decode("ascii")
    return re.sub(r"[^a-zA-Z0-9]+", ".", ascii_only).strip(".").lower()
