import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionAPI, emotionAPI } from '../services/api';
import socketService from '../services/socket';
import EmotionStats from '../components/EmotionStats';
import EmotionChart from '../components/EmotionChart';

const ZoomMeeting = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [sessionStats, setSessionStats] = useState(null);
  const [alert, setAlert] = useState(null);
  const [emotionHistory, setEmotionHistory] = useState([]);
  const trackingIntervalRef = useRef(null);

  useEffect(() => {
    // Connect to WebSocket
    socketService.connect();
    socketService.joinSession(sessionId);

    // Listen for emotion updates
    socketService.onEmotionUpdate((data) => {
      console.log('Emotion update:', data);
      setEmotionHistory(prev => [...prev, data]);
      fetchSessionStats();
    });

    // Start webcam
    startWebcam();

    return () => {
      stopTracking();
      if (stream) {
        stream.getTracks().forEach(track => track.stop());
      }
      socketService.disconnect();
    };
  }, [sessionId]);

  const startWebcam = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
    } catch (error) {
      console.error('Error accessing webcam:', error);
      alert('Failed to access webcam. Please check your permissions.');
    }
  };

  const captureFrame = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      return canvas.toDataURL('image/jpeg', 0.8);
    }
    return null;
  };

  const startTracking = () => {
    setIsTracking(true);

    // Capture and analyze frame every 3 seconds
    trackingIntervalRef.current = setInterval(async () => {
      const imageData = captureFrame();
      if (imageData) {
        try {
          const response = await emotionAPI.analyzeEmotion(
            sessionId,
            'participant_1', // In a real app, this would be the actual participant ID
            imageData
          );

          if (response.success) {
            console.log('Emotion detected:', response.emotion);
          }
        } catch (error) {
          console.error('Error analyzing emotion:', error);
        }
      }
    }, 3000); // Analyze every 3 seconds
  };

  const stopTracking = () => {
    setIsTracking(false);
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
  };

  const fetchSessionStats = async () => {
    try {
      const response = await sessionAPI.getSessionStats(sessionId);
      if (response.success) {
        setSessionStats(response);
        setAlert(response.alert);
      }
    } catch (error) {
      console.error('Error fetching session stats:', error);
    }
  };

  const handleEndSession = async () => {
    if (window.confirm('Are you sure you want to end this session?')) {
      stopTracking();
      try {
        const response = await sessionAPI.stopSession(sessionId);
        if (response.success) {
          navigate(`/report/${sessionId}`);
        }
      } catch (error) {
        console.error('Error stopping session:', error);
        navigate('/dashboard');
      }
    }
  };

  useEffect(() => {
    if (isTracking) {
      const interval = setInterval(fetchSessionStats, 5000);
      return () => clearInterval(interval);
    }
  }, [isTracking]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Live Session</h1>
              <p className="text-sm text-gray-600">Session ID: {sessionId}</p>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 text-gray-700 bg-gray-200 rounded-lg hover:bg-gray-300 transition-colors"
              >
                Dashboard
              </button>
              <button
                onClick={handleEndSession}
                className="px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
              >
                End Session
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Alert Banner */}
      {alert && (
        <div className={`${alert.level === 'high' ? 'bg-red-100 border-red-500 text-red-700' : 'bg-yellow-100 border-yellow-500 text-yellow-700'} border-l-4 p-4 fade-in`}>
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <p className="font-semibold">{alert.message}</p>
                <p className="text-sm">Disengagement: {alert.percentage.toFixed(1)}%</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Video Feed */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">Video Feed</h2>
                <div className="flex items-center space-x-2">
                  {isTracking ? (
                    <span className="flex items-center text-green-600">
                      <span className="w-3 h-3 bg-green-600 rounded-full mr-2 pulse-animation"></span>
                      Tracking Active
                    </span>
                  ) : (
                    <span className="text-gray-500">Tracking Paused</span>
                  )}
                </div>
              </div>

              <div className="relative bg-black rounded-lg overflow-hidden">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-auto"
                />
                <canvas ref={canvasRef} className="hidden" />
              </div>

              <div className="mt-4 flex justify-center space-x-4">
                {!isTracking ? (
                  <button
                    onClick={startTracking}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" />
                    </svg>
                    Start Tracking
                  </button>
                ) : (
                  <button
                    onClick={stopTracking}
                    className="px-6 py-3 bg-yellow-600 text-white rounded-lg hover:bg-yellow-700 transition-colors font-semibold flex items-center"
                  >
                    <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zM7 8a1 1 0 012 0v4a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v4a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                    Pause Tracking
                  </button>
                )}
              </div>

              <p className="mt-4 text-sm text-gray-600 text-center">
                The system will analyze facial expressions every 3 seconds to detect emotions
              </p>
            </div>
          </div>

          {/* Statistics Panel */}
          <div className="space-y-6">
            {sessionStats && (
              <>
                <EmotionStats stats={sessionStats} />
                <EmotionChart emotionData={sessionStats.emotion_counts} />
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

export default ZoomMeeting;
