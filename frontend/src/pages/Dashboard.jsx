import { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const Dashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [reports, setReports] = useState([]);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const userMenuRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(event) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target)) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  useEffect(() => {
    fetchReports();
  }, []);

  useEffect(() => {
    document.title = 'Dashboard - Emotion Tracker';
  }, []);

  const fetchReports = async () => {
    try {
      const response = await sessionAPI.getAllReports();
      if (response.success) {
        setReports(response.reports);
      }
    } catch (error) {
      console.error('Error fetching reports:', error);
    }
  };

  const stats = useMemo(() => {
    const total = reports.length;
    const completed = reports.filter(r => !!r.end_time).length;
    const active = total - completed;
    const totalDetections = reports.reduce((sum, r) => sum + (r.total_detections || 0), 0);
    return { total, active, completed, totalDetections };
  }, [reports]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 text-white relative overflow-hidden">
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>
      <div className="grid grid-cols-12 min-h-screen relative z-10">
        <aside className="col-span-12 md:col-span-3 lg:col-span-2 bg-white/10 backdrop-blur-xl border-r border-white/20 p-4 md:p-6">
          <div className="flex items-center space-x-3 mb-8">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-xl p-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
            </div>
            <div>
              <h1 className="font-bold">Emotion Tracker</h1>
              <p className="text-xs text-purple-200">AI Meeting Analytics</p>
            </div>
          </div>

          <nav className="space-y-1">
            <button onClick={() => navigate('/zoom-bot')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center space-x-2">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
              <span>Start Analysis</span>
            </button>
            <button onClick={() => reports[0] && navigate(`/report/${reports[0].session_id}`)} disabled={!reports[0]} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center space-x-2 disabled:opacity-50">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17v-6a2 2 0 012-2h8m-6 6h6" /></svg>
              <span>Latest Report</span>
            </button>
            {user?.role === 'admin' && (
              <button onClick={() => navigate('/admin')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center space-x-2">
                <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8c1.657 0 3-1.567 3-3.5S13.657 1 12 1s-3 1.567-3 3.5S10.343 8 12 8zM19 21v-2a4 4 0 00-4-4H9a4 4 0 00-4 4v2" /></svg>
                <span>Admin</span>
              </button>
            )}
            <button onClick={() => navigate('/profile')} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center space-x-2">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" /></svg>
              <span>Profile</span>
            </button>
            <button onClick={async () => { await logout(); navigate('/login'); }} className="w-full text-left px-3 py-2 rounded-lg hover:bg-white/10 transition-colors flex items-center space-x-2">
              <svg className="w-5 h-5 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
              <span>Logout</span>
            </button>
          </nav>

          {/* User dropdown removed; actions available in nav */}
        </aside>

        <section className="col-span-12 md:col-span-9 lg:col-span-10 p-6 md:p-10">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8">
            <div>
              <h2 className="text-2xl md:text-3xl font-extrabold">Welcome{user?.full_name ? `, ${user.full_name}` : ''}</h2>
              <p className="text-purple-200">Here is your analytics overview</p>
            </div>
            <div className="mt-4 md:mt-0 flex items-center space-x-2">
              <button onClick={() => navigate('/zoom-bot')} className="px-4 py-2 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 transition-colors font-semibold">Start Analysis</button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5"><p className="text-gray-400 text-sm mb-1">Total Sessions</p><p className="text-3xl font-bold">{stats.total}</p></div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5"><p className="text-gray-400 text-sm mb-1">Active Sessions</p><p className="text-3xl font-bold text-green-400">{stats.active}</p></div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5"><p className="text-gray-400 text-sm mb-1">Completed</p><p className="text-3xl font-bold text-purple-300">{stats.completed}</p></div>
            <div className="bg-gray-900 border border-gray-800 rounded-xl p-5"><p className="text-gray-400 text-sm mb-1">Total Detections</p><p className="text-3xl font-bold text-blue-300">{stats.totalDetections}</p></div>
          </div>

          {/* Bot Details Block (expanded text, CTA at bottom) */}
          <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-8 border border-white/20 mb-8 relative overflow-hidden text-center">
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 via-purple-500/10 to-pink-500/10"></div>
            <div className="relative z-10 grid grid-cols-1 gap-6">
              <div>
                <div className="flex items-center mb-4">
                  <div className="bg-gradient-to-br from-blue-400 to-purple-600 rounded-2xl p-4 mr-4 shadow-xl">
                    <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"/></svg>
                  </div>
                  <div className="text-center">
                    <h3 className="text-2xl font-bold text-center">Zoom Meeting Bot</h3>
                    <p className="text-purple-200 text-center">Automated emotion detection and analytics</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                  <div className="flex items-start space-x-4 p-4 bg-white/5 rounded-xl">
                    <div className="w-10 h-10 bg-blue-500/40 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg">1</div>
                    <div>
                      <p className="font-semibold">Enter Meeting Details</p>
                      <p className="text-purple-200 text-sm">Provide your Zoom Meeting ID and Passcode to start tracking</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4 p-4 bg-white/5 rounded-xl">
                    <div className="w-10 h-10 bg-purple-500/40 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg">2</div>
                    <div>
                      <p className="font-semibold">Bot Joins Automatically</p>
                      <p className="text-purple-200 text-sm">Invisible participant with camera/mic OFF</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4 p-4 bg-white/5 rounded-xl">
                    <div className="w-10 h-10 bg-pink-500/40 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg">3</div>
                    <div>
                      <p className="font-semibold">Gallery View & Capture</p>
                      <p className="text-purple-200 text-sm">Covers all pages to capture every participant</p>
                    </div>
                  </div>
                  <div className="flex items-start space-x-4 p-4 bg-white/5 rounded-xl">
                    <div className="w-10 h-10 bg-yellow-500/40 rounded-full flex-shrink-0 flex items-center justify-center text-white font-bold text-lg">4</div>
                    <div>
                      <p className="font-semibold">Real-time Analysis</p>
                      <p className="text-purple-200 text-sm">Periodic AI analysis of emotions and engagement</p>
                    </div>
                  </div>
                </div>
                <button 
                  onClick={() => navigate('/zoom-bot')} 
                  className="w-full px-6 py-4 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 rounded-xl font-bold hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 transition-colors shadow-2xl col-span-2"
                >
                  Start New Meeting
                </button>
              </div>
            </div>
          </div>

          <div className="bg-white/10 backdrop-blur-xl border border-white/20 rounded-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-white/20 flex items-center justify-between bg-white/5">
              <h3 className="text-lg font-semibold">Recent Sessions</h3>
              <button onClick={() => navigate('/zoom-bot')} className="text-sm px-3 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 transition-colors">New Session</button>
            </div>
            {reports.length === 0 ? (
              <div className="p-10 text-center text-purple-200">No sessions yet. Start your first session.</div>
            ) : (
              <div className="overflow-x-auto max-h-96 overflow-y-auto">
                <table className="min-w-full">
                  <thead className="bg-gray-800/50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Session</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Date</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Duration</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-800">
                    {reports.map((report) => (
                      <tr key={report.session_id} className="hover:bg-gray-800/40">
                        <td className="px-6 py-4 whitespace-nowrap"><div className="font-medium">{report.session_name}</div></td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-300">{new Date(report.start_time).toLocaleDateString()}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-gray-300">{report.end_time ? `${Math.round((new Date(report.end_time) - new Date(report.start_time)) / 60000)} min` : 'In progress'}</td>
                        <td className="px-6 py-4 whitespace-nowrap"><button onClick={() => navigate(`/report/${report.session_id}`)} className="px-3 py-1.5 rounded-lg bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 transition-colors text-sm">View Report</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export default Dashboard;