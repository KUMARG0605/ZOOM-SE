"""
Admin routes for user management and system administration
"""
from flask import Blueprint, request, jsonify
from datetime import datetime
from models.database import db, User, Session, EmotionLog
from utils.auth import token_required, admin_required
from sqlalchemy import func

admin_bp = Blueprint('admin', __name__)


# ============================================
# USER MANAGEMENT
# ============================================

@admin_bp.route('/users', methods=['GET'])
@token_required
@admin_required
def get_all_users(current_user):
    """
    Get all users (admin only)
    Query params:
        - page: Page number (default: 1)
        - per_page: Items per page (default: 20)
        - search: Search by email/username
        - role: Filter by role
        - is_active: Filter by active status
    """
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    search = request.args.get('search', '')
    role_filter = request.args.get('role', '')
    is_active = request.args.get('is_active', '')

    # Build query
    query = User.query

    # Search filter
    if search:
        search_pattern = f'%{search}%'
        query = query.filter(
            (User.email.ilike(search_pattern)) |
            (User.username.ilike(search_pattern)) |
            (User.full_name.ilike(search_pattern))
        )

    # Role filter
    if role_filter:
        query = query.filter(User.role == role_filter)

    # Active status filter
    if is_active:
        query = query.filter(User.is_active == (is_active.lower() == 'true'))

    # Pagination
    pagination = query.order_by(User.created_at.desc()).paginate(
        page=page,
        per_page=per_page,
        error_out=False
    )

    users = [user.to_dict() for user in pagination.items]

    return jsonify({
        'success': True,
        'users': users,
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages,
            'has_next': pagination.has_next,
            'has_prev': pagination.has_prev
        }
    }), 200


@admin_bp.route('/users/<int:user_id>', methods=['GET'])
@token_required
@admin_required
def get_user_details(current_user, user_id):
    """Get detailed information about a specific user"""
    user = User.query.get(user_id)

    if not user:
        return jsonify({
            'success': False,
            'message': 'User not found'
        }), 404

    # Get user statistics
    total_sessions = Session.query.filter_by(user_id=user_id).count()
    active_sessions = Session.query.filter_by(user_id=user_id, end_time=None).count()

    return jsonify({
        'success': True,
        'user': user.to_dict(),
        'statistics': {
            'total_sessions': total_sessions,
            'active_sessions': active_sessions
        }
    }), 200


@admin_bp.route('/users/<int:user_id>', methods=['PUT'])
@token_required
@admin_required
def update_user(current_user, user_id):
    """
    Update user details (admin only)
    Body: {
        "role": "admin",
        "is_active": true,
        "is_verified": true
    }
    """
    user = User.query.get(user_id)

    if not user:
        return jsonify({
            'success': False,
            'message': 'User not found'
        }), 404

    data = request.json

    try:
        # Update role
        if 'role' in data:
            if data['role'] not in ['user', 'admin']:
                return jsonify({
                    'success': False,
                    'message': 'Invalid role. Must be: user or admin'
                }), 400
            user.role = data['role']

        # Update active status
        if 'is_active' in data:
            user.is_active = bool(data['is_active'])

        # Update verified status
        if 'is_verified' in data:
            user.is_verified = bool(data['is_verified'])

        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'User updated successfully',
            'user': user.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error updating user: {str(e)}'
        }), 500


@admin_bp.route('/users/<int:user_id>', methods=['DELETE'])
@token_required
@admin_required
def delete_user(current_user, user_id):
    """Delete a user (admin only)"""
    # Prevent self-deletion
    if current_user['user_id'] == user_id:
        return jsonify({
            'success': False,
            'message': 'Cannot delete your own account'
        }), 400

    user = User.query.get(user_id)

    if not user:
        return jsonify({
            'success': False,
            'message': 'User not found'
        }), 404

    try:
        # Delete user (sessions will be orphaned, not deleted)
        db.session.delete(user)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'User deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error deleting user: {str(e)}'
        }), 500


# ============================================
# ADMIN ACCESS MANAGEMENT
# ============================================

@admin_bp.route('/users/<int:user_id>/grant-admin', methods=['POST'])
@token_required
@admin_required
def grant_admin_access(current_user, user_id):
    """
    Grant admin access to a user
    This is a dedicated endpoint for promoting users to admin role
    """
    user = User.query.get(user_id)

    if not user:
        return jsonify({
            'success': False,
            'message': 'User not found'
        }), 404

    # Check if user is already an admin
    if user.role == 'admin':
        return jsonify({
            'success': False,
            'message': 'User is already an admin'
        }), 400

    try:
        user.role = 'admin'
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Admin access granted to {user.username}',
            'user': user.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error granting admin access: {str(e)}'
        }), 500


