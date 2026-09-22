"""
Vinta School OS — Billing Models
PaymentPlan, StudentBilling, PaymentLog (legacy, kept for backward compat).
StudentSubscription, RevenueEntry, PayoutRecord (VINTA SCHOOL OS money model).
All monetary columns are Integer (DZD).
"""
import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String, Integer, Text, ForeignKey, DateTime, Date,
    JSON, Boolean,
    Enum as SAEnum,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.extensions import db


class PaymentPlan(db.Model):
    """Reusable billing plans that can be assigned to students."""

    __tablename__ = "payment_plans"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    academy_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("academies.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    duration_days: Mapped[int] = mapped_column(Integer, nullable=False, comment="30 for monthly, 90 for term")
    amount_da: Mapped[int] = mapped_column(Integer, nullable=False, comment="Price in Algerian Dinars")
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    academy = relationship("Academy", back_populates="payment_plans")
    billings = relationship("StudentBilling", back_populates="payment_plan", lazy="dynamic")

    def __repr__(self):
        return f"<PaymentPlan {self.name} {self.amount_da} DA>"


class StudentBilling(db.Model):
    """One record per billing cycle per student. Core billing entity."""

    __tablename__ = "student_billings"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("students.id"), nullable=False
    )
    payment_plan_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("payment_plans.id"), nullable=False
    )
    amount_da: Mapped[int] = mapped_column(Integer, nullable=False, comment="Amount due for this cycle")
    status: Mapped[str] = mapped_column(
        SAEnum("paid", "due", "overdue", name="billing_status_enum"),
        default="due",
    )
    due_date: Mapped[datetime] = mapped_column(Date, nullable=False)
    paid_date: Mapped[datetime | None] = mapped_column(Date)
    paid_amount: Mapped[int | None] = mapped_column(
        Integer, nullable=True, comment="Actual amount paid (may differ if partial)"
    )
    cycle_start: Mapped[datetime] = mapped_column(Date, nullable=False)
    cycle_end: Mapped[datetime] = mapped_column(Date, nullable=False)
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime,
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationships
    student = relationship("Student", back_populates="billings")
    payment_plan = relationship("PaymentPlan", back_populates="billings")
    payment_logs = relationship(
        "PaymentLog", back_populates="student_billing", lazy="dynamic",
        cascade="all, delete-orphan"
    )

    def __repr__(self):
        return f"<StudentBilling {self.student_id} {self.amount_da} DA ({self.status})>"


class PaymentLog(db.Model):
    """Individual payment transactions against a billing record."""

    __tablename__ = "payment_logs"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    student_billing_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("student_billings.id"), nullable=False
    )
    amount_da: Mapped[int] = mapped_column(Integer, nullable=False, comment="Amount paid in this transaction")
    payment_method: Mapped[str | None] = mapped_column(
        String(50), comment="Cash, bank transfer, etc."
    )
    group_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("classes.id"), nullable=True,
        comment="Course group / class this payment covers (money-model)"
    )
    session_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("sessions.id"), nullable=True,
        comment="Session this payment is linked to (money-model, finalize flow)"
    )
    recorded_by: Mapped[str] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=False,
        comment="Which staff member logged the payment"
    )
    notes: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    student_billing = relationship("StudentBilling", back_populates="payment_logs")
    recorded_by_user = relationship("User")

    def __repr__(self):
        return f"<PaymentLog {self.amount_da} DA>"


class StudentSubscription(db.Model):
    """Student purchase of a Class offer (credit-based or time-based).

    Table name is ``student_subscriptions`` to avoid colliding with the
    legacy SaaS ``subscriptions`` table (Academy tier gating in academy.py).
    """

    __tablename__ = "student_subscriptions"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    academy_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("academies.id"), nullable=False
    )
    enrollment_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("enrollments.id"), nullable=True
    )
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("students.id"), nullable=False
    )
    group_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("classes.id"), nullable=False,
        comment="CourseGroup (-> classes.id)",
    )
    billing_model: Mapped[str] = mapped_column(String(20), nullable=False)
    total_credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    remaining_credits: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cycle_start_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    cycle_deadline: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    access_start_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    access_end_date: Mapped[datetime | None] = mapped_column(Date, nullable=True)
    max_groups_included: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    enrolled_group_ids: Mapped[list | None] = mapped_column(
        JSON, nullable=True, comment="List of group (class) ids included"
    )
    amount_paid_da: Mapped[int] = mapped_column(
        Integer, default=0, nullable=False, comment="DZD integer"
    )
    payment_method: Mapped[str] = mapped_column(
        SAEnum("CASH", "CCP", "BARIDI_MOB", name="subscription_payment_method_enum"),
        default="CASH", nullable=False,
    )
    recorded_by_staff_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )
    makeup_credits: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    status: Mapped[str] = mapped_column(
        String(20), default="ACTIVE", nullable=False,
        comment="ACTIVE|EXPIRED|OVERDUE|DEPLETED|CANCELLED|SUSPENDED",
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
    academy = relationship("Academy")
    student = relationship("Student")
    enrollment = relationship("Enrollment")
    group = relationship("Class")
    recorded_by = relationship("User")

    def __repr__(self):
        return f"<StudentSubscription {self.student_id} group={self.group_id} ({self.status})>"


# Backwards-compatible alias: spec calls this entity "Subscription".
Subscription = StudentSubscription


class RevenueEntry(db.Model):
    """Immutable revenue fact per conducted session allocation (DZD integers)."""

    __tablename__ = "revenue_entries"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    academy_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("academies.id"), nullable=False
    )
    group_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("classes.id"), nullable=True
    )
    student_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("students.id"), nullable=True
    )
    session_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("sessions.id"), nullable=True
    )
    amount_da: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="DZD integer"
    )
    recorded_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    academy = relationship("Academy")
    group = relationship("Class")
    student = relationship("Student")
    session = relationship("Session")

    def __repr__(self):
        return f"<RevenueEntry {self.amount_da} DA session={self.session_id}>"


class PayoutRecord(db.Model):
    """Teacher payout computed from gross revenue per conducted session."""

    __tablename__ = "payout_records"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    academy_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("academies.id"), nullable=False
    )
    teacher_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("teachers.id"), nullable=False
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id"), unique=True, nullable=False
    )
    gross_revenue_da: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="DZD integer"
    )
    commission_type: Mapped[str] = mapped_column(String(20), nullable=False)
    commission_value: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="DZD integer"
    )
    teacher_cut_da: Mapped[int] = mapped_column(
        Integer, nullable=False, default=0, comment="DZD integer"
    )
    status: Mapped[str] = mapped_column(
        SAEnum("PENDING", "PAID", name="payout_status_enum"),
        default="PENDING", nullable=False,
    )
    paid_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    paid_by_staff_id: Mapped[str | None] = mapped_column(
        String(36), ForeignKey("users.id"), nullable=True
    )

    # Relationships
    academy = relationship("Academy")
    teacher = relationship("Teacher")
    session = relationship("Session")
    paid_by = relationship("User")

    def __repr__(self):
        return f"<PayoutRecord teacher={self.teacher_id} {self.teacher_cut_da} DA ({self.status})>"
