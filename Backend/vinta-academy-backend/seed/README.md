# Vinta seeder

Deterministic seed data for the Vinta academy backend. It writes to
`instance/vinta_seed.db` and nothing else.

## Running it

From the backend root (`Backend/vinta-academy-backend`):

```bash
python -m seed.run --fresh
```

| Flag | Effect |
|---|---|
| `--fresh` | Delete `instance/vinta_seed.db`, then `db.create_all()`, then seed |
| `--upto sNN` | Run `s01` through `sNN` inclusive (`--upto s03`) |
| `--only sNN` | Run one module (`--only s04`). Mutually exclusive with `--upto` |
| `--no-create` | Skip `db.create_all()` and use the schema as it stands |

The run prints a line per module, then a row count for every table in the
metadata, then the wall time. Any module that raises prints its name and the
traceback, and the process exits `1`.

No module is idempotent. Seeding twice into the same file fails on a duplicate
key (`UNIQUE constraint failed: academies.id`), because `s01` now draws its ids
from the rng and the second run produces the same ones. Use `--fresh` to start
over, or `--only sNN --no-create` to re-run a single module against a database
that was seeded up to `sNN`'s predecessor.

### Which interpreter

On this machine `python` on PATH is Python 3.12 and does not have Flask
installed. The app stack lives in Python 3.14:

```bash
"/c/Users/nekka/AppData/Local/Programs/Python/Python314/python" -m seed.run --fresh
```

Point `python` at a virtualenv with `requirements.txt` installed and the plain
`python -m seed.run` form works.

## Where the database goes

`instance/vinta_seed.db`.

`app/config.py` reads `DATABASE_URL` from the environment while the class body
is evaluated, so the variable is set at the top of `seed/run.py`, before any
`app.*` import. Flask-SQLAlchemy resolves a relative sqlite path against the
app instance path, which lands the file in `instance/`.

This matters because the project `.env` sets `DATABASE_URL=sqlite:///vinta_dev.db`,
and `python-dotenv` (called by `app/config.py`) does not overwrite a variable
that is already set. Setting it first is what keeps the seeder off the
development database.

`run.py` also calls `_assert_target()`, which aborts with exit code `2` if the
resolved engine is anything other than `vinta_seed.db`, and refuses
`vinta_dev.db` by name.

**Do not import a `seed.sNN` module and call `run()` yourself.** The
`DATABASE_URL` override lives in `run.py`; running a module outside it can point
the write at `vinta_dev.db`.

## What exists so far

`s01_academy` is implemented. `s02` through `s07` are stubs: they log, return
`{}`, and are meant to be replaced body-only. The chain runs end to end today.

| Module | Owns |
|---|---|
| `s01_academy` | Academy, AcademySettings, Subscription, 3 users, 7 subjects, 6–8 classrooms, 4 payment plans |
| `s02_teachers` | 7 teachers, one per subject, plus `TeacherSubject` links |
| `s03_classes` | 28 weekly groups (7 × 4), edge-case classes, `Schedule` rows |
| `s04_students` | 489 students and their guardians |
| `s05_enrollments` | `Enrollment` and `StudentSubscription`, 1–4 classes per student |
| `s06_sessions` | `Session` rows across history and future, plus `SessionStudent` attendance |
| `s07_money` | `StudentBilling`, `PaymentLog`, `RevenueEntry`, `PayoutRecord` |

A successful `--fresh` run of the stub chain gives 23 rows: 1 academy, 1
settings row, 1 subscription, 3 users, 7 subjects, 6–8 classrooms, 4 plans.

## Logins

Created by `s01_academy`. Emails are stored lowercased.

| Role | Email | Password | PIN |
|---|---|---|---|
| owner | `direction@academie-el-feth.dz` | `owner1234` | `1234` |
| staff | `nadia.meziane@academie-el-feth.dz` | — | `1111` |
| staff | `sofiane.haddad@academie-el-feth.dz` | — | `2222` |

