"""
One-shot database fix — adds any missing columns to existing tables.
Run once: python fix_db.py
Safe to run multiple times (idempotent).
"""
import sqlite3
import os
import sys

DB_PATH = os.path.join(os.path.dirname(__file__), "instance", "vinta_school_dev.db")

# All (table, column, definition) tuples that must exist
MISSING_COLUMNS = [
    # ── students ──
    ("students", "is_active", "BOOLEAN NOT NULL DEFAULT 1"),
    ("students", "created_at", "DATETIME"),
    ("students", "updated_at", "DATETIME"),

    # ── guardians ──
    ("guardians", "relationship_type", "VARCHAR(100)"),
    ("guardians", "is_emergency", "BOOLEAN DEFAULT 0"),
    ("guardians", "created_at", "DATETIME"),

    # ── enrollments ──
    ("enrollments", "enrolled_by", "VARCHAR(36)"),
    ("enrollments", "status", "VARCHAR(20) DEFAULT 'active'"),
    ("enrollments", "created_at", "DATETIME"),
    ("enrollments", "updated_at", "DATETIME"),

    # ── teachers ──
    ("teachers", "first_name", "VARCHAR(255)"),
    ("teachers", "last_name", "VARCHAR(255)"),
    ("teachers", "full_name", "VARCHAR(255)"),
    ("teachers", "contract_type", "VARCHAR(20) DEFAULT 'hourly'"),
    ("teachers", "hourly_rate", "INTEGER DEFAULT 0"),
    ("teachers", "per_student_rate", "INTEGER DEFAULT 0"),
    ("teachers", "commission_type", "VARCHAR(20)"),
    ("teachers", "commission_value", "INTEGER DEFAULT 0"),
    ("teachers", "notes", "TEXT"),
    ("teachers", "created_at", "DATETIME"),
    ("teachers", "updated_at", "DATETIME"),

    # ── classes ──
    ("classes", "teacher_id", "VARCHAR(36)"),
    ("classes", "capacity", "INTEGER DEFAULT 20"),
    ("classes", "subject", "VARCHAR(100)"),
    ("classes", "is_active", "BOOLEAN DEFAULT 1"),
    ("classes", "class_type", "VARCHAR(20) DEFAULT 'weekly'"),
    ("classes", "dedicated_time", "VARCHAR(255)"),

    # ── sessions ──
    ("sessions", "status", "VARCHAR(20) DEFAULT 'scheduled'"),
    ("sessions", "finalized_by", "VARCHAR(36)"),
    ("sessions", "finalized_at", "DATETIME"),
    ("sessions", "is_conducted", "BOOLEAN"),

    # ── session_students ──
    ("session_students", "status", "VARCHAR(20) DEFAULT 'present'"),
    ("session_students", "is_group_swap", "BOOLEAN DEFAULT 0"),

    # ── payment_plans ──
    ("payment_plans", "academy_id", "VARCHAR(36)"),

    # ── student_billings ──
    ("student_billings", "amount_da", "INTEGER DEFAULT 0"),
    ("student_billings", "paid_amount", "INTEGER"),
    ("student_billings", "cycle_start", "DATE"),
    ("student_billings", "cycle_end", "DATE"),
    ("student_billings", "notes", "TEXT"),

    # ── payment_logs ──
    ("payment_logs", "group_id", "VARCHAR(36)"),
    ("payment_logs", "session_id", "VARCHAR(36)"),

    # ── teacher_payrolls ──
    ("teacher_payrolls", "session_id", "VARCHAR(36)"),
    ("teacher_payrolls", "gross_revenue_da", "INTEGER DEFAULT 0"),
    ("teacher_payrolls", "commission_type", "VARCHAR(20)"),
    ("teacher_payrolls", "commission_value", "INTEGER DEFAULT 0"),
    ("teacher_payrolls", "cut_da", "INTEGER DEFAULT 0"),
    ("teacher_payrolls", "status", "VARCHAR(20) DEFAULT 'pending'"),
    ("teacher_payrolls", "paid_at", "DATETIME"),
    ("teacher_payrolls", "paid_by_staff_id", "VARCHAR(36)"),

    # ── student_subscriptions (entire table) ──
    # ── payout_records (entire table) ──
    # ── revenue_entries (entire table) ──

    # ── academy_settings ──
    ("academy_settings", "currency", "VARCHAR(10) DEFAULT 'DZD'"),
    ("academy_settings", "default_plan_duration", "INTEGER DEFAULT 30"),
    ("academy_settings", "billing_reminder_days_before", "INTEGER DEFAULT 3"),
    ("academy_settings", "due_date_reminder_timing", "VARCHAR(20) DEFAULT 'same_day'"),
    ("academy_settings", "whatsapp_template", "TEXT"),
    ("academy_settings", "auto_checkout_enabled", "BOOLEAN DEFAULT 0"),
    ("academy_settings", "end_class_popup_enabled", "BOOLEAN DEFAULT 0"),
    ("academy_settings", "default_theme", "VARCHAR(20) DEFAULT 'dark'"),
    ("academy_settings", "default_font_size", "VARCHAR(20) DEFAULT 'normal'"),
    ("academy_settings", "default_language", "VARCHAR(10) DEFAULT 'fr'"),
]

