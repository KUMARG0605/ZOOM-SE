import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import DailyIframe from '@daily-co/daily-js';
import { sessionAPI, emotionAPI, dailyAPI } from '../services/api';
import socketService from '../services/socket';
import FloatingStatsWindow from '../components/FloatingStatsWindow';

/**
 * DAILY.CO VIDEO MEETING - Direct Video Stream Access
 *
 * This component creates a Daily.co video meeting and automatically captures
 * all participant video streams for real-time emotion detection.
 *
 * Features:
 * - Create meeting with one click
 * - Automatically access ALL participant video streams via Daily SDK
 * - No screen sharing needed!
 * - Real-time emotion detection every 4 seconds
 * - Floating statistics bubble
 */

const DailyMeet = () => {
  const navigate = useNavigate();

  // Meeting state
  const [meetingName, setMeetingName] = useState('');
  const [roomUrl, setRoomUrl] = useState(null);
  const [callObject, setCallObject] = useState(null);
  const [participants, setParticipants] = useState({});

  // Session tracking
  const [sessionId, setSessionId] = useState(null);
  const [isTracking, setIsTracking] = useState(false);
  const [sessionStats, setSessionStats] = useState(null);

  // Refs
  const canvasRef = useRef(null);
  const trackingIntervalRef = useRef(null);
  const callFrameRef = useRef(null);

  // UI state
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const [loading, setLoading] = useState(false);
  const [view, setView] = useState('setup'); // setup, meeting, error
  const [error, setError] = useState(null);
  const [meetingState, setMeetingState] = useState('not-started'); // not-started, joining, joined, left, error

  // ============================================
  // MEETING CREATION & SETUP
  // ============================================

  const handleCreateMeeting = async () => {
    if (!meetingName.trim()) {
      alert('Please enter a meeting name');
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

      // Step 3: Create Daily.co room
      console.log('🎥 Creating Daily.co room...');
      const roomResponse = await dailyAPI.createRoom({
        room_name: `meeting-${Date.now()}`,
        privacy: 'public',
        max_participants: 10
      });

      if (!roomResponse.success) {
        throw new Error(roomResponse.message || 'Failed to create room');
      }

      console.log('✅ Room created:', roomResponse.room.url);
      setRoomUrl(roomResponse.room.url);

      // Step 4: Join the meeting
      await joinMeeting(roomResponse.room.url);

    } catch (error) {
      console.error('❌ Error creating meeting:', error);
      setError(error.message);
      setView('error');
      setLoading(false);
    }
  };

  const joinMeeting = async (url) => {
    try {
      console.log('🚀 Joining Daily.co meeting...');
      setMeetingState('joining');

      // Create Daily call object
      const daily = DailyIframe.createFrame(callFrameRef.current, {
        iframeStyle: {
          position: 'absolute',
          width: '100%',
          height: '100%',
          border: '0',
          borderRadius: '8px'
        },
        showLeaveButton: true,
        showFullscreenButton: true,
      });

      setCallObject(daily);

      // Set up event listeners
      daily
        .on('joined-meeting', handleJoinedMeeting)
        .on('participant-joined', handleParticipantJoined)
        .on('participant-updated', handleParticipantUpdated)
        .on('participant-left', handleParticipantLeft)
        .on('left-meeting', handleLeftMeeting)
        .on('error', handleDailyError);

      // Join the call
      await daily.join({ url });

      console.log('✅ Successfully joined meeting');
      setMeetingState('joined');
      setView('meeting');
      setLoading(false);

    } catch (error) {
      console.error('❌ Error joining meeting:', error);
      setError(error.message);
      setView('error');
      setLoading(false);
    }
  };

  // ============================================
  // DAILY.CO EVENT HANDLERS
  // ============================================

  const handleJoinedMeeting = useCallback((event) => {
    console.log('✅ Joined meeting:', event);
    setMeetingState('joined');

    // Start emotion tracking automatically after joining
    setTimeout(() => {
      console.log('🚀 Starting automatic emotion tracking...');
      startTracking();
    }, 2000);
  }, []);

  const handleParticipantJoined = useCallback((event) => {
    console.log('👤 Participant joined:', event.participant);
    updateParticipants();
  }, []);

  const handleParticipantUpdated = useCallback((event) => {
    console.log('👤 Participant updated:', event.participant);
    updateParticipants();
  }, []);

  const handleParticipantLeft = useCallback((event) => {
    console.log('👋 Participant left:', event.participant);
    updateParticipants();
  }, []);

  const handleLeftMeeting = useCallback(() => {
    console.log('👋 Left meeting');
    setMeetingState('left');
    stopTracking();
  }, []);

  const handleDailyError = useCallback((error) => {
    console.error('❌ Daily.co error:', error);
    setError(error.errorMsg || 'An error occurred with the video call');
  }, []);

  const updateParticipants = useCallback(() => {
    if (!callObject) return;

    const participantsObj = callObject.participants();
    console.log('👥 Current participants:', Object.keys(participantsObj).length);
    setParticipants(participantsObj);
  }, [callObject]);

  // ============================================
  // EMOTION DETECTION
  // ============================================

  const captureAndAnalyzeParticipants = async () => {
    if (!callObject || !canvasRef.current || !sessionId) {
      console.log('[WARN] Call object, canvas, or session not ready');
      return;
    }

    const participantsObj = callObject.participants();
    const participantIds = Object.keys(participantsObj);

    if (participantIds.length === 0) {
      console.log('[INFO] No participants to analyze yet');
      return;
    }

    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');

    // Process each participant
    for (const participantId of participantIds) {
      const participant = participantsObj[participantId];

      // Skip if participant has no video or video is off
      if (!participant.video || participant.videoTrack?.state !== 'playable') {
        console.log(`[SKIP] Participant ${participant.user_name || participantId} - video not available`);
        continue;
      }

      try {
        // Get video element for this participant
        const videoElement = callObject.participants()[participantId]?.videoTrack;

        if (!videoElement) {
          console.log(`[SKIP] No video track for ${participantId}`);
          continue;
        }

        // Create a temporary video element to render the track
        const video = document.createElement('video');
        video.srcObject = new MediaStream([videoElement]);
        video.autoplay = true;
        video.muted = true;

        // Wait for video to be ready
        await new Promise((resolve, reject) => {
          video.onloadedmetadata = resolve;
          video.onerror = reject;
          setTimeout(reject, 2000); // Timeout after 2 seconds
        });

        // Set canvas size to match video
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;

        // Draw frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get image data
        const imageData = canvas.toDataURL('image/jpeg', 0.8);

        if (!imageData || imageData === 'data:,') {
          console.log(`[ERROR] Failed to capture image for ${participantId}`);
          continue;
        }

        console.log(`[DEBUG] Captured frame for ${participant.user_name || participantId}`);

        // Send to backend for emotion analysis
        const response = await emotionAPI.analyzeEmotion(
          sessionId,
          participant.user_name || participantId,
          imageData
        );

        if (response.success) {
          console.log(`✅ ${participant.user_name || participantId}: ${response.emotion} (${(response.confidence * 100).toFixed(1)}%)`);
        } else {
          console.log(`⚠️ No emotion detected for ${participant.user_name || participantId}`);
        }

        // Clean up
        video.srcObject = null;
        video.remove();

      } catch (error) {
        console.error(`❌ Error analyzing participant ${participantId}:`, error);
      }
    }
  };

  // ============================================
  // TRACKING CONTROLS
  // ============================================

  const startTracking = () => {
    console.log('🎭 Starting emotion tracking...');
    setIsTracking(true);

    // Analyze all participants every 4 seconds
    trackingIntervalRef.current = setInterval(() => {
      captureAndAnalyzeParticipants();
    }, 4000);

    // Also run once immediately
    captureAndAnalyzeParticipants();
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
        // Leave Daily.co call
        if (callObject) {
          await callObject.leave();
          await callObject.destroy();
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
      if (callObject) {
        callObject.destroy();
      }
      stopTracking();
      if (sessionId) {
        socketService.disconnect();
      }
    };
  }, [callObject, sessionId]);

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
                👥 {Object.keys(participants).length} participant{Object.keys(participants).length !== 1 ? 's' : ''}
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
                {isTracking ? '⏸️ Pause Analysis' : '▶️ Resume Analysis'}
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

        {/* Daily.co Call Frame */}
        <div className="relative" style={{ height: 'calc(100vh - 60px)' }}>
          <div ref={callFrameRef} className="w-full h-full" />
        </div>

        {/* Floating Statistics Window */}
        {sessionStats && (
          <FloatingStatsWindow
            stats={sessionStats}
            participants={Object.values(participants).map(p => ({
              id: p.user_id,
              name: p.user_name || 'Guest'
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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-2xl w-full">
        <div className="text-center mb-6">
          <div className="bg-blue-600 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Emotion Detection Meeting</h1>
          <p className="text-gray-600">Create a video meeting with automatic emotion analysis</p>
        </div>

        {/* Meeting Name Input */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Meeting Name
          </label>
          <input
            type="text"
            placeholder="e.g., Team Standup - Monday"
            value={meetingName}
            onChange={(e) => setMeetingName(e.target.value)}
            className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-lg"
          />
        </div>

        {/* Features */}
        <div className="mb-6 p-6 bg-green-50 border-l-4 border-green-500 rounded-lg">
          <h3 className="text-lg font-bold text-green-900 mb-3">✨ What You Get:</h3>
          <ul className="space-y-2 text-sm text-green-800">
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>Instant Meeting</strong> - Created in seconds</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>Automatic Analysis</strong> - All participants analyzed automatically</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>No Screen Sharing</strong> - Direct video stream access via API</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>Real-time Stats</strong> - Floating bubble with live data</span>
            </li>
            <li className="flex items-start">
              <svg className="w-5 h-5 text-green-600 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span><strong>High Quality</strong> - HD video with reliable connections</span>
            </li>
          </ul>
        </div>

        {/* Create Button */}
        <button
          onClick={handleCreateMeeting}
          disabled={loading}
          className="w-full px-6 py-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold text-lg disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
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
              Start Meeting with Emotion Detection
            </>
          )}
        </button>

        <button
          onClick={() => navigate('/dashboard')}
          className="w-full mt-4 px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
        >
          ← Back to Dashboard
        </button>

        {/* Privacy Note */}
        <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
          <h3 className="text-sm font-bold text-yellow-900 mb-2">⚠️ Privacy & Consent</h3>
          <p className="text-xs text-yellow-800">
            Always inform participants that emotion analysis is being performed and obtain their consent before starting the meeting.
          </p>
        </div>
      </div>
    </div>
  );
};

export default DailyMeet;