@admin_bp.route('/users/<int:user_id>/revoke-admin', methods=['POST'])
@token_required
@admin_required
def revoke_admin_access(current_user, user_id):
    """
    Revoke admin access from a user
    This demotes an admin user back to regular user role
    """
    # Prevent self-demotion
    if current_user['user_id'] == user_id:
        return jsonify({
            'success': False,
            'message': 'Cannot revoke your own admin access'
        }), 400

    user = User.query.get(user_id)

    if not user:
        return jsonify({
            'success': False,
            'message': 'User not found'
        }), 404

    # Check if user is already a regular user
    if user.role != 'admin':
        return jsonify({
            'success': False,
            'message': 'User is not an admin'
        }), 400

    try:
        user.role = 'user'
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Admin access revoked from {user.username}',
            'user': user.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error revoking admin access: {str(e)}'
        }), 500


@admin_bp.route('/grant-admin', methods=['POST'])
@token_required
@admin_required
def grant_admin_by_identifier(current_user):
    """
    Grant admin access by email or user_id
    Body: {
        "email": "user@example.com"
        OR
        "user_id": 5
    }
    """
    data = request.json

    if not data:
        return jsonify({
            'success': False,
            'message': 'Request body is required'
        }), 400

    user = None

    # Try to find user by email first
    if 'email' in data:
        user = User.query.filter_by(email=data['email']).first()
        if not user:
            return jsonify({
                'success': False,
                'message': f'User with email {data["email"]} not found'
            }), 404
    # Otherwise try user_id
    elif 'user_id' in data:
        user = User.query.get(data['user_id'])
        if not user:
            return jsonify({
                'success': False,
                'message': f'User with ID {data["user_id"]} not found'
            }), 404
    else:
        return jsonify({
            'success': False,
            'message': 'Either email or user_id is required'
        }), 400

    # Check if user is already an admin
    if user.role == 'admin':
        return jsonify({
            'success': False,
            'message': f'{user.email} is already an admin'
        }), 400

    try:
        user.role = 'admin'
        user.is_active = True
        user.is_verified = True
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Admin access granted to {user.email}',
            'user': user.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error granting admin access: {str(e)}'
        }), 500


@admin_bp.route('/revoke-admin', methods=['POST'])
@token_required
@admin_required
def revoke_admin_by_identifier(current_user):
    """
    Revoke admin access by email or user_id
    Body: {
        "email": "user@example.com"
        OR
        "user_id": 5
    }
    """
    data = request.json

    if not data:
        return jsonify({
            'success': False,
            'message': 'Request body is required'
        }), 400

    user = None

    # Try to find user by email first
    if 'email' in data:
        user = User.query.filter_by(email=data['email']).first()
        if not user:
            return jsonify({
                'success': False,
                'message': f'User with email {data["email"]} not found'
            }), 404
    # Otherwise try user_id
    elif 'user_id' in data:
        user = User.query.get(data['user_id'])
        if not user:
            return jsonify({
                'success': False,
                'message': f'User with ID {data["user_id"]} not found'
            }), 404
    else:
        return jsonify({
            'success': False,
            'message': 'Either email or user_id is required'
        }), 400

    # Prevent self-demotion
    if current_user['user_id'] == user.id:
        return jsonify({
            'success': False,
            'message': 'Cannot revoke your own admin access'
        }), 400

    # Check if user is already a regular user
    if user.role != 'admin':
        return jsonify({
            'success': False,
            'message': f'{user.email} is not an admin'
        }), 400

    try:
        user.role = 'user'
        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'Admin access revoked from {user.email}',
            'user': user.to_dict()
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error revoking admin access: {str(e)}'
        }), 500


# ============================================
# SYSTEM STATISTICS
# ============================================

@admin_bp.route('/stats', methods=['GET'])
@token_required
@admin_required
def get_system_stats(current_user):
    """Get system-wide statistics"""
    try:
        # User statistics
        total_users = User.query.count()
        active_users = User.query.filter_by(is_active=True).count()
        admin_users = User.query.filter_by(role='admin').count()

        # Session statistics
        total_sessions = Session.query.count()
        active_sessions = Session.query.filter_by(end_time=None).count()
        completed_sessions = Session.query.filter(Session.end_time.isnot(None)).count()

        # Emotion logs statistics
        total_emotion_logs = EmotionLog.query.count()

        # Emotion distribution
        emotion_distribution = db.session.query(
            EmotionLog.emotion,
            func.count(EmotionLog.id).label('count')
        ).group_by(EmotionLog.emotion).all()

        emotion_dist_dict = {emotion: count for emotion, count in emotion_distribution}

        # Recent activity
        recent_users = User.query.order_by(User.created_at.desc()).limit(5).all()
        recent_sessions = Session.query.order_by(Session.start_time.desc()).limit(5).all()

        return jsonify({
            'success': True,
            'statistics': {
                'users': {
                    'total': total_users,
                    'active': active_users,
                    'admins': admin_users
                },
                'sessions': {
                    'total': total_sessions,
                    'active': active_sessions,
                    'completed': completed_sessions
                },
                'emotions': {
                    'total_logs': total_emotion_logs,
                    'distribution': emotion_dist_dict
                },
                'recent_activity': {
                    'users': [u.to_dict() for u in recent_users],
                    'sessions': [{
                        'session_id': s.session_id,
                        'session_name': s.session_name,
                        'start_time': s.start_time.isoformat(),
                        'user_id': s.user_id
                    } for s in recent_sessions]
                }
            }
        }), 200

    except Exception as e:
        return jsonify({
            'success': False,
            'message': f'Error fetching statistics: {str(e)}'
        }), 500