All three carry `picture = {"type": "preset", "colors": [hex, hex]}` so avatars
render. Staff accounts have `password_hash = NULL` by design; they are PIN-only.

## Safety: vinta_dev.db

`vinta_dev.db` holds the user's existing work. The seeder never reads it, never
writes it, and never deletes it. The only file `--fresh` removes is
`instance/vinta_seed.db`. Everything under `app/` is untouched by this package.

## Interface for later modules

Each module exposes `def run(ctx: dict) -> dict:` and receives the same `ctx`
dict object that `s01` populated, mutated in place. Return a dict of counts for
the log line; returning `{}` is fine.

Import `app.*` inside `run()`, not at module import time. A module-level app
import can be pulled in before `run.py` sets `DATABASE_URL`.

### ctx keys

`s01` sets: `academy_id`, `owner_id`, `staff_ids` (list of 2, in `config.STAFF`
order), `user_ids` (all 3, owner first), `subject_ids` (name → id),
`classroom_ids` (list), `plan_ids` (dict keyed by `(sessions, amount_da)`, so
`ctx["plan_ids"][(6, 4800)]`). `rng` and `today` are set by `run.py` before the
chain starts.

### Determinism

Every random choice comes from `ctx["rng"]`, a `random.Random(RNG_SEED)`. Do not
call `random.*` directly and do not use `datetime.now()` as a value source;
today is the constant `TODAY = date(2026, 9, 28)`. Use `helpers.new_id(rng)` for
primary keys instead of leaving them to the models' `uuid.uuid4()` default.

Two `--fresh` runs produce identical values and identical ids in every seeded
column. Two fields still differ between runs, and both are out of the rng's
reach:

- `created_at` / `updated_at` / `started_at` — stamped by the models' own
  `datetime.now(timezone.utc)` defaults.
- bcrypt hashes (`users.pin_hash`, `users.password_hash`) — `User.hash_pin` and
  `set_password` salt randomly, which is what they are supposed to do.

A run is reproducible in everything the seeder chooses. Compare runs on the
seeded columns, not on the whole file.

### Helpers

| Helper | Notes |
|---|---|
| `helpers.new_id(rng)` | uuid4-shaped id drawn from the rng |
| `helpers.bulk_insert(db, objs, chunk=500, *, rng=None)` | Chunked `bulk_save_objects`, commits per chunk. Pass `rng` for reproducible ids |
| `helpers.month_iter(start, n)` | `n` calendar months ending with `start`'s month, ascending `(cycle_start, cycle_end, due_date)` |
| `helpers.parse_hhmm("09:30")` | → `datetime.time` |
| `helpers.hex_color(rng)` | `#rrggbb` from `config.PALETTE` |
| `helpers.log(msg)` | utf-8-safe print |
| `pools.pick(rng, seq)` / `pick_many(rng, seq, k)` / `phone(rng)` / `email_slug(s)` | Text pools and pickers |

`bulk_insert` fills in the primary key of each object before the INSERT and
leaves the value on the object, because `bulk_save_objects` does not write
defaults back. Build dependent rows from `obj.id` after the call; the objects
do not stay in the session and relationship cascades do not run.

Read `seed/config.py` before adding constants. It already holds `GROUP_PLAN`
(the 1er / 2ème / two 3ème split and the A/B naming for the 3ème pair),
`SUBJECT_COLORS`, `PLAN_AMOUNTS`, `SESSIONS_PER_MONTH_CHOICES`,
`PER_SESSION_RATE_MIN/MAX`, `HISTORY_MONTHS`, `STUDENT_COUNT` and the academy
identity.

Two things worth knowing about `app/models/`:

- `TeacherSubject` is not re-exported from `app/models/__init__.py`. Import it
  from `app.models.teacher`.
- The `StudentSubscription` class is aliased as `Subscription` in
  `app/models/billing.py`, and `subscriptions` is the unrelated SaaS tier table.
  `import app.models` and the names in `__init__.py` are the safe ones.
