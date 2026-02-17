from flask import Flask, request, jsonify
from flask_cors import CORS
from flask_socketio import SocketIO, emit
from dotenv import load_dotenv
import os
import base64
import cv2
import numpy as np
from datetime import datetime
import json

from utils.emotion_detector import EmotionDetector
from models.database import db, Session, EmotionLog, User
from utils.aggregator import EmotionAggregator
# from routes import zoom_bp
from routes.google_meet import google_meet_bp
from routes.auth import auth_bp
from routes.admin import admin_bp
from routes.daily import daily_bp
from routes.zoom_bot import zoom_bot_bp
from routes.zoom_desktop_bot import zoom_desktop_bot_bp
from utils.auth import get_current_user_from_token

# Load environment variables
load_dotenv()

# IMPORTANT: Allow OAuth over HTTP for development (localhost)
# Remove this in production and use HTTPS
os.environ['OAUTHLIB_INSECURE_TRANSPORT'] = '1'

app = Flask(__name__)
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'your-secret-key-change-in-production-2024')
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'your-jwt-secret-key-change-in-production-2024')
app.config['SQLALCHEMY_DATABASE_URI'] = 'sqlite:///emotion_tracker.db'
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False

CORS(app, resources={r"/*": {"origins": "*"}})
socketio = SocketIO(app, cors_allowed_origins="*", async_mode='threading')

# Make socketio accessible to blueprints
app.extensions['socketio'] = socketio

# Initialize database
db.init_app(app)

# Initialize emotion detector and aggregator
emotion_detector = EmotionDetector()
emotion_aggregator = EmotionAggregator()

# Register blueprints
#app.register_blueprint(zoom_bp, url_prefix='/api/zoom')
app.register_blueprint(google_meet_bp, url_prefix='/api/google-meet')
app.register_blueprint(auth_bp, url_prefix='/api/auth')
app.register_blueprint(admin_bp, url_prefix='/api/admin')
app.register_blueprint(daily_bp, url_prefix='/api/daily')
app.register_blueprint(zoom_bot_bp, url_prefix='/api/zoom-bot')  # Selenium web version
app.register_blueprint(zoom_desktop_bot_bp, url_prefix='/api/zoom-desktop-bot')  # Desktop client version
# Store active sessions
active_sessions = {}

