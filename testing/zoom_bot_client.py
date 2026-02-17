# zoom_bot_client.py
"""
Local Zoom bot that captures a screen region (where Zoom gallery is shown),
detects faces and sends each face crop to the backend /upload_frame endpoint every N seconds.

Adjust CAPTURE_REGION to the coordinates where your Zoom meeting grid is visible.
"""

import time
import base64
import argparse
from datetime import datetime
import cv2
import numpy as np
import requests
from mss import mss

# CONFIG
BACKEND_UPLOAD_URL = "http://localhost:5000/upload_frame"
CAPTURE_INTERVAL = 3  # seconds between captures
CAPTURE_REGION = {"top": 120, "left": 80, "width": 1024, "height": 576}
PARTICIPANT_PREFIX = "participant"  # we will name faces participant_1, participant_2, ...

# face detector (OpenCV Haar)
face_cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

def capture_region(region):
    with mss() as sct:
        s = sct.grab(region)
        img = np.array(s)
        # mss returns BGRA
        img = cv2.cvtColor(img, cv2.COLOR_BGRA2BGR)
        return img

def detect_faces(img_bgr):
    gray = cv2.cvtColor(img_bgr, cv2.COLOR_BGR2GRAY)
    faces = face_cascade.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=4, minSize=(30,30))
    return faces  # list of (x,y,w,h)

def crop_and_send(img, box, idx):
    x,y,w,h = box
    # pad slightly
    pad = int(0.1 * min(w,h))
    x0 = max(0, x - pad)
    y0 = max(0, y - pad)
    x1 = min(img.shape[1], x + w + pad)
    y1 = min(img.shape[0], y + h + pad)
    crop = img[y0:y1, x0:x1]
    # encode to JPEG
    success, buf = cv2.imencode(".jpg", crop, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
    if not success:
        return None
    b64 = base64.b64encode(buf).decode("utf-8")
    participant_id = f"{PARTICIPANT_PREFIX}_{idx}"
    payload = {
        "participant_id": participant_id,
        "image_b64": f"data:image/jpeg;base64,{b64}"
    }
    try:
        resp = requests.post(BACKEND_UPLOAD_URL, json=payload, timeout=10)
        if resp.status_code == 200:
            data = resp.json()
            res = data.get("result", {})
            print(f"[{datetime.now().strftime('%H:%M:%S')}] Sent {participant_id} -> emotion={res.get('emotion')} conf={res.get('confidence')}")
        else:
            print("Backend error:", resp.status_code, resp.text)
    except Exception as e:
        print("Error posting to backend:", e)

def main_loop(region, interval):
    print("Starting capture loop. Region:", region, "Interval:", interval)
    time.sleep(2)
    while True:
        img = capture_region(region)
        faces = detect_faces(img)
        if len(faces) == 0:
            # fallback: send the entire region as participant_unknown
            print(f"[{datetime.now().strftime('%H:%M:%S')}] No faces found, sending full region as unknown")
            success, buf = cv2.imencode(".jpg", img, [int(cv2.IMWRITE_JPEG_QUALITY), 70])
            if success:
                b64 = base64.b64encode(buf).decode("utf-8")
                payload = {"participant_id": "unknown", "image_b64": f"data:image/jpeg;base64,{b64}"}
                try:
                    requests.post(BACKEND_UPLOAD_URL, json=payload, timeout=10)
                except Exception as e:
                    print("Error:", e)
        else:
            # crop & send each face
            for i, box in enumerate(faces, start=1):
                crop_and_send(img, box, i)
        time.sleep(interval)

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--interval", type=float, default=CAPTURE_INTERVAL, help="capture interval seconds")
    parser.add_argument("--top", type=int, default=CAPTURE_REGION["top"])
    parser.add_argument("--left", type=int, default=CAPTURE_REGION["left"])
    parser.add_argument("--width", type=int, default=CAPTURE_REGION["width"])
    parser.add_argument("--height", type=int, default=CAPTURE_REGION["height"])
    args = parser.parse_args()

    region = {"top": args.top, "left": args.left, "width": args.width, "height": args.height}
    main_loop(region, args.interval)
