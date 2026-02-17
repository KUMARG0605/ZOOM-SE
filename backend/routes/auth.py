"""
Authentication routes for login, signup, password reset, and profile management
"""
from flask import Blueprint, request, jsonify
from datetime import datetime, timedelta
from models.database import db, User
from utils.auth import generate_token, token_required, get_current_user_from_token
import re

auth_bp = Blueprint('auth', __name__)


def validate_email(email):
    """Validate email format"""
    pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    return re.match(pattern, email) is not None


def validate_password(password):
    """
    Validate password strength
    - At least 8 characters
    - At least one uppercase letter
    - At least one lowercase letter
    - At least one digit
    """
    if len(password) < 8:
        return False, "Password must be at least 8 characters long"
    if not re.search(r'[A-Z]', password):
        return False, "Password must contain at least one uppercase letter"
    if not re.search(r'[a-z]', password):
        return False, "Password must contain at least one lowercase letter"
    if not re.search(r'\d', password):
        return False, "Password must contain at least one digit"
    return True, "Password is valid"


# ============================================
# SIGNUP / REGISTRATION
# ============================================

@auth_bp.route('/signup', methods=['POST'])
def signup():
    """
    Register a new user
    Body: {
        "email": "user@example.com",
        "username": "username",
        "password": "Password123",
        "full_name": "Full Name" (optional)
    }
    """
    data = request.json

    # Validate required fields
    if not data or not all(k in data for k in ['email', 'username', 'password']):
        return jsonify({
            'success': False,
            'message': 'Email, username, and password are required'
        }), 400

    email = data['email'].lower().strip()
    username = data['username'].strip()
    password = data['password']
    full_name = data.get('full_name', '').strip()

    # Validate email format
    if not validate_email(email):
        return jsonify({
            'success': False,
            'message': 'Invalid email format'
        }), 400

    # Validate username (alphanumeric and underscore only)
    if not re.match(r'^[a-zA-Z0-9_]{3,20}$', username):
        return jsonify({
            'success': False,
            'message': 'Username must be 3-20 characters and contain only letters, numbers, and underscores'
        }), 400

    # Validate password strength
    is_valid, message = validate_password(password)
    if not is_valid:
        return jsonify({
            'success': False,
            'message': message
        }), 400

    # Check if email already exists
    existing_email = User.query.filter_by(email=email).first()
    if existing_email:
        return jsonify({
            'success': False,
            'message': 'Email already registered'
        }), 409

    # Check if username already exists
    existing_username = User.query.filter_by(username=username).first()
    if existing_username:
        return jsonify({
            'success': False,
            'message': 'Username already taken'
        }), 409

    try:
        # Create new user
        user = User(
            email=email,
            username=username,
            full_name=full_name,
            role='user',  # Default role
            is_active=True,
            is_verified=False
        )
        user.set_password(password)

        db.session.add(user)
        db.session.flush()  # Get the user ID without committing

        # Generate verification code and send email
        from utils.email_service import send_verification_email, store_verification_code, generate_verification_code
        verification_code = generate_verification_code()
        # Store the code first
        store_verification_code(email, verification_code)
        # Then send the email
        sent = send_verification_email(email, verification_code, purpose='verification')

        db.session.commit()

        # If email sending failed, still return success for account creation but notify client
        if not sent:
            return jsonify({
                'success': True,
                'message': 'Account created but verification email failed to send. Please request a new verification code or contact support.',
                'user_id': user.id,
                'email': user.email,
                'is_verified': user.is_verified,
                'email_sent': False
            }), 201

        return jsonify({
            'success': True,
            'message': 'Account created successfully. Please check your email to verify your account.',
            'user_id': user.id,
            'email': user.email,
            'is_verified': user.is_verified
        }), 201

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error creating account: {str(e)}'
        }), 500


# ============================================
# LOGIN
# ============================================

@auth_bp.route('/login', methods=['POST'])
def login():
    """
    Authenticate user and return JWT token
    Body: {
        "email": "user@example.com",  # or username
        "password": "Password123"
    }
    """
    data = request.json

    if not data or not all(k in data for k in ['email', 'password']):
        return jsonify({
            'success': False,
            'message': 'Email/username and password are required'
        }), 400

    identifier = data['email'].strip()
    password = data['password']

    # Try to find user by email or username
    user = User.query.filter(
        (User.email == identifier.lower()) | (User.username == identifier)
    ).first()

    if not user or not user.check_password(password):
        return jsonify({
            'success': False,
            'message': 'Invalid email/username or password'
        }), 401

    # Check if account is active
    if not user.is_active:
        return jsonify({
            'success': False,
            'message': 'Account is deactivated. Please contact support.'
        }), 403
        
    # Check if email is verified
    if not user.is_verified:
        return jsonify({
            'success': False,
            'message': 'Please verify your email address before logging in.',
            'requires_verification': True,
            'email': user.email
        }), 403

    try:
        # Update last login time
        user.last_login = datetime.utcnow()
        db.session.commit()

        # Generate token
        token = generate_token(user.id, user.email, user.role)

        return jsonify({
            'success': True,
            'message': 'Login successful',
            'token': token,
            'user': user.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error during login: {str(e)}'
        }), 500


