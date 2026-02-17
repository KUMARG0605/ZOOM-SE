"""
Authentication utilities for JWT token management and password handling
"""
from functools import wraps
from flask import request, jsonify
import jwt
from datetime import datetime, timedelta
import os

# Secret key for JWT (in production, use environment variable)
SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'your-secret-key-change-in-production')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 24


def generate_token(user_id, email, role):
    """
    Generate a JWT token for authenticated user

    Args:
        user_id: User's database ID
        email: User's email
        role: User's role (user, admin)

    Returns:
        JWT token string
    """
    payload = {
        'user_id': user_id,
        'email': email,
        'role': role,
        'exp': datetime.utcnow() + timedelta(hours=JWT_EXPIRATION_HOURS),
        'iat': datetime.utcnow()
    }
    return jwt.encode(payload, SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_token(token):
    """
    Decode and verify a JWT token

    Args:
        token: JWT token string

    Returns:
        Decoded payload if valid, None if invalid
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None  # Token expired
    except jwt.InvalidTokenError:
        return None  # Invalid token


def token_required(f):
    """
    Decorator to protect routes that require authentication
    Adds 'current_user' to kwargs with user info from token
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None

        # Check for token in Authorization header
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                # Format: "Bearer <token>"
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({
                    'success': False,
                    'message': 'Invalid authorization header format. Use: Bearer <token>'
                }), 401

        if not token:
            return jsonify({
                'success': False,
                'message': 'Authentication token is missing'
            }), 401

        # Decode and verify token
        payload = decode_token(token)
        if not payload:
            return jsonify({
                'success': False,
                'message': 'Invalid or expired token'
            }), 401

        # Add user info to kwargs
        kwargs['current_user'] = payload

        return f(*args, **kwargs)

    return decorated


def admin_required(f):
    """
    Decorator to protect routes that require admin privileges
    Must be used together with @token_required
    """
    @wraps(f)
    def decorated(*args, **kwargs):
        # Check if current_user exists (should be added by token_required)
        if 'current_user' not in kwargs:
            return jsonify({
                'success': False,
                'message': 'Authentication required'
            }), 401

        current_user = kwargs['current_user']

        # Check if user has admin role
        if current_user.get('role') != 'admin':
            return jsonify({
                'success': False,
                'message': 'Admin privileges required'
            }), 403

        return f(*args, **kwargs)

    return decorated


def get_token_from_request():
    """
    Extract token from request headers

    Returns:
        Token string or None
    """
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        try:
            return auth_header.split(" ")[1]
        except IndexError:
            return None
    return None


def get_current_user_from_token():
    """
    Get current user info from token in request

    Returns:
        User payload dict or None
    """
    token = get_token_from_request()
    if token:
        return decode_token(token)
    return None
