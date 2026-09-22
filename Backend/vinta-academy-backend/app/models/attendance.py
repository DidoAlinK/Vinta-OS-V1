"""
Vinta School OS — Attendance Model
SessionStudent: tracks check-in/out per session per student.

A roster row is created for every enrolled student the moment a session
starts, defaulting to ABSENT ("false until true"). The desk flips students
to PRESENT as they arrive. There is deliberately no payment snapshot here:
whether a student is paid is owned by their subscription, and a second copy
of that fact on this row could only ever drift from it.
"""

import uuid
from datetime import datetime, timezone
from sqlalchemy import (
    String,
    Boolean,
    ForeignKey,
    DateTime,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.extensions import db


class SessionStudent(db.Model):
    """
    Many-to-many: Session ↔ Student.
    Tracks attendance (is_present, check-in/out times) and per-session payment status.
    """

    __tablename__ = "session_students"

    id: Mapped[str] = mapped_column(
        String(36), primary_key=True, default=lambda: str(uuid.uuid4())
    )
    session_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("sessions.id"), nullable=False
    )
    student_id: Mapped[str] = mapped_column(
        String(36), ForeignKey("students.id"), nullable=False
    )
    is_present: Mapped[bool] = mapped_column(Boolean, default=False)
    checked_in_at: Mapped[datetime | None] = mapped_column(DateTime)
    checked_out_at: Mapped[datetime | None] = mapped_column(DateTime)
    checked_in_by: Mapped[str | None] = mapped_column(
        String(36),
        ForeignKey("users.id"),
        nullable=True,
        comment="Which staff member logged the check-in",
    )
    status: Mapped[str] = mapped_column(
        String(20),
        default="ABSENT",
        server_default="ABSENT",
        nullable=False,
        comment=(
            "PRESENT|ABSENT, kept in sync with is_present. Defaults to ABSENT: a "
            "roster is a blank slate of absences and the desk flips students to "
            "PRESENT as they arrive. These two columns must never disagree."
        ),
    )
    is_group_swap: Mapped[bool] = mapped_column(
        Boolean,
        default=False,
        nullable=False,
        comment="True when attendance counts for a different group (swap/makeup)",
    )
    timestamp: Mapped[datetime | None] = mapped_column(
        DateTime,
        nullable=True,
        comment=(
            "When attendance was actually recorded. Null means the row exists but "
            "nobody has acted on it yet — the normal state for every student at "
            "the moment a class starts."
        ),
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, default=lambda: datetime.now(timezone.utc)
    )

    # Relationships
    session = relationship("Session", back_populates="session_students")
    student = relationship("Student", back_populates="session_students")
    checked_in_by_user = relationship("User")

    def __repr__(self):
        return f"<SessionStudent session={self.session_id} student={self.student_id}>"