# ============================================
# PROFILE MANAGEMENT
# ============================================

@auth_bp.route('/profile', methods=['GET'])
@token_required
def get_profile(current_user):
    """Get current user's profile"""
    user = User.query.get(current_user['user_id'])

    if not user:
        return jsonify({
            'success': False,
            'message': 'User not found'
        }), 404

    return jsonify({
        'success': True,
        'user': user.to_dict()
    }), 200


@auth_bp.route('/profile', methods=['PUT'])
@token_required
def update_profile(current_user):
    """
    Update user profile
    Body: {
        "full_name": "New Name",
        "email": "newemail@example.com" (optional),
        "username": "newusername" (optional)
    }
    """
    user = User.query.get(current_user['user_id'])

    if not user:
        return jsonify({
            'success': False,
            'message': 'User not found'
        }), 404

    data = request.json

    try:
        # Update full name
        if 'full_name' in data:
            user.full_name = data['full_name'].strip()

        # Update email (check if new email is available)
        if 'email' in data:
            new_email = data['email'].lower().strip()
            if new_email != user.email:
                if not validate_email(new_email):
                    return jsonify({
                        'success': False,
                        'message': 'Invalid email format'
                    }), 400

                existing = User.query.filter_by(email=new_email).first()
                if existing:
                    return jsonify({
                        'success': False,
                        'message': 'Email already in use'
                    }), 409

                user.email = new_email

        # Update username (check if new username is available)
        if 'username' in data:
            new_username = data['username'].strip()
            if new_username != user.username:
                if not re.match(r'^[a-zA-Z0-9_]{3,20}$', new_username):
                    return jsonify({
                        'success': False,
                        'message': 'Invalid username format'
                    }), 400

                existing = User.query.filter_by(username=new_username).first()
                if existing:
                    return jsonify({
                        'success': False,
                        'message': 'Username already taken'
                    }), 409

                user.username = new_username

        db.session.commit()

        # Generate new token with updated info
        token = generate_token(user.id, user.email, user.role)

        return jsonify({
            'success': True,
            'message': 'Profile updated successfully',
            'user': user.to_dict(),
            'token': token  # New token with updated info
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error updating profile: {str(e)}'
        }), 500


@auth_bp.route('/change-password', methods=['POST'])
@token_required
def change_password(current_user):
    """
    Change user password
    Body: {
        "current_password": "OldPassword123",
        "new_password": "NewPassword123"
    }
    """
    user = User.query.get(current_user['user_id'])

    if not user:
        return jsonify({
            'success': False,
            'message': 'User not found'
        }), 404

    data = request.json

    if not data or not all(k in data for k in ['current_password', 'new_password']):
        return jsonify({
            'success': False,
            'message': 'Current password and new password are required'
        }), 400

    # Verify current password
    if not user.check_password(data['current_password']):
        return jsonify({
            'success': False,
            'message': 'Current password is incorrect'
        }), 401

    # Validate new password
    is_valid, message = validate_password(data['new_password'])
    if not is_valid:
        return jsonify({
            'success': False,
            'message': message
        }), 400

    try:
        user.set_password(data['new_password'])
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Password changed successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error changing password: {str(e)}'
        }), 500


# ============================================
# PASSWORD RESET
# ============================================

@auth_bp.route('/forgot-password', methods=['POST'])
def forgot_password():
    """
    Request password reset code
    Body: {
        "email": "user@example.com"
    }
    """
    data = request.get_json()
    
    if not data or 'email' not in data:
        return jsonify({
            'success': False,
            'message': 'Email is required'
        }), 400

    email = data['email'].lower().strip()
    user = User.query.filter_by(email=email).first()
    
    if not user:
        # For security, don't reveal if email exists or not
        return jsonify({
            'success': True,
            'message': 'If an account exists with this email, a password reset code has been sent.'
        })

    try:
        # Generate verification code and send email
        from utils.email_service import send_verification_email, store_verification_code, generate_verification_code
        verification_code = generate_verification_code()
        # Store the code first
        store_verification_code(email, verification_code)
        # Then send the email
        sent = send_verification_email(email, verification_code, purpose='password_reset')

        # send_verification_email may return True, False, or the code string (in dev mode)
        if sent:
            return jsonify({
                'success': True,
                'message': 'If an account exists with this email, a password reset code has been sent.',
                'email': email
            })
        else:
            return jsonify({
                'success': False,
                'message': 'Failed to send password reset email. Please try again.'
            }), 500

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error processing password reset: {str(e)}'
        }), 500


