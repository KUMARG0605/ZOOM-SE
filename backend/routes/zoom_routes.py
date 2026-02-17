from flask import Blueprint, request, jsonify
import jwt
import os
from datetime import datetime, timedelta
from dotenv import load_dotenv

load_dotenv()

zoom_bp = Blueprint('zoom', __name__)

ZOOM_CLIENT_ID = os.getenv('ZOOM_CLIENT_ID')
ZOOM_CLIENT_SECRET = os.getenv('ZOOM_CLIENT_SECRET')

@zoom_bp.route('/token', methods=['POST'])
def generate_token():
    """
    Generate Zoom Video SDK JWT token
    """
    try:
        data = request.json
        session_name = data.get('sessionName')
        role = data.get('role', 1)  # 1 for host, 0 for participant

        if not session_name:
            return jsonify({
                "success": False,
                "message": "Session name is required"
            }), 400

        # Token expiration (24 hours from now)
        exp_time = datetime.now() + timedelta(hours=24)

        # JWT payload
        payload = {
            'app_key': ZOOM_CLIENT_ID,
            'tpc': session_name,  # Topic/Session name
            'role_type': role,
            'version': 1,
            'iat': datetime.now().timestamp(),
            'exp': exp_time.timestamp()
        }

        # Generate JWT token
        token = jwt.encode(
            payload,
            ZOOM_CLIENT_SECRET,
            algorithm='HS256'
        )

        return jsonify({
            "success": True,
            "token": token
        })

    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error generating token: {str(e)}"
        }), 500
