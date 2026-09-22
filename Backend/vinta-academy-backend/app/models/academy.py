"""
Vinta School OS — Academy & Tenant Models
Academy (tenant root), AcademySettings (singleton), Subscription (tier gating).
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String,
    Integer,
    Text,
    Boolean,
    Enum as SAEnum,
    ForeignKey,
    DateTime,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.extensions import db


class Academy(db.Model):
    """Top-level tenant entity. One academy = one private school/academy."""

    __tablename__ = "academies"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    phone: Mapped[str | None] = mapped_column(String(30))
    email: Mapped[str | None] = mapped_column(String(255))
    address: Mapped[str | None] = mapped_column(String(500))
    weekend_day: Mapped[int] = mapped_column(
        Integer,
        default=5,
        comment="Day-of-week considered weekend (5=Friday for Algeria)",
    )
    current_term: Mapped[str | None] = mapped_column(String(100))
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    users = relationship("User", back_populates="academy", lazy="dynamic")
    students = relationship("Student", back_populates="academy", lazy="dynamic")
    teachers = relationship("Teacher", back_populates="academy", lazy="dynamic")
    classrooms = relationship("Classroom", back_populates="academy", lazy="dynamic")
    classes = relationship("Class", back_populates="academy", lazy="dynamic")
    sessions = relationship("Session", back_populates="academy", lazy="dynamic")
    payment_plans = relationship(
        "PaymentPlan", back_populates="academy", lazy="dynamic"
    )
    activity_logs = relationship(
        "ActivityLog", back_populates="academy", lazy="dynamic"
    )
    notifications = relationship(
        "Notification", back_populates="academy", lazy="dynamic"
    )
    subjects = relationship("Subject", back_populates="academy", lazy="dynamic")

    settings = relationship("AcademySettings", back_populates="academy", uselist=False)
    subscription = relationship("Subscription", back_populates="academy", uselist=False)

    def __repr__(self):
        return f"<Academy {self.name}>"


class AcademySettings(db.Model):
    """Per-academy configuration singleton."""

    __tablename__ = "academy_settings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    academy_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("academies.id"), unique=True, nullable=False
    )
    currency: Mapped[str] = mapped_column(String(10), default="DZD")
    default_credits_per_cycle: Mapped[int] = mapped_column(Integer, default=4)
    allow_rollover_default: Mapped[bool] = mapped_column(Boolean, default=False)
    allow_makeups_default: Mapped[bool] = mapped_column(Boolean, default=True)

    # ------------------------------------------------------------------
    # Billing Rules — per-academy edge-case toggles.
    #
    # These are read-only configuration values consulted at decision points
    # in the billing flow, never at startup. Changing one mid-day takes
    # effect on the very next attendance check-in: no restart, no cache
    # invalidation, no migration. Each toggle is independent and has a
    # sensible default, so an academy that never opens Settings still runs.
    #
    # `server_default` is set alongside the Python `default` so the additive
    # ALTER TABLE that introduces these columns can backfill existing rows.
    # ------------------------------------------------------------------

    # Toggle 1 — charge for missed sessions. True: an ABSENT student still
    # spends a credit. False: only PRESENT spends one; absences are free retries.
    absence_consumes_credit: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="1", nullable=False
    )

    # Toggle 2 — count sessions missed during a payment gap. True: sessions
    # missed while overdue are retroactively charged against the NEXT
    # subscription. False: a new payment always starts a clean cycle.
    count_gap_sessions: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", nullable=False
    )

    # Toggle 5 — restore credits when a class is cancelled AFTER students were
    # already checked in and charged. False = the academy keeps the money.
    restore_credits_on_cancellation: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", nullable=False
    )

    # Toggle 6 — auto-mark everyone PRESENT for a FREE session. True: no
    # attendance tracking on free sessions (there is no money to justify it).
    free_session_auto_present: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="1", nullable=False
    )

    # Toggle 7 — one subscription covers every group of the same subject.
    # False: each group needs its own subscription (the common, simpler policy).
    share_credits_across_groups: Mapped[bool] = mapped_column(
        Boolean, default=False, server_default="0", nullable=False
    )

    # Toggle 8 — prompt for renewal as soon as extra sessions drain the credits,
    # rather than waiting for the natural cycle end date.
    early_payment_on_extra_sessions: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default="1", nullable=False
    )

    default_access_weeks: Mapped[int | None] = mapped_column(Integer, nullable=True)
    default_max_groups: Mapped[int] = mapped_column(Integer, default=1)
    default_plan_duration: Mapped[int] = mapped_column(Integer, default=30)
    billing_reminder_days_before: Mapped[int] = mapped_column(Integer, default=3)
    due_date_reminder_timing: Mapped[str] = mapped_column(
        SAEnum("same_day", "custom", name="reminder_timing_enum"), default="same_day"
    )
    whatsapp_template: Mapped[str | None] = mapped_column(Text)
    auto_checkout_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    end_class_popup_enabled: Mapped[bool] = mapped_column(Boolean, default=True)
    default_theme: Mapped[str] = mapped_column(
        SAEnum("light", "dark", name="theme_enum"), default="light"
    )
    default_font_size: Mapped[str] = mapped_column(
        SAEnum("small", "normal", "large", name="font_size_enum"), default="normal"
    )
    default_language: Mapped[str] = mapped_column(
        SAEnum("fr", "ar", name="language_enum"), default="fr"
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    academy = relationship("Academy", back_populates="settings")

    def __repr__(self):
        return f"<AcademySettings for {self.academy_id}>"


class Subscription(db.Model):
    """Academy SaaS subscription tier."""

    __tablename__ = "subscriptions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    academy_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("academies.id"), unique=True, nullable=False
    )
    tier: Mapped[str] = mapped_column(
        SAEnum("starter", "pro", "scaler", name="subscription_tier_enum"),
        default="starter",
    )
    status: Mapped[str] = mapped_column(
        SAEnum("active", "inactive", "trialing", name="subscription_status_enum"),
        default="active",
    )
    invoicing_method: Mapped[str] = mapped_column(String(50), default="Manual")
    started_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    expires_at: Mapped[datetime | None] = mapped_column(DateTime)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    academy = relationship("Academy", back_populates="subscription")

    def __repr__(self):
        return f"<Subscription {self.tier} for {self.academy_id}>"