@auth_bp.route('/reset-password', methods=['POST'])
def reset_password():
    """
    Reset password with verification code
    Body: {
        "email": "user@example.com",
        "code": "123456",
        "new_password": "NewPassword123"
    }
    """
    data = request.get_json()
    
    required_fields = ['email', 'code', 'new_password']
    if not data or not all(field in data for field in required_fields):
        return jsonify({
            'success': False,
            'message': 'Email, verification code, and new password are required'
        }), 400

    email = data['email'].lower().strip()
    code = data['code'].strip()
    new_password = data['new_password']

    # Validate password strength
    is_valid, message = validate_password(new_password)
    if not is_valid:
        return jsonify({
            'success': False,
            'message': message
        }), 400

    # Verify the code
    from utils.email_service import verify_code
    is_valid, message = verify_code(email, code)
    
    if not is_valid:
        return jsonify({
            'success': False,
            'message': message or 'Invalid or expired verification code'
        }), 400

    try:
        # Find user and update password
        user = User.query.filter_by(email=email).first()
        if not user:
            return jsonify({
                'success': False,
                'message': 'User not found'
            }), 404

        user.set_password(new_password)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Password has been reset successfully. You can now log in with your new password.'
        })

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error resetting password: {str(e)}'
        }), 500


# ============================================
# VERIFY TOKEN
# ============================================


# ============================================
# VERIFY CODE / RESEND VERIFICATION
# ============================================


@auth_bp.route('/verify-code', methods=['POST'])
def verify_code_route():
    """
    Verify a code sent to user's email (used for email verification and password reset)
    Body: { email, code, purpose }
    purpose: 'verification' or 'password_reset'
    """
    print("\n=== Verify Code Route Hit ===")
    print(f"Request Method: {request.method}")
    print(f"Request Path: {request.path}")
    print(f"Request Headers: {dict(request.headers)}")
    
    data = request.get_json() or {}
    print(f"Request Data: {data}")
    
    if not all(k in data for k in ['email', 'code', 'purpose']):
        print("Missing required fields!")
        print(f"Required: ['email', 'code', 'purpose']")
        print(f"Received: {list(data.keys())}")
        return jsonify({'success': False, 'message': 'Email, code and purpose are required'}), 400

    email = data['email'].lower().strip()
    code = data['code'].strip()
    purpose = data['purpose']

    from utils.email_service import verify_code
    
    print(f"\nVerifying code...")
    print(f"Email: {email}")
    print(f"Code: {code}")
    print(f"Purpose: {purpose}")
    
    is_valid, message = verify_code(email, code)
    print(f"Verification Result: valid={is_valid}, message='{message}'")
    
    if not is_valid:
        return jsonify({'success': False, 'message': message}), 400

    # If purpose is verification, mark the user as verified
    if purpose == 'verification':
        print("\nPurpose is verification - checking user...")
        user = User.query.filter_by(email=email).first()
        print(f"User found: {user is not None}")
        if user and not user.is_verified:
            try:
                user.is_verified = True
                db.session.commit()
            except Exception as e:
                db.session.rollback()
                return jsonify({'success': False, 'message': f'Failed to verify user: {str(e)}'}), 500

    return jsonify({'success': True, 'message': 'Code verified successfully'})


@auth_bp.route('/resend-verification', methods=['POST'])
def resend_verification():
    """
    Resend verification code to an email
    Body: { email }
    """
    data = request.get_json() or {}
    if 'email' not in data:
        return jsonify({'success': False, 'message': 'Email is required'}), 400

    email = data['email'].lower().strip()
    user = User.query.filter_by(email=email).first()
    # For security, don't reveal if user exists; still generate and send if exists
    try:
        from utils.email_service import generate_verification_code, store_verification_code, send_verification_email

        code = generate_verification_code()
        store_verification_code(email, code)
        sent = send_verification_email(email, code, purpose='verification')

        if sent:
            return jsonify({'success': True, 'message': 'Verification code resent'})
        else:
            return jsonify({'success': False, 'message': 'Failed to send verification email'}), 500

    except Exception as e:
        return jsonify({'success': False, 'message': f'Error resending verification: {str(e)}'}), 500


@auth_bp.route('/verify-token', methods=['GET'])
@token_required
def verify_token(current_user):
    """Verify if token is still valid and return user info"""
    user = User.query.get(current_user['user_id'])

    if not user or not user.is_active:
        return jsonify({
            'success': False,
            'message': 'User not found or inactive'
        }), 404

    return jsonify({
        'success': True,
        'user': user.to_dict()
    }), 200


# ============================================
# LOGOUT (client-side only, token invalidation could be added)
# ============================================

@auth_bp.route('/logout', methods=['POST'])
@token_required
def logout(current_user):
    """
    Logout user (mainly for logging purposes)
    In JWT, logout is typically handled client-side by removing the token
    """
    return jsonify({
        'success': True,
        'message': 'Logged out successfully'
    }), 200
