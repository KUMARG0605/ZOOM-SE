import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { adminAPI } from '../services/api';
import { useAuth } from '../contexts/AuthContext';

const AdminDashboard = () => {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('stats'); // stats, users, sessions
  const [pagination, setPagination] = useState({ page: 1, per_page: 10 });
  const [sessionPagination, setSessionPagination] = useState({ page: 1, per_page: 20 });
  const [grantAdminEmail, setGrantAdminEmail] = useState('');
  const [showGrantAdminForm, setShowGrantAdminForm] = useState(false);

  useEffect(() => {
    if (user?.role !== 'admin') {
      navigate('/dashboard');
    } else {
      loadData();
    }
  }, [user, activeTab, pagination.page, sessionPagination.page]);

  const loadData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'stats') {
        const response = await adminAPI.getStats();
        if (response.success) {
          setStats(response.statistics);
        }
      } else if (activeTab === 'users') {
        const response = await adminAPI.getUsers({ page: pagination.page, per_page: pagination.per_page });
        if (response.success) {
          setUsers(response.users);
          setPagination(prev => ({ ...prev, ...response.pagination }));
        }
      } else if (activeTab === 'sessions') {
        const response = await adminAPI.getAllSessions({ page: sessionPagination.page, per_page: sessionPagination.per_page });
        if (response.success) {
          setSessions(response.sessions);
          setSessionPagination(prev => ({ ...prev, ...response.pagination }));
        }
      }
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userId) => {
    if (!window.confirm('Are you sure you want to delete this user?')) return;

    try {
      const response = await adminAPI.deleteUser(userId);
      if (response.success) {
        loadData();
      }
    } catch (error) {
      alert('Error deleting user');
    }
  };

  const handleToggleUserStatus = async (userId, isActive) => {
    try {
      const response = await adminAPI.updateUser(userId, { is_active: !isActive });
      if (response.success) {
        loadData();
      }
    } catch (error) {
      alert('Error updating user');
    }
  };

  const handleDeleteSession = async (sessionId) => {
    if (!window.confirm('Are you sure you want to delete this session and all its data?')) return;

    try {
      const response = await adminAPI.deleteSession(sessionId);
      if (response.success) {
        loadData();
      }
    } catch (error) {
      alert('Error deleting session');
    }
  };

  const handleGrantAdmin = async (userId) => {
    if (!window.confirm('Are you sure you want to grant admin access to this user?')) return;

    try {
      const response = await adminAPI.grantAdmin(userId);
      if (response.success) {
        alert(response.message);
        loadData();
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Error granting admin access');
    }
  };

  const handleRevokeAdmin = async (userId) => {
    if (!window.confirm('Are you sure you want to revoke admin access from this user?')) return;

    try {
      const response = await adminAPI.revokeAdmin(userId);
      if (response.success) {
        alert(response.message);
        loadData();
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Error revoking admin access');
    }
  };

  const handleGrantAdminByEmail = async (e) => {
    e.preventDefault();
    if (!grantAdminEmail.trim()) {
      alert('Please enter an email address');
      return;
    }

    try {
      const response = await adminAPI.grantAdminByEmail(grantAdminEmail.trim());
      if (response.success) {
        alert(response.message);
        setGrantAdminEmail('');
        setShowGrantAdminForm(false);
        loadData();
      }
    } catch (error) {
      alert(error.response?.data?.message || 'Error granting admin access');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-yellow-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      {/* Header */}
      <header className="relative z-10 bg-white/10 backdrop-blur-md border-b border-white/20">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-4">
              <Link to="/dashboard" className="text-white hover:text-purple-300 transition-colors">
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </Link>
              <h1 className="text-3xl font-bold text-white">Admin Dashboard</h1>
            </div>
            <div className="flex items-center space-x-4">
              <Link to="/profile" className="px-4 py-2 text-white hover:text-purple-300 transition-colors">
                Profile
              </Link>
              <button
                onClick={() => { logout(); navigate('/login'); }}
                className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
              >
                Logout
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Tabs */}
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl border border-white/20 mb-6">
          <div className="border-b border-white/20">
            <div className="flex space-x-8 px-6">
              <button
                onClick={() => setActiveTab('stats')}
                className={`py-4 px-2 font-semibold transition-all relative ${
                  activeTab === 'stats'
                    ? 'text-white'
                    : 'text-purple-200 hover:text-white'
                }`}
              >
                Statistics
                {activeTab === 'stats' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 to-purple-500"></span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('users')}
                className={`py-4 px-2 font-semibold transition-all relative ${
                  activeTab === 'users'
                    ? 'text-white'
                    : 'text-purple-200 hover:text-white'
                }`}
              >
                User Management
                {activeTab === 'users' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 to-purple-500"></span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('sessions')}
                className={`py-4 px-2 font-semibold transition-all relative ${
                  activeTab === 'sessions'
                    ? 'text-white'
                    : 'text-purple-200 hover:text-white'
                }`}
              >
                All Sessions
                {activeTab === 'sessions' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 to-purple-500"></span>
                )}
              </button>
            </div>
          </div>

          <div className="p-8">
            {loading ? (
              <div className="text-center py-12">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-purple-400 mx-auto"></div>
                <p className="text-purple-200 mt-4">Loading...</p>
              </div>
            ) : (
              <>
                {/* Stats Tab */}
                {activeTab === 'stats' && stats && (
                  <div className="space-y-6 animate-fade-in">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                      <div className="bg-gradient-to-br from-blue-500/20 to-blue-600/20 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                        <h3 className="text-sm font-medium text-purple-200 mb-2">Total Users</h3>
                        <p className="text-4xl font-bold text-white">{stats.users.total}</p>
                        <p className="text-sm text-purple-200 mt-2">{stats.users.active} active</p>
                      </div>
                      <div className="bg-gradient-to-br from-green-500/20 to-green-600/20 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                        <h3 className="text-sm font-medium text-purple-200 mb-2">Sessions</h3>
                        <p className="text-4xl font-bold text-white">{stats.sessions.total}</p>
                        <p className="text-sm text-purple-200 mt-2">{stats.sessions.active} active</p>
                      </div>
                      <div className="bg-gradient-to-br from-purple-500/20 to-purple-600/20 backdrop-blur-sm rounded-xl p-6 border border-white/20">
                        <h3 className="text-sm font-medium text-purple-200 mb-2">Admins</h3>
                        <p className="text-4xl font-bold text-white">{stats.users.admins}</p>
                      </div>
                    </div>

                    {/* Emotion Distribution */}
                    <div className="bg-white/10 backdrop-blur-sm rounded-xl p-8 border border-white/20">
                      <h3 className="text-xl font-semibold text-white mb-6">Emotion Distribution</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                        {Object.entries(stats.emotions.distribution).map(([emotion, count]) => (
                          <div key={emotion} className="text-center bg-white/5 rounded-lg p-4 backdrop-blur-sm border border-white/10">
                            <p className="text-3xl font-bold text-white mb-1">{count}</p>
                            <p className="text-sm text-purple-200 capitalize">{emotion}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* Users Tab */}
                {activeTab === 'users' && (
                  <div className="animate-fade-in">
                    {/* Grant Admin by Email Form */}
                    <div className="mb-6">
                      <button
                        onClick={() => setShowGrantAdminForm(!showGrantAdminForm)}
                        className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:from-blue-600 hover:to-purple-700 transition-all shadow-lg"
                      >
                        {showGrantAdminForm ? 'Hide Form' : '+ Grant Admin Access'}
                      </button>

                      {showGrantAdminForm && (
                        <form onSubmit={handleGrantAdminByEmail} className="mt-4 bg-white/5 backdrop-blur-sm rounded-lg p-6 border border-white/20">
                          <h3 className="text-white font-semibold mb-4">Grant Admin Access by Email</h3>
                          <div className="flex gap-3">
                            <input
                              type="email"
                              value={grantAdminEmail}
                              onChange={(e) => setGrantAdminEmail(e.target.value)}
                              placeholder="Enter user email address"
                              className="flex-1 px-4 py-2 bg-white/10 border border-white/20 rounded-lg text-white placeholder-purple-300 focus:outline-none focus:ring-2 focus:ring-purple-500"
                              required
                            />
                            <button
                              type="submit"
                              className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
                            >
                              Grant Admin
                            </button>
                          </div>
                        </form>
                      )}
                    </div>

                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-white/20">
                        <thead className="bg-white/5">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">User</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">Role</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">Status</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">Created</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white/5 divide-y divide-white/10">
                          {users.map((u) => (
                            <tr key={u.id} className="hover:bg-white/10 transition-colors">
                              <td className="px-6 py-4">
                                <div>
                                  <p className="font-medium text-white">{u.full_name || u.username}</p>
                                  <p className="text-sm text-purple-200">{u.email}</p>
                                </div>
                              </td>
                              <td className="px-6 py-4">
                                <span className="capitalize px-3 py-1 text-xs font-semibold rounded-full bg-blue-500/30 text-blue-200">
                                  {u.role}
                                </span>
                              </td>
                              <td className="px-6 py-4">
                                <span className={`px-3 py-1 text-xs font-semibold rounded-full ${
                                  u.is_active ? 'bg-green-500/30 text-green-200' : 'bg-red-500/30 text-red-200'
                                }`}>
                                  {u.is_active ? 'Active' : 'Inactive'}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm text-purple-200">
                                {new Date(u.created_at).toLocaleDateString()}
                              </td>
                              <td className="px-6 py-4 text-sm space-x-2">
                                {u.role !== 'admin' && (
                                  <button
                                    onClick={() => handleGrantAdmin(u.id)}
                                    className="text-green-300 hover:text-green-200 transition-colors font-semibold"
                                  >
                                    Make Admin
                                  </button>
                                )}
                                {u.role === 'admin' && u.id !== user?.id && (
                                  <button
                                    onClick={() => handleRevokeAdmin(u.id)}
                                    className="text-orange-300 hover:text-orange-200 transition-colors font-semibold"
                                  >
                                    Remove Admin
                                  </button>
                                )}
                                <button
                                  onClick={() => handleToggleUserStatus(u.id, u.is_active)}
                                  className="text-blue-300 hover:text-blue-200 transition-colors"
                                >
                                  {u.is_active ? 'Deactivate' : 'Activate'}
                                </button>
                                {u.id !== user?.id && (
                                  <button
                                    onClick={() => handleDeleteUser(u.id)}
                                    className="text-red-300 hover:text-red-200 transition-colors"
                                  >
                                    Delete
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {pagination.pages > 1 && (
                      <div className="mt-6 flex justify-center space-x-2">
                        <button
                          onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                          disabled={!pagination.has_prev}
                          className="px-4 py-2 bg-white/10 rounded-lg disabled:opacity-50 text-white hover:bg-white/20 transition-colors"
                        >
                          Previous
                        </button>
                        <span className="px-4 py-2 text-white">
                          Page {pagination.page} of {pagination.pages}
                        </span>
                        <button
                          onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                          disabled={!pagination.has_next}
                          className="px-4 py-2 bg-white/10 rounded-lg disabled:opacity-50 text-white hover:bg-white/20 transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}

                {/* Sessions Tab */}
                {activeTab === 'sessions' && (
                  <div className="animate-fade-in">
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-white/20">
                        <thead className="bg-white/5">
                          <tr>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">Session Name</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">User</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">Start Time</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">Duration</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">Emotion Logs</th>
                            <th className="px-6 py-4 text-left text-xs font-medium text-white uppercase">Actions</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white/5 divide-y divide-white/10">
                          {sessions.map((session) => (
                            <tr key={session.session_id} className="hover:bg-white/10 transition-colors">
                              <td className="px-6 py-4">
                                <div className="font-medium text-white">{session.session_name}</div>
                              </td>
                              <td className="px-6 py-4">
                                <div>
                                  <p className="text-white font-medium">{session.user_name}</p>
                                  <p className="text-sm text-purple-200">{session.user_email}</p>
                                </div>
                              </td>
                              <td className="px-6 py-4 text-sm text-purple-200">
                                {new Date(session.start_time).toLocaleString()}
                              </td>
                              <td className="px-6 py-4 text-sm text-purple-200">
                                {session.duration_minutes ? `${session.duration_minutes} min` : 'In progress'}
                              </td>
                              <td className="px-6 py-4">
                                <span className="px-3 py-1 bg-purple-500/30 text-purple-200 rounded-full text-xs font-semibold">
                                  {session.emotion_logs_count}
                                </span>
                              </td>
                              <td className="px-6 py-4 text-sm space-x-2">
                                <button
                                  onClick={() => navigate(`/report/${session.session_id}`)}
                                  className="text-blue-300 hover:text-blue-200 transition-colors"
                                >
                                  View
                                </button>
                                <button
                                  onClick={() => handleDeleteSession(session.session_id)}
                                  className="text-red-300 hover:text-red-200 transition-colors"
                                >
                                  Delete
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Pagination */}
                    {sessionPagination.pages > 1 && (
                      <div className="mt-6 flex justify-center space-x-2">
                        <button
                          onClick={() => setSessionPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                          disabled={!sessionPagination.has_prev}
                          className="px-4 py-2 bg-white/10 rounded-lg disabled:opacity-50 text-white hover:bg-white/20 transition-colors"
                        >
                          Previous
                        </button>
                        <span className="px-4 py-2 text-white">
                          Page {sessionPagination.page} of {sessionPagination.pages}
                        </span>
                        <button
                          onClick={() => setSessionPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                          disabled={!sessionPagination.has_next}
                          className="px-4 py-2 bg-white/10 rounded-lg disabled:opacity-50 text-white hover:bg-white/20 transition-colors"
                        >
                          Next
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </main>

      {/* Custom CSS */}
      <style>{`
        @keyframes blob {
          0%, 100% {
            transform: translate(0, 0) scale(1);
          }
          33% {
            transform: translate(30px, -50px) scale(1.1);
          }
          66% {
            transform: translate(-20px, 20px) scale(0.9);
          }
        }
        .animate-blob {
          animation: blob 7s infinite;
        }
        .animation-delay-2000 {
          animation-delay: 2s;
        }
        .animation-delay-4000 {
          animation-delay: 4s;
        }
        @keyframes fade-in {
          from {
            opacity: 0;
            transform: translateY(-20px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
        .animate-fade-in {
          animation: fade-in 0.5s ease-out;
        }
      `}</style>
    </div>
  );
};

export default AdminDashboard;
