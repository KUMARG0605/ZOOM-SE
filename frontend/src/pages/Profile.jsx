import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const Profile = () => {
  const navigate = useNavigate();
  const { user, updateProfile, changePassword, logout } = useAuth();

  const [activeTab, setActiveTab] = useState('profile'); // profile, password
  const [profileData, setProfileData] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    username: user?.username || ''
  });
  const [passwordData, setPasswordData] = useState({
    current_password: '',
    new_password: '',
    confirm_password: ''
  });
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleProfileChange = (e) => {
    setProfileData({
      ...profileData,
      [e.target.name]: e.target.value
    });
  };

  const handlePasswordChange = (e) => {
    setPasswordData({
      ...passwordData,
      [e.target.name]: e.target.value
    });
  };

  const handleProfileSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    try {
      const result = await updateProfile(profileData);

      if (result.success) {
        setMessage('Profile updated successfully!');
      } else {
        setError(result.message || 'Update failed');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (passwordData.new_password !== passwordData.confirm_password) {
      setError('New passwords do not match');
      return;
    }

    if (passwordData.new_password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    setLoading(true);

    try {
      const result = await changePassword(
        passwordData.current_password,
        passwordData.new_password
      );

      if (result.success) {
        setMessage('Password changed successfully!');
        setPasswordData({
          current_password: '',
          new_password: '',
          confirm_password: ''
        });
      } else {
        setError(result.message || 'Password change failed');
      }
    } catch (err) {
      setError('An error occurred');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
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
            <Link to="/dashboard" className="flex items-center space-x-2 text-white hover:text-purple-300 transition-colors">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              <span className="font-semibold">Back to Dashboard</span>
            </Link>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="relative z-10 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-10 border border-white/20 animate-fade-in">
          {/* Profile Header */}
          <div className="flex items-center space-x-6 mb-10">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-full p-6 shadow-2xl transform hover:scale-110 transition-transform">
              <svg className="w-16 h-16 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
            <div>
              <h1 className="text-4xl font-bold text-white mb-2">{user?.full_name || user?.username}</h1>
              <p className="text-purple-200 text-lg">{user?.email}</p>
              <p className="text-sm text-purple-300 mt-1">Role: <span className="capitalize font-semibold text-white">{user?.role}</span></p>
            </div>
          </div>

          {/* Tabs */}
          <div className="border-b border-white/20 mb-8">
            <div className="flex space-x-8">
              <button
                onClick={() => setActiveTab('profile')}
                className={`pb-4 px-2 font-semibold transition-all relative ${
                  activeTab === 'profile'
                    ? 'text-white'
                    : 'text-purple-200 hover:text-white'
                }`}
              >
                Profile Settings
                {activeTab === 'profile' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 to-purple-500"></span>
                )}
              </button>
              <button
                onClick={() => setActiveTab('password')}
                className={`pb-4 px-2 font-semibold transition-all relative ${
                  activeTab === 'password'
                    ? 'text-white'
                    : 'text-purple-200 hover:text-white'
                }`}
              >
                Change Password
                {activeTab === 'password' && (
                  <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-gradient-to-r from-blue-400 to-purple-500"></span>
                )}
              </button>
            </div>
          </div>

          {message && (
            <div className="mb-6 p-4 bg-green-500/20 backdrop-blur-sm border border-green-400/30 rounded-xl">
              <p className="text-green-200 text-sm font-medium">{message}</p>
            </div>
          )}

          {error && (
            <div className="mb-6 p-4 bg-red-500/20 backdrop-blur-sm border border-red-400/30 rounded-xl animate-shake">
              <p className="text-red-200 text-sm font-medium">{error}</p>
            </div>
          )}

          {/* Profile Tab */}
          {activeTab === 'profile' && (
            <form onSubmit={handleProfileSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="full_name"
                  value={profileData.full_name}
                  onChange={handleProfileChange}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Email
                </label>
                <input
                  type="email"
                  name="email"
                  value={profileData.email}
                  onChange={handleProfileChange}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Username
                </label>
                <input
                  type="text"
                  name="username"
                  value={profileData.username}
                  onChange={handleProfileChange}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white rounded-xl font-bold hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 transition-all shadow-xl hover:scale-105 transform disabled:opacity-50 disabled:hover:scale-100"
              >
                {loading ? 'Saving...' : 'Save Changes'}
              </button>
            </form>
          )}

          {/* Password Tab */}
          {activeTab === 'password' && (
            <form onSubmit={handlePasswordSubmit} className="space-y-6">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Current Password
                </label>
                <input
                  type="password"
                  name="current_password"
                  value={passwordData.current_password}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  name="new_password"
                  value={passwordData.new_password}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all"
                />
                <p className="text-xs text-purple-300 mt-2">Min 8 characters, 1 uppercase, 1 lowercase, 1 number</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Confirm New Password
                </label>
                <input
                  type="password"
                  name="confirm_password"
                  value={passwordData.confirm_password}
                  onChange={handlePasswordChange}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="px-8 py-3 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white rounded-xl font-bold hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 transition-all shadow-xl hover:scale-105 transform disabled:opacity-50 disabled:hover:scale-100"
              >
                {loading ? 'Changing...' : 'Change Password'}
              </button>
            </form>
          )}
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
          animation: fade-in 0.8s ease-out;
        }
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-10px); }
          75% { transform: translateX(10px); }
        }
        .animate-shake {
          animation: shake 0.5s;
        }
      `}</style>
    </div>
  );
};

export default Profile;
