"""
seed.run — orchestrator for the Vinta seed package.

    python -m seed.run --fresh          # wipe instance/vinta_seed.db, rebuild
    python -m seed.run --upto s03       # run s01..s03 against what exists
    python -m seed.run --only s04       # run one module
    python -m seed.run --no-create      # don't touch the schema

The seeder writes to ``instance/vinta_seed.db`` and never to
``instance/vinta_dev.db``. Two things keep that true, and both are load
bearing:

1. ``DATABASE_URL`` is set in this module's import block, before anything from
   ``app.*`` is imported. ``app.config.BaseConfig`` reads that variable from
   the environment when the class body is evaluated, i.e. at import time.
2. ``python-dotenv`` — called by ``app/config.py`` — does not overwrite a
   variable that is already set, so the project ``.env`` (which points at
   ``vinta_dev.db``) cannot take the setting back.

On top of that, ``_assert_target()`` refuses to run if the resolved engine
turns out not to be the seed file. Belt and braces: the cost of being wrong
here is the user's real database.
"""

import argparse
import importlib
import os
import random
import re
import sys
import time
import traceback

# ``app`` has to be importable whether this was launched as ``python -m
# seed.run`` from the backend root or as ``python seed/run.py`` (in which case
# sys.path[0] is the seed/ directory).
BACKEND_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if BACKEND_ROOT not in sys.path:
    sys.path.insert(0, BACKEND_ROOT)

from seed.config import DB_FILENAME, DB_URL, RNG_SEED, TODAY  # noqa: E402
from seed.helpers import log  # noqa: E402

# --- the DATABASE_URL override. This must stay above every app.* import. ---
#
# VINTA_SEED_DB_URL is a scratch override used only while developing the
# seeder: when several people (or agents) are editing different modules at
# once, each can validate against their own throwaway file instead of racing
# on instance/vinta_seed.db. Unset in every normal run.
DB_URL = os.environ.get("VINTA_SEED_DB_URL") or DB_URL
os.environ["DATABASE_URL"] = DB_URL

INSTANCE_DIR = os.path.join(BACKEND_ROOT, "instance")


def _local_db_path(url):
    """Filesystem path a sqlite URL points at, mirroring Flask-SQLAlchemy's rule.

    A relative path is resolved against the app instance folder; an absolute
    one (``sqlite:////abs/path``) is used as-is. Used only so ``--fresh``
    deletes the file the engine is actually about to open.
    """
    raw = url.split("sqlite:///", 1)[-1]
    if not raw:
        return os.path.join(INSTANCE_DIR, DB_FILENAME)
    if os.path.isabs(raw) or re.match(r"^[A-Za-z]:[\\/]", raw):
        return raw
    return os.path.join(INSTANCE_DIR, raw)


#: Filenames --fresh is permitted to delete. An allowlist, not a denylist:
#: the cost of refusing a legitimate name is one manual `rm`; the cost of
#: permitting a wrong one is the user's database.
DELETABLE_STEM = re.compile(r"^(vinta_seed|seed_[A-Za-z0-9_.-]+|scratch_[A-Za-z0-9_.-]+)$")


def _assert_deletable(path):
    """Refuse to --fresh-delete anything that is not a recognised seed database."""
    filename = re.split(r"[\\/]", path)[-1]
    stem = filename[:-3] if filename.endswith(".db") else filename
    if filename == DEV_DB_FILENAME or not DELETABLE_STEM.match(stem):
        log(
            f"FATAL: refusing to delete {path!r} — --fresh only removes seed "
            f"databases ({DB_FILENAME}, seed_*.db, scratch_*.db). Remove that "
            f"file yourself if it is really what you mean to do."
        )
        raise SystemExit(2)

#: (cli token, module name), executed in this order.
MODULES = (
    ("s01", "s01_academy"),
    ("s02", "s02_teachers"),
    ("s03", "s03_classes"),
    ("s04", "s04_students"),
    ("s05", "s05_enrollments"),
    ("s06", "s06_sessions"),
    ("s07", "s07_money"),
)

DEV_DB_FILENAME = "vinta_dev.db"


# --------------------------------------------------------------------------
# CLI
# --------------------------------------------------------------------------


def _build_parser():
    parser = argparse.ArgumentParser(
        prog="python -m seed.run",
        description="Seed instance/vinta_seed.db. Never touches vinta_dev.db.",
    )
    parser.add_argument(
        "--fresh",
        action="store_true",
        help=f"delete instance/{DB_FILENAME} before running, then create the schema",
    )
    scope = parser.add_mutually_exclusive_group()
    scope.add_argument(
        "--upto",
        metavar="sNN",
        help="run s01 through the named module, inclusive (e.g. --upto s03)",
    )
    scope.add_argument(
        "--only",
        metavar="sNN",
        help="run just the named module (e.g. --only s04)",
    )
    parser.add_argument(
        "--no-create",
        dest="no_create",
        action="store_true",
        help="skip db.create_all() and use the schema as it stands",
    )
    return parser


