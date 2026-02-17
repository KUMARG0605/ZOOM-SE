# routes/daily.py
import os
import requests
from datetime import datetime, timedelta
from flask import Blueprint, request, jsonify
from dotenv import load_dotenv

load_dotenv()

daily_bp = Blueprint("daily", __name__)

# Daily.co API configuration
DAILY_API_KEY = os.getenv('DAILY_API_KEY', '')
DAILY_API_BASE = 'https://api.daily.co/v1'

def get_headers():
    """Get headers for Daily.co API requests"""
    return {
        'Authorization': f'Bearer {DAILY_API_KEY}',
        'Content-Type': 'application/json'
    }


@daily_bp.route("/create-room", methods=["POST"])
def create_room():
    """
    Create a Daily.co video room
    Body: {
        "room_name": "My Meeting",
        "privacy": "public" or "private",
        "max_participants": 10
    }
    """
    if not DAILY_API_KEY:
        return jsonify({
            "success": False,
            "message": "Daily.co API key not configured. Please add DAILY_API_KEY to your .env file"
        }), 500

    data = request.json or {}
    room_name = data.get("room_name", f"meeting-{int(datetime.now().timestamp())}")
    privacy = data.get("privacy", "public")
    max_participants = data.get("max_participants", 10)

    # Create room via Daily.co API
    try:
        response = requests.post(
            f"{DAILY_API_BASE}/rooms",
            headers=get_headers(),
            json={
                "name": room_name,
                "privacy": privacy,
                "properties": {
                    "max_participants": max_participants,
                    "enable_screenshare": True,
                    "enable_chat": True,
                    "enable_knocking": False,
                    "start_video_off": False,
                    "start_audio_off": False,
                    "enable_prejoin_ui": False,  # Skip prejoin screen
                    "exp": int((datetime.now() + timedelta(hours=2)).timestamp())  # Expires in 2 hours
                }
            }
        )

        if response.status_code == 200:
            room_data = response.json()
            return jsonify({
                "success": True,
                "room": {
                    "name": room_data.get("name"),
                    "url": room_data.get("url"),
                    "created_at": room_data.get("created_at"),
                    "privacy": room_data.get("privacy"),
                    "api_created": room_data.get("api_created"),
                    "config": room_data.get("config", {})
                }
            })
        else:
            error_data = response.json()
            return jsonify({
                "success": False,
                "message": f"Failed to create room: {error_data.get('error', 'Unknown error')}"
            }), response.status_code

    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error creating room: {str(e)}"
        }), 500


@daily_bp.route("/rooms", methods=["GET"])
def list_rooms():
    """List all Daily.co rooms"""
    if not DAILY_API_KEY:
        return jsonify({
            "success": False,
            "message": "Daily.co API key not configured"
        }), 500

    try:
        response = requests.get(
            f"{DAILY_API_BASE}/rooms",
            headers=get_headers()
        )

        if response.status_code == 200:
            rooms_data = response.json()
            return jsonify({
                "success": True,
                "rooms": rooms_data.get("data", []),
                "total_count": rooms_data.get("total_count", 0)
            })
        else:
            return jsonify({
                "success": False,
                "message": "Failed to list rooms"
            }), response.status_code

    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error listing rooms: {str(e)}"
        }), 500


@daily_bp.route("/room/<room_name>", methods=["DELETE"])
def delete_room(room_name):
    """Delete a Daily.co room"""
    if not DAILY_API_KEY:
        return jsonify({
            "success": False,
            "message": "Daily.co API key not configured"
        }), 500

    try:
        response = requests.delete(
            f"{DAILY_API_BASE}/rooms/{room_name}",
            headers=get_headers()
        )

        if response.status_code == 200:
            return jsonify({
                "success": True,
                "message": "Room deleted successfully"
            })
        else:
            return jsonify({
                "success": False,
                "message": "Failed to delete room"
            }), response.status_code

    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error deleting room: {str(e)}"
        }), 500


@daily_bp.route("/room/<room_name>", methods=["GET"])
def get_room(room_name):
    """Get details of a specific room"""
    if not DAILY_API_KEY:
        return jsonify({
            "success": False,
            "message": "Daily.co API key not configured"
        }), 500

    try:
        response = requests.get(
            f"{DAILY_API_BASE}/rooms/{room_name}",
            headers=get_headers()
        )

        if response.status_code == 200:
            room_data = response.json()
            return jsonify({
                "success": True,
                "room": room_data
            })
        else:
            return jsonify({
                "success": False,
                "message": "Room not found"
            }), response.status_code

    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error getting room: {str(e)}"
        }), 500


@daily_bp.route("/meeting-token", methods=["POST"])
def create_meeting_token():
    """
    Create a meeting token for a participant (optional, for private rooms)
    Body: {
        "room_name": "meeting-123",
        "user_name": "John Doe",
        "is_owner": true
    }
    """
    if not DAILY_API_KEY:
        return jsonify({
            "success": False,
            "message": "Daily.co API key not configured"
        }), 500

    data = request.json or {}
    room_name = data.get("room_name")
    user_name = data.get("user_name", "Guest")
    is_owner = data.get("is_owner", False)

    if not room_name:
        return jsonify({
            "success": False,
            "message": "room_name is required"
        }), 400

    try:
        response = requests.post(
            f"{DAILY_API_BASE}/meeting-tokens",
            headers=get_headers(),
            json={
                "properties": {
                    "room_name": room_name,
                    "user_name": user_name,
                    "is_owner": is_owner,
                    "exp": int((datetime.now() + timedelta(hours=2)).timestamp())
                }
            }
        )

        if response.status_code == 200:
            token_data = response.json()
            return jsonify({
                "success": True,
                "token": token_data.get("token")
            })
        else:
            return jsonify({
                "success": False,
                "message": "Failed to create meeting token"
            }), response.status_code

    except Exception as e:
        return jsonify({
            "success": False,
            "message": f"Error creating meeting token: {str(e)}"
        }), 500
