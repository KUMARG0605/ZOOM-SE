import cv2
import numpy as np
import os
from datetime import datetime
from deepface import DeepFace
import logging

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

class EmotionDetector:
    """
    Emotion detector using DeepFace library
    Detects emotions for multiple faces: happy, sad, angry, surprise, fear, disgust, neutral
    """

    def __init__(self, debug_dir='emotion_debug'):
        self.emotion_labels = ['angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral']
        self.debug_dir = debug_dir
        os.makedirs(debug_dir, exist_ok=True)
        logger.info(f"EmotionDetector initialized with debug directory: {os.path.abspath(debug_dir)}")

    def _save_debug_image(self, image, prefix='detected'):
        """Save image to debug directory with timestamp"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S_%f')[:-3]
        filename = f"{prefix}_{timestamp}.jpg"
        filepath = os.path.join(self.debug_dir, filename)
        cv2.imwrite(filepath, image)
        logger.debug(f"Saved debug image: {filepath}")
        return filepath

    def _draw_face_annotations(self, image, face_results):
        """Draw annotations on the image for each detected face"""
        annotated_image = image.copy()
        
        for i, face in enumerate(face_results):
            if 'region' not in face:
                continue
                
            x, y, w, h = face['region'].values()
            emotion = face['dominant_emotion']
            confidence = face['emotion'][emotion]
            
            # Draw rectangle around face
            cv2.rectangle(annotated_image, (x, y), (x+w, y+h), (0, 255, 0), 2)
            
            # Add emotion and confidence text
            text = f"{emotion}: {confidence:.1f}%"
            cv2.putText(annotated_image, text, (x, y-10), 
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 0), 2)
            
            # Add face number
            cv2.putText(annotated_image, f"Face {i+1}", (x, y+h+20),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.6, (255, 0, 0), 2)
        
        return annotated_image

    def detect_emotion(self, image, save_debug_images=True):
        """
        Detect emotions from all faces in an image

        Args:
            image: OpenCV image (numpy array)
            save_debug_images: Whether to save original and annotated images for debugging

        Returns:
            dict: {
                'success': bool,
                'faces': [{
                    'emotion': str,
                    'confidence': float,
                    'all_emotions': dict,
                    'face_location': {
                        'x': int, 'y': int, 'w': int, 'h': int
                    }
                }],
                'debug': {
                    'original_image_path': str,
                    'annotated_image_path': str
                },
                'message': str
            }
        """
        debug_info = {}
        try:
            # Save original image if debug mode is on
            if save_debug_images:
                original_path = self._save_debug_image(image, 'original')
                debug_info['original_image_path'] = original_path

            # Preprocess the image
            processed_image = self.preprocess_image(image)
            
            # Analyze the image using DeepFace - get all faces
            results = DeepFace.analyze(
                img_path=processed_image,
                actions=['emotion'],
                enforce_detection=False,
                detector_backend='opencv',
                silent=True
            )

            # Convert single result to list for uniform processing
            if not isinstance(results, list):
                results = [results]

            # Process each detected face
            face_results = []
            for result in results:
                if 'emotion' not in result:
                    continue
                    
                emotions = result['emotion']
                dominant_emotion = result['dominant_emotion']
                confidence = emotions[dominant_emotion]
                
                face_info = {
                    'emotion': dominant_emotion,
                    'confidence': round(confidence, 2),
                    'all_emotions': {k: round(v, 2) for k, v in emotions.items()},
                    'region': result.get('region', {})
                }
                face_results.append(face_info)

            # Create and save annotated image
            if save_debug_images:
                annotated_image = self._draw_face_annotations(processed_image, results)
                annotated_path = self._save_debug_image(annotated_image, 'annotated')
                debug_info['annotated_image_path'] = annotated_path

            return {
                'success': True,
                'faces': face_results,
                'debug': debug_info,
                'message': f'Detected {len(face_results)} face(s) successfully'
            }

        except Exception as e:
            logger.error(f"Error detecting emotion: {str(e)}", exc_info=True)
            return {
                'success': False,
                'faces': [],
                'debug': debug_info,
                'message': f'Error: {str(e)}'
            }

    def detect_emotions_batch(self, images, save_debug_images=True):
        """
        Detect emotions from multiple images

        Args:
            images: List of OpenCV images
            save_debug_images: Whether to save debug images for each input image

        Returns:
            list: List of detection results, each with the same structure as detect_emotion()
        """
        results = []
        for i, image in enumerate(images):
            logger.info(f"Processing image {i+1}/{len(images)}")
            result = self.detect_emotion(image, save_debug_images=save_debug_images)
            results.append(result)
        return results

    def preprocess_image(self, image):
        """
        Preprocess image for better emotion detection

        Args:
            image: OpenCV image

        Returns:
            Preprocessed image
        """
        # Resize if too large
        max_dimension = 1024
        height, width = image.shape[:2]

        if max(height, width) > max_dimension:
            scale = max_dimension / max(height, width)
            new_width = int(width * scale)
            new_height = int(height * scale)
            image = cv2.resize(image, (new_width, new_height))

        # Apply histogram equalization for better contrast
        if len(image.shape) == 3:
            # Convert to YUV color space
            yuv = cv2.cvtColor(image, cv2.COLOR_BGR2YUV)
            # Equalize the histogram of the Y channel
            yuv[:, :, 0] = cv2.equalizeHist(yuv[:, :, 0])
            # Convert back to BGR
            image = cv2.cvtColor(yuv, cv2.COLOR_YUV2BGR)

        return image
