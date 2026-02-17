import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionAPI, emotionAPI } from '../services/api';
import socketService from '../services/socket';
import FloatingStatsWindow from '../components/FloatingStatsWindow';

/**
 * ZOOM BOT - Professional Meeting Analytics
 *
 * User provides Zoom meeting link → Bot joins automatically
 * Bot captures all participant video streams in real-time
 * Performs emotion detection on all faces simultaneously
 * Shows live statistics dashboard
 */

const ZoomBot = () => {
  const navigate = useNavigate();

  // Meeting input
  const [meetingId, setMeetingId] = useState('');
  const [passcode, setPasscode] = useState('');
  const [sessionName, setSessionName] = useState('');

  // Bot state
  const [botStatus, setBotStatus] = useState('idle'); // idle, connecting, joined, analyzing, error
  const [botId, setBotId] = useState(null);

  // Session tracking
  const [sessionId, setSessionId] = useState(null);
  const [participants, setParticipants] = useState([]);
  const [sessionStats, setSessionStats] = useState(null);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [view, setView] = useState('setup'); // setup, loading, dashboard, error
  const [isFloatingMinimized, setIsFloatingMinimized] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('Initializing...');

  // Refs
  const statsIntervalRef = useRef(null);

  // ============================================
  // BOT CONTROL
  // ============================================

  const handleStartBot = async () => {
    // Validation - both meeting ID and passcode are mandatory
    if (!meetingId.trim()) {
      alert('Please enter a Zoom meeting ID');
      return;
    }

    if (!passcode.trim()) {
      alert('Please enter the meeting passcode');
      return;
    }

    if (!sessionName.trim()) {
      alert('Please enter a session name for your records');
      return;
    }

    setLoading(true);
    setError(null);
    setBotStatus('connecting');
    setView('loading'); // Show loading screen
    setLoadingStatus('Creating tracking session...');

    try {
      // Step 1: Create tracking session
      console.log('📊 Creating tracking session...');
      const sessionResponse = await sessionAPI.startSession(sessionName);

      if (!sessionResponse.success) {
        throw new Error('Failed to create tracking session');
      }

      setSessionId(sessionResponse.session_id);
      setLoadingStatus('Connecting to real-time updates...');

      // Step 2: Connect to WebSocket
      console.log('🔌 Connecting to WebSocket...');
      socketService.connect();
      socketService.joinSession(sessionResponse.session_id);

      // Listen for emotion updates
      socketService.onEmotionUpdate((data) => {
        console.log('💓 Emotion update:', data);
        if (data.participants) {
          setParticipants(data.participants);
        }
        fetchSessionStats();
      });

      // Listen for bot status updates
      socketService.socket.on('status', (data) => {
        console.log('🤖 Bot status update:', data);
        if (data.status) {
          setBotStatus(data.status);

          // Update loading status based on bot status
          if (data.status === 'initializing') {
            setLoadingStatus('Starting browser...');
          } else if (data.status === 'joining') {
            setLoadingStatus('Opening Zoom meeting...');
          } else if (data.status === 'configuring') {
            setLoadingStatus('Enabling gallery view...');
          } else if (data.status === 'active') {
            setLoadingStatus('Bot joined! Starting analysis...');
            // Switch to dashboard only when bot is active
            setTimeout(() => {
              setView('dashboard');
              setLoading(false);
            }, 2000);
          }
        }
        if (data.message) {
          console.log('📢', data.message);
          setLoadingStatus(data.message);
        }
      });

      // Listen for bot errors
      socketService.socket.on('error', (data) => {
        console.error('❌ Bot error:', data);
        setError(data.error || data.message || 'Bot encountered an error');
        setBotStatus('error');
      });

      // Step 3: Prepare request body with meeting ID and passcode
      let requestBody = {
        session_id: sessionResponse.session_id,
        session_name: sessionName,
        meeting_id: meetingId.trim().replace(/[\s-]/g, ''), // Remove spaces and dashes
        meeting_password: passcode.trim(),
      };

      // Step 4: Send bot to join meeting
      console.log('🤖 Sending bot to join meeting...');
      setLoadingStatus('Sending bot to join meeting...');

      const response = await fetch('http://localhost:5000/api/zoom-desktop-bot/join', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(requestBody)
      });

      const data = await response.json();

      // Check for errors
      if (data.error || !data.bot_id) {
        throw new Error(data.error || data.message || 'Failed to start bot');
      }

      console.log('✅ Bot started:', data.bot_id);
      console.log('📊 Bot status:', data.status, '-', data.message);
      setBotId(data.bot_id);
      setBotStatus(data.status || 'starting');

      // Don't switch to dashboard yet - wait for 'active' status from WebSocket
      setLoadingStatus('Bot is joining the meeting...');

      // Start polling for stats (but dashboard won't show until bot is active)
      startStatsPolling();

    } catch (error) {
      console.error('❌ Error starting bot:', error);
      setError(error.message);
      setBotStatus('error');
      setView('error');
      setLoading(false);
    }
    // Don't set loading to false here - wait for bot to be active
  };

  const handleStopBot = async () => {
    if (!window.confirm('Are you sure you want to stop the bot and end this session?')) {
      return;
    }

    try {
      // Stop bot
      if (botId) {
        await fetch(`http://localhost:5000/api/zoom-desktop-bot/leave/${botId}`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });
      }

      // Stop session
      if (sessionId) {
        const response = await sessionAPI.stopSession(sessionId);
        if (response.success) {
          navigate(`/report/${sessionId}`);
        }
      }

      cleanup();
    } catch (error) {
      console.error('Error stopping bot:', error);
      navigate('/dashboard');
    }
  };

  // ============================================
  // STATISTICS & UPDATES
  // ============================================

  const startStatsPolling = () => {
    // Poll for stats every 3 seconds
    statsIntervalRef.current = setInterval(() => {
      fetchSessionStats();
      fetchParticipants();
    }, 3000);

    // Initial fetch
    fetchSessionStats();
    fetchParticipants();
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

  const fetchParticipants = async () => {
    if (!botId) return;

    try {
      const response = await fetch(`http://localhost:5000/api/zoom-desktop-bot/participants/${botId}`, {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      const data = await response.json();

      if (data.success) {
        setParticipants(data.participants || []);
      }
    } catch (error) {
      console.error('Error fetching participants:', error);
    }
  };

  const cleanup = () => {
    if (statsIntervalRef.current) {
      clearInterval(statsIntervalRef.current);
    }
    if (sessionId) {
      socketService.disconnect();
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [sessionId]);

  // Page title
  useEffect(() => {
    if (view === 'dashboard' && sessionName) {
      document.title = `Live Dashboard - ${sessionName}`;
    } else {
      document.title = 'Zoom Bot Setup - Emotion Tracker';
    }
  }, [view, sessionName]);

  // ============================================
  // RENDER: LOADING SCREEN
  // ============================================

  if (view === 'loading') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
          <div className="text-center">
            {/* Animated Robot Icon */}
            <div className="relative mx-auto mb-6">
              <div className="bg-blue-600 rounded-full p-6 w-20 h-20 mx-auto flex items-center justify-center animate-pulse">
                <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
              </div>
              {/* Spinning loader around icon */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="w-24 h-24 border-4 border-blue-200 border-t-blue-600 rounded-full animate-spin"></div>
              </div>
            </div>

            <h1 className="text-2xl font-bold text-gray-900 mb-2">Bot is Joining Meeting</h1>
            <p className="text-blue-600 font-medium mb-6">{loadingStatus}</p>

            {/* Progress Steps */}
            <div className="space-y-3 text-left mb-6">
              <div className={`flex items-center space-x-3 ${botStatus === 'initializing' || botStatus === 'joining' || botStatus === 'configuring' || botStatus === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${botStatus === 'initializing' || botStatus === 'joining' || botStatus === 'configuring' || botStatus === 'active' ? 'bg-green-600' : 'bg-gray-300'}`}>
                  {(botStatus === 'joining' || botStatus === 'configuring' || botStatus === 'active') ? (
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  )}
                </div>
                <span className="text-sm font-medium">Starting browser</span>
              </div>

              <div className={`flex items-center space-x-3 ${botStatus === 'joining' || botStatus === 'configuring' || botStatus === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${botStatus === 'joining' || botStatus === 'configuring' || botStatus === 'active' ? 'bg-green-600' : 'bg-gray-300'}`}>
                  {(botStatus === 'configuring' || botStatus === 'active') ? (
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  )}
                </div>
                <span className="text-sm font-medium">Joining Zoom meeting</span>
              </div>

              <div className={`flex items-center space-x-3 ${botStatus === 'configuring' || botStatus === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${botStatus === 'configuring' || botStatus === 'active' ? 'bg-green-600' : 'bg-gray-300'}`}>
                  {botStatus === 'active' ? (
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  )}
                </div>
                <span className="text-sm font-medium">Enabling gallery view</span>
              </div>

              <div className={`flex items-center space-x-3 ${botStatus === 'active' ? 'text-green-600' : 'text-gray-400'}`}>
                <div className={`w-6 h-6 rounded-full flex items-center justify-center ${botStatus === 'active' ? 'bg-green-600' : 'bg-gray-300'}`}>
                  {botStatus === 'active' ? (
                    <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                  ) : (
                    <div className="w-2 h-2 bg-white rounded-full"></div>
                  )}
                </div>
                <span className="text-sm font-medium">Starting emotion analysis</span>
              </div>
            </div>

            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-800">
                This may take 30-60 seconds. Please wait while the bot joins and configures the meeting view.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

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
              setBotStatus('idle');
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
  // RENDER: DASHBOARD (Bot Active)
  // ============================================

  if (view === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-900">
        {/* Top Bar */}
        <div className="bg-gray-800 border-b border-gray-700 px-4 py-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <div className="flex items-center space-x-2">
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
                <span className="text-white font-semibold">{sessionName}</span>
              </div>
              <span className="text-gray-400 text-sm">
                🤖 Bot: <span className="capitalize">{botStatus}</span>
              </span>
              <span className="text-gray-400 text-sm">
                👥 {participants.length} participant{participants.length !== 1 ? 's' : ''}
              </span>
            </div>

            <button
              onClick={handleStopBot}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors font-semibold"
            >
              Stop Bot & End Session
            </button>
          </div>
        </div>

        {/* Main Content */}
        <div className="max-w-7xl mx-auto px-4 py-8">
          {/* Status Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            {/* Bot Status */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-white font-semibold">Bot Status</h3>
                <div className="w-3 h-3 bg-green-500 rounded-full animate-pulse"></div>
              </div>
              <p className="text-3xl font-bold text-green-400 mb-2">Active</p>
              <p className="text-gray-400 text-sm">Analyzing participants in real-time</p>
            </div>

            {/* Total Detections */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-white font-semibold mb-4">Total Detections</h3>
              <p className="text-3xl font-bold text-blue-400 mb-2">
                {sessionStats?.total_detections || 0}
              </p>
              <p className="text-gray-400 text-sm">Faces analyzed</p>
            </div>

            {/* Engagement Score */}
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-white font-semibold mb-4">Engagement</h3>
              <p className="text-3xl font-bold text-purple-400 mb-2">
                {sessionStats?.engagement_score ? `${Math.round(sessionStats.engagement_score)}%` : 'N/A'}
              </p>
              <p className="text-gray-400 text-sm">Overall engagement level</p>
            </div>
          </div>

          {/* Participants Grid */}
          <div className="bg-gray-800 rounded-xl p-6 border border-gray-700 mb-8">
            <h3 className="text-white font-semibold mb-4 flex items-center">
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
              </svg>
              Active Participants
            </h3>

            {participants.length === 0 ? (
              <div className="text-center py-8">
                <svg className="w-16 h-16 text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                <p className="text-gray-400">Waiting for participants to join...</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {participants.map((participant, index) => (
                  <div key={index} className="bg-gray-700 rounded-lg p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-white font-medium">{participant.name || `Participant ${index + 1}`}</span>
                      <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                    </div>
                    <div className="text-sm text-gray-400">
                      {participant.current_emotion ? (
                        <span className="text-blue-400">😊 {participant.current_emotion}</span>
                      ) : (
                        <span>Analyzing...</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Emotion Statistics */}
          {sessionStats && sessionStats.emotion_counts && (
            <div className="bg-gray-800 rounded-xl p-6 border border-gray-700">
              <h3 className="text-white font-semibold mb-4">Emotion Distribution</h3>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
                {Object.entries(sessionStats.emotion_counts).map(([emotion, count]) => (
                  <div key={emotion} className="text-center">
                    <div className="text-2xl mb-2">
                      {emotion === 'happy' && '😊'}
                      {emotion === 'sad' && '😢'}
                      {emotion === 'angry' && '😠'}
                      {emotion === 'surprise' && '😲'}
                      {emotion === 'fear' && '😨'}
                      {emotion === 'disgust' && '🤢'}
                      {emotion === 'neutral' && '😐'}
                    </div>
                    <div className="text-white font-bold text-lg">{count}</div>
                    <div className="text-gray-400 text-xs capitalize">{emotion}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Floating Statistics Window */}
        {sessionStats && (
          <FloatingStatsWindow
            stats={sessionStats}
            participants={participants.map((p, i) => ({
              id: i,
              name: p.name || `Participant ${i + 1}`
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
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Decorative gradient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>
      <div className="relative z-10 bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 shadow-2xl p-8 max-w-6xl w-full">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-start">
          {/* Left column: How it works + notes */}
          <div>
            <div className="flex items-center mb-6">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl p-4 mr-4 shadow-xl">
                <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white">Zoom Meeting Analytics Bot</h1>
                <p className="text-purple-200">Add AI bot to your Zoom meeting for real-time emotion analysis</p>
              </div>
            </div>

            <div className="mb-6 p-6 bg-white/5 border border-white/10 rounded-xl">
              <h3 className="text-lg font-bold text-white mb-3">🤖 How It Works:</h3>
              <ul className="space-y-2 text-sm text-purple-100">
                <li className="flex items-start"><svg className="w-5 h-5 text-purple-300 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg><span><strong>Bot Joins Automatically</strong> - AI bot joins your meeting as a participant</span></li>
                <li className="flex items-start"><svg className="w-5 h-5 text-purple-300 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg><span><strong>Captures All Participants</strong> - Bot sees everyone in gallery view</span></li>
                <li className="flex items-start"><svg className="w-5 h-5 text-purple-300 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg><span><strong>Real-time Analysis</strong> - Analyzes emotions periodically</span></li>
                <li className="flex items-start"><svg className="w-5 h-5 text-purple-300 mr-2 mt-0.5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" /></svg><span><strong>Live Dashboard</strong> - See statistics update in real-time</span></li>
              </ul>
            </div>

            <div className="p-4 bg-white/5 border border-white/10 rounded">
              <h3 className="text-sm font-bold text-white mb-2">⚠️ Important Notes</h3>
              <ul className="text-xs text-purple-100 space-y-1">
                <li>• Bot will appear as a participant in your meeting</li>
                <li>• Inform participants that AI analysis is being performed</li>
                <li>• Participants' cameras must be ON for face detection</li>
                <li>• Meeting host may need to admit the bot if waiting room is enabled</li>
              </ul>
            </div>
          </div>

          {/* Right column: Input form */}
          <div>
            <div className="space-y-4 mb-2">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Session Name (For Your Records)</label>
                <input type="text" placeholder="e.g., Team Standup - Monday" value={sessionName} onChange={(e) => setSessionName(e.target.value)} className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all" />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Meeting ID <span className="text-red-500">*</span></label>
                <input type="text" placeholder="123 456 7890 or 1234567890" value={meetingId} onChange={(e) => setMeetingId(e.target.value)} required className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all" />
                <p className="text-xs text-purple-200 mt-1">Enter the 9, 10, or 11 digit meeting ID (required)</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">Passcode <span className="text-red-500">*</span></label>
                <input type="text" placeholder="Enter meeting passcode" value={passcode} onChange={(e) => setPasscode(e.target.value)} required className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all" />
                <p className="text-xs text-purple-200 mt-1">🔒 Meeting passcode is required</p>
              </div>
            </div>
            {/* Bottom buttons in two columns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
              <button onClick={handleStartBot} disabled={loading} className="w-full px-8 py-4 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white rounded-xl font-bold text-lg hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 transition-all shadow-2xl hover:shadow-3xl hover:scale-105 transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center relative overflow-hidden group">
                {loading ? (
                  <>
                    <svg className="animate-spin h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>
                    {botStatus === 'connecting' ? 'Connecting Bot...' : 'Starting...'}
                  </>
                ) : (
                  <>
                    <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></span>
                    <svg className="w-6 h-6 mr-2 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                    Add Bot to Meeting
                  </>
                )}
              </button>
              <button onClick={() => navigate('/dashboard')} className="w-full px-4 py-4 text-white bg-white/10 backdrop-blur-sm rounded-xl hover:bg-white/20 border border-white/20 transition-colors">← Back to Dashboard</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ZoomBot;
