import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionAPI, emotionAPI } from '../services/api';
import socketService from '../services/socket';
import zoomService from '../services/zoomService';
import FloatingStatsWindow from '../components/FloatingStatsWindow';

/**
 * LIVE ZOOM MEETING ANALYZER
 *
 * This component:
 * 1. Accepts Zoom meeting details (session name, meeting ID, passcode)
 * 2. Joins the Zoom meeting automatically
 * 3. Captures and analyzes ALL participant video streams in real-time
 * 4. Displays a floating statistics window overlay during the meeting
 * 5. Tracks emotions from start to end of the meeting
 */

const ZoomMeetingLive = () => {
  const navigate = useNavigate();

  // Meeting setup state
  const [setupComplete, setSetupComplete] = useState(false);
  const [inputMode, setInputMode] = useState('link'); // 'link' or 'manual'
  const [invitationLink, setInvitationLink] = useState('');
  const [meetingName, setMeetingName] = useState('');
  const [sessionName, setSessionName] = useState('');
  const [meetingId, setMeetingId] = useState('');
  const [userName, setUserName] = useState('Teacher');
  const [sessionPassword, setSessionPassword] = useState('');

  // Session tracking
  const [sessionId, setSessionId] = useState(null);
  const [zoomConnected, setZoomConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const participantVideosRef = useRef({});
  const participantCanvasRef = useRef({});

  // Tracking state
  const [isTracking, setIsTracking] = useState(false);
  const [sessionStats, setSessionStats] = useState(null);
  const [participantEmotions, setParticipantEmotions] = useState({});
  const trackingIntervalRef = useRef(null);
  const participantMonitorRef = useRef(null);

  // UI state
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      cleanup();
    };
  }, []);

  const cleanup = () => {
    stopTracking();
    if (participantMonitorRef.current) {
      clearInterval(participantMonitorRef.current);
    }
    if (zoomConnected) {
      zoomService.leaveSession();
    }
    if (sessionId) {
      socketService.disconnect();
    }
  };

  // ============================================
  // MEETING SETUP
  // ============================================

  const parseInvitationLink = (link) => {
    try {
      // Example Zoom invitation link formats:
      // https://zoom.us/j/1234567890?pwd=abcdef
      // https://us05web.zoom.us/j/1234567890?pwd=abcdef
      // Meeting ID: 123 456 7890, Passcode: abcdef

      let extractedMeetingId = '';
      let extractedPasscode = '';

      // Try to extract from URL format
      const urlMatch = link.match(/zoom\.us\/j\/(\d+)/);
      if (urlMatch) {
        extractedMeetingId = urlMatch[1];

        // Try to extract passcode from URL parameter
        const pwdMatch = link.match(/pwd=([^&\s]+)/);
        if (pwdMatch) {
          extractedPasscode = pwdMatch[1];
        }
      } else {
        // Try to extract from text format: "Meeting ID: 123 456 7890"
        const idMatch = link.match(/Meeting\s+ID[:\s]+(\d[\d\s]+\d)/i);
        if (idMatch) {
          extractedMeetingId = idMatch[1].replace(/\s/g, '');
        }

        // Try to extract passcode from text format: "Passcode: abcdef"
        const passMatch = link.match(/Passcode[:\s]+([^\s\n]+)/i);
        if (passMatch) {
          extractedPasscode = passMatch[1];
        }
      }

      return {
        meetingId: extractedMeetingId,
        passcode: extractedPasscode
      };
    } catch (error) {
      console.error('Error parsing invitation link:', error);
      return { meetingId: '', passcode: '' };
    }
  };

  const handleParseLink = () => {
    if (!invitationLink.trim()) {
      alert('Please paste a Zoom invitation link');
      return;
    }

    const parsed = parseInvitationLink(invitationLink);

    if (!parsed.meetingId) {
      alert('Could not extract meeting ID from the link. Please check the format or use manual input.');
      return;
    }

    // Populate fields with parsed data
    setMeetingId(parsed.meetingId);
    setSessionName(parsed.meetingId); // Use meeting ID as session name
    setSessionPassword(parsed.passcode);

    alert(`Meeting ID: ${parsed.meetingId}\nPasscode: ${parsed.passcode || 'None'}\n\nClick "Join & Start Tracking" to continue.`);
  };

  const handleJoinMeeting = async () => {
    // Validate based on input mode
    if (inputMode === 'link') {
      if (!invitationLink.trim()) {
        alert('Please paste a Zoom invitation link or switch to manual input');
        return;
      }
      // Parse the link if not already parsed
      if (!sessionName.trim()) {
        handleParseLink();
        return;
      }
    }

    if (!meetingName.trim()) {
      alert('Please enter a meeting name');
      return;
    }

    const finalSessionName = sessionName.trim() || meetingId.trim();
    if (!finalSessionName) {
      alert('Please provide a session name or meeting ID');
      return;
    }

    setLoading(true);

    try {
      // Step 1: Create tracking session in backend
      console.log('Creating tracking session...');
      const newSessionId = `zoom_${Date.now()}`;
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

      // Step 3: Join Zoom session with timeout
      console.log('Joining Zoom session:', finalSessionName);
      console.log('Session details:', { finalSessionName, userName, hasPassword: !!sessionPassword });

      // Add timeout wrapper
      const joinWithTimeout = (timeout = 15000) => {
        return Promise.race([
          zoomService.joinSession(finalSessionName, userName, sessionPassword, 1),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Connection timeout - unable to join session after 15 seconds')), timeout)
          )
        ]);
      };

      let zoomResult;
      try {
        zoomResult = await joinWithTimeout();
        console.log('Zoom join result:', zoomResult);
      } catch (timeoutError) {
        console.error('Zoom join timeout or error:', timeoutError);
        throw new Error(`Unable to connect to Zoom session.\n\nPossible reasons:\n• Invalid session name or meeting ID\n• Network connectivity issues\n• Zoom Video SDK credentials not configured\n\nTechnical details: ${timeoutError.message}`);
      }

      if (!zoomResult || !zoomResult.success) {
        throw new Error(zoomResult?.message || 'Failed to join Zoom session - no response received');
      }

      setZoomConnected(true);
      setSetupComplete(true);

      // Step 4: Start monitoring participants
      startParticipantMonitoring();

      // Step 5: Auto-start tracking
      setTimeout(() => {
        startTracking();
      }, 2000);

      console.log('Successfully joined meeting and started tracking!');
    } catch (error) {
      console.error('Error joining meeting:', error);

      // More user-friendly error message
      const errorMessage = error.message.includes('timeout') || error.message.includes('Unable to connect')
        ? error.message
        : `Failed to join meeting: ${error.message}\n\nNote: This app uses Zoom Video SDK, not regular Zoom meetings. Please ensure you're using a Video SDK session name.`;

      alert(errorMessage);
      cleanup();
    } finally {
      setLoading(false);
    }
  };

  // ============================================
  // PARTICIPANT MONITORING
  // ============================================

  const startParticipantMonitoring = () => {
    // Monitor participants every 3 seconds
    participantMonitorRef.current = setInterval(() => {
      const currentParticipants = zoomService.getParticipants();

      console.log(`Detected ${currentParticipants.length} participants`);

      setParticipants(currentParticipants);

      // Render video for new participants
      currentParticipants.forEach(participant => {
        if (!participantVideosRef.current[participant.userId]) {
          renderParticipantVideo(participant);
        }
      });
    }, 3000);
  };

  const renderParticipantVideo = async (participant) => {
    try {
      // Create video element if it doesn't exist
      let videoElement = document.getElementById(`participant-video-${participant.userId}`);

      if (!videoElement) {
        videoElement = document.createElement('video');
        videoElement.id = `participant-video-${participant.userId}`;
        videoElement.setAttribute('data-user-id', participant.userId);
        videoElement.autoplay = true;
        videoElement.playsInline = true;
        videoElement.style.display = 'none'; // Hidden, only for capture
        document.body.appendChild(videoElement);
      }

      // Render video stream
      await zoomService.stream.renderVideo(
        videoElement,
        participant.userId,
        640,
        480,
        0, 0, 3
      );

      participantVideosRef.current[participant.userId] = videoElement;

      // Create canvas for capturing frames
      if (!participantCanvasRef.current[participant.userId]) {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        participantCanvasRef.current[participant.userId] = canvas;
      }

      console.log(`Rendered video for: ${participant.displayName}`);
    } catch (error) {
      console.error(`Error rendering video for ${participant.displayName}:`, error);
    }
  };

  // ============================================
  // VIDEO FRAME CAPTURE
  // ============================================

  const captureParticipantFrame = async (participant) => {
    try {
      const videoElement = participantVideosRef.current[participant.userId];
      const canvas = participantCanvasRef.current[participant.userId];

      if (!videoElement || !canvas) {
        console.warn(`No video/canvas for ${participant.displayName}`);
        return null;
      }

      // Check if video is ready
      if (videoElement.readyState < 2) {
        return null;
      }

      const ctx = canvas.getContext('2d');
      ctx.drawImage(videoElement, 0, 0, 640, 480);

      return canvas.toDataURL('image/jpeg', 0.7);
    } catch (error) {
      console.error(`Error capturing frame for ${participant.displayName}:`, error);
      return null;
    }
  };

  // ============================================
  // EMOTION TRACKING
  // ============================================

  const startTracking = () => {
    console.log('Starting emotion tracking for all participants...');
    setIsTracking(true);

    trackingIntervalRef.current = setInterval(async () => {
      await analyzeAllParticipants();
    }, 4000); // Analyze every 4 seconds (adjustable)
  };

  const analyzeAllParticipants = async () => {
    if (participants.length === 0) {
      console.log('No participants to analyze yet');
      return;
    }

    console.log(`Analyzing ${participants.length} participants...`);

    // Process all participants in parallel
    const promises = participants.map(async (participant) => {
      try {
        const imageData = await captureParticipantFrame(participant);

        if (imageData) {
          const response = await emotionAPI.analyzeEmotion(
            sessionId,
            participant.userId,
            imageData
          );

          if (response.success) {
            console.log(
              `${participant.displayName}: ${response.emotion} (${(response.confidence * 100).toFixed(1)}%)`
            );

            // Update participant-specific emotion state
            setParticipantEmotions(prev => ({
              ...prev,
              [participant.userId]: {
                emotion: response.emotion,
                confidence: response.confidence,
                timestamp: new Date().toISOString()
              }
            }));
          }
        }
      } catch (error) {
        console.error(`Error analyzing ${participant.displayName}:`, error);
      }
    });

    await Promise.all(promises);

    // Fetch updated session stats
    fetchSessionStats();
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

  // ============================================
  // SESSION CONTROLS
  // ============================================

  const handleEndSession = async () => {
    if (window.confirm('Are you sure you want to end this session and leave the meeting?')) {
      stopTracking();

      try {
        // Stop tracking session
        if (sessionId) {
          const response = await sessionAPI.stopSession(sessionId);
          if (response.success) {
            // Leave Zoom
            await zoomService.leaveSession();

            // Navigate to report
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
  // RENDER
  // ============================================

  if (!setupComplete) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center mb-6">
            <div className="bg-blue-600 rounded-full p-4 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <h1 className="text-3xl font-bold text-gray-900 mb-2">Join Zoom Meeting</h1>
            <p className="text-gray-600">Enter meeting details to start emotion tracking</p>
          </div>

          <div className="space-y-4">
            {/* Input Mode Toggle */}
            <div className="flex gap-2 p-1 bg-gray-100 rounded-lg">
              <button
                onClick={() => setInputMode('link')}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                  inputMode === 'link'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                Invitation Link
              </button>
              <button
                onClick={() => setInputMode('manual')}
                className={`flex-1 px-4 py-2 rounded-md font-medium transition-colors ${
                  inputMode === 'manual'
                    ? 'bg-blue-600 text-white shadow'
                    : 'text-gray-700 hover:bg-gray-200'
                }`}
              >
                Manual Input
              </button>
            </div>

            {/* Meeting Name (Always shown) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Meeting Name
              </label>
              <input
                type="text"
                placeholder="e.g., Math Class - Chapter 5"
                value={meetingName}
                onChange={(e) => setMeetingName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            {/* Invitation Link Mode */}
            {inputMode === 'link' && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Zoom Invitation Link
                </label>
                <textarea
                  rows="4"
                  placeholder="Paste your Zoom invitation link or text here&#10;&#10;Examples:&#10;https://zoom.us/j/1234567890?pwd=abc123&#10;&#10;Or paste the full invitation email with Meeting ID and Passcode"
                  value={invitationLink}
                  onChange={(e) => setInvitationLink(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
                />
                <button
                  onClick={handleParseLink}
                  className="mt-2 w-full px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  Parse Link
                </button>
                {sessionName && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded-lg">
                    <p className="text-xs font-semibold text-green-800 mb-1">Extracted:</p>
                    <p className="text-xs text-green-700">Meeting ID: {meetingId || sessionName}</p>
                    {sessionPassword && (
                      <p className="text-xs text-green-700">Passcode: {sessionPassword}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Manual Input Mode */}
            {inputMode === 'manual' && (
              <>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Zoom Session Name / Meeting ID
                  </label>
                  <input
                    type="text"
                    placeholder="e.g., my-class-session or 1234567890"
                    value={sessionName}
                    onChange={(e) => setSessionName(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Enter the Zoom meeting ID or custom session name
                  </p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Meeting Passcode (Optional)
                  </label>
                  <input
                    type="text"
                    placeholder="Leave blank if not required"
                    value={sessionPassword}
                    onChange={(e) => setSessionPassword(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  />
                </div>
              </>
            )}

            {/* Your Name (Always shown) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Your Name
              </label>
              <input
                type="text"
                placeholder="Teacher"
                value={userName}
                onChange={(e) => setUserName(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              />
            </div>

            <button
              onClick={handleJoinMeeting}
              disabled={loading}
              className="w-full px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-semibold disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-5 w-5 mr-2" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Connecting...
                </>
              ) : (
                <>
                  <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                  </svg>
                  Join & Start Tracking
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

          {/* Important Notice */}
          <div className="mt-6 p-4 bg-yellow-50 border-l-4 border-yellow-400 rounded">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-semibold text-yellow-800">Important: Zoom Video SDK Required</h3>
                <div className="mt-2 text-xs text-yellow-700">
                  <p className="mb-1">This app uses <strong>Zoom Video SDK</strong>, not regular Zoom meetings.</p>
                  <p className="mb-1"><strong>For Testing:</strong> Use a custom session name (e.g., "test-session-123")</p>
                  <p><strong>Not Supported:</strong> Regular Zoom meeting IDs (10-11 digits from zoom.us meetings won't work)</p>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-4 p-4 bg-blue-50 rounded-lg">
            <h3 className="text-sm font-semibold text-blue-900 mb-2">How it works:</h3>
            <ul className="text-xs text-blue-800 space-y-1">
              <li>• <strong>Invitation Link:</strong> Paste Zoom link/email and auto-extract details</li>
              <li>• <strong>Manual Input:</strong> Enter meeting ID and passcode directly</li>
              <li>• Joins your Zoom Video SDK session automatically</li>
              <li>• Captures all participant video streams</li>
              <li>• Analyzes emotions in real-time</li>
              <li>• Shows floating stats window during meeting</li>
              <li>• Generates detailed report after session</li>
            </ul>
          </div>
        </div>
      </div>
    );
  }

  // ============================================
  // MEETING IN PROGRESS VIEW
  // ============================================

  return (
    <div className="min-h-screen bg-gray-900">
      {/* Top Bar */}
      <div className="bg-gray-800 border-b border-gray-700 px-4 py-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              {isTracking && (
                <span className="w-3 h-3 bg-red-600 rounded-full animate-pulse"></span>
              )}
              <span className="text-white font-semibold">{meetingName}</span>
            </div>
            <span className="text-gray-400 text-sm">
              {participants.length} participant{participants.length !== 1 ? 's' : ''}
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
              {isTracking ? 'Pause Tracking' : 'Resume Tracking'}
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

      {/* Participant Grid */}
      <div className="p-4">
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {participants.length === 0 ? (
            <div className="col-span-full flex flex-col items-center justify-center py-20">
              <svg className="w-16 h-16 text-gray-600 mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              <p className="text-gray-400 text-lg">Waiting for participants to join...</p>
              <p className="text-gray-500 text-sm mt-2">
                Emotion tracking will start automatically when participants join
              </p>
            </div>
          ) : (
            participants.map(participant => {
              const emotion = participantEmotions[participant.userId];
              return (
                <div key={participant.userId} className="relative bg-gray-800 rounded-lg overflow-hidden aspect-video">
                  {/* Participant name */}
                  <div className="absolute top-2 left-2 right-2 z-10">
                    <div className="bg-black/60 backdrop-blur-sm rounded px-2 py-1 flex items-center justify-between">
                      <span className="text-white text-sm font-medium truncate">
                        {participant.displayName}
                      </span>
                      {isTracking && emotion && (
                        <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded ml-2">
                          {emotion.emotion}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Emotion indicator */}
                  {emotion && (
                    <div className="absolute bottom-2 right-2 z-10">
                      <div className="bg-black/60 backdrop-blur-sm rounded-full px-3 py-1 text-white text-xs font-medium">
                        {(emotion.confidence * 100).toFixed(0)}% confident
                      </div>
                    </div>
                  )}

                  {/* Placeholder (video elements are hidden in DOM) */}
                  <div className="w-full h-full flex items-center justify-center bg-gray-700">
                    <svg className="w-12 h-12 text-gray-500" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 9a3 3 0 100-6 3 3 0 000 6zm-7 9a7 7 0 1114 0H3z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Floating Statistics Window */}
      {setupComplete && sessionStats && (
        <FloatingStatsWindow
          stats={sessionStats}
          participants={participants}
          isMinimized={isFloatingMinimized}
          onToggleMinimize={() => setIsFloatingMinimized(!isFloatingMinimized)}
        />
      )}
    </div>
  );
};

export default ZoomMeetingLive;
