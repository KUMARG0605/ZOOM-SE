# emotion_detector.py
"""
Emotion detector wrapper.
Primary: DeepFace (recommended) if installed.
Fallback: a safe stub returning neutral if DeepFace not available.
"""

import traceback
import numpy as np
import cv2

USE_DEEPFACE = False
try:
    from deepface import DeepFace
    USE_DEEPFACE = True
except Exception:
    # DeepFace not available; fall back to stub
    USE_DEEPFACE = False

class EmotionDetector:
    def __init__(self):
        # Load OpenCV face cascade for optional fallback face cropping
        self.face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    def detect_emotion(self, image_bgr):
        """
        Accepts a BGR numpy image (OpenCV). Returns:
        {
          "emotion": "happy",
          "confidence": 0.92,
          "all_emotions": {"happy": 0.92, "neutral": 0.05, ...}
        }
        """
        try:
            # If DeepFace is available, let it handle face detection and emotion analysis
            if USE_DEEPFACE:
                # DeepFace expects BGR or RGB? it accepts numpy image; to be safe convert to RGB
                img_rgb = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2RGB)
                # Use try/except in case DeepFace fails on some images
                analysis = DeepFace.analyze(img_rgb, actions=["emotion"], enforce_detection=False)
                # DeepFace.analyze may return dict or list if multiple faces; handle both
                if isinstance(analysis, list) and len(analysis) > 0:
                    analysis = analysis[0]
                dominant = analysis.get("dominant_emotion", "neutral")
                emotions = analysis.get("emotion", {})
                # Choose confidence as probability of dominant_emotion if available
                confidence = float(emotions.get(dominant, 0.0)) / 100.0 if emotions else 0.0
                # Convert keys to lower-case percentages
                all_emotions = {k.lower(): float(v)/100.0 for k,v in (emotions or {}).items()}
                return {"emotion": dominant.lower(), "confidence": confidence, "all_emotions": all_emotions}
            else:
                # Fallback approach:
                # - detect faces and return neutral for now (no heavy ML)
                gray = cv2.cvtColor(image_bgr, cv2.COLOR_BGR2GRAY)
                faces = self.face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5)
                if len(faces) == 0:
                    return {"emotion": "neutral", "confidence": 0.0, "all_emotions": {"neutral": 1.0}}
                # If face(s) exist, return neutral with medium confidence
                return {"emotion": "neutral", "confidence": 0.6, "all_emotions": {"neutral": 0.6}}
        except Exception as e:
            traceback.print_exc()
            return {"emotion": "neutral", "confidence": 0.0, "all_emotions": {"neutral": 1.0}}
