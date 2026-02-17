# aggregator.py
"""
Simple emotion aggregation utilities.
Works on lists of logs of the form:
{ "participant_id": "...", "timestamp": "ISO", "emotion": "happy", "confidence": 0.9 }
"""

from collections import Counter, defaultdict
from datetime import datetime, timedelta
import math

def parse_ts(ts):
    if isinstance(ts, str):
        try:
            return datetime.fromisoformat(ts)
        except Exception:
            return datetime.utcnow()
    elif isinstance(ts, datetime):
        return ts
    else:
        return datetime.utcnow()

class EmotionAggregator:
    def __init__(self):
        pass

    def aggregate_emotions(self, logs):
        """
        Return distribution percentages of emotions in logs.
        Example output:
          {"happy": 0.5, "neutral": 0.3, "sad": 0.2}
        """
        if not logs:
            return {}
        counts = Counter()
        for l in logs:
            e = (l.get("emotion") or "neutral").lower()
            counts[e] += 1
        total = sum(counts.values())
        return {k: round(v / total, 4) for k, v in counts.items()}

    def calculate_engagement_metrics(self, logs):
        """
        Simple engagement metrics:
         - avg_confidence
         - detections_per_minute (approx)
        """
        if not logs:
            return {"avg_confidence": 0.0, "detections_per_minute": 0.0}
        confidences = [l.get("confidence", 0.0) or 0.0 for l in logs]
        avg_conf = sum(confidences) / len(confidences) if confidences else 0.0

        # calculate duration covered by logs
        times = [parse_ts(l.get("timestamp")) for l in logs]
        span_seconds = (max(times) - min(times)).total_seconds() if len(times) > 1 else 0.0
        dpm = (len(logs) / (span_seconds / 60.0)) if span_seconds > 0 else len(logs)
        return {"avg_confidence": round(avg_conf, 4), "detections_per_minute": round(dpm, 2)}

    def detect_anomalies(self, logs, threshold=2.5):
        """
        Very simple anomaly detector:
        Check per-minute emotion distribution z-score for a given emotion spike.
        Returns list of detected anomalies like:
         [{"timestamp": "...", "emotion": "surprise", "zscore": 3.1}]
        """
        if not logs:
            return []
        # build minute buckets
        buckets = defaultdict(lambda: Counter())
        for l in logs:
            ts = parse_ts(l.get("timestamp"))
            key = ts.replace(second=0, microsecond=0)
            buckets[key][(l.get("emotion") or "neutral").lower()] += 1
        # compute means & stddev per emotion across buckets
        emot_counts_by_bucket = defaultdict(list)
        for key, c in buckets.items():
            for emot, cnt in c.items():
                emot_counts_by_bucket[emot].append(cnt)
        anomalies = []
        for emot, arr in emot_counts_by_bucket.items():
            if len(arr) < 2:
                continue
            mean = sum(arr) / len(arr)
            variance = sum((x - mean) ** 2 for x in arr) / (len(arr) - 1) if len(arr) > 1 else 0.0
            std = math.sqrt(variance)
            # check last bucket value zscore
            last_val = arr[-1]
            if std > 0:
                z = (last_val - mean) / std
                if abs(z) >= threshold:
                    anomalies.append({"emotion": emot, "zscore": round(z, 2), "last_value": last_val, "mean": round(mean,2)})
        return anomalies

    def get_emotion_timeline(self, logs, interval_seconds=60):
        """
        Returns a list of (timestamp_iso, distribution) buckets aggregated by interval_seconds.
        Example:
          [
            {"ts": "2025-10-26T12:34:00", "dist": {"happy":0.6,"neutral":0.4}},
            ...
          ]
        """
        if not logs:
            return []
        # bucket by interval_seconds since first log
        times = [parse_ts(l.get("timestamp")) for l in logs]
        start = min(times)
        buckets = defaultdict(list)
        for l in logs:
            ts = parse_ts(l.get("timestamp"))
            idx = int((ts - start).total_seconds() // interval_seconds)
            buckets[idx].append(l)
        timeline = []
        for idx in sorted(buckets.keys()):
            bucket_logs = buckets[idx]
            dist = self.aggregate_emotions(bucket_logs)
            bucket_ts = (start + timedelta(seconds=idx * interval_seconds)).replace(microsecond=0).isoformat()
            timeline.append({"ts": bucket_ts, "dist": dist, "count": len(bucket_logs)})
        return timeline
