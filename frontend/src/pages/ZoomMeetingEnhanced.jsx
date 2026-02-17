import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionAPI, emotionAPI } from '../services/api';
import socketService from '../services/socket';
import zoomService from '../services/zoomService';
import EmotionStats from '../components/EmotionStats';
import EmotionChart from '../components/EmotionChart';
import { Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement } from 'chart.js';

// Register ChartJS components
ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, ArcElement);

/**
 * ENHANCED VERSION with Zoom Meeting Integration
 *
 * This component supports TWO MODES:
 * 1. Standalone Mode: Uses local webcam (for testing)
 * 2. Zoom Meeting Mode: Integrates with actual Zoom meetings
 */

const ZoomMeetingEnhanced = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  // Mode selection
  const [mode, setMode] = useState('standalone'); // 'standalone' or 'zoom'

  // Standalone mode refs
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const [stream, setStream] = useState(null);

  // Zoom mode state
  const [zoomSessionName, setZoomSessionName] = useState('');
  const [zoomConnected, setZoomConnected] = useState(false);
  const [participants, setParticipants] = useState([]);
  const participantVideosRef = useRef({});

  // Common state
  const [isTracking, setIsTracking] = useState(false);
  const [sessionStats, setSessionStats] = useState(null);
  const [alert, setAlert] = useState(null);
  const [emotionHistory, setEmotionHistory] = useState([]);
  const [participantEmotions, setParticipantEmotions] = useState({});
  const [emotionTimeline, setEmotionTimeline] = useState([]);
  const trackingIntervalRef = useRef(null);
  const timelineDataRef = useRef([]);
  const MAX_TIMELINE_POINTS = 20; // Keep last 20 data points for the timeline

  useEffect(() => {
    // Connect to WebSocket
    socketService.connect();
    socketService.joinSession(sessionId);

    // Listen for emotion updates
    const handleEmotionUpdate = (data) => {
      console.log('Emotion update:', data);
      
      // Update participant emotions
      setParticipantEmotions(prev => ({
        ...prev,
        [data.participantId]: {
          ...data,
          timestamp: new Date()
        }
      }));

      // Update timeline data
      const timestamp = new Date().toLocaleTimeString();
      const newTimelineData = [...timelineDataRef.current, { ...data, timestamp }];
      
      // Keep only the last MAX_TIMELINE_POINTS
      if (newTimelineData.length > MAX_TIMELINE_POINTS) {
        newTimelineData.shift();
      }
      
      timelineDataRef.current = newTimelineData;
      setEmotionTimeline(newTimelineData);
      
      fetchSessionStats();
    };

    socketService.onEmotionUpdate(handleEmotionUpdate);
    
    // Cleanup on unmount
    return () => {
      socketService.offEmotionUpdate(handleEmotionUpdate);
    };

    return () => {
      stopTracking();
      cleanup();
      socketService.disconnect();
    };
  }, [sessionId]);

  const cleanup = () => {
    // Cleanup standalone webcam
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
    }

    // Cleanup Zoom connection
    if (zoomConnected) {
      zoomService.leaveSession();
    }
  };

  // ============================================
  // STANDALONE MODE FUNCTIONS
  // ============================================

  const startStandaloneMode = async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
        audio: false
      });
      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
      }
      console.log('Standalone webcam started');
    } catch (error) {
      console.error('Error accessing webcam:', error);
      alert('Failed to access webcam. Please check your permissions.');
    }
  };

  const captureFrameStandalone = () => {
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

  // ============================================
  // ZOOM MODE FUNCTIONS
  // ============================================

  const joinZoomMeeting = async () => {
    if (!zoomSessionName.trim()) {
      alert('Please enter a Zoom session name');
      return;
    }

    try {
      console.log('Joining Zoom session:', zoomSessionName);

      const result = await zoomService.joinSession(
        zoomSessionName,
        'Teacher',  // userName
        '',         // password (if required)
        1           // role: 1 = host
      );

      if (result.success) {
        setZoomConnected(true);
        console.log('Connected to Zoom session');

        // Start video for teacher
        await zoomService.startVideo(document.getElementById('teacher-video'));

        // Listen for participant changes
        startParticipantMonitoring();
      } else {
        alert('Failed to join Zoom session: ' + result.message);
      }
    } catch (error) {
      console.error('Error joining Zoom:', error);
      alert('Failed to connect to Zoom: ' + error.message);
    }
  };

  const startParticipantMonitoring = () => {
    // Monitor participants every 5 seconds
    const monitorInterval = setInterval(() => {
      const currentParticipants = zoomService.getParticipants();
      setParticipants(currentParticipants);

      console.log(`Monitoring ${currentParticipants.length} participants`);

      // Render video for each participant
      currentParticipants.forEach(participant => {
        if (!participantVideosRef.current[participant.userId]) {
          renderParticipantVideo(participant);
        }
      });
    }, 5000);

    return () => clearInterval(monitorInterval);
  };

  const renderParticipantVideo = async (participant) => {
    const videoElement = document.getElementById(`participant-${participant.userId}`);
    if (videoElement) {
      try {
        await zoomService.stream.renderVideo(
          videoElement,
          participant.userId,
          videoElement.offsetWidth,
          videoElement.offsetHeight,
          0, 0, 3
        );
        participantVideosRef.current[participant.userId] = true;
        console.log(`Rendered video for participant: ${participant.displayName}`);
      } catch (error) {
        console.error('Error rendering participant video:', error);
      }
    }
  };

  const captureParticipantFrame = async (participant) => {
    try {
      const imageData = await zoomService.captureVideoFrame(participant.userId);
      return imageData;
    } catch (error) {
      console.error(`Error capturing frame for ${participant.displayName}:`, error);
      return null;
    }
  };

  // ============================================
  // TRACKING FUNCTIONS (Both Modes)
  // ============================================

  const startTracking = () => {
    setIsTracking(true);

    trackingIntervalRef.current = setInterval(async () => {
      if (mode === 'standalone') {
        await trackStandaloneMode();
      } else if (mode === 'zoom') {
        await trackZoomMode();
      }
    }, 3000); // Analyze every 3 seconds
  };

  const trackStandaloneMode = async () => {
    const imageData = captureFrameStandalone();
    if (imageData) {
      try {
        const response = await emotionAPI.analyzeEmotion(
          sessionId,
          'participant_1',
          imageData
        );

        if (response.success) {
          console.log('Emotion detected:', response.emotion);
        }
      } catch (error) {
        console.error('Error analyzing emotion:', error);
      }
    }
  };

  const trackZoomMode = async () => {
    // Process all participants in parallel
    const promises = participants.map(async (participant) => {
      const imageData = await captureParticipantFrame(participant);

      if (imageData) {
        try {
          const response = await emotionAPI.analyzeEmotion(
            sessionId,
            participant.userId,
            imageData
          );

          if (response.success) {
            console.log(`${participant.displayName}: ${response.emotion} (${response.confidence}%)`);
          }
        } catch (error) {
          console.error(`Error analyzing ${participant.displayName}:`, error);
        }
      }
    });

    await Promise.all(promises);
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
        // Calculate engagement score based on recent emotions
        const recentEmotions = emotionTimeline.slice(-10); // Last 10 emotions
        const positiveEmotions = ['happy', 'surprise'];
        const negativeEmotions = ['sad', 'angry', 'fear', 'disgust'];
        
        let positiveCount = 0;
        let negativeCount = 0;
        
        recentEmotions.forEach(emotion => {
          if (positiveEmotions.includes(emotion.emotion)) {
            positiveCount++;
          } else if (negativeEmotions.includes(emotion.emotion)) {
            negativeCount++;
          }
        });
        
        const total = recentEmotions.length || 1;
        const engagementScore = Math.max(0, Math.min(100, 50 + ((positiveCount - negativeCount) / total) * 50));
        
        setSessionStats({
          ...response,
          engagement_score: engagementScore,
          participant_count: Object.keys(participantEmotions).length
        });
        
        if (response.alert) {
          setAlert(response.alert);
        }
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

  // Initialize based on mode
  useEffect(() => {
    if (mode === 'standalone') {
      startStandaloneMode();
    }
  }, [mode]);

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header */}
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                Live Session {mode === 'zoom' && zoomConnected && '(Zoom Connected)'}
              </h1>
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

      {/* Mode Selection */}
      {!zoomConnected && (
        <div className="bg-white border-b">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <div className="flex items-center space-x-4">
              <span className="text-sm font-medium text-gray-700">Mode:</span>
              <button
                onClick={() => setMode('standalone')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  mode === 'standalone'
                    ? 'bg-zoom-blue text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Standalone (Webcam)
              </button>
              <button
                onClick={() => setMode('zoom')}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                  mode === 'zoom'
                    ? 'bg-zoom-blue text-white'
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Zoom Meeting
              </button>
            </div>
          </div>
        </div>
      )}

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
          {/* Video Area */}
          <div className="lg:col-span-2">
            <div className="bg-white rounded-xl shadow-lg p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-gray-900">
                  {mode === 'standalone' ? 'Your Webcam' : 'Zoom Participants'}
                </h2>
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

              {/* Standalone Mode Video */}
              {mode === 'standalone' && (
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
              )}

              {/* Zoom Mode */}
              {mode === 'zoom' && !zoomConnected && (
                <div className="space-y-4">
                  <div className="p-6 bg-blue-50 rounded-lg border border-blue-200">
                    <h3 className="text-lg font-semibold text-gray-900 mb-4">Join Zoom Meeting</h3>
                    <div className="space-y-3">
                      <input
                        type="text"
                        placeholder="Enter Zoom session name"
                        value={zoomSessionName}
                        onChange={(e) => setZoomSessionName(e.target.value)}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-zoom-blue focus:border-transparent outline-none"
                      />
                      <button
                        onClick={joinZoomMeeting}
                        className="w-full px-6 py-3 bg-zoom-blue text-white rounded-lg hover:bg-blue-600 transition-colors font-semibold"
                      >
                        Join Zoom Session
                      </button>
                    </div>
                    <p className="mt-4 text-sm text-gray-600">
                      Enter a session name to create or join a Zoom Video SDK session.
                      Participant video streams will appear here.
                    </p>
                  </div>
                </div>
              )}

              {/* Zoom Mode - Participant Grid */}
              {mode === 'zoom' && zoomConnected && (
                <div>
                  <div id="teacher-video" className="hidden" />
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                    {participants.length === 0 ? (
                      <div className="col-span-full p-12 text-center bg-gray-50 rounded-lg">
                        <p className="text-gray-600">Waiting for participants to join...</p>
                      </div>
                    ) : (
                      participants.map(participant => (
                        <div key={participant.userId} className="relative bg-black rounded-lg overflow-hidden">
                          <video
                            id={`participant-${participant.userId}`}
                            data-user-id={participant.userId}
                            className="w-full h-48 object-cover"
                            autoPlay
                            playsInline
                          />
                          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/75 to-transparent p-2">
                            <p className="text-white text-sm font-medium">{participant.displayName}</p>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}

              {/* Control Buttons */}
              <div className="mt-4 flex justify-center space-x-4">
                {!isTracking ? (
                  <button
                    onClick={startTracking}
                    disabled={mode === 'zoom' && !zoomConnected}
                    className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors font-semibold flex items-center disabled:opacity-50 disabled:cursor-not-allowed"
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
                {mode === 'standalone'
                  ? 'The system will analyze facial expressions every 3 seconds'
                  : `Tracking ${participants.length} participant${participants.length !== 1 ? 's' : ''}`
                }
              </p>
            </div>
          </div>

          {/* Statistics Panel */}
          <div className="space-y-6">
            {sessionStats && (
              <>
                <EmotionStats stats={sessionStats} />
                <EmotionChart emotionData={sessionStats.emotion_counts} />
                
                {/* Emotion Timeline Chart */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Emotion Timeline</h2>
                  <div className="h-64">
                    <EmotionTimelineChart data={emotionTimeline} />
                  </div>
                </div>
                
                {/* Participant Emotions */}
                <div className="bg-white rounded-xl shadow-lg p-6">
                  <h2 className="text-xl font-bold text-gray-900 mb-4">Participant Emotions</h2>
                  <div className="space-y-4">
                    {Object.entries(participantEmotions).map(([id, data]) => (
                      <div key={id} className="p-3 bg-gray-50 rounded-lg">
                        <div className="flex justify-between items-center">
                          <span className="font-medium">{data.participantName || `Participant ${id}`}</span>
                          <span className={`px-2 py-1 rounded-full text-sm font-medium ${
                            data.emotion === 'happy' ? 'bg-green-100 text-green-800' :
                            data.emotion === 'sad' ? 'bg-blue-100 text-blue-800' :
                            data.emotion === 'angry' ? 'bg-red-100 text-red-800' :
                            data.emotion === 'surprise' ? 'bg-yellow-100 text-yellow-800' :
                            data.emotion === 'fear' ? 'bg-purple-100 text-purple-800' :
                            data.emotion === 'disgust' ? 'bg-orange-100 text-orange-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {data.emotion || 'neutral'}
                          </span>
                        </div>
                        <div className="mt-2 text-sm text-gray-600">
                          Confidence: {data.confidence ? `${Math.round(data.confidence)}%` : 'N/A'}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      </main>
    </div>
  );
};

// Emotion Timeline Chart Component
const EmotionTimelineChart = ({ data }) => {
  const chartData = useMemo(() => {
    const labels = data.map((_, index) => `T-${data.length - index}`).reverse();
    
    // Group emotions by type
    const emotions = {};
    const emotionColors = {
      happy: '#10B981',
      sad: '#3B82F6',
      angry: '#EF4444',
      surprise: '#F59E0B',
      fear: '#8B5CF6',
      disgust: '#F97316',
      neutral: '#6B7280',
    };

    // Initialize emotion datasets
    Object.keys(emotionColors).forEach(emotion => {
      emotions[emotion] = Array(data.length).fill(0);
    });

    // Fill in the data
    data.forEach((entry, idx) => {
      if (entry.emotion) {
        emotions[entry.emotion][idx] = entry.confidence || 0;
      }
    });

    return {
      labels,
      datasets: Object.entries(emotions).map(([emotion, values]) => ({
        label: emotion.charAt(0).toUpperCase() + emotion.slice(1),
        data: values,
        borderColor: emotionColors[emotion],
        backgroundColor: `${emotionColors[emotion]}40`,
        borderWidth: 2,
        tension: 0.3,
        fill: true,
      })),
    };
  }, [data]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    scales: {
      y: {
        beginAtZero: true,
        max: 100,
        title: {
          display: true,
          text: 'Confidence %',
        },
      },
      x: {
        title: {
          display: true,
          text: 'Time',
        },
      },
    },
    plugins: {
      legend: {
        position: 'bottom',
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            return `${label}: ${value.toFixed(1)}%`;
          },
        },
      },
    },
  };

  return <Line data={chartData} options={options} />;
};

export default ZoomMeetingEnhanced;
