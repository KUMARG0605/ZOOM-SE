import { Doughnut } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend
} from 'chart.js';

ChartJS.register(ArcElement, Tooltip, Legend);

const EmotionChart = ({ emotionData }) => {
  const emotionColors = {
    happy: '#10B981',
    sad: '#3B82F6',
    angry: '#EF4444',
    surprise: '#F59E0B',
    fear: '#8B5CF6',
    disgust: '#F97316',
    neutral: '#6B7280',
  };

  const data = {
    labels: Object.keys(emotionData || {}).map(e => e.charAt(0).toUpperCase() + e.slice(1)),
    datasets: [
      {
        label: 'Emotions',
        data: Object.values(emotionData || {}),
        backgroundColor: Object.keys(emotionData || {}).map(emotion => emotionColors[emotion] || '#6B7280'),
        borderColor: '#ffffff',
        borderWidth: 2,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'bottom',
        labels: {
          padding: 15,
          font: {
            size: 12,
          },
        },
      },
      tooltip: {
        callbacks: {
          label: (context) => {
            const label = context.label || '';
            const value = context.parsed || 0;
            const total = context.dataset.data.reduce((a, b) => a + b, 0);
            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
            return `${label}: ${value} (${percentage}%)`;
          },
        },
      },
    },
  };

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-900 mb-4">Emotion Distribution</h2>
      <div className="h-64">
        <Doughnut data={data} options={options} />
      </div>
    </div>
  );
};

export default EmotionChart;
