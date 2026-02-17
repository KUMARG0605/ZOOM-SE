"""
Zoom Bot API Routes
Endpoints for controlling headless Zoom bots
"""
from flask import Blueprint, request, jsonify
from services.zoom_bot_service import bot_manager
from functools import wraps

zoom_bot_bp = Blueprint('zoom_bot', __name__)


def get_socketio():
    """Get socketio instance from app context"""
    from flask import current_app
    return current_app.extensions.get('socketio')


@zoom_bot_bp.route('/join', methods=['POST'])
def join_meeting():
    """
    Start a bot and join a Zoom meeting

    Request body (Option 1 - Invitation Link):
    {
        "invitation_link": "https://zoom.us/j/1234567890?pwd=abcdef",
        "session_id": "session_uuid",
        "session_name": "Team Meeting",
        "bot_name": "Emotion Bot" (optional)
    }

    Request body (Option 2 - Meeting ID + Passcode):
    {
        "meeting_id": "1234567890",
        "passcode": "password123",
        "session_id": "session_uuid",
        "session_name": "Team Meeting",
        "bot_name": "Emotion Bot" (optional)
    }

    Legacy format (still supported):
    {
        "meeting_url": "https://zoom.us/j/1234567890 or just meeting ID",
        "meeting_password": "password123" (optional),
        ...
    }
    """
    try:
        data = request.get_json()

        # Validate required session fields
        if not data.get('session_id'):
            return jsonify({"error": "session_id is required"}), 400

        session_id = data.get('session_id')
        session_name = data.get('session_name', 'Unnamed Session')
        bot_name = data.get('bot_name', 'Emotion Bot')

        # Determine which format is being used
        invitation_link = data.get('invitation_link')
        meeting_id = data.get('meeting_id')
        passcode = data.get('passcode')
        meeting_url = data.get('meeting_url')  # Legacy
        meeting_password = data.get('meeting_password')  # Legacy

        # Priority 1: Invitation link (full URL with password)
        if invitation_link:
            final_meeting_url = invitation_link
            final_password = None  # Password is in URL
        # Priority 2: Meeting ID + Passcode (separate fields)
        elif meeting_id:
            final_meeting_url = meeting_id
            final_password = passcode  # Can be None
        # Priority 3: Legacy format (meeting_url + meeting_password)
        elif meeting_url:
            final_meeting_url = meeting_url
            final_password = meeting_password
        else:
            return jsonify({
                "error": "Either 'invitation_link' OR 'meeting_id' OR 'meeting_url' is required"
            }), 400

        # Get socketio instance
        socketio = get_socketio()

        # Create and start bot
        result = bot_manager.create_bot(
            meeting_url=final_meeting_url,
            session_id=session_id,
            session_name=session_name,
            user_name=bot_name,
            meeting_password=final_password,
            socketio=socketio
        )

        if "error" in result:
            return jsonify(result), 400

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_bot_bp.route('/leave/<bot_id>', methods=['POST'])
def leave_meeting(bot_id):
    """
    Stop a bot and leave the meeting

    URL params:
        bot_id: Bot instance ID
    """
    try:
        result = bot_manager.stop_bot(bot_id)

        if "error" in result:
            return jsonify(result), 404

        return jsonify(result), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_bot_bp.route('/status/<bot_id>', methods=['GET'])
def get_bot_status(bot_id):
    """
    Get current status of a bot

    URL params:
        bot_id: Bot instance ID
    """
    try:
        status = bot_manager.get_bot_status(bot_id)

        if "error" in status:
            return jsonify(status), 404

        return jsonify(status), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_bot_bp.route('/participants/<bot_id>', methods=['GET'])
def get_participants(bot_id):
    """
    Get list of participants detected by the bot

    URL params:
        bot_id: Bot instance ID
    """
    try:
        bot = bot_manager.get_bot(bot_id)

        if not bot:
            return jsonify({"error": "Bot not found"}), 404

        return jsonify({
            "participants": list(bot.participants.values()),
            "participant_count": len(bot.participants),
            "total_detections": bot.total_detections
        }), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_bot_bp.route('/bots', methods=['GET'])
def list_bots():
    """Get list of all active bots"""
    try:
        bots_info = []

        for bot_id, bot in bot_manager.bots.items():
            bots_info.append({
                "bot_id": bot_id,
                "session_id": bot.session_id,
                "session_name": bot.session_name,
                "is_running": bot.is_running,
                "is_in_meeting": bot.is_in_meeting,
                "participant_count": len(bot.participants)
            })

        return jsonify({"bots": bots_info, "total": len(bots_info)}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500


@zoom_bot_bp.route('/stop-all', methods=['POST'])
def stop_all_bots():
    """Stop all running bots (emergency stop)"""
    try:
        bot_manager.stop_all_bots()
        return jsonify({"success": True, "message": "All bots stopped"}), 200

    except Exception as e:
        return jsonify({"error": str(e)}), 500
