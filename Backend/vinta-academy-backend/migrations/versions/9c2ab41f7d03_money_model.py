"""VINTA money model — subscriptions, revenue, payouts, group billing fields.

Revision ID: 9c2ab41f7d03
Revises: 6f09e1ca4d62
Create Date: 2026-09-11

Adds:
- tables: student_subscriptions, revenue_entries, payout_records
- classes: academic_level, group_name, billing_model, price_da,
  credits_per_cycle, cycle_week_limit, allow_rollover, allow_makeups,
  access_duration_weeks, max_groups_included, enforce_attendance,
  attendance_threshold
- teachers: avatar, commission_type, commission_value
- session_students: status, is_group_swap, timestamp
- payment_logs: group_id, session_id
- academy_settings: default_credits_per_cycle, allow_rollover_default,
  allow_makeups_default, default_access_weeks, default_max_groups

Enum columns whose value sets changed (enrollment status, session status)
are widened to plain String on SQLite-safe path; on Postgres the new enum
labels are added with ALTER TYPE ... ADD VALUE. All money columns are
Integer (DZD).
"""
import sqlalchemy as sa
from alembic import op


# revision identifiers, used by Alembic.
revision = '9c2ab41f7d03'
down_revision = '6f09e1ca4d62'
branch_labels = None
depends_on = None


def _has_table(inspector, name):
    return name in inspector.get_table_names()


def _columns(inspector, table):
    return {c["name"] for c in inspector.get_columns(table)}


