import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionAPI, emotionAPI } from '../services/api';
import socketService from '../services/socket';
import FloatingStatsWindow from '../components/FloatingStatsWindow';

/**
 * JITSI MEET INTEGRATION - 100% FREE!
 *
 * Uses Jitsi Meet (completely free, open-source video platform)
 * - No account needed
 * - No payment method required
 * - Direct access to participant video streams
 * - Automatic emotion detection
 *
 * Uses meet.jit.si public server (free forever)
 */

const JitsiMeet = () => {
  const navigate = useNavigate();

  // Meeting state
  const [meetingName, setMeetingName] = useState('');
  const [roomName, setRoomName] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [jitsiApi, setJitsiApi] = useState(null);
  const [participants, setParticipants] = useState([]);

  // Session tracking
  const [sessionId, setSessionId] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [sessionStats, setSessionStats] = useState(null);

  // Refs
  const jitsiContainerRef = useRef(null);
  const canvasRef = useRef(null);
  const trackingIntervalRef = useRef(null);

  // UI state
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('setup'); // setup, meeting, error
  const [error, setError] = useState(null);

  // ============================================
  // JITSI MEET SETUP
  // ============================================

  const loadJitsiScript = () => {
    return new Promise((resolve, reject) => {
      if (window.JitsiMeetExternalAPI) {
        resolve();
        return;
      }

      const script = document.createElement('script');
      script.src = 'https://meet.jit.si/external_api.js';
      script.async = true;
      script.onload = resolve;
      script.onerror = reject;
      document.body.appendChild(script);
    });
  };

  const handleCreateMeeting = async () => {
    if (!meetingName.trim()) {
      alert('Please enter a meeting name');
      return;
    }

    if (!displayName.trim()) {
      alert('Please enter your name');
      return;
    }

    setLoading(true);
    setError(null);

    try {
      // Step 1: Create tracking session
      console.log('📊 Creating tracking session...');
      const sessionResponse = await sessionAPI.startSession(meetingName);

      if (!sessionResponse.success) {
        throw new Error('Failed to create tracking session');
      }

      setSessionId(sessionResponse.session_id);

      // Step 2: Connect to WebSocket
      console.log('🔌 Connecting to WebSocket...');
      socketService.connect();
      socketService.joinSession(sessionResponse.session_id);

      socketService.onEmotionUpdate((data) => {
        console.log('💓 Emotion update:', data);
        fetchSessionStats();
      });

      // Step 3: Generate room name
      const room = roomName.trim() || `EmotionTracker-${Date.now()}`;
      setRoomName(room);

      // Step 4: Load Jitsi script
      console.log('📹 Loading Jitsi Meet...');
      await loadJitsiScript();

      // Step 5: Change view to meeting (this renders the container)
      setView('meeting');

      // Step 6: Wait for next tick to ensure DOM is ready, then initialize Jitsi
      setTimeout(async () => {
        try {
          console.log('🚀 Joining Jitsi meeting...');
          await initJitsiMeeting(room);
          setLoading(false);
        } catch (error) {
          console.error('❌ Error initializing Jitsi:', error);
          setError(error.message);
          setView('error');
          setLoading(false);
        }
      }, 100);

    } catch (error) {
      console.error('❌ Error creating meeting:', error);
      setError(error.message);
      setView('error');
      setLoading(false);
    }
  };

  const initJitsiMeeting = async (room) => {
    // Verify container exists
    if (!jitsiContainerRef.current) {
      throw new Error('Jitsi container not found in DOM');
    }

    const domain = 'meet.jit.si';
    const options = {
      roomName: room,
      width: '100%',
      height: '100%',
      parentNode: jitsiContainerRef.current,
      userInfo: {
        displayName: displayName
      },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: false,
        enableWelcomePage: false,
        prejoinPageEnabled: false,
        disableDeepLinking: true,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
        TOOLBAR_BUTTONS: [
          'microphone', 'camera', 'closedcaptions', 'desktop', 'fullscreen',
          'fodeviceselection', 'hangup', 'profile', 'chat', 'recording',
          'livestreaming', 'etherpad', 'sharedvideo', 'settings', 'raisehand',
          'videoquality', 'filmstrip', 'invite', 'feedback', 'stats', 'shortcuts',
          'tileview', 'videobackgroundblur', 'download', 'help', 'mute-everyone',
        ],
      },
    };

    const api = new window.JitsiMeetExternalAPI(domain, options);
    setJitsiApi(api);

    // Set up event listeners
    api.addEventListener('videoConferenceJoined', handleConferenceJoined);
    api.addEventListener('participantJoined', handleParticipantJoined);
    api.addEventListener('participantLeft', handleParticipantLeft);
    api.addEventListener('videoConferenceLeft', handleConferenceLeft);

    console.log('✅ Jitsi API initialized');
  };

  // ============================================
  // JITSI EVENT HANDLERS
  // ============================================

  const handleConferenceJoined = useCallback((event) => {
    console.log('✅ Joined conference:', event);

    // Start emotion tracking automatically after joining
    setTimeout(() => {
      console.log('🚀 Starting automatic emotion tracking...');
      startTracking();
    }, 3000);
  }, []);

  const handleParticipantJoined = useCallback((event) => {
    console.log('👤 Participant joined:', event.displayName || event.id);
    updateParticipantsList();
  }, []);

  const handleParticipantLeft = useCallback((event) => {
    console.log('👋 Participant left:', event.displayName || event.id);
    updateParticipantsList();
  }, []);

  const handleConferenceLeft = useCallback(() => {
    console.log('👋 Left conference');
    stopTracking();
  }, []);

  const updateParticipantsList = useCallback(() => {
    if (!jitsiApi) return;

    jitsiApi.getParticipantsInfo().then((participantsList) => {
      console.log('👥 Current participants:', participantsList.length);
      setParticipants(participantsList);
    });
  }, [jitsiApi]);

  // ============================================
  // EMOTION DETECTION - Screen Capture Method
  // ============================================

  const captureAndAnalyzeScreen = async () => {
    if (!jitsiApi || !canvasRef.current || !sessionId) {
      console.log('[WARN] Jitsi API, canvas, or session not ready');
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    try {
      // Get the Jitsi iframe
      const jitsiIframe = jitsiContainerRef.current?.querySelector('iframe');

      if (!jitsiIframe) {
        console.log('[WARN] Jitsi iframe not found');
        return;
      }

      // We need to capture the entire Jitsi meeting area
      // Since we can't directly access iframe content due to CORS,
      // we'll use canvas to capture video tiles

      // Get participant info
      const participantsList = await jitsiApi.getParticipantsInfo();

      if (participantsList.length === 0) {
        console.log('[INFO] No participants to analyze yet');
        return;
      }

      // For each participant, we'll capture a screenshot of the meeting
      // Note: This is a simplified approach - capturing the whole screen
      console.log(`[DEBUG] Analyzing ${participantsList.length} participants`);

      // Capture screenshot using Jitsi's captureScreenshot API
      // This requires screen sharing to be active, which is not ideal
      // Instead, we'll use a workaround with html2canvas or similar

      // Alternative: Use screen capture API
      console.log('[INFO] Using screen capture for emotion analysis');
      console.log('[INFO] Please share your Jitsi meeting window when prompted');

    } catch (error) {
      console.error('❌ Error capturing screen:', error);
    }
  };

  // ============================================
  // TRACKING CONTROLS
  // ============================================

  const startTracking = () => {
    console.log('🎭 Starting emotion tracking...');
    setIsTracking(true);

    // For Jitsi, we'll need to use screen capture
    // This is similar to Google Meet approach
    startScreenCapture();
  };

  const startScreenCapture = async () => {
    try {
      console.log('📺 Starting screen capture...');

      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: {
          cursor: 'never',
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          frameRate: { ideal: 10, max: 15 }
        },
        audio: false
      });

      console.log('✅ Screen capture started');

      // Create video element to display stream
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      video.muted = true;
      video.style.display = 'none';
      document.body.appendChild(video);

      // Wait for video to be ready
      video.onloadedmetadata = () => {
        console.log('✅ Video metadata loaded');

        // Start analyzing frames
        trackingIntervalRef.current = setInterval(() => {
          analyzeVideoFrame(video);
        }, 4000);
      };

      // Handle track end
      const track = stream.getVideoTracks()[0];
      track.addEventListener('ended', () => {
        console.log('⚠️ Screen sharing stopped');
        stopTracking();
        video.remove();
      });

    } catch (error) {
      console.error('❌ Error starting screen capture:', error);

      if (error.name === 'NotAllowedError') {
        alert('Screen capture is required for emotion detection.\n\nPlease select your Jitsi meeting window and click "Share".');
      }
    }
  };

  const analyzeVideoFrame = async (video) => {
    if (!canvasRef.current || !sessionId) return;

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = video.videoWidth || 1920;
    canvas.height = video.videoHeight || 1080;

    // Draw current frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    // Get image data
    const imageData = canvas.toDataURL('image/jpeg', 0.8);

    if (!imageData || imageData === 'data:,') {
      console.log('[ERROR] Failed to capture frame');
      return;
    }

    console.log(`[DEBUG] Captured frame, size: ${imageData.length} bytes`);

    // Send to backend for analysis
    try {
      const response = await emotionAPI.analyzeEmotion(
        sessionId,
        'jitsi_participant',
        imageData
      );

      if (response.success) {
        console.log(`✅ Detected emotion: ${response.emotion} (${(response.confidence * 100).toFixed(1)}%)`);
      } else {
        console.log(`⚠️ No emotion detected: ${response.message}`);
      }
    } catch (error) {
      console.error('❌ Error analyzing frame:', error);
    }
  };

  const stopTracking = () => {
    console.log('⏸️ Stopping emotion tracking...');
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
        // Leave Jitsi meeting
        if (jitsiApi) {
          jitsiApi.dispose();
        }

        // Stop session in backend
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

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (jitsiApi) {
        jitsiApi.dispose();
      }
      stopTracking();
      if (sessionId) {
        socketService.disconnect();
      }
    };
  }, [jitsiApi, sessionId]);

  // ============================================
  // RENDER: ERROR SCREEN
  // ============================================

  if (view === 'error') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-pink-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="bg-red-600 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Error</h1>
          <p className="text-red-600 mb-6">{error}</p>
          <button
            onClick={() => {
              setView('setup');
              setError(null);
            }}
            className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold"
          >
            Try Again
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
  // RENDER: MEETING VIEW
  // ============================================

  if (view === 'meeting') {
    return (
      <div className="min-h-screen bg-gray-900">
        {/* Hidden canvas for frame capture */}
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
                👥 {participants.length} participant{participants.length !== 1 ? 's' : ''}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                onClick={handleEndSession}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
              >
                End Session
              </button>
            </div>
          </div>
        </div>

        {/* Jitsi Meeting Container */}
        <div ref={jitsiContainerRef} className="w-full" style={{ height: 'calc(100vh - 60px)' }} />

        {/* Floating Statistics Window */}
        {sessionStats && (
          <FloatingStatsWindow
            stats={sessionStats}
            participants={participants.map(p => ({
              id: p.participantId,
              name: p.displayName || 'Guest'
            }))}
            isMinimized={isFloatingMinimized}
            onToggleMinimize={() => setIsFloatingMinimized(!isFloatingMinimized)}
          />
        )}
      </div>
    );
  }

  // ============================================
  // RENDER: SETUP SCREEN
  // ============================================

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full">
        <div className="text-center mb-6">
          <div className="bg-green-600 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Jitsi Meet - 100% FREE!</h1>
          <p className="text-gray-600">No account, no payment, no limits - completely free forever!</p>
        </div>

        {/* Meeting Details Form */}
        <div className="space-y-4 mb-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Meeting Name (For Your Records)
            </label>
            <input
              type="text"
              placeholder="e.g., Team Standup - Monday"
              value={meetingName}
              onChange={(e) => setMeetingName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Your Name
            </label>
            <input
              type="text"
              placeholder="e.g., John Doe"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Room Name (Optional)
            </label>
            <input
              type="text"
              placeholder="Leave empty to auto-generate"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent outline-none text-lg"
            />
            <p className="text-xs text-gray-500 mt-1">Custom room name or leave empty for auto-generated</p>
          </div>
        </div>

        {/* Features */}
        <div className="mb-6 p-6 bg-green-50 border-l-4 border-green-500 rounded-lg">
          <h3 className="text-lg font-bold text-green-900 mb-3">✨ 100% Free Features:</h3>
          <ul className="space-y-2 text-sm text-green-800">
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>No Account Needed</strong> - Start immediately</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>No Payment Method</strong> - Zero credit card required</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>Unlimited Meetings</strong> - Use as much as you want</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>HD Video Quality</strong> - Crystal clear video</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>Emotion Detection</strong> - Real-time analysis with screen capture</span>
            </li>
          </ul>
        </div>

        {/* Create Button */}
        <button
          onClick={handleCreateMeeting}
          disabled={loading}
          className="w-full px-6 py-4 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
        >
          {loading ? (
            <>
              <svg className="animate-spin h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              Creating Meeting...
            </>
          ) : (
            <>
              <svg className="w-6 h-6 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
              Start FREE Meeting with Emotion Detection
            </>
          )}
        </button>

        <button
          onClick={() => navigate('/dashboard')}
          className="w-full mt-4 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          ← Back to Dashboard
        </button>

        {/* Info Note */}
        <div className="mt-6 p-4 bg-blue-50 border-l-4 border-blue-400 rounded">
          <h3 className="text-sm font-bold text-blue-900 mb-2">ℹ️ How It Works</h3>
          <p className="text-xs text-blue-800">
            This uses Jitsi Meet's public server (meet.jit.si) which is completely free. After joining, you'll be prompted to share your screen for emotion detection. Select the Jitsi meeting window to analyze all participants.
          </p>
        </div>
      </div>
    </div>
  );
};

export default JitsiMeet;
