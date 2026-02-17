"""
Zoom Desktop Client Bot API Routes
Endpoints for controlling Zoom Desktop client bots (pywinauto + mss version)
"""
from flask import Blueprint, request, jsonify
from services.zoom_desktop_client_bot import desktop_client_bot_manager
from functools import wraps

zoom_desktop_bot_bp = Blueprint('zoom_desktop_bot', __name__)


def get_socketio():
    """Get socketio instance from app context"""
    from flask import current_app
    return current_app.extensions.get('socketio')


@zoom_desktop_bot_bp.route('/join', methods=['POST'])
def join_meeting():
    """
    Start a desktop bot and join a Zoom meeting

    Request body:
    {
        "meeting_id": "1234567890" (required),
        "meeting_password": "password123" (required),
        "session_id": "session_uuid" (required),
        "session_name": "Team Meeting" (required),
        "bot_name": "Emotion Bot" (optional),
        "capture_interval": 240 (optional - seconds between captures, default 4 minutes)
    }

    Returns:
    {
        "bot_id": "uuid",
        "status": "starting",
        "message": "Bot is launching Zoom Desktop client..."
    }
    """
    try:
        data = request.get_json()

        # Validate required fields
        if not data.get('session_id'):
            return jsonify({"error": "session_id is required"}), 400

        if not data.get('meeting_id'):
            return jsonify({"error": "meeting_id is required"}), 400

        if not data.get('meeting_password'):
            return jsonify({"error": "meeting_password is required"}), 400

        session_id = data.get('session_id')
        session_name = data.get('session_name', 'Unnamed Session')
        bot_name = data.get('bot_name', 'Emotion Bot')
        meeting_id = data.get('meeting_id').replace(' ', '').replace('-', '')  # Clean meeting ID
        meeting_password = data.get('meeting_password')
        capture_interval = data.get('capture_interval', 240)  # Default 4 minutes

        # Get socketio instance
        socketio = get_socketio()

        # Create and start desktop bot
        result = desktop_client_bot_manager.create_bot(
            meeting_id=meeting_id,
            session_id=session_id,
            session_name=session_name,
            user_name=bot_name,
            meeting_password=meeting_password,
            socketio=socketio,
            capture_interval=capture_interval
        )

        if "error" in result:
            return jsonify(result), 400

        return jsonify(result), 200

    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500


@zoom_desktop_bot_bp.route('/leave/<bot_id>', methods=['POST'])
def leave_meeting(bot_id):
    """
    Stop a desktop bot and leave the meeting

    URL params:
        bot_id: Bot instance ID

    Returns:
    {
        "success": true,
        "message": "Bot stopped",
        "bot_id": "uuid"
    }
    """
    try:
        result = desktop_client_bot_manager.stop_bot(bot_id)

        if "error" in result:
            return jsonify(result), 404

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_desktop_bot_bp.route('/status/<bot_id>', methods=['GET'])
def get_bot_status(bot_id):
    """
    Get current status of a desktop bot

    URL params:
        bot_id: Bot instance ID

    Returns:
    {
        "bot_id": "uuid",
        "session_id": "session_uuid",
        "is_running": true,
        "is_in_meeting": true,
        "participant_count": 5,
        "frame_count": 150,
        "total_detections": 750,
        "participants": [...]
    }
    """
    try:
        status = desktop_client_bot_manager.get_bot_status(bot_id)

        if "error" in status:
            return jsonify(status), 404

        return jsonify(status), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_desktop_bot_bp.route('/participants/<bot_id>', methods=['GET'])
def get_participants(bot_id):
    """
    Get list of participants detected by the desktop bot

    URL params:
        bot_id: Bot instance ID

    Returns:
    {
        "participants": [...],
        "participant_count": 5,
        "total_detections": 750
    }
    """
    try:
        bot = desktop_client_bot_manager.get_bot(bot_id)

        if not bot:
            return jsonify({"error": "Bot not found"}), 404

        return jsonify({
            "participants": list(bot.participants.values()),
            "participant_count": len(bot.participants),
            "total_detections": bot.total_detections
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_desktop_bot_bp.route('/bots', methods=['GET'])
def list_bots():
    """
    Get list of all active desktop bots

    Returns:
    {
        "bots": [
            {
                "bot_id": "uuid",
                "session_id": "session_uuid",
                "session_name": "Meeting Name",
                "is_running": true,
                "is_in_meeting": true,
                "participant_count": 5
            },
            ...
        ],
        "total": 2
    }
    """
    try:
        bots_info = []

        for bot_id, bot in desktop_client_bot_manager.bots.items():
            bots_info.append({
                "bot_id": bot_id,
                "session_id": bot.session_id,
                "session_name": bot.session_name,
                "is_running": bot.is_running,
                "is_in_meeting": bot.is_in_meeting,
                "participant_count": len(bot.participants),
                "frame_count": bot.frame_count,
                "total_detections": bot.total_detections
            })

        return jsonify({"bots": bots_info, "total": len(bots_info)}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_desktop_bot_bp.route('/stop-all', methods=['POST'])
def stop_all_bots():
    """
    Stop all running desktop bots (emergency stop)

    Returns:
    {
        "success": true,
        "message": "All bots stopped"
    }
    """
    try:
        desktop_client_bot_manager.stop_all_bots()
        return jsonify({"success": True, "message": "All desktop bots stopped"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_desktop_bot_bp.route('/debug-images/<bot_id>', methods=['GET'])
def get_debug_images(bot_id):
    """
    Get list of debug images captured by the bot

    URL params:
        bot_id: Bot instance ID

    Returns:
    {
        "bot_id": "uuid",
        "debug_dir": "path/to/debug/dir",
        "images": [
            "frame_0000_original.png",
            "frame_0000_annotated.png",
            ...
        ]
    }
    """
    try:
        import os

        bot = desktop_client_bot_manager.get_bot(bot_id)

        if not bot:
            return jsonify({"error": "Bot not found"}), 404

        debug_dir = bot.debug_dir

        if not os.path.exists(debug_dir):
            return jsonify({
                "bot_id": bot_id,
                "debug_dir": debug_dir,
                "images": []
            }), 200

        # List all image files
        images = [f for f in os.listdir(debug_dir) if f.endswith('.png')]
        images.sort()

        return jsonify({
            "bot_id": bot_id,
            "debug_dir": debug_dir,
            "images": images
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_desktop_bot_bp.route('/health', methods=['GET'])
def health_check():
    """
    Health check for desktop bot service

    Returns:
    {
        "status": "healthy",
        "platform": "win32",
        "active_bots": 2,
        "dependencies": {
            "pywinauto": true,
            "mss": true,
            "deepface": true
        }
    }
    """
    try:
        import sys

        # Check dependencies
        dependencies = {}

        try:
            import pywinauto
            dependencies['pywinauto'] = True
        except:
            dependencies['pywinauto'] = False

        try:
            import mss
            dependencies['mss'] = True
        except:
            dependencies['mss'] = False

        try:
            import deepface
            dependencies['deepface'] = True
        except:
            dependencies['deepface'] = False

        return jsonify({
            "status": "healthy",
            "platform": sys.platform,
            "active_bots": len(desktop_client_bot_manager.bots),
            "dependencies": dependencies
        }), 200

    except Exception as e:
        return jsonify({"status": "unhealthy", "error": str(e)}), 500
