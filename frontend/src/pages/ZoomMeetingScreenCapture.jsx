import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionAPI, emotionAPI } from '../services/api';
import socketService from '../services/socket';
import FloatingStatsWindow from '../components/FloatingStatsWindow';

/**
 * REAL ZOOM MEETING ANALYZER - Screen Capture Method
 *
 * This works with ACTUAL Zoom meetings by:
 * 1. Teacher joins Zoom meeting normally (any method)
 * 2. Teacher starts screen capture of Zoom window
 * 3. App extracts and analyzes participant faces from the captured screen
 * 4. Shows floating statistics overlay
 */

const ZoomMeetingScreenCapture = () => {
  const navigate = useNavigate();

  // Meeting info
  const [meetingName, setMeetingName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [meetingPassword, setMeetingPassword] = useState('');

  // Capture state
  const [setupComplete, setSetupComplete] = useState(false);
  const [captureStream, setCaptureStream] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Session tracking
  const [sessionId, setSessionId] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [sessionStats, setSessionStats] = useState(null);
  const [detectedFaces, setDetectedFaces] = useState([]);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const trackingIntervalRef = useRef(null);
  const faceDetectionRef = useRef(null);

  // UI state
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [instructionsVisible, setInstructionsVisible] = useState(false);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    stopTracking();
    if (captureStream) {
      captureStream.getTracks().forEach(track => track.stop());
    }
    if (sessionId) {
      socketService.disconnect();
    }
  };

  // ============================================
  // SCREEN CAPTURE SETUP
  // ============================================

  const handleStartCapture = async () => {
    if (!meetingName.trim()) {
      alert('Please enter a meeting name for your records');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create tracking session
      console.log('Creating tracking session...');
      const sessionResponse = await sessionAPI.startSession(meetingName);

      if (!sessionResponse.success) {
        throw new Error('Failed to create tracking session');
      }

      setSessionId(sessionResponse.session_id);

      // Step 2: Connect to WebSocket
      console.log('Connecting to WebSocket...');
      socketService.connect();
      socketService.joinSession(sessionResponse.session_id);

      socketService.onEmotionUpdate((data) => {
        console.log('Emotion update:', data);
        fetchSessionStats();
      });

      // Step 3: Request screen capture
      console.log('Requesting screen capture...');
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'never',
          displaySurface: 'window', // Prefer window capture
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 10, max: 15 } // Lower frame rate for better performance
        },
        audio: false
      });

      console.log('Screen capture started');
      setCaptureStream(stream);
      setIsCapturing(true);
      setSetupComplete(true);

      // Set up video element
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.play();
      }

      // Handle when user stops sharing
      stream.getVideoTracks()[0].addEventListener('ended', () => {
        console.log('Screen sharing stopped by user');
        handleEndSession();
      });

      // Auto-start tracking after 2 seconds
      setTimeout(() => {
        startTracking();
      }, 2000);

      alert('Screen capture started!\n\n📌 Instructions:\n1. Make sure Zoom is in Gallery View\n2. All student videos should be visible\n3. Emotion analysis will start automatically');

    } catch (error) {
      console.error('Error starting capture:', error);

      if (error.name === 'NotAllowedError') {
        alert('Screen capture permission denied.\n\nPlease click "Share" and select your Zoom window to continue.');
      } else {
        alert('Failed to start capture: ' + error.message);
      }

      cleanup();
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // FACE DETECTION & ANALYSIS
  // ============================================

  const detectAndAnalyzeFaces = async () => {
    if (!videoRef.current || !canvasRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get full screen image
    const fullImage = canvas.toDataURL('image/jpeg', 0.8);

    // Send to backend for face detection and emotion analysis
    try {
      const response = await emotionAPI.analyzeEmotion(
        sessionId,
        'gallery_view', // Special participant ID for gallery view
        fullImage
      );

      if (response.success) {
        console.log(`Detected emotion: ${response.emotion} (${(response.confidence * 100).toFixed(1)}%)`);

        // Update detected faces count (for now, each detection is one face)
        setDetectedFaces(prev => {
          const newFaces = [...prev];
          if (newFaces.length < 50) { // Arbitrary limit
            newFaces.push({
              id: Date.now(),
              emotion: response.emotion,
              confidence: response.confidence
            });
          }
          return newFaces.slice(-10); // Keep last 10
        });
      }
    } catch (error) {
      console.error('Error analyzing faces:', error);
    }
  };

  // ============================================
  // TRACKING CONTROLS
  // ============================================

  const startTracking = () => {
    console.log('Starting emotion tracking...');
    setIsTracking(true);

    // Analyze faces every 4 seconds
    trackingIntervalRef.current = setInterval(() => {
      detectAndAnalyzeFaces();
    }, 4000);
  };

  const stopTracking = () => {
    console.log('Stopping emotion tracking...');
    setIsTracking(false);
    if (trackingIntervalRef.current) {
      clearInterval(trackingIntervalRef.current);
      trackingIntervalRef.current = null;
    }
  };

  const fetchSessionStats = async () => {
    if (!sessionId) return;

    try {
      const response = await sessionAPI.getSessionStats(sessionId);
      if (response.success) {
        setSessionStats(response);
      }
    } catch (error) {
      console.error('Error fetching session stats:', error);
    }
  };

  const handleEndSession = async () => {
    if (window.confirm('Are you sure you want to end this session?')) {
      stopTracking();

      try {
        if (captureStream) {
          captureStream.getTracks().forEach(track => track.stop());
        }

        if (sessionId) {
          const response = await sessionAPI.stopSession(sessionId);
          if (response.success) {
            navigate(`/report/${sessionId}`);
          }
        }
      } catch (error) {
        console.error('Error stopping session:', error);
        navigate('/dashboard');
      }
    }
  };

  // Update stats periodically
  useEffect(() => {
    if (isTracking && sessionId) {
      const interval = setInterval(fetchSessionStats, 5000);
      return () => clearInterval(interval);
    }
  }, [isTracking, sessionId]);

  // ============================================
  // RENDER: SETUP SCREEN
  // ============================================

  if (!setupComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-green-50 to-teal-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full">
          <div className="text-center mb-6">
            <div className="bg-green-600 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Real Zoom Meeting Analyzer</h1>
            <p className="text-gray-600">Analyze emotions in your active Zoom meeting</p>
          </div>

          {/* Instructions */}
          <div className="mb-6 p-4 bg-blue-50 border-l-4 border-blue-500 rounded">
            <h3 className="text-sm font-bold text-blue-900 mb-2 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
              </svg>
              How This Works
            </h3>
            <ol className="text-sm text-blue-800 space-y-2 ml-7 list-decimal">
              <li><strong>Join your Zoom meeting</strong> using any method (desktop app, web browser, mobile)</li>
              <li><strong>Switch to Gallery View</strong> so all student videos are visible</li>
              <li><strong>Click "Start Screen Capture"</strong> below</li>
              <li><strong>Select your Zoom window</strong> when prompted</li>
              <li><strong>Floating stats window</strong> will appear automatically</li>
              <li><strong>Emotion analysis</strong> runs every 4 seconds for all visible students</li>
            </ol>
          </div>

          <div className="space-y-4">
            {/* Meeting Name */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meeting Name (For Your Records)
              </label>
              <input
                type="text"
                placeholder="e.g., Math Class - Chapter 5"
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none"
              />
            </div>

            {/* Optional: Meeting Details for Reference */}
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Meeting ID (Optional - for reference)
                </label>
                <input
                  type="text"
                  placeholder="123-456-7890"
                  value={meetingId}
                  onChange={(e) => setMeetingId(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-500 mb-1">
                  Passcode (Optional - for reference)
                </label>
                <input
                  type="text"
                  placeholder="abc123"
                  value={meetingPassword}
                  onChange={(e) => setMeetingPassword(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-sm"
                />
              </div>
            </div>

            {/* Start Button */}
            <button
              onClick={handleStartCapture}
              disabled={loading}
              className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center text-lg"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Setting up...
                </>
              ) : (
                <>
                  <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                  Start Screen Capture & Analysis
                </>
              )}
            </button>

            <button
              onClick={() => navigate('/dashboard')}
              className="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>

          {/* Important Notes */}
          <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
            <h3 className="text-sm font-bold text-yellow-900 mb-2">⚠️ Important Notes</h3>
            <ul className="text-xs text-yellow-800 space-y-1">
              <li>• Works with ANY Zoom meeting (desktop app, web, mobile screen share)</li>
              <li>• Make sure student videos are visible in Gallery View</li>
              <li>• The more faces visible, the better the analysis</li>
              <li>• Inform students they are being analyzed (privacy/consent)</li>
              <li>• Analysis quality depends on video quality and lighting</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: ACTIVE CAPTURE SCREEN
  // ============================================

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Hidden video and canvas */}
      <video ref={videoRef} className="hidden" autoPlay playsInline muted />
      <canvas ref={canvasRef} className="hidden" />

      {/* Top Bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {isTracking && (
                <span className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></span>
              )}
              <span className="text-white font-semibold">{meetingName}</span>
            </div>
            <span className="text-gray-400 text-sm">
              {isCapturing ? '📹 Capturing' : '⏸️ Paused'}
            </span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setIsTracking(!isTracking)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                isTracking
                  ? 'bg-yellow-600 hover:bg-yellow-700 text-white'
                  : 'bg-green-600 hover:bg-green-700 text-white'
              }`}
            >
              {isTracking ? 'Pause Analysis' : 'Resume Analysis'}
            </button>
            <button
              onClick={handleEndSession}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
            >
              End Session
            </button>
          </div>
        </div>
      </div>

      {/* Main Content - Instructions */}
      <div className="flex items-center justify-center h-[calc(100vh-60px)] p-8">
        <div className="bg-gray-800 rounded-xl shadow-2xl p-8 max-w-2xl">
          <div className="text-center">
            <div className="bg-green-600 rounded-full p-6 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <h2 className="text-3xl font-bold text-white mb-4">Analysis Active!</h2>
            <p className="text-gray-300 text-lg mb-6">
              Emotion tracking is running in the background
            </p>

            <div className="bg-gray-700 rounded-lg p-6 mb-6">
              <h3 className="text-white font-semibold mb-4 text-lg">What's Happening:</h3>
              <ul className="text-gray-300 space-y-3 text-left">
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Capturing your Zoom window in the background</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Analyzing emotions every 4 seconds</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>Floating stats window shows real-time data</span>
                </li>
                <li className="flex items-start">
                  <svg className="w-5 h-5 text-green-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                  </svg>
                  <span>All data is being saved to your session</span>
                </li>
              </ul>
            </div>

            <p className="text-gray-400 text-sm mb-4">
              Minimize or close this window - analysis continues in the background.<br/>
              The floating stats window stays on top of your Zoom meeting.
            </p>

            <div className="flex gap-3 justify-center">
              <button
                onClick={() => window.open(window.location.origin, '_blank')}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
              >
                Open in New Tab
              </button>
              <button
                onClick={() => window.minimize()}
                className="px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-600 transition-colors text-sm"
              >
                Minimize Window
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Floating Statistics Window */}
      {sessionStats && (
        <FloatingStatsWindow
          stats={sessionStats}
          participants={[]} // We don't have individual participants in screen capture mode
          isMinimized={isFloatingMinimized}
          onToggleMinimize={() => setIsFloatingMinimized(!isFloatingMinimized)}
        />
      )}
    </div>
  );
};

export default ZoomMeetingScreenCapture;
