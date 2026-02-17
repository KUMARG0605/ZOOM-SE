# server.py
import os
import time
import hmac
import hashlib
import base64
import json
from datetime import datetime
from io import BytesIO

from flask import Flask, request, jsonify, send_from_directory
from flask_socketio import SocketIO, emit
import cv2
import numpy as np

from emotion_detector import EmotionDetector
from aggregator import EmotionAggregator

# -------- CONFIG ----------
SDK_KEY = os.getenv("ZOOM_SDK_KEY", "<YOUR_MEETING_SDK_KEY>")
SDK_SECRET = os.getenv("ZOOM_SDK_SECRET", "<YOUR_MEETING_SDK_SECRET>")
APP_HOST = "0.0.0.0"
APP_PORT = int(os.getenv("PORT", 5000))
STATIC_FOLDER = "static"

# Use threading to avoid eventlet/gevent ssl issues on some Windows installs
app = Flask(__name__, static_folder=STATIC_FOLDER, static_url_path="/static")
socketio = SocketIO(app, cors_allowed_origins="*", async_mode="threading")

detector = EmotionDetector()
aggregator = EmotionAggregator()

# In-memory state (for demo). Replace with DB for production.
meeting_info = {}
emotion_logs = []         # list of dicts: {participant_id, emotion, confidence, timestamp}
per_user_logs = {}        # participant_id -> list of logs

# ---------------------------
# Meeting SDK signature generation (Meeting SDK / Web)
# Note: Signature format may vary by SDK version. If you hit signature errors,
# consult Zoom's Meeting SDK docs and sample server code and adjust accordingly.
# ---------------------------
def generate_meeting_signature(sdk_key, sdk_secret, meeting_number, role):
    """
    Basic implementation used by many Zoom Meeting SDK samples.
    If signature invalid, check Zoom docs for your SDK version.
    """
    ts = int(round(time.time() * 1000)) - 30000
    msg = f"{sdk_key}{meeting_number}{ts}{role}"
    message = base64.b64encode(msg.encode("utf-8"))
    secret = sdk_secret.encode("utf-8")
    hash_ = hmac.new(secret, message, hashlib.sha256)
    hash_b64 = base64.b64encode(hash_.digest()).decode("utf-8")
    signature = f"{sdk_key}.{meeting_number}.{ts}.{role}.{hash_b64}"
    return base64.b64encode(signature.encode("utf-8")).decode("utf-8")

@app.route("/signature", methods=["POST"])
def signature():
    data = request.json or {}
    meeting_number = data.get("meetingNumber") or data.get("meeting_number")
    role = int(data.get("role", 0))
    if not meeting_number:
        return jsonify({"error": "meetingNumber required"}), 400
    sig = generate_meeting_signature(SDK_KEY, SDK_SECRET, meeting_number, role)
    return jsonify({"signature": sig, "sdkKey": SDK_KEY})

@app.route("/")
def index():
    # Optional: serve a static dashboard if you add one in static/index.html
    try:
        return send_from_directory(STATIC_FOLDER, "index.html")
    except Exception:
        return jsonify({"message": "Server running. No static index found."})

@app.route("/join_meeting", methods=["POST"])
def join_meeting():
    """
    Receive meeting details to track (for bookkeeping).
    Expects JSON like:
    {
      "meeting_id": "...",
      "passcode": "...",
      "sdk_key": "...",
      "sdk_secret": "..."
    }
    """
    global meeting_info
    data = request.json or {}
    meeting_info = data.copy()
    meeting_info.setdefault("joined_at", datetime.utcnow().isoformat())
    return jsonify({"message": "Meeting info saved", "meeting_info": meeting_info})

@app.route("/upload_frame", methods=["POST"])
def upload_frame():
    """
    Receive a frame or face crop and analyze it.
    Expects:
      {
        "participant_id": "user123",
        "image_b64": "data:image/jpeg;base64,..."
      }
    Returns detection result and updated aggregated stats.
    """
    try:
        data = request.json or {}
        if not data or "image_b64" not in data:
            return jsonify({"error": "image_b64 required"}), 400

        participant_id = data.get("participant_id", "unknown")
        b64 = data["image_b64"]
        if "," in b64:
            b64 = b64.split(",", 1)[1]
        img_bytes = base64.b64decode(b64)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            return jsonify({"error": "invalid image data"}), 400

        # Attempt emotion detection. detector.detect_emotion should accept an image (BGR numpy array)
        det_result = detector.detect_emotion(img)

        log_entry = {
            "participant_id": participant_id,
            "timestamp": datetime.utcnow().isoformat(),
            "emotion": det_result.get("emotion"),
            "confidence": det_result.get("confidence", 0.0),
            "all_emotions": det_result.get("all_emotions", {}),
        }
        emotion_logs.append(log_entry)
        per_user_logs.setdefault(participant_id, []).append(log_entry)

        global_stats = aggregator.aggregate_emotions(emotion_logs)
        engagement = aggregator.calculate_engagement_metrics(emotion_logs)
        timeline = aggregator.get_emotion_timeline(emotion_logs, interval_seconds=60)

        payload = {
            "new_detection": log_entry,
            "global_stats": global_stats,
            "engagement": engagement,
            "timeline": timeline[-20:],
        }

        # Broadcast real-time update to connected clients
        socketio.emit("emotion_update", payload, broadcast=True)

        return jsonify({
            "message": "Frame processed",
            "result": det_result,
            "global_stats": global_stats
        })

    except Exception as e:
        print("Error in /upload_frame:", e)
        return jsonify({"error": str(e)}), 500

@app.route("/get_statistics", methods=["GET"])
def get_statistics():
    global_stats = aggregator.aggregate_emotions(emotion_logs)
    engagement = aggregator.calculate_engagement_metrics(emotion_logs)
    return jsonify({
        "meeting_info": meeting_info,
        "global_stats": global_stats,
        "engagement": engagement,
        "total_detections": len(emotion_logs)
    })

# Socket handlers
@socketio.on("connect")
def on_connect():
    print("Socket client connected")
    emit("status", {"message": "connected", "time": datetime.utcnow().isoformat()})

@socketio.on("request_user_stats")
def on_request_user_stats(data):
    pid = data.get("participant_id")
    logs = per_user_logs.get(pid, [])
    stats = aggregator.aggregate_emotions(logs)
    emit("user_stats", {"participant_id": pid, "stats": stats})

if __name__ == "__main__":
    print("Starting server at http://%s:%s" % (APP_HOST, APP_PORT))
    socketio.run(app, host=APP_HOST, port=APP_PORT, debug=True)