def _module_index(token, parser):
    """Resolve ``s03`` / ``s03_classes`` to an index in MODULES."""
    wanted = str(token).strip().lower()
    for index, (key, name) in enumerate(MODULES):
        if wanted == key or wanted == name or name.startswith(wanted):
            return index
    parser.error(
        f"unknown module {token!r}; expected one of "
        + ", ".join(key for key, _ in MODULES)
    )


def _select_modules(args, parser):
    if args.only:
        index = _module_index(args.only, parser)
        return MODULES[index:index + 1]
    if args.upto:
        index = _module_index(args.upto, parser)
        return MODULES[:index + 1]
    return MODULES


# --------------------------------------------------------------------------
# Guards
# --------------------------------------------------------------------------


def _force_utf8_stdout():
    """The console here is cp1252; the data is French/Arabic-flavoured."""
    for stream in (sys.stdout, sys.stderr):
        reconfigure = getattr(stream, "reconfigure", None)
        if reconfigure is None:
            continue
        try:
            reconfigure(encoding="utf-8")
        except Exception:
            pass


def _assert_target(db):
    """Refuse to write to the user's development database, or anywhere unexpected."""
    resolved = str(db.engine.url.database or "")
    filename = re.split(r"[\\/]", resolved)[-1]
    if filename == DEV_DB_FILENAME:
        log(
            f"FATAL: refusing to run — DATABASE_URL resolved to {resolved!r}, "
            f"which is the user's development database. Set "
            f"DATABASE_URL={DB_URL!r} before importing app.*"
        )
        raise SystemExit(2)
    expected = re.split(r"[\\/]", DB_URL)[-1]
    if filename != expected:
        log(f"FATAL: refusing to run — expected {expected}, got {resolved!r}")
        raise SystemExit(2)


# --------------------------------------------------------------------------
# Main
# --------------------------------------------------------------------------


def _print_summary(db, started):
    from sqlalchemy import text

    log("")
    log("=== row counts ===")
    total = 0
    for table in db.metadata.sorted_tables:
        # table.name comes from our own model metadata, not from input.
        try:
            count = db.session.execute(
                text(f'SELECT COUNT(*) FROM "{table.name}"')
            ).scalar_one()
        except Exception as exc:  # a table a later module has not created yet
            log(f"  {table.name:<24} {'ERR: ' + exc.__class__.__name__}")
            continue
        total += count
        log(f"  {table.name:<24} {count}")
    log(f"  {'TOTAL':<24} {total}")
    log("")
    log(f"database:  {_local_db_path(DB_URL)}")
    log(f"wall time: {time.perf_counter() - started:.2f}s")


def main(argv=None):
    _force_utf8_stdout()
    parser = _build_parser()
    args = parser.parse_args(argv)
    modules = _select_modules(args, parser)
    log("Vinta seeder")

    started = time.perf_counter()
    target = _local_db_path(DB_URL)

    # Guard BEFORE the delete, never after: --fresh removes a file, and a
    # guard that runs once the engine is up is a guard that runs too late.
    # This is the mistake that once deleted the user's vinta_dev.db.
    if args.fresh:
        _assert_deletable(target)

    os.makedirs(os.path.dirname(target) or INSTANCE_DIR, exist_ok=True)
    if args.fresh and os.path.exists(target):
        os.remove(target)
        log(f"removed  {target}")

    from app import create_app

    app = create_app("development")

    with app.app_context():
        from app.extensions import db
        import app.models  # noqa: F401  — registers every model on db.metadata

        _assert_target(db)
        log(f"target   {db.engine.url.database}")

        if args.no_create:
            log("schema   left as-is (--no-create)")
        else:
            db.create_all()
            log("schema   ensured (db.create_all)")

        ctx = {"rng": random.Random(RNG_SEED), "today": TODAY}
        log(f"rng      seed={RNG_SEED}   today={TODAY.isoformat()}")
        log("modules  " + ", ".join(name for _, name in modules))
        if modules and modules[0][0] != "s01":
            log("note     ctx is only populated by the modules that run")

        for _, name in modules:
            log("")
            log(f"--- {name} ---")
            module_started = time.perf_counter()
            try:
                module = importlib.import_module(f"seed.{name}")
                counts = module.run(ctx)
            except SystemExit:
                raise
            except BaseException:
                log(f"[FAIL] {name} raised — aborting, nothing further ran.")
                traceback.print_exc()
                return 1
            # Modules own their own commits; this catches anything a module
            # left pending so one module's work is never lost to the next one.
            db.session.commit()
            log(
                f"[{name}] ok in {time.perf_counter() - module_started:.2f}s"
                + (f" -> {counts}" if counts else "")
            )

        _print_summary(db, started)

    log("")
    log(f"done. {DEV_DB_FILENAME} was not touched.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
