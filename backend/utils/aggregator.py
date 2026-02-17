from collections import defaultdict
from datetime import datetime, timedelta
import numpy as np

class EmotionAggregator:
    """
    Aggregates emotion data for analysis and reporting
    """

    def __init__(self):
        self.emotion_categories = {
            'positive': ['happy', 'surprise'],
            'negative': ['sad', 'angry', 'fear', 'disgust'],
            'neutral': ['neutral']
        }

    def aggregate_emotions(self, emotion_logs):
        """
        Aggregate emotion logs into summary statistics

        Args:
            emotion_logs: List of emotion log dictionaries

        Returns:
            dict: Aggregated statistics
        """
        if not emotion_logs:
            return {
                'total_detections': 0,
                'emotion_distribution': {},
                'average_confidence': 0,
                'sentiment_distribution': {
                    'positive': 0,
                    'negative': 0,
                    'neutral': 0
                }
            }

        emotion_counts = defaultdict(int)
        total_confidence = 0

        for log in emotion_logs:
            emotion = log.get('emotion', 'neutral')
            confidence = log.get('confidence', 0)

            emotion_counts[emotion] += 1
            total_confidence += confidence

        total_detections = len(emotion_logs)
        average_confidence = total_confidence / total_detections if total_detections > 0 else 0

        # Calculate emotion distribution percentages
        emotion_distribution = {
            emotion: round((count / total_detections) * 100, 2)
            for emotion, count in emotion_counts.items()
        }

        # Calculate sentiment distribution
        sentiment_counts = {'positive': 0, 'negative': 0, 'neutral': 0}
        for emotion, count in emotion_counts.items():
            for sentiment, emotions in self.emotion_categories.items():
                if emotion in emotions:
                    sentiment_counts[sentiment] += count
                    break

        sentiment_distribution = {
            sentiment: round((count / total_detections) * 100, 2)
            for sentiment, count in sentiment_counts.items()
        }

        return {
            'total_detections': total_detections,
            'emotion_distribution': emotion_distribution,
            'emotion_counts': dict(emotion_counts),
            'average_confidence': round(average_confidence, 2),
            'sentiment_distribution': sentiment_distribution
        }

    def calculate_engagement_metrics(self, emotion_logs):
        """
        Calculate engagement metrics from emotion logs

        Args:
            emotion_logs: List of emotion log dictionaries

        Returns:
            dict: Engagement metrics
        """
        if not emotion_logs:
            return {
                'engagement_score': 0,
                'attention_level': 'low',
                'recommendation': 'Start the session to track engagement'
            }

        aggregated = self.aggregate_emotions(emotion_logs)

        # Calculate engagement score (0-100)
        positive_weight = aggregated['sentiment_distribution'].get('positive', 0) * 1.0
        neutral_weight = aggregated['sentiment_distribution'].get('neutral', 0) * 0.5
        negative_weight = aggregated['sentiment_distribution'].get('negative', 0) * -0.3

        engagement_score = max(0, min(100, 50 + positive_weight + neutral_weight + negative_weight))

        # Determine attention level
        if engagement_score >= 70:
            attention_level = 'high'
            recommendation = 'Students are highly engaged! Keep up the good work.'
        elif engagement_score >= 40:
            attention_level = 'medium'
            recommendation = 'Moderate engagement. Consider interactive activities.'
        else:
            attention_level = 'low'
            recommendation = 'Low engagement detected. Try to interact more with students.'

        return {
            'engagement_score': round(engagement_score, 2),
            'attention_level': attention_level,
            'recommendation': recommendation
        }

    def get_emotion_timeline(self, emotion_logs, interval_minutes=5):
        """
        Create a timeline of emotions over the session

        Args:
            emotion_logs: List of emotion log dictionaries
            interval_minutes: Time interval for grouping (default 5 minutes)

        Returns:
            list: Timeline data points
        """
        if not emotion_logs:
            return []

        # Sort logs by timestamp
        sorted_logs = sorted(emotion_logs, key=lambda x: x.get('timestamp', datetime.now()))

        # Group by time intervals
        timeline = []
        current_interval_logs = []
        interval_start = None

        for log in sorted_logs:
            timestamp = log.get('timestamp')
            if isinstance(timestamp, str):
                timestamp = datetime.fromisoformat(timestamp)

            if interval_start is None:
                interval_start = timestamp

            # Check if we need to start a new interval
            if timestamp - interval_start > timedelta(minutes=interval_minutes):
                # Process current interval
                if current_interval_logs:
                    aggregated = self.aggregate_emotions(current_interval_logs)
                    timeline.append({
                        'timestamp': interval_start.isoformat(),
                        'interval_end': timestamp.isoformat(),
                        'data': aggregated
                    })

                # Start new interval
                interval_start = timestamp
                current_interval_logs = [log]
            else:
                current_interval_logs.append(log)

        # Process remaining logs
        if current_interval_logs:
            aggregated = self.aggregate_emotions(current_interval_logs)
            timeline.append({
                'timestamp': interval_start.isoformat(),
                'data': aggregated
            })

        return timeline

    def detect_anomalies(self, emotion_logs, threshold=2.0):
        """
        Detect unusual patterns in emotion data

        Args:
            emotion_logs: List of emotion log dictionaries
            threshold: Standard deviation threshold for anomaly detection

        Returns:
            list: Detected anomalies
        """
        if len(emotion_logs) < 10:
            return []

        # Calculate average confidence
        confidences = [log.get('confidence', 0) for log in emotion_logs]
        mean_confidence = np.mean(confidences)
        std_confidence = np.std(confidences)

        anomalies = []
        for i, log in enumerate(emotion_logs):
            confidence = log.get('confidence', 0)
            z_score = abs((confidence - mean_confidence) / std_confidence) if std_confidence > 0 else 0

            if z_score > threshold:
                anomalies.append({
                    'index': i,
                    'timestamp': log.get('timestamp'),
                    'emotion': log.get('emotion'),
                    'confidence': confidence,
                    'z_score': round(z_score, 2),
                    'message': 'Unusual confidence level detected'
                })

        return anomalies
