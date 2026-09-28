"""
Vinta School OS — Academy Data Purge

One ordered, foreign-key-safe way to remove what an academy owns.

Why this file exists
--------------------
The danger zone has two buttons that both mean "delete a lot": *Reset All
Data* (keeps the academy and its staff) and *Delete Academy* (keeps
nothing). Each used to spell its deletions out by hand, table by table —
and both spelled them in the wrong order. ``enrollments`` was deleted
before the ``student_subscriptions`` rows that point at it, so SQLite
refused the statement with FOREIGN KEY constraint failed and the whole
request came back 500. Nothing in either list looked wrong: the defect
was the sequence, not any single line.

So the sequence is not written here either. It is read off the models'
own foreign keys — ``MetaData.sorted_tables`` is parents-first, and its
reverse is children-first — and the rows are gathered before any of them
are deleted, so every child of a doomed row is doomed with it. A model
that gains a foreign key tomorrow is handled without editing this file,
which is the only reason this is a service and not two corrected lists.

Rows are named by primary key throughout, not by an ``id`` column:
``teacher_subjects`` has no ``id``, it is keyed by (teacher_id,
subject_id). Assuming otherwise is how the first version of this file
failed.

Nothing here is academy-specific beyond the ``academy_id`` column: the
root set is "every table that carries one", and everything else follows
by reference.
"""

from sqlalchemy import tuple_

from app.extensions import db

#: Deleted in chunks, so one statement never carries an unbounded number of
#: bound parameters (SQLite's own limit is a few thousand; a busy academy's
#: register is bigger than that).
CHUNK = 500


def _academy_owned_tables(keep_tables=frozenset()):
    """Every mapped table that names an academy directly, minus the kept ones."""
    for table in db.Model.metadata.sorted_tables:
        if table.name in keep_tables:
            continue
        if "academy_id" in table.c:
            yield table


def _foreign_keys(table):
    """(local column name, parent table) for every foreign key on ``table``."""
    for fk in table.foreign_keys:
        yield fk.parent.name, fk.column.table


def _primary_key(table):
    return list(table.primary_key.columns)


def _row_keys(table, column_name, values):
    """
    Primary-key tuples of ``table``'s rows whose ``column_name`` is in ``values``.

    Which column is *selected* matters as much as which one is filtered on: an
    earlier version selected the column it filtered by, so every row answered
    with the same value, the set collapsed to a single element, and the purge
    deleted one row per table while reporting success.
    """
    key_columns = _primary_key(table)
    rows = db.session.execute(
        db.select(*key_columns).where(table.c[column_name].in_(values))
    )
    return {tuple(row) for row in rows}


def _delete_where(table, keys):
    """Delete one chunk of rows, named by primary key."""
    key_columns = _primary_key(table)
    if len(key_columns) == 1:
        condition = key_columns[0].in_([key[0] for key in keys])
    else:
        condition = tuple_(*key_columns).in_(keys)
    db.session.execute(table.delete().where(condition))


def _collect(academy_id, keep_tables, drop_academy):
    """
    The rows to delete, per table, closed under "children of a doomed row".

    Two passes, because the second one has to repeat: a row's children are
    found only after the row itself is known, and their children after that.
    """
    doomed: dict[str, set] = {}

    for table in _academy_owned_tables(keep_tables):
        keys = _row_keys(table, "academy_id", [academy_id])
        if keys:
            doomed[table.name] = keys

    if drop_academy:
        # `academies` carries no academy_id of its own; it is the row itself.
        doomed["academies"] = {(academy_id,)}

    by_name = {table.name: table for table in db.Model.metadata.sorted_tables}
    changed = True
    while changed:
        changed = False
        for name, table in by_name.items():
            if name in keep_tables:
                continue
            for column_name, parent in _foreign_keys(table):
                parent_keys = doomed.get(parent.name)
                if not parent_keys:
                    continue
                found = _row_keys(table, column_name, [key[0] for key in parent_keys])
                if not found:
                    continue
                mine = doomed.setdefault(name, set())
                new = found - mine
                if new:
                    mine |= new
                    changed = True

    return doomed


def _delete(doomed):
    """Delete children before parents — the reverse of the models' own order."""
    counts: dict[str, int] = {}
    for table in reversed(db.Model.metadata.sorted_tables):
        keys = doomed.get(table.name)
        if not keys:
            continue
        batch_of = list(keys)
        for start in range(0, len(batch_of), CHUNK):
            _delete_where(table, batch_of[start:start + CHUNK])
        counts[table.name] = len(batch_of)
    return counts


def purge_academy_data(academy_id, *, keep_tables=frozenset(), drop_academy=False):
    """
    Delete an academy's data, in an order the foreign keys accept.

    ``keep_tables`` names tables to leave alone *and* not to walk into — the
    reset uses it to keep the academy, its staff accounts, its settings and
    its subscription tier, which are what the academy *is* rather than what it
    accumulated.

    ``drop_academy`` also removes the academy row itself, last.

    Returns the number of rows deleted per table, for the caller to report or
    log. One transaction: either all of it goes or none of it does.
    """
    doomed = _collect(academy_id, keep_tables, drop_academy)
    counts = _delete(doomed)
    db.session.commit()
    return counts
