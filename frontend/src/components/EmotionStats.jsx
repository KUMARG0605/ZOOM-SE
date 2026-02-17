const EmotionStats = ({ stats }) => {
  const emotionIcons = {
    happy: '😊',
    sad: '😢',
    angry: '😠',
    surprise: '😲',
    fear: '😨',
    disgust: '🤢',
    neutral: '😐',
  };

  const emotionColors = {
    happy: 'bg-green-100 text-green-800 border-green-200',
    sad: 'bg-blue-100 text-blue-800 border-blue-200',
    angry: 'bg-red-100 text-red-800 border-red-200',
    surprise: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    fear: 'bg-purple-100 text-purple-800 border-purple-200',
    disgust: 'bg-orange-100 text-orange-800 border-orange-200',
    neutral: 'bg-gray-100 text-gray-800 border-gray-200',
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Emotion Statistics</h2>

      {/* Engagement Score */}
      <div className="mb-6 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-lg border border-blue-200">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-gray-700">Engagement Score</span>
          <span className="text-2xl font-bold text-zoom-blue">
            {stats.engagement_score ? stats.engagement_score.toFixed(0) : 0}%
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-zoom-blue h-2 rounded-full transition-all duration-500"
            style={{ width: `${stats.engagement_score || 0}%` }}
          ></div>
        </div>
      </div>

      {/* Total Detections */}
      <div className="mb-4 p-3 bg-gray-50 rounded-lg">
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Total Detections</span>
          <span className="text-lg font-bold text-gray-900">{stats.total_detections || 0}</span>
        </div>
      </div>

      {/* Emotion Breakdown */}
      <div className="space-y-2">
        <h3 className="text-sm font-semibold text-gray-700 mb-3">Emotion Breakdown</h3>
        {Object.entries(stats.emotion_percentages || {}).map(([emotion, percentage]) => (
          <div key={emotion} className={`p-3 rounded-lg border ${emotionColors[emotion] || 'bg-gray-100'}`}>
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center space-x-2">
                <span className="text-xl">{emotionIcons[emotion]}</span>
                <span className="font-medium capitalize">{emotion}</span>
              </div>
              <span className="font-bold">{percentage.toFixed(1)}%</span>
            </div>
            <div className="w-full bg-white/50 rounded-full h-1.5">
              <div
                className="bg-current h-1.5 rounded-full transition-all duration-500"
                style={{ width: `${percentage}%` }}
              ></div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default EmotionStats;
