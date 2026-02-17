import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionAPI, emotionAPI, googleMeetAPI } from '../services/api';
import socketService from '../services/socket';
import FloatingStatsWindow from '../components/FloatingStatsWindow';

/**
 * GOOGLE MEET ANALYZER - Screen Capture Method
 *
 * This works with Google Meet meetings by:
 * 1. Create or join Google Meet meeting
 * 2. Start screen capture of Meet window
 * 3. Extract and analyze participant faces from the captured screen
 * 4. Show floating statistics overlay
 */

const GoogleMeet = () => {
  const navigate = useNavigate();

  // Auth state
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [checkingAuth, setCheckingAuth] = useState(true);

  // Meeting state
  const [meetings, setMeetings] = useState([]);
  const [selectedMeetingId, setSelectedMeetingId] = useState('');
  const [meetingName, setMeetingName] = useState('');
  const [createdMeeting, setCreatedMeeting] = useState(null);

  // Capture state
  const [setupComplete, setSetupComplete] = useState(false);
  const [captureStream, setCaptureStream] = useState(null);
  const [isCapturing, setIsCapturing] = useState(false);

  // Session tracking
  const [sessionId, setSessionId] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [sessionStats, setSessionStats] = useState(null);

  // Refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const trackingIntervalRef = useRef(null);

  // UI state
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('main'); // main, createAndStart, joinExisting
  const [existingMeetLink, setExistingMeetLink] = useState('');

  // ============================================
  // AUTH & INITIAL SETUP
  // ============================================

  useEffect(() => {
    checkAuthStatus();
    return () => cleanup();
  }, []);

  const checkAuthStatus = async () => {
    try {
      const response = await googleMeetAPI.checkAuthStatus();
      setIsAuthenticated(response.authenticated);
      if (response.authenticated) {
        loadMeetings();
      }
    } catch (error) {
      console.error('Error checking auth status:', error);
    } finally {
      setCheckingAuth(false);
    }
  };

  const handleGoogleAuth = async () => {
    try {
      const response = await googleMeetAPI.initiateAuth();
      if (response.success && response.authorization_url) {
        // Open OAuth window
        const authWindow = window.open(
          response.authorization_url,
          'Google Authorization',
          'width=600,height=700'
        );

        // Poll for auth completion
        const pollTimer = setInterval(async () => {
          try {
            if (authWindow.closed) {
              clearInterval(pollTimer);
              await checkAuthStatus();
            }
          } catch (e) {
            clearInterval(pollTimer);
          }
        }, 1000);
      }
    } catch (error) {
      console.error('Error initiating auth:', error);
      alert('Failed to start authorization: ' + error.message);
    }
  };

  const loadMeetings = async () => {
    try {
      const response = await googleMeetAPI.listMeetings();
      if (response.success) {
        setMeetings(response.meetings);
      }
    } catch (error) {
      console.error('Error loading meetings:', error);
    }
  };

  // ============================================
  // MEETING CREATION
  // ============================================

  const handleCreateAndStartMeeting = async () => {
    if (!meetingName.trim()) {
      alert('Please enter a meeting name');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create the Google Meet
      console.log('Creating Google Meet...');
      const response = await googleMeetAPI.createMeeting({
        summary: meetingName,
        duration_minutes: 60
      });

      if (response.success) {
        setCreatedMeeting(response.meeting);
        console.log('Meeting created:', response.meeting);

        // Step 2: Open the meeting in a new window
        window.open(response.meeting.meet_link, '_blank');

        // Step 3: Wait a moment then auto-start emotion detection
        console.log('Waiting 3 seconds before starting emotion detection...');
        setTimeout(async () => {
          console.log('Auto-starting emotion detection...');
          await startEmotionDetection();
        }, 3000); // Wait 3 seconds for user to see the meeting tab
      }
    } catch (error) {
      console.error('Error creating meeting:', error);
      alert('Failed to create meeting: ' + error.message);
      setLoading(false);
    }
  };

  // ============================================
  // SCREEN CAPTURE SETUP
  // ============================================

  const handleJoinExistingMeeting = async () => {
    if (!meetingName.trim()) {
      alert('Please enter a meeting name for your records');
      return;
    }

    if (existingMeetLink.trim()) {
      // Open the existing meeting link
      console.log('Opening existing meeting:', existingMeetLink);
      window.open(existingMeetLink, '_blank');

      // Wait 3 seconds then auto-start emotion detection
      console.log('Waiting 3 seconds before starting emotion detection...');
      setTimeout(async () => {
        console.log('Auto-starting emotion detection...');
        await startEmotionDetection();
      }, 3000);
    } else {
      // No link provided, start detection immediately
      await startEmotionDetection();
    }
  };

  const startEmotionDetection = async () => {
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
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 10, max: 15 }
        },
        audio: false
      });

      console.log('✅ Screen capture permission granted!');

      // Get track immediately
      const track = stream.getVideoTracks()[0];

      // Check track state immediately
      console.log('📹 Initial track state:', {
        label: track.label,
        enabled: track.enabled,
        muted: track.muted,
        readyState: track.readyState,
        id: track.id
      });

      // Get track settings to see what was actually captured
      const settings = track.getSettings();
      console.log('🎥 Track settings:', {
        displaySurface: settings.displaySurface,
        width: settings.width,
        height: settings.height,
        frameRate: settings.frameRate,
        deviceId: settings.deviceId
      });

      // Check if track is already ended (this would be very bad)
      if (track.readyState === 'ended') {
        throw new Error('Screen capture track ended immediately! This is likely a browser security issue. Please select "Entire Screen" or "Window" instead of a Chrome tab.');
      }

      // Warn if user captured a browser tab instead of window
      if (settings.displaySurface === 'browser') {
        console.warn('⚠️ User captured a browser tab instead of window/screen. This may cause issues.');
      }

      setCaptureStream(stream);
      setIsCapturing(true);

      // Set up video element FIRST (before event listeners)
      if (!videoRef.current) {
        throw new Error('Video element ref is not available');
      }

      const video = videoRef.current;

      console.log('🎬 Setting up video element...');
      video.srcObject = stream;

      // Wait for video metadata to load
      video.onloadedmetadata = () => {
        console.log(`✅ Video metadata loaded! Size: ${video.videoWidth}x${video.videoHeight}`);
        video.play().then(() => {
          console.log('▶️ Video is now playing');
          setSetupComplete(true);

          // Auto-start tracking after video is confirmed playing
          setTimeout(() => {
            console.log('🚀 Starting emotion tracking...');
            startTracking();
          }, 1000);
        }).catch(err => {
          console.error('❌ Error playing video:', err);
        });
      };

      video.onerror = (err) => {
        console.error('❌ Video element error:', err);
      };

      // Set a timeout to detect if video never loads
      const videoLoadTimeout = setTimeout(() => {
        if (video.videoWidth === 0) {
          console.error('❌ Video failed to load after 5 seconds');
          alert('Video stream failed to load. Please try again.\n\nTip: Make sure to select "Window" or "Entire Screen" instead of a browser tab.');
          cleanup();
          setView('main');
        }
      }, 5000);

      // Handle when user stops sharing (set this AFTER video setup)
      track.addEventListener('ended', () => {
        console.log('⚠️ Screen sharing stopped - track ended event fired');
        clearTimeout(videoLoadTimeout);

        // Only auto-end if tracking was actually started
        if (isTracking) {
          alert('Screen sharing has stopped. The session will end now.');
          handleEndSession();
        } else {
          alert('Screen sharing was stopped before tracking started.\n\nPlease try again and make sure to:\n1. Click "Share entire screen" or "Window"\n2. Select the Google Meet window\n3. Click "Share"\n\nNote: Do NOT select a Chrome tab - this won\'t work.');
          setLoading(false);
          cleanup();
          setView('main');
        }
      });

      console.log('✅ Screen capture setup complete! Waiting for video to load metadata...');

    } catch (error) {
      console.error('Error starting capture:', error);

      if (error.name === 'NotAllowedError') {
        alert('Screen capture permission denied.\n\nPlease click "Share" and select your Google Meet window to continue.');
      } else {
        alert('Failed to start capture: ' + error.message);
      }

      cleanup();
    } finally {
      setLoading(false);
    }
  };

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
  // FACE DETECTION & ANALYSIS
  // ============================================

  const detectAndAnalyzeFaces = async () => {
    if (!videoRef.current || !canvasRef.current) {
      console.log('[WARN] Video or canvas ref not ready');
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;

    // Check if video is actually playing and has dimensions
    if (video.videoWidth === 0 || video.videoHeight === 0) {
      console.log('[WARN] Video not ready yet, skipping frame');
      return;
    }

    const ctx = canvas.getContext('2d');

    // Set canvas size to match video
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get full screen image
    const fullImage = canvas.toDataURL('image/jpeg', 0.8);

    // Validate image data
    if (!fullImage || fullImage === 'data:,') {
      console.log('[ERROR] Failed to capture image from canvas');
      return;
    }

    console.log(`[DEBUG] Captured image, size: ${fullImage.length} bytes`);

    // Send to backend for face detection and emotion analysis
    try {
      const response = await emotionAPI.analyzeEmotion(
        sessionId,
        'google_meet_view',
        fullImage
      );

      if (response.success) {
        console.log(`✅ Detected emotion: ${response.emotion} (${(response.confidence * 100).toFixed(1)}%)`);
      } else {
        console.log(`⚠️ No emotion detected: ${response.message}`);
      }
    } catch (error) {
      console.error('❌ Error analyzing faces:', error);
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
  // RENDER: AUTH SCREEN
  // ============================================

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="bg-blue-600 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10 2a8 8 0 100 16 8 8 0 000-16zM9 9a1 1 0 012 0v4a1 1 0 11-2 0V9zm1-5a1 1 0 100 2 1 1 0 000-2z" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Google Authorization Required</h1>
          <p className="text-gray-600 mb-6">
            To use Google Meet integration, you need to authorize this application to access your Google Calendar.
          </p>
          <button
            onClick={handleGoogleAuth}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold flex items-center justify-center"
          >
            <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z" />
            </svg>
            Authorize with Google
          </button>
          <button
            onClick={() => navigate('/dashboard')}
            className="w-full mt-3 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  // ============================================
  // RENDER: ACTIVE CAPTURE SCREEN
  // ============================================

  if (setupComplete) {
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

        {/* Main Content */}
        <div className="flex items-center justify-center h-[calc(100vh-60px)] p-8">
          <div className="bg-gray-800 rounded-xl shadow-2xl p-8 max-w-2xl">
            <div className="text-center">
              <div className="bg-blue-600 rounded-full p-6 w-20 h-20 mx-auto mb-6 flex items-center justify-center">
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
                    <svg className="w-5 h-5 text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Capturing your Google Meet window in the background</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Analyzing emotions every 4 seconds</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>Floating stats window shows real-time data</span>
                  </li>
                  <li className="flex items-start">
                    <svg className="w-5 h-5 text-blue-400 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    <span>All data is being saved to your session</span>
                  </li>
                </ul>
              </div>

              <p className="text-gray-400 text-sm mb-4">
                Minimize or close this window - analysis continues in the background.<br/>
                The floating stats window stays on top of your Google Meet.
              </p>
            </div>
          </div>
        </div>

        {/* Floating Statistics Window */}
        {sessionStats && (
          <FloatingStatsWindow
            stats={sessionStats}
            participants={[]}
            isMinimized={isFloatingMinimized}
            onToggleMinimize={() => setIsFloatingMinimized(!isFloatingMinimized)}
          />
        )}
      </div>
    );
  }

  // ============================================
  // RENDER: MAIN SETUP SCREEN
  // ============================================

  if (view === 'createAndStart') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="bg-green-600 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Create & Start Meeting</h2>
            <p className="text-gray-600 text-sm mt-2">Create a new Google Meet with emotion detection</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meeting Name
              </label>
              <input
                type="text"
                placeholder="e.g., Team Standup - Monday"
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <div className="bg-blue-50 border-l-4 border-blue-500 p-4 rounded">
              <p className="text-sm text-blue-800">
                <strong>What happens next:</strong><br/>
                1. ✅ Google Meet will be created (you'll be the host)<br/>
                2. 🔗 Meeting opens in new tab automatically<br/>
                3. 📊 After 3 seconds, screen capture starts<br/>
                4. 🎭 Emotion detection runs automatically
              </p>
            </div>

            <button
              onClick={handleCreateAndStartMeeting}
              disabled={loading}
              className="w-full px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Creating...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Create & Start Meeting
                </>
              )}
            </button>

            <button
              onClick={() => setView('main')}
              className="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (view === 'joinExisting') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="bg-purple-600 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold text-gray-900">Join Existing Meeting</h2>
            <p className="text-gray-600 text-sm mt-2">Analyze emotions in an ongoing Google Meet</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meeting Name (For Your Records)
              </label>
              <input
                type="text"
                placeholder="e.g., Client Review Meeting"
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Google Meet Link (Optional)
              </label>
              <input
                type="text"
                placeholder="https://meet.google.com/abc-defg-hij"
                value={existingMeetLink}
                onChange={(e) => setExistingMeetLink(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-purple-500 focus:border-transparent outline-none"
              />
              <p className="text-xs text-gray-500 mt-1">Leave empty if already in the meeting</p>
            </div>

            <div className="bg-purple-50 border-l-4 border-purple-500 p-4 rounded">
              <p className="text-sm text-purple-800">
                <strong>What happens next:</strong><br/>
                1. 🔗 Meeting opens in new tab (if link provided)<br/>
                2. 📊 After 3 seconds, screen capture prompt appears<br/>
                3. 🖥️ Select your Google Meet window<br/>
                4. 🎭 Emotion detection starts automatically
              </p>
            </div>

            <button
              onClick={handleJoinExistingMeeting}
              disabled={loading}
              className="w-full px-6 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold disabled:opacity-50 flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Starting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Start Emotion Detection
                </>
              )}
            </button>

            <button
              onClick={() => setView('main')}
              className="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full">
        <div className="text-center mb-6">
          <div className="bg-blue-600 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Google Meet Analyzer</h1>
          <p className="text-gray-600">Analyze emotions in your Google Meet meetings</p>
        </div>

        {/* Two Main Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Option 1: Create & Start Meeting */}
          <div className="bg-gradient-to-br from-green-50 to-green-100 border-2 border-green-300 rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setView('createAndStart')}>
            <div className="flex items-center justify-center mb-4">
              <div className="bg-green-600 rounded-full p-3">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Create New Meeting</h3>
            <p className="text-sm text-gray-700 text-center mb-4">
              Start a fresh Google Meet with automatic emotion tracking
            </p>
            <ul className="text-xs text-gray-600 space-y-2 mb-4">
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Creates Google Meet instantly</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Opens meeting in new tab</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Auto-starts emotion detection</span>
              </li>
            </ul>
            <button className="w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold">
              Get Started →
            </button>
          </div>

          {/* Option 2: Join Existing Meeting */}
          <div className="bg-gradient-to-br from-purple-50 to-purple-100 border-2 border-purple-300 rounded-xl p-6 hover:shadow-lg transition-shadow cursor-pointer" onClick={() => setView('joinExisting')}>
            <div className="flex items-center justify-center mb-4">
              <div className="bg-purple-600 rounded-full p-3">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                </svg>
              </div>
            </div>
            <h3 className="text-xl font-bold text-gray-900 text-center mb-2">Join Existing Meeting</h3>
            <p className="text-sm text-gray-700 text-center mb-4">
              Analyze emotions in an ongoing or scheduled Google Meet
            </p>
            <ul className="text-xs text-gray-600 space-y-2 mb-4">
              <li className="flex items-start">
                <svg className="w-4 h-4 text-purple-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Works with any Google Meet link</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-purple-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Join via link or manually</span>
              </li>
              <li className="flex items-start">
                <svg className="w-4 h-4 text-purple-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                </svg>
                <span>Start emotion analysis anytime</span>
              </li>
            </ul>
            <button className="w-full px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition-colors font-semibold">
              Get Started →
            </button>
          </div>
        </div>

        {/* How It Works */}
        <div className="mb-6 p-6 bg-blue-50 border-l-4 border-blue-500 rounded-lg">
          <h3 className="text-lg font-bold text-blue-900 mb-3 flex items-center">
            <svg className="w-6 h-6 mr-2" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
            </svg>
            How Emotion Detection Works
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-sm">
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center mx-auto mb-2 font-bold">1</div>
              <p className="font-semibold text-blue-900">Join Meeting</p>
              <p className="text-blue-700 text-xs">Open Google Meet in browser</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center mx-auto mb-2 font-bold">2</div>
              <p className="font-semibold text-blue-900">Screen Capture</p>
              <p className="text-blue-700 text-xs">Select Meet window to analyze</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center mx-auto mb-2 font-bold">3</div>
              <p className="font-semibold text-blue-900">AI Analysis</p>
              <p className="text-blue-700 text-xs">Detect faces & emotions every 4s</p>
            </div>
            <div className="text-center">
              <div className="bg-blue-600 text-white rounded-full w-10 h-10 flex items-center justify-center mx-auto mb-2 font-bold">4</div>
              <p className="font-semibold text-blue-900">Live Stats</p>
              <p className="text-blue-700 text-xs">View real-time floating window</p>
            </div>
          </div>
        </div>

        <button
          onClick={() => navigate('/dashboard')}
          className="w-full px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          ← Back to Dashboard
        </button>

        {/* Important Notes */}
        <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
          <h3 className="text-sm font-bold text-yellow-900 mb-2">⚠️ Important Privacy & Usage Notes</h3>
          <ul className="text-xs text-yellow-800 space-y-1">
            <li>• <strong>Privacy:</strong> Always inform participants that emotion analysis is being performed</li>
            <li>• <strong>Consent:</strong> Obtain necessary consent from all meeting participants</li>
            <li>• <strong>View Mode:</strong> Switch to tiled/grid view in Google Meet for best results</li>
            <li>• <strong>Quality:</strong> Analysis accuracy depends on video quality and lighting</li>
            <li>• <strong>Local Processing:</strong> All data is stored locally; nothing is sent to third parties</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default GoogleMeet;
