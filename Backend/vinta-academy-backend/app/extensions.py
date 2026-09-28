"""
Vinta School OS — Extension Initialization
Centralized extension instances for Flask-Migrate, SQLAlchemy, JWT, CORS, SocketIO, SMOREST, Limiter.
"""
import sqlite3

from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_smorest import Api
from sqlalchemy import event
from sqlalchemy.engine import Engine

from app.utils.rate_limiter import limiter

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()
socketio = SocketIO()
api = Api()


@event.listens_for(Engine, "connect")
def _sqlite_enable_foreign_keys(dbapi_connection, _connection_record):
    """
    Turn on foreign key enforcement for every SQLite connection as it opens.

    ``PRAGMA foreign_keys`` is a property of a *connection*, not of the
    database file, and SQLAlchemy's default is off. This used to be done in a
    ``before_request`` hook, which reached into the pool for a connection,
    set the pragma on that one, and handed it back — so the request itself ran
    on whichever connection it was given, and whether its deletes were checked
    against foreign keys came down to pool luck. A delete could pass locally
    and fail with FOREIGN KEY constraint failed on the next attempt, with
    nothing changed but the connection.

    Set on connect, it is a property of the engine: every connection has it,
    always, including the ones the ORM opens for its own bookkeeping.
    """
    if isinstance(dbapi_connection, sqlite3.Connection):
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.close()