@app.route('/api/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({"status": "healthy", "message": "Emotion Tracker API is running"})

@app.route('/api/session/start', methods=['POST'])
def start_session():
    """Start a new tracking session"""
    data = request.json
    session_id = data.get('session_id', f"session_{datetime.now().timestamp()}")
    session_name = data.get('session_name', 'Untitled Session')

    # Get user ID from token if authenticated
    user_id = None
    current_user = get_current_user_from_token()
    if current_user:
        user_id = current_user.get('user_id')

    # Store in memory for quick access
    active_sessions[session_id] = {
        'session_name': session_name,
        'start_time': datetime.now().isoformat(),
        'participants': {},
        'emotion_counts': {
            'happy': 0,
            'sad': 0,
            'angry': 0,
            'surprise': 0,
            'fear': 0,
            'disgust': 0,
            'neutral': 0
        }
    }

    # Also save to database immediately
    with app.app_context():
        # Check if session already exists (in case of reload)
        existing_session = Session.query.filter_by(session_id=session_id).first()
        if not existing_session:
            session_obj = Session(
                session_id=session_id,
                session_name=session_name,
                user_id=user_id,  # Link to user if authenticated
                start_time=datetime.now(),
                end_time=None,
                summary=json.dumps(active_sessions[session_id]['emotion_counts'])
            )
            db.session.add(session_obj)
            db.session.commit()

    return jsonify({
        "success": True,
        "session_id": session_id,
        "message": "Session started successfully"
    })

@app.route('/api/session/<session_id>/stop', methods=['POST'])
def stop_session(session_id):
    """Stop a tracking session and generate report"""
    # Check both in-memory and database
    session_data = active_sessions.get(session_id)

    with app.app_context():
        session_obj = Session.query.filter_by(session_id=session_id).first()

        if not session_obj and not session_data:
            return jsonify({"success": False, "message": "Session not found"}), 404

        if session_obj:
            # Update existing session in database
            session_obj.end_time = datetime.now()
            if session_data:
                session_obj.summary = json.dumps(session_data['emotion_counts'])
            db.session.commit()
        elif session_data:
            # Create new database entry if it doesn't exist
            session_obj = Session(
                session_id=session_id,
                session_name=session_data['session_name'],
                start_time=datetime.fromisoformat(session_data['start_time']),
                end_time=datetime.now(),
                summary=json.dumps(session_data['emotion_counts'])
            )
            db.session.add(session_obj)
            db.session.commit()

    report = generate_session_report(session_id)

    # Remove from active sessions if present
    if session_id in active_sessions:
        del active_sessions[session_id]

    return jsonify({
        "success": True,
        "message": "Session stopped successfully",
        "report": report
    })

@app.route('/api/emotions/analyze', methods=['POST'])
def analyze_emotion():
    """Analyze emotion from uploaded image"""
    try:
        data = request.json
        session_id = data.get('session_id')
        participant_id = data.get('participant_id', 'unknown')
        image_data = data.get('image')

        if not image_data:
            return jsonify({"success": False, "message": "No image data provided"}), 400

        # Decode base64 image
        print(f"[DEBUG] Decoding image for session {session_id}")
        image_bytes = base64.b64decode(image_data.split(',')[1] if ',' in image_data else image_data)
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)

        if img is None:
            print("[ERROR] Failed to decode image")
            return jsonify({"success": False, "message": "Failed to decode image"}), 400

        print(f"[DEBUG] Image decoded successfully. Shape: {img.shape}")

        # Detect emotion
        print("[DEBUG] Detecting emotion...")
        result = emotion_detector.detect_emotion(img)
        print(f"[DEBUG] Emotion detection result: {result}")

        if result['success']:
            emotion = result['emotion']
            confidence = result['confidence']

            # Update session data
            if session_id:
                # Update active sessions if present
                if session_id in active_sessions:
                    active_sessions[session_id]['emotion_counts'][emotion] = \
                        active_sessions[session_id]['emotion_counts'].get(emotion, 0) + 1

                # Store in database
                with app.app_context():
                    # Store emotion log
                    log = EmotionLog(
                        session_id=session_id,
                        participant_id=participant_id,
                        emotion=emotion,
                        confidence=confidence,
                        timestamp=datetime.now()
                    )
                    db.session.add(log)

                    # Update session summary in database
                    session_obj = Session.query.filter_by(session_id=session_id).first()
                    if session_obj and session_id in active_sessions:
                        session_obj.summary = json.dumps(active_sessions[session_id]['emotion_counts'])

                    db.session.commit()

                # Emit real-time update via WebSocket
                socketio.emit('emotion_update', {
                    'session_id': session_id,
                    'participant_id': participant_id,
                    'emotion': emotion,
                    'confidence': confidence,
                    'timestamp': datetime.now().isoformat()
                }, namespace='/')

            return jsonify({
                "success": True,
                "emotion": emotion,
                "confidence": confidence,
                "all_emotions": result.get('all_emotions', {})
            })
        else:
            return jsonify({"success": False, "message": result.get('message', 'No face detected')}), 400

    except Exception as e:
        print(f"[ERROR] Exception in analyze_emotion: {str(e)}")
        import traceback
        traceback.print_exc()
        return jsonify({"success": False, "message": f"Error processing image: {str(e)}"}), 500

@app.route('/api/session/<session_id>/stats', methods=['GET'])
def get_session_stats(session_id):
    """Get real-time statistics for a session"""
    session_data = None

    # Try to get from active sessions first
    if session_id in active_sessions:
        session_data = active_sessions[session_id]
    else:
        # If not in active_sessions, try to restore from database
        with app.app_context():
            session_obj = Session.query.filter_by(session_id=session_id).first()
            if session_obj:
                # Get emotion counts from emotion logs
                emotion_logs = EmotionLog.query.filter_by(session_id=session_id).all()

                emotion_counts = {
                    'happy': 0,
                    'sad': 0,
                    'angry': 0,
                    'surprise': 0,
                    'fear': 0,
                    'disgust': 0,
                    'neutral': 0
                }

                for log in emotion_logs:
                    if log.emotion in emotion_counts:
                        emotion_counts[log.emotion] += 1

                # Restore to active_sessions
                session_data = {
                    'session_name': session_obj.session_name,
                    'start_time': session_obj.start_time.isoformat(),
                    'participants': {},
                    'emotion_counts': emotion_counts
                }
                active_sessions[session_id] = session_data

    if not session_data:
        return jsonify({"success": False, "message": "Session not found"}), 404

    total_detections = sum(session_data['emotion_counts'].values())

    # Calculate percentages
    emotion_percentages = {}
    if total_detections > 0:
        for emotion, count in session_data['emotion_counts'].items():
            emotion_percentages[emotion] = round((count / total_detections) * 100, 2)

    # Calculate engagement metrics
    engagement_score = calculate_engagement_score(session_data['emotion_counts'])

    return jsonify({
        "success": True,
        "session_id": session_id,
        "session_name": session_data['session_name'],
        "total_detections": total_detections,
        "emotion_counts": session_data['emotion_counts'],
        "emotion_percentages": emotion_percentages,
        "engagement_score": engagement_score,
        "alert": check_disengagement(emotion_percentages)
    })

