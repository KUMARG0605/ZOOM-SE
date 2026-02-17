import { useState, useEffect } from 'react';

const FloatingStatsWindow = ({ stats, participants, isMinimized, onToggleMinimize }) => {
  const [position, setPosition] = useState({ x: window.innerWidth - 420, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  const handleMouseDown = (e) => {
    if (e.target.classList.contains('draggable-header')) {
      setIsDragging(true);
      setDragOffset({
        x: e.clientX - position.x,
        y: e.clientY - position.y
      });
    }
  };

  const handleMouseMove = (e) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragOffset.x,
        y: e.clientY - dragOffset.y
      });
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  // Attach global mouse listeners
  useEffect(() => {
    if (isDragging) {
      window.addEventListener('mousemove', handleMouseMove);
      window.addEventListener('mouseup', handleMouseUp);

      return () => {
        window.removeEventListener('mousemove', handleMouseMove);
        window.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, handleMouseMove, handleMouseUp]);

  if (!stats) return null;

  const emotionColors = {
    happy: 'bg-green-500',
    sad: 'bg-blue-500',
    angry: 'bg-red-500',
    surprise: 'bg-yellow-500',
    fear: 'bg-purple-500',
    disgust: 'bg-orange-500',
    neutral: 'bg-gray-500'
  };

  const emotionEmojis = {
    happy: '😊',
    sad: '😢',
    angry: '😠',
    surprise: '😲',
    fear: '😨',
    disgust: '🤢',
    neutral: '😐'
  };

  const getEngagementColor = (score) => {
    if (score >= 70) return 'text-green-600';
    if (score >= 40) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div
      style={{
        position: 'fixed',
        left: `${position.x}px`,
        top: `${position.y}px`,
        zIndex: 9999,
        width: isMinimized ? '250px' : '400px',
        maxHeight: isMinimized ? '60px' : '80vh',
        transition: isDragging ? 'none' : 'all 0.3s ease'
      }}
      className="bg-white rounded-xl shadow-2xl border-2 border-gray-300 overflow-hidden"
      onMouseDown={handleMouseDown}
    >
      {/* Header - Draggable */}
      <div className="draggable-header bg-gradient-to-r from-blue-600 to-blue-700 px-4 py-3 cursor-move select-none">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="w-3 h-3 bg-green-400 rounded-full animate-pulse"></div>
            <h3 className="text-white font-bold text-sm">Live Analytics</h3>
          </div>
          <button
            onClick={onToggleMinimize}
            className="text-white hover:bg-blue-800 rounded p-1 transition-colors"
          >
            {isMinimized ? (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            ) : (
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
              </svg>
            )}
          </button>
        </div>
      </div>

      {/* Content */}
      {!isMinimized && (
        <div className="p-4 overflow-y-auto max-h-[calc(80vh-60px)]">
          {/* Overall Stats */}
          <div className="mb-4">
            <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg p-3 mb-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-gray-600">Engagement Score</span>
                <span className={`text-2xl font-bold ${getEngagementColor(stats.engagement_score)}`}>
                  {Math.round(stats.engagement_score)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div
                  className={`h-2 rounded-full transition-all duration-500 ${
                    stats.engagement_score >= 70 ? 'bg-green-500' :
                    stats.engagement_score >= 40 ? 'bg-yellow-500' : 'bg-red-500'
                  }`}
                  style={{ width: `${stats.engagement_score}%` }}
                ></div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Total Detections</div>
                <div className="text-lg font-bold text-gray-900">{stats.total_detections}</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-2 text-center">
                <div className="text-xs text-gray-600">Participants</div>
                <div className="text-lg font-bold text-gray-900">{participants?.length || 0}</div>
              </div>
            </div>
          </div>

          {/* Alert */}
          {stats.alert && (
            <div className={`mb-4 p-3 rounded-lg ${
              stats.alert.level === 'high'
                ? 'bg-red-100 border border-red-300'
                : 'bg-yellow-100 border border-yellow-300'
            }`}>
              <div className="flex items-start space-x-2">
                <svg className={`w-5 h-5 mt-0.5 ${
                  stats.alert.level === 'high' ? 'text-red-600' : 'text-yellow-600'
                }`} fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className={`text-xs font-semibold ${
                    stats.alert.level === 'high' ? 'text-red-700' : 'text-yellow-700'
                  }`}>
                    {stats.alert.message}
                  </p>
                  <p className={`text-xs ${
                    stats.alert.level === 'high' ? 'text-red-600' : 'text-yellow-600'
                  }`}>
                    {stats.alert.percentage.toFixed(1)}% disengaged
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Emotion Distribution */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-gray-700 mb-2">Emotion Distribution</h4>
            <div className="space-y-2">
              {Object.entries(stats.emotion_percentages || {})
                .sort((a, b) => b[1] - a[1])
                .map(([emotion, percentage]) => (
                  percentage > 0 && (
                    <div key={emotion} className="flex items-center space-x-2">
                      <span className="text-lg">{emotionEmojis[emotion]}</span>
                      <div className="flex-1">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-medium text-gray-700 capitalize">{emotion}</span>
                          <span className="text-xs font-bold text-gray-900">{percentage.toFixed(1)}%</span>
                        </div>
                        <div className="w-full bg-gray-200 rounded-full h-1.5">
                          <div
                            className={`h-1.5 rounded-full ${emotionColors[emotion]} transition-all duration-500`}
                            style={{ width: `${percentage}%` }}
                          ></div>
                        </div>
                      </div>
                    </div>
                  )
                ))}
            </div>
          </div>

          {/* Participant Summary (if available) */}
          {participants && participants.length > 0 && (
            <div>
              <h4 className="text-xs font-semibold text-gray-700 mb-2">
                Active Participants ({participants.length})
              </h4>
              <div className="max-h-32 overflow-y-auto space-y-1">
                {participants.slice(0, 10).map((participant, idx) => (
                  <div
                    key={participant.userId || idx}
                    className="flex items-center justify-between bg-gray-50 rounded px-2 py-1.5"
                  >
                    <span className="text-xs text-gray-700 truncate flex-1">
                      {participant.displayName || `Participant ${idx + 1}`}
                    </span>
                    <span className="w-2 h-2 bg-green-500 rounded-full ml-2"></span>
                  </div>
                ))}
                {participants.length > 10 && (
                  <div className="text-xs text-gray-500 text-center py-1">
                    +{participants.length - 10} more
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default FloatingStatsWindow;