# ============================================
# SESSION MANAGEMENT
# ============================================

@admin_bp.route('/sessions', methods=['GET'])
@token_required
@admin_required
def get_all_sessions(current_user):
    """
    Get all sessions (admin only)
    Query params:
        - page: Page number
        - per_page: Items per page
        - user_id: Filter by user
    """
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 20, type=int)
    user_id = request.args.get('user_id', type=int)

    query = Session.query

    if user_id:
        query = query.filter_by(user_id=user_id)

    pagination = query.order_by(Session.start_time.desc()).paginate(
        page=page,
        per_page=per_page,
        error_out=False
    )

    # Include user information with sessions
    sessions = []
    for s in pagination.items:
        user = User.query.get(s.user_id)
        # Count emotion logs for this session
        emotion_count = EmotionLog.query.filter_by(session_id=s.session_id).count()
        sessions.append({
            'session_id': s.session_id,
            'session_name': s.session_name,
            'user_id': s.user_id,
            'user_name': user.full_name if user else 'Unknown',
            'user_email': user.email if user else 'Unknown',
            'start_time': s.start_time.isoformat(),
            'end_time': s.end_time.isoformat() if s.end_time else None,
            'duration_minutes': int((s.end_time - s.start_time).total_seconds() / 60) if s.end_time else None,
            'emotion_logs_count': emotion_count,
            'created_at': s.created_at.isoformat() if s.created_at else None
        })

    return jsonify({
        'success': True,
        'sessions': sessions,
        'pagination': {
            'page': pagination.page,
            'per_page': pagination.per_page,
            'total': pagination.total,
            'pages': pagination.pages
        }
    }), 200


@admin_bp.route('/sessions/<session_id>', methods=['DELETE'])
@token_required
@admin_required
def delete_session(current_user, session_id):
    """Delete a session and all related emotion logs"""
    session = Session.query.filter_by(session_id=session_id).first()

    if not session:
        return jsonify({
            'success': False,
            'message': 'Session not found'
        }), 404

    try:
        # Emotion logs will be deleted automatically due to cascade
        db.session.delete(session)
        db.session.commit()

        return jsonify({
            'success': True,
            'message': 'Session deleted successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error deleting session: {str(e)}'
        }), 500


# ============================================
# BULK OPERATIONS
# ============================================

@admin_bp.route('/users/bulk-update', methods=['POST'])
@token_required
@admin_required
def bulk_update_users(current_user):
    """
    Bulk update users
    Body: {
        "user_ids": [1, 2, 3],
        "updates": {
            "is_active": false,
            "role": "user"
        }
    }
    """
    data = request.json

    if not data or 'user_ids' not in data or 'updates' not in data:
        return jsonify({
            'success': False,
            'message': 'user_ids and updates are required'
        }), 400

    user_ids = data['user_ids']
    updates = data['updates']

    # Prevent self-modification in bulk operations
    if current_user['user_id'] in user_ids:
        return jsonify({
            'success': False,
            'message': 'Cannot modify your own account in bulk operations'
        }), 400

    try:
        # Build update dict
        update_dict = {}
        if 'is_active' in updates:
            update_dict['is_active'] = bool(updates['is_active'])
        if 'role' in updates:
            if updates['role'] not in ['user', 'admin']:
                return jsonify({
                    'success': False,
                    'message': 'Invalid role'
                }), 400
            update_dict['role'] = updates['role']
        if 'is_verified' in updates:
            update_dict['is_verified'] = bool(updates['is_verified'])

        # Perform bulk update
        User.query.filter(User.id.in_(user_ids)).update(
            update_dict,
            synchronize_session=False
        )

        db.session.commit()

        return jsonify({
            'success': True,
            'message': f'{len(user_ids)} users updated successfully'
        }), 200

    except Exception as e:
        db.session.rollback()
        return jsonify({
            'success': False,
            'message': f'Error in bulk update: {str(e)}'
        }), 500
