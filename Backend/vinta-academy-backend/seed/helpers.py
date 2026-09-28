"""
seed.helpers — shared utilities for every seed module.

Kept deliberately small: date/month arithmetic, time parsing, colours, a
chunked bulk insert, and a utf-8-safe print.
"""

import calendar
import sys
import uuid
from datetime import date, datetime, time

import sqlalchemy as sa

from seed.config import PALETTE
from seed.pools import pick

# --------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------


def log(msg=""):
    """``print`` that survives a cp1252 console.

    ``seed/run.py`` reconfigures stdout to utf-8 up front, but a module can be
    imported and run on its own, so this stays defensive rather than assuming.
    """
    try:
        print(msg, flush=True)
    except UnicodeEncodeError:
        encoding = getattr(sys.stdout, "encoding", None) or "ascii"
        print(
            str(msg).encode(encoding, "replace").decode(encoding, "replace"),
            flush=True,
        )


# --------------------------------------------------------------------------
# Dates
# --------------------------------------------------------------------------


def _shift_month(year, month, delta):
    """``(2026, 9)`` shifted by ``delta`` months -> ``(year, month)``."""
    index = year * 12 + (month - 1) + delta
    return index // 12, index % 12 + 1


def month_iter(start, n):
    """``n`` consecutive monthly cycles, the last one containing ``start``.

    Cycles are calendar-aligned: each runs from the 1st to the last day of its
    month. The day component of ``start`` is therefore ignored — ``start``
    only picks which month is "current". Returned oldest-first, as
    ``(cycle_start, cycle_end, due_date)`` triples, where ``due_date`` is the
    day the cycle opens: money for a cycle is collected when it starts. A
    caller wanting a later collection window can offset the third element.

    Example, for ``start = date(2026, 9, 28)`` and ``n = 3``::

        (date(2026, 7, 1),  date(2026, 7, 31), date(2026, 7, 1))
        (date(2026, 8, 1),  date(2026, 8, 31), date(2026, 8, 1))
        (date(2026, 9, 1),  date(2026, 9, 30), date(2026, 9, 1))
    """
    if n <= 0:
        return []
    cycles = []
    for back in range(n - 1, -1, -1):
        year, month = _shift_month(start.year, start.month, -back)
        cycle_start = date(year, month, 1)
        cycle_end = date(year, month, calendar.monthrange(year, month)[1])
        cycles.append((cycle_start, cycle_end, cycle_start))
    return cycles


def parse_hhmm(s):
    """``"09:30"`` -> ``datetime.time(9, 30)``. Accepts ``"9:30"`` too."""
    return datetime.strptime(str(s).strip(), "%H:%M").time()


# --------------------------------------------------------------------------
# Colours
# --------------------------------------------------------------------------


def hex_color(rng):
    """A ``#rrggbb`` string drawn from the shared palette."""
    return pick(rng, PALETTE)


# --------------------------------------------------------------------------
# Identifiers
# --------------------------------------------------------------------------


def new_id(rng):
    """A uuid4-shaped id drawn from ``rng``.

    Every model defaults its primary key to ``str(uuid.uuid4())``, which is
    unseeded: two runs over identical data would come out with different ids,
    and a run could not be compared against the run before it. Drawing from
    ``ctx["rng"]`` instead keeps a whole run reproducible, ids included.
    """
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


# --------------------------------------------------------------------------
# Bulk writing
# --------------------------------------------------------------------------


def _fill_primary_key(obj, rng=None):
    """Give ``obj`` a primary key if it has none yet.

    ``Session.bulk_save_objects`` applies the model's Python-side column
    defaults when it builds the INSERT, but it never writes those values back
    onto the objects it was handed — they stay detached, with ``id is None``.
    Anything that needs to build a dependent row afterwards (an enrollment
    pointing at a student) would have no id to point at. So the PK is
    materialised here first and left on the object.

    With an ``rng``, ids come from ``new_id`` and are reproducible; without
    one, the model's own default is evaluated, which is a fresh uuid4 and so
    differs from run to run.
    """
    try:
        mapper = sa.inspect(obj).mapper
    except Exception:
        return
    for column in mapper.primary_key:
        try:
            key = mapper.get_property_by_column(column).key
        except Exception:
            continue
        if getattr(obj, key, None) is not None:
            continue
        if rng is not None:
            setattr(obj, key, new_id(rng))
            continue
        default = column.default
        arg = getattr(default, "arg", None) if default is not None else None
        if arg is None:
            continue
        try:
            value = arg(None) if callable(arg) else arg
        except TypeError:
            # A zero-argument callable, e.g. ``lambda: str(uuid.uuid4())``.
            try:
                value = arg()
            except Exception:
                continue
        except Exception:
            continue
        if value is not None:
            setattr(obj, key, value)


def bulk_insert(db, objs, chunk=500, *, rng=None):
    """Insert many ORM objects in chunks, committing after each chunk.

    Wraps ``db.session.bulk_save_objects``. Notes for callers:

    * Python-side column defaults *are* applied by SQLAlchemy; the primary key
      is additionally pre-filled by this helper so it can be read back off the
      object (see ``_fill_primary_key``).
    * Pass ``rng=ctx["rng"]`` to get reproducible ids. Leave it out and the
      model default runs — a fresh ``uuid4`` per row, different every run.
    * Relationship cascades do **not** run, and the objects are not left in the
      session. Build dependent rows from the ids on the objects just inserted
      and pass them through this same helper.
    * Committing per chunk means a failure part-way leaves the earlier chunks
      persisted. Callers that need all-or-nothing should not use this.

    Returns the number of objects handed to the database.
    """
    objs = list(objs)
    if not objs:
        return 0
    if not chunk or chunk < 1:
        chunk = len(objs)
    total = 0
    for start in range(0, len(objs), chunk):
        batch = objs[start:start + chunk]
        for obj in batch:
            _fill_primary_key(obj, rng)
        db.session.bulk_save_objects(batch)
        db.session.commit()
        total += len(batch)
    return total
