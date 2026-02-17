from flask_sqlalchemy import SQLAlchemy
from datetime import datetime
from werkzeug.security import generate_password_hash, check_password_hash
import secrets

db = SQLAlchemy()

class User(db.Model):
    """Model for user authentication and profile"""
    __tablename__ = 'users'

    id = db.Column(db.Integer, primary_key=True)
    email = db.Column(db.String(120), unique=True, nullable=False, index=True)
    username = db.Column(db.String(80), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    full_name = db.Column(db.String(200))
    role = db.Column(db.String(20), default='user', nullable=False)  # user, admin
    is_active = db.Column(db.Boolean, default=True, nullable=False)
    is_verified = db.Column(db.Boolean, default=False, nullable=False)
    reset_token = db.Column(db.String(100), unique=True, nullable=True)
    reset_token_expiry = db.Column(db.DateTime, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    last_login = db.Column(db.DateTime, nullable=True)

    # Relationships
    sessions = db.relationship('Session', backref='user', lazy=True)

    def set_password(self, password):
        """Hash and set the user's password"""
        self.password_hash = generate_password_hash(password)

    def check_password(self, password):
        """Check if the provided password matches the hash"""
        return check_password_hash(self.password_hash, password)

    def generate_reset_token(self):
        """Generate a password reset token"""
        self.reset_token = secrets.token_urlsafe(32)
        self.reset_token_expiry = datetime.utcnow() + datetime.timedelta(hours=24)
        return self.reset_token

    def is_admin(self):
        """Check if user has admin role"""
        return self.role == 'admin'

    def to_dict(self, include_sensitive=False):
        """Convert user to dictionary"""
        data = {
            'id': self.id,
            'email': self.email,
            'username': self.username,
            'full_name': self.full_name,
            'role': self.role,
            'is_active': self.is_active,
            'is_verified': self.is_verified,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'last_login': self.last_login.isoformat() if self.last_login else None
        }
        if include_sensitive:
            data['reset_token'] = self.reset_token
            data['reset_token_expiry'] = self.reset_token_expiry.isoformat() if self.reset_token_expiry else None
        return data

    def __repr__(self):
        return f'<User {self.username}>'


class Session(db.Model):
    """Model for tracking session information"""
    __tablename__ = 'sessions'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(100), unique=True, nullable=False)
    session_name = db.Column(db.String(200), nullable=False)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=True)  # Link to user
    start_time = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)
    end_time = db.Column(db.DateTime, nullable=True)
    summary = db.Column(db.Text, nullable=True)
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    # Relationship with emotion logs
    emotion_logs = db.relationship('EmotionLog', backref='session', lazy=True, cascade='all, delete-orphan')

    def __repr__(self):
        return f'<Session {self.session_name}>'

class EmotionLog(db.Model):
    """Model for logging individual emotion detections"""
    __tablename__ = 'emotion_logs'

    id = db.Column(db.Integer, primary_key=True)
    session_id = db.Column(db.String(100), db.ForeignKey('sessions.session_id'), nullable=False)
    participant_id = db.Column(db.String(100), nullable=False)
    emotion = db.Column(db.String(50), nullable=False)
    confidence = db.Column(db.Float, nullable=False)
    timestamp = db.Column(db.DateTime, nullable=False, default=datetime.utcnow)

    def __repr__(self):
        return f'<EmotionLog {self.participant_id} - {self.emotion}>'

    def to_dict(self):
        return {
            'id': self.id,
            'session_id': self.session_id,
            'participant_id': self.participant_id,
            'emotion': self.emotion,
            'confidence': self.confidence,
            'timestamp': self.timestamp.isoformat()
        }
