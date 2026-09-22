"""
Vinta School OS — Configuration Environments
Dev, Test, and Production configurations for the Flask application.
"""
import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()


class BaseConfig:
    """Shared configuration across all environments."""

    SECRET_KEY = os.environ.get("SECRET_KEY")
    SQLALCHEMY_TRACK_MODIFICATIONS = False

    # JWT Configuration
    JWT_SECRET_KEY = os.environ.get("JWT_SECRET_KEY")
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=int(os.getenv("JWT_ACCESS_MINUTES", "60")))
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=int(os.getenv("JWT_REFRESH_DAYS", "7")))
    JWT_TOKEN_LOCATION = ["headers"]
    JWT_HEADER_NAME = "Authorization"
    JWT_HEADER_TYPE = "Bearer"

    # CORS
    CORS_ORIGINS = os.getenv("CORS_ORIGINS", "")

    # SQLAlchemy
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "DATABASE_URL",
        "mysql+pymysql://root:03112006@localhost:3306/vinta_school_dev",
    )

    # Flask-Migrate
    MIGRATION_DIR = "migrations"

    # Pagination defaults
    DEFAULT_PAGE_SIZE = 50
    MAX_PAGE_SIZE = 100

    # Phone format (+213)
    PHONE_COUNTRY_CODE = "+213"

    # Currency
    DEFAULT_CURRENCY = "DZD"

    # Timezone (Algeria)
    TIMEZONE = "Africa/Algiers"


class DevelopmentConfig(BaseConfig):
    """Development environment configuration."""

    DEBUG = True
    SQLALCHEMY_ECHO = False  # Set True to log SQL queries


class TestingConfig(BaseConfig):
    """Test environment configuration."""

    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = os.getenv(
        "TEST_DATABASE_URL",
        "sqlite:///:memory:",
    )
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=5)


class ProductionConfig(BaseConfig):
    """Production environment configuration."""

    DEBUG = False
    SQLALCHEMY_ECHO = False


config_by_name = {
    "development": DevelopmentConfig,
    "testing": TestingConfig,
    "production": ProductionConfig,
}


def validate_config():
    """Fail fast if critical secrets are not configured."""
    import sys
    missing = []
    if not BaseConfig.SECRET_KEY:
        missing.append("SECRET_KEY")
    if not BaseConfig.JWT_SECRET_KEY:
        missing.append("JWT_SECRET_KEY")
    if missing:
        print(f"FATAL: Missing required environment variables: {', '.join(missing)}", file=sys.stderr)
        print("Set these in your .env file or environment before starting the application.", file=sys.stderr)
        sys.exit(1)