# Entire tables that must exist (created via CREATE TABLE IF NOT EXISTS)
REQUIRED_TABLES = {
    "student_subscriptions": """
        CREATE TABLE IF NOT EXISTS student_subscriptions (
            id VARCHAR(36) PRIMARY KEY,
            academy_id VARCHAR(36) NOT NULL,
            enrollment_id VARCHAR(36),
            student_id VARCHAR(36) NOT NULL,
            group_id VARCHAR(36) NOT NULL,
            billing_model VARCHAR(20) NOT NULL,
            total_credits INTEGER,
            remaining_credits INTEGER,
            cycle_start_date DATE,
            cycle_deadline DATE,
            access_start_date DATE,
            access_end_date DATE,
            max_groups_included INTEGER DEFAULT 1,
            enrolled_group_ids JSON,
            amount_paid_da INTEGER DEFAULT 0,
            payment_method VARCHAR(20) DEFAULT 'CASH',
            recorded_by_staff_id VARCHAR(36),
            makeup_credits INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'ACTIVE',
            created_at DATETIME,
            updated_at DATETIME
        )
    """,
    "payout_records": """
        CREATE TABLE IF NOT EXISTS payout_records (
            id VARCHAR(36) PRIMARY KEY,
            academy_id VARCHAR(36) NOT NULL,
            teacher_id VARCHAR(36) NOT NULL,
            session_id VARCHAR(36),
            session_date DATE,
            gross_revenue_da INTEGER DEFAULT 0,
            commission_type VARCHAR(20),
            commission_value INTEGER DEFAULT 0,
            cut_da INTEGER DEFAULT 0,
            status VARCHAR(20) DEFAULT 'Pending',
            paid_at DATETIME,
            paid_by_staff_id VARCHAR(36),
            created_at DATETIME
        )
    """,
    "revenue_entries": """
        CREATE TABLE IF NOT EXISTS revenue_entries (
            id VARCHAR(36) PRIMARY KEY,
            academy_id VARCHAR(36) NOT NULL,
            source VARCHAR(50),
            amount_da INTEGER DEFAULT 0,
            payment_method VARCHAR(20),
            session_id VARCHAR(36),
            group_id VARCHAR(36),
            recorded_at DATETIME,
            created_at DATETIME
        )
    """,
    "academic_years": """
        CREATE TABLE IF NOT EXISTS academic_years (
            id VARCHAR(36) PRIMARY KEY,
            academy_id VARCHAR(36) NOT NULL,
            name VARCHAR(100) NOT NULL,
            start_date DATE,
            end_date DATE,
            is_current BOOLEAN DEFAULT 0,
            created_at DATETIME
        )
    """,
    "terms": """
        CREATE TABLE IF NOT EXISTS terms (
            id VARCHAR(36) PRIMARY KEY,
            academy_id VARCHAR(36) NOT NULL,
            academic_year_id VARCHAR(36),
            name VARCHAR(100) NOT NULL,
            start_date DATE,
            end_date DATE,
            is_current BOOLEAN DEFAULT 0,
            created_at DATETIME
        )
    """,
    "room_assignments": """
        CREATE TABLE IF NOT EXISTS room_assignments (
            id VARCHAR(36) PRIMARY KEY,
            academy_id VARCHAR(36) NOT NULL,
            class_id VARCHAR(36),
            session_id VARCHAR(36),
            room_name VARCHAR(100),
            assigned_at DATETIME
        )
    """,
    "teacher_subjects": """
        CREATE TABLE IF NOT EXISTS teacher_subjects (
            teacher_id VARCHAR(36) NOT NULL,
            subject_id VARCHAR(36) NOT NULL,
            PRIMARY KEY (teacher_id, subject_id),
            FOREIGN KEY (teacher_id) REFERENCES teachers(id) ON DELETE CASCADE,
            FOREIGN KEY (subject_id) REFERENCES subjects(id) ON DELETE CASCADE
        )
    """,
}


def main():
    if not os.path.exists(DB_PATH):
        print(f"ERROR: Database not found at {DB_PATH}")
        print("Make sure you run this from the Backend/vinta-academy-backend directory.")
        sys.exit(1)

    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()

    # 1. Create missing tables
    created_tables = 0
    for table_name, create_sql in REQUIRED_TABLES.items():
        cur.execute(f"SELECT name FROM sqlite_master WHERE type='table' AND name='{table_name}'")
        if not cur.fetchone():
            cur.execute(create_sql)
            created_tables += 1
            print(f"  [OK] Created table: {table_name}")

    # 2. Add missing columns
    added_columns = 0
    for table, column, definition in MISSING_COLUMNS:
        cur.execute(f"PRAGMA table_info({table})")
        existing = {row[1] for row in cur.fetchall()}
        if column not in existing:
            try:
                cur.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
                added_columns += 1
                print(f"  [OK] Added column: {table}.{column}")
            except sqlite3.OperationalError as e:
                print(f"  [SKIP] {table}.{column}: {e}")

    conn.commit()
    conn.close()

    print(f"\nDone! Created {created_tables} tables, added {added_columns} columns.")
    print("Restart your Flask server and try adding a student again.")


if __name__ == "__main__":
    main()
