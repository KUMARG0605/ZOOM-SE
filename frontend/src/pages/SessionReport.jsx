import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { sessionAPI } from '../services/api';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

const SessionReport = () => {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(true);
  const printRef = useRef(null);

  useEffect(() => {
    fetchReport();
  }, [sessionId]);

  useEffect(() => {
    if (report) {
      document.title = `Session Report - ${report.session_name}`;
    }
  }, [report]);

  const fetchReport = async () => {
    try {
      const response = await sessionAPI.getSessionReport(sessionId);
      if (response.success) {
        setReport(response.report);
      }
    } catch (error) {
      console.error('Error fetching report:', error);
    } finally {
      setLoading(false);
    }
  };

  const emotionIcons = {
    happy: '😊',
    sad: '😢',
    angry: '😠',
    surprise: '😲',
    fear: '😨',
    disgust: '🤢',
    neutral: '😐',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-zoom-blue mx-auto mb-4"></div>
          <p className="text-gray-600">Loading report...</p>
        </div>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600 text-lg">Report not found</p>
          <button
            onClick={() => navigate('/dashboard')}
            className="mt-4 px-6 py-2 bg-zoom-blue text-white rounded-lg hover:bg-blue-600"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden">
      {/* Decorative gradient blobs */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 bg-white/10 backdrop-blur-md border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-white">Session Report</h1>
              <p className="text-sm text-purple-200 mt-1">{report.session_name}</p>
            </div>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-6 py-2 bg-white/10 text-white rounded-lg hover:bg-white/20 border border-white/20 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main ref={printRef} className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 print:max-w-none print:p-0">
        {/* Session Info */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-6 mb-6 border border-white/20">
          <h2 className="text-xl font-bold text-white mb-4">Session Information</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-purple-200 mb-1">Start Time</p>
              <p className="text-lg font-semibold text-white">
                {new Date(report.start_time).toLocaleString()}
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-purple-200 mb-1">End Time</p>
              <p className="text-lg font-semibold text-white">
                {report.end_time ? new Date(report.end_time).toLocaleString() : 'In progress'}
              </p>
            </div>
            <div className="p-4 bg-white/5 rounded-lg border border-white/10">
              <p className="text-sm text-purple-200 mb-1">Total Detections</p>
              <p className="text-lg font-semibold text-white">{report.total_detections}</p>
            </div>
          </div>
        </div>

        {/* Summary Statistics */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-6 mb-6 border border-white/20">
          <h2 className="text-xl font-bold text-white mb-6">Emotion Summary</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
            {Object.entries(report.summary || {}).map(([emotion, count]) => (
              <div key={emotion} className="p-4 bg-white/5 rounded-lg text-center border border-white/10">
                <div className="text-3xl mb-2">{emotionIcons[emotion]}</div>
                <p className="text-sm text-purple-200 capitalize mb-1">{emotion}</p>
                <p className="text-2xl font-bold text-white">{count}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Timeline */}
        {report.timeline && report.timeline.length > 0 && (
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-6 mb-6 border border-white/20">
            <h2 className="text-xl font-bold text-white mb-6">Emotion Timeline</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-white/20">
                <thead>
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">
                      Time
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">
                      Participant
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">
                      Emotion
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-white uppercase">
                      Confidence
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white/5 divide-y divide-white/10">
                  {report.timeline.slice(-20).reverse().map((entry, index) => (
                    <tr key={index} className="hover:bg-white/10">
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-purple-200">
                        {new Date(entry.timestamp).toLocaleTimeString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-white">
                        {entry.participant_id}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <span className="flex items-center space-x-2">
                          <span className="text-xl">{emotionIcons[entry.emotion]}</span>
                          <span className="text-sm font-medium capitalize text-white">{entry.emotion}</span>
                        </span>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-purple-200">
                        {entry.confidence.toFixed(1)}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {report.timeline.length > 20 && (
              <p className="text-sm text-purple-200 mt-4 text-center">
                Showing last 20 entries out of {report.timeline.length} total
              </p>
            )}
          </div>
        )}

        {/* Export Buttons */}
        <div className="text-center no-print">
          <button
            onClick={() => window.print()}
            className="px-6 py-3 bg-gradient-to-r from-green-500 to-teal-500 text-white rounded-xl hover:from-green-600 hover:to-teal-600 transition-colors font-semibold shadow-lg"
          >
            Export PDF
          </button>
        </div>
      </main>

      {/* Print Styles */}
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { background: #ffffff !important; }
          .no-print { display: none !important; }
          header, .no-print, .pointer-events-none { display: none !important; }
          .print\:max-w-none { max-width: none !important; }
          .print\:p-0 { padding: 0 !important; }
          .bg-white\/10, .backdrop-blur-xl, .border, .shadow-2xl { background: #ffffff !important; box-shadow: none !important; border: 0 !important; }
          .text-white, .text-purple-200, .text-purple-300 { color: #111827 !important; }
          .text-purple-200 { color: #4b5563 !important; }
          .text-purple-300 { color: #6b7280 !important; }
          .divide-white\/20, .divide-white\/10 { --tw-divide-opacity: 1; border-color: #e5e7eb !important; }
          table { page-break-inside: auto; }
          tr { page-break-inside: avoid; page-break-after: auto; }
          .rounded-2xl, .rounded-xl, .rounded-lg { border-radius: 8px !important; }
        }
      `}</style>
    </div>
  );
};

export default SessionReport;
