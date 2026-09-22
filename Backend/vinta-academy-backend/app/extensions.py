"""
Vinta School OS — Extension Initialization
Centralized extension instances for Flask-Migrate, SQLAlchemy, JWT, CORS, SocketIO, SMOREST, Limiter.
"""
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_cors import CORS
from flask_socketio import SocketIO
from flask_smorest import Api
from app.utils.rate_limiter import limiter

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()
cors = CORS()
socketio = SocketIO()
api = Api()