@app.route('/api/reports', methods=['GET'])
def get_all_reports():
    """Get all session reports"""
    with app.app_context():
        sessions = Session.query.order_by(Session.start_time.desc()).all()
        reports = []
        for session in sessions:
            reports.append({
                'session_id': session.session_id,
                'session_name': session.session_name,
                'start_time': session.start_time.isoformat(),
                'end_time': session.end_time.isoformat() if session.end_time else None,
                'summary': json.loads(session.summary) if session.summary else {}
            })
        return jsonify({"success": True, "reports": reports})

@app.route('/api/reports/<session_id>', methods=['GET'])
def get_session_report(session_id):
    """Get detailed report for a specific session"""
    report = generate_session_report(session_id)
    if report:
        return jsonify({"success": True, "report": report})
    return jsonify({"success": False, "message": "Session not found"}), 404

def generate_session_report(session_id):
    """Generate a detailed session report"""
    with app.app_context():
        session = Session.query.filter_by(session_id=session_id).first()
        if not session:
            return None

        logs = EmotionLog.query.filter_by(session_id=session_id).all()

        # Aggregate emotions over time
        emotion_timeline = []
        for log in logs:
            emotion_timeline.append({
                'timestamp': log.timestamp.isoformat(),
                'participant_id': log.participant_id,
                'emotion': log.emotion,
                'confidence': log.confidence
            })

        summary = json.loads(session.summary) if session.summary else {}

        return {
            'session_id': session.session_id,
            'session_name': session.session_name,
            'start_time': session.start_time.isoformat(),
            'end_time': session.end_time.isoformat() if session.end_time else None,
            'summary': summary,
            'timeline': emotion_timeline,
            'total_detections': len(logs)
        }

def calculate_engagement_score(emotion_counts):
    """Calculate engagement score based on emotions"""
    total = sum(emotion_counts.values())
    if total == 0:
        return 0

    # Positive emotions increase score
    positive_weight = (emotion_counts.get('happy', 0) + emotion_counts.get('surprise', 0)) * 1.0
    # Neutral is moderate
    neutral_weight = emotion_counts.get('neutral', 0) * 0.5
    # Negative emotions decrease score
    negative_weight = (emotion_counts.get('sad', 0) + emotion_counts.get('angry', 0) +
                      emotion_counts.get('fear', 0) + emotion_counts.get('disgust', 0)) * -0.5

    score = ((positive_weight + neutral_weight + negative_weight) / total) * 100
    return max(0, min(100, score))  # Clamp between 0-100

def check_disengagement(emotion_percentages):
    """Check if disengagement is high and return alert"""
    disengagement_emotions = ['sad', 'angry', 'neutral']
    disengagement_total = sum([emotion_percentages.get(e, 0) for e in disengagement_emotions])

    if disengagement_total > 60:
        return {
            'level': 'high',
            'message': 'High disengagement detected! Consider engaging students.',
            'percentage': disengagement_total
        }
    elif disengagement_total > 40:
        return {
            'level': 'medium',
            'message': 'Moderate disengagement detected.',
            'percentage': disengagement_total
        }
    return None

# WebSocket events
@socketio.on('connect')
def handle_connect():
    print('Client connected')
    emit('connection_response', {'status': 'connected'})

@socketio.on('disconnect')
def handle_disconnect():
    print('Client disconnected')

@socketio.on('join_session')
def handle_join_session(data):
    from flask_socketio import join_room
    session_id = data.get('session_id')
    print(f'Client joined session: {session_id}')
    join_room(session_id)  # Join the session room for bot updates
    emit('session_joined', {'session_id': session_id})

if __name__ == '__main__':
    with app.app_context():
        db.create_all()
    socketio.run(app, host='0.0.0.0', port=5000, allow_unsafe_werkzeug=True, debug=True)