def upgrade():
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    dialect = bind.dialect.name

    # ── New tables ────────────────────────────────────────────────
    if not _has_table(inspector, "student_subscriptions"):
        op.create_table(
            "student_subscriptions",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("academy_id", sa.String(36), sa.ForeignKey("academies.id"), nullable=False),
            sa.Column("enrollment_id", sa.String(36), sa.ForeignKey("enrollments.id"), nullable=True),
            sa.Column("student_id", sa.String(36), sa.ForeignKey("students.id"), nullable=False),
            sa.Column("group_id", sa.String(36), sa.ForeignKey("classes.id"), nullable=False),
            sa.Column("billing_model", sa.String(20), nullable=False),
            sa.Column("total_credits", sa.Integer(), nullable=True),
            sa.Column("remaining_credits", sa.Integer(), nullable=True),
            sa.Column("cycle_start_date", sa.Date(), nullable=True),
            sa.Column("cycle_deadline", sa.Date(), nullable=True),
            sa.Column("access_start_date", sa.Date(), nullable=True),
            sa.Column("access_end_date", sa.Date(), nullable=True),
            sa.Column("max_groups_included", sa.Integer(), nullable=False, server_default="1"),
            sa.Column("enrolled_group_ids", sa.JSON(), nullable=True),
            sa.Column("amount_paid_da", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("payment_method",
                      sa.Enum("CASH", "CCP", "BARIDI_MOB",
                              name="subscription_payment_method_enum"),
                      nullable=False, server_default="CASH"),
            sa.Column("recorded_by_staff_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
            sa.Column("makeup_credits", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status", sa.String(20), nullable=False, server_default="ACTIVE"),
            sa.Column("created_at", sa.DateTime(), nullable=False),
            sa.Column("updated_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "revenue_entries"):
        op.create_table(
            "revenue_entries",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("academy_id", sa.String(36), sa.ForeignKey("academies.id"), nullable=False),
            sa.Column("group_id", sa.String(36), sa.ForeignKey("classes.id"), nullable=True),
            sa.Column("student_id", sa.String(36), sa.ForeignKey("students.id"), nullable=True),
            sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.id"), nullable=True),
            sa.Column("amount_da", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("recorded_at", sa.DateTime(), nullable=False),
        )

    if not _has_table(inspector, "payout_records"):
        op.create_table(
            "payout_records",
            sa.Column("id", sa.String(36), primary_key=True),
            sa.Column("academy_id", sa.String(36), sa.ForeignKey("academies.id"), nullable=False),
            sa.Column("teacher_id", sa.String(36), sa.ForeignKey("teachers.id"), nullable=False),
            sa.Column("session_id", sa.String(36), sa.ForeignKey("sessions.id"), nullable=False, unique=True),
            sa.Column("gross_revenue_da", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("commission_type", sa.String(20), nullable=False),
            sa.Column("commission_value", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("teacher_cut_da", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("status",
                      sa.Enum("PENDING", "PAID", name="payout_status_enum"),
                      nullable=False, server_default="PENDING"),
            sa.Column("paid_at", sa.DateTime(), nullable=True),
            sa.Column("paid_by_staff_id", sa.String(36), sa.ForeignKey("users.id"), nullable=True),
        )

    # ── New columns (guarded, idempotent) ─────────────────────────
    def add_column(table, column):
        cols = _columns(sa.inspect(bind), table)
        if column.name not in cols:
            with op.batch_alter_table(table) as batch:
                batch.add_column(column)

    for name, type_, kwargs in [
        ("academic_level", sa.String(100), {"nullable": True}),
        ("group_name", sa.String(50), {"nullable": True, "server_default": "A"}),
        ("billing_model",
         sa.Enum("CREDIT_BASED", "TIME_BASED", name="class_billing_model_enum"),
         {"nullable": True, "server_default": "CREDIT_BASED"}),
        ("price_da", sa.Integer(), {"nullable": True, "server_default": "0"}),
        ("credits_per_cycle", sa.Integer(), {"nullable": True, "server_default": "4"}),
        ("cycle_week_limit", sa.Integer(), {"nullable": True}),
        ("allow_rollover", sa.Boolean(), {"nullable": True, "server_default": "0"}),
        ("allow_makeups", sa.Boolean(), {"nullable": True, "server_default": "1"}),
        ("access_duration_weeks", sa.Integer(), {"nullable": True}),
        ("max_groups_included", sa.Integer(), {"nullable": True, "server_default": "1"}),
        ("enforce_attendance", sa.Boolean(), {"nullable": True, "server_default": "0"}),
        ("attendance_threshold", sa.Float(), {"nullable": True, "server_default": "0.75"}),
    ]:
        add_column("classes", sa.Column(name, type_, **kwargs))

    add_column("teachers", sa.Column("avatar", sa.String(500), nullable=True))
    add_column("teachers", sa.Column(
        "commission_type",
        sa.Enum("PERCENTAGE", "FLAT_HOURLY", "FIXED_SESSION",
                name="teacher_commission_type_enum"),
        nullable=True, server_default="PERCENTAGE"))
    add_column("teachers", sa.Column("commission_value", sa.Integer(),
                                     nullable=True, server_default="30"))

    add_column("session_students", sa.Column("status", sa.String(20),
                                             nullable=True, server_default="PRESENT"))
    add_column("session_students", sa.Column("is_group_swap", sa.Boolean(),
                                             nullable=True, server_default="0"))
    add_column("session_students", sa.Column("timestamp", sa.DateTime(), nullable=True))

    add_column("payment_logs", sa.Column("group_id", sa.String(36),
                                         sa.ForeignKey("classes.id", name="fk_payment_logs_group_id"), nullable=True))
    add_column("payment_logs", sa.Column("session_id", sa.String(36),
                                         sa.ForeignKey("sessions.id", name="fk_payment_logs_session_id"), nullable=True))

    for name, type_, default in [
        ("default_credits_per_cycle", sa.Integer(), "4"),
        ("allow_rollover_default", sa.Boolean(), "0"),
        ("allow_makeups_default", sa.Boolean(), "1"),
        ("default_access_weeks", sa.Integer(), None),
        ("default_max_groups", sa.Integer(), "1"),
    ]:
        kwargs = {"nullable": True, "server_default": default} if default is None \
            else {"nullable": True, "server_default": default}
        add_column("academy_settings", sa.Column(name, type_, **kwargs))

    # ── Widen enum value sets ─────────────────────────────────────
    if dialect == "postgresql":
        op.execute("ALTER TYPE enrollment_status_enum ADD VALUE IF NOT EXISTS 'expired'")
        op.execute("ALTER TYPE enrollment_status_enum ADD VALUE IF NOT EXISTS 'overdue'")
        op.execute("ALTER TYPE enrollment_status_enum ADD VALUE IF NOT EXISTS 'transferred'")
        op.execute("ALTER TYPE session_status_enum ADD VALUE IF NOT EXISTS 'conducted'")
    else:
        # SQLite: switch to plain String carrying old + new labels
        with op.batch_alter_table("enrollments") as batch:
            batch.alter_column("status", type_=sa.String(20),
                               existing_type=sa.Enum("active", "withdrawn",
                                                     name="enrollment_status_enum"))
        with op.batch_alter_table("sessions") as batch:
            batch.alter_column("status", type_=sa.String(20),
                               existing_type=sa.Enum("scheduled", "in_progress",
                                                     "completed", "cancelled",
                                                     name="session_status_enum"))


def downgrade():
    op.drop_table("payout_records")
    op.drop_table("revenue_entries")
    op.drop_table("student_subscriptions")
    # Column drops omitted intentionally: SQLite batch mode would rebuild
    # large tables; forward-only for the money-model columns.
