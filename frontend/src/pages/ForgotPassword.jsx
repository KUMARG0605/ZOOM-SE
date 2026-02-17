import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { authAPI } from '../services/api';

const ForgotPassword = () => {
  const [step, setStep] = useState('request'); // request, reset, success
  const [email, setEmail] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handleRequestReset = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setLoading(true);

    if (!email) {
      setError('Please enter your email');
      setLoading(false);
      return;
    }

    try {
      const response = await authAPI.forgotPassword(email);

      if (response.success) {
        setMessage('Password reset instructions sent to your email');
        setResetToken(response.reset_token || ''); // In dev mode, token is returned
        setStep('reset');
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');

    if (!resetToken || resetToken.length !== 6 || !newPassword) {
      setError('Please fill in all fields (Reset token must be 6 digits)');
      return;
    }

    // Validate reset token format (6 digits)
    if (!/^\d{6}$/.test(resetToken)) {
      setError('Reset token must be 6 digits');
      return;
    }

    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    // Validate password requirements
    if (!/[A-Z]/.test(newPassword)) {
      setError('Password must contain at least one uppercase letter');
      return;
    }

    if (!/[a-z]/.test(newPassword)) {
      setError('Password must contain at least one lowercase letter');
      return;
    }

    if (!/\d/.test(newPassword)) {
      setError('Password must contain at least one number');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    setLoading(true);

    try {
      const response = await authAPI.resetPassword(email, resetToken, newPassword);

      if (response.success) {
        setStep('success');
      } else {
        setError(response.message);
      }
    } catch (err) {
      setError(err.response?.data?.message || 'Reset failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'success') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        </div>
        
        <div className="relative z-10 bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-10 w-full max-w-md text-center border border-white/20 animate-fade-in">
          <div className="bg-gradient-to-br from-green-400 to-emerald-600 rounded-full p-5 w-20 h-20 mx-auto mb-6 flex items-center justify-center shadow-2xl">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 drop-shadow-lg">Password Reset!</h1>
          <p className="text-purple-200 text-lg mb-8">
            Your password has been successfully reset. You can now log in with your new password.
          </p>
          <Link
            to="/login"
            className="inline-block px-8 py-4 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white rounded-xl font-bold text-lg hover:from-blue-600 hover:via-purple-600 hover:to-pink-600 transition-all shadow-2xl hover:scale-105 transform"
          >
            Go to Login
          </Link>
        </div>
      </div>
    );
  }

  if (step === 'reset') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden flex items-center justify-center p-4">
        <div className="absolute inset-0 overflow-hidden">
          <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
          <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        </div>
        
        <div className="relative z-10 bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-10 w-full max-w-md border border-white/20 animate-fade-in">
          <div className="text-center mb-8">
            <div className="bg-gradient-to-br from-purple-400 to-pink-600 rounded-full p-5 w-20 h-20 mx-auto mb-6 flex items-center justify-center shadow-2xl">
              <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <h1 className="text-4xl font-bold text-white mb-3 drop-shadow-lg">Reset Password</h1>
            <p className="text-purple-200 text-lg">Enter your new password</p>
          </div>

          {error && (
            <div className="mb-6 p-4 bg-red-500/20 backdrop-blur-sm border border-red-400/30 rounded-xl animate-shake">
              <p className="text-red-200 text-sm font-medium">{error}</p>
            </div>
          )}

          {message && (
            <div className="mb-6 p-4 bg-green-500/20 backdrop-blur-sm border border-green-400/30 rounded-xl">
              <p className="text-green-200 text-sm font-medium">{message}</p>
            </div>
          )}

          <form onSubmit={handleResetPassword} className="space-y-5">
            <div>
              <label className="block text-sm font-semibold text-white mb-2">
                Reset Token
              </label>
              <div className="flex justify-between space-x-2">
                {[...Array(6)].map((_, index) => (
                  <input
                    key={index}
                    type="text"
                    maxLength={1}
                    value={resetToken[index] || ''}
                    onChange={(e) => {
                      const newToken = resetToken.split('');
                      newToken[index] = e.target.value.replace(/[^0-9]/g, '');
                      setResetToken(newToken.join(''));
                      
                      // Auto-focus next input
                      if (e.target.value && index < 5) {
                        document.getElementById(`token-${index + 1}`)?.focus();
                      }
                    }}
                    onKeyDown={(e) => {
                      // Handle backspace to move to previous input
                      if (e.key === 'Backspace' && !resetToken[index] && index > 0) {
                        document.getElementById(`token-${index - 1}`)?.focus();
                      }
                    }}
                    id={`token-${index}`}
                    className="w-12 h-12 text-xl text-center bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-lg focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white"
                    autoFocus={index === 0}
                  />
                ))}
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-2">
                New Password
              </label>
              <div className="relative">
                <input
                  type={showNewPassword ? "text" : "password"}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-10 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-300 hover:text-white transition-colors"
                  aria-label={showNewPassword ? "Hide password" : "Show password"}
                >
                  {showNewPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
              </div>
              <p className="text-xs text-purple-300 mt-1">Must be at least 8 characters with 1 uppercase, 1 lowercase & 1 number</p>
            </div>

            <div>
              <label className="block text-sm font-semibold text-white mb-2">
                Confirm Password
              </label>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="w-full px-4 py-3 pr-10 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all"
                  placeholder="••••••••"
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-300 hover:text-white transition-colors"
                  aria-label={showConfirmPassword ? "Hide password" : "Show password"}
                >
                  {showConfirmPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full px-6 py-4 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white rounded-xl font-bold text-lg hover:from-purple-600 hover:via-pink-600 hover:to-red-600 transition-all shadow-2xl hover:shadow-3xl hover:scale-105 transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
            >
              {loading ? 'Resetting...' : 'Reset Password'}
            </button>
          </form>

          <div className="mt-6 text-center">
            <Link to="/login" className="text-sm text-purple-300 hover:text-purple-200 font-medium transition-colors">
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-pink-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>
      
      <div className="relative z-10 bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-10 w-full max-w-md border border-white/20 animate-fade-in">
        <div className="text-center mb-8">
          <div className="bg-gradient-to-br from-purple-400 to-pink-600 rounded-full p-5 w-20 h-20 mx-auto mb-6 flex items-center justify-center shadow-2xl">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
            </svg>
          </div>
          <h1 className="text-4xl font-bold text-white mb-3 drop-shadow-lg">Forgot Password?</h1>
          <p className="text-purple-200 text-lg">Enter your email to reset your password</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 backdrop-blur-sm border border-red-400/30 rounded-xl animate-shake">
            <p className="text-red-200 text-sm font-medium">{error}</p>
          </div>
        )}

        {message && (
          <div className="mb-6 p-4 bg-green-500/20 backdrop-blur-sm border border-green-400/30 rounded-xl">
            <p className="text-green-200 text-sm font-medium">{message}</p>
          </div>
        )}

        <form onSubmit={handleRequestReset} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold text-white mb-2">
              Email Address
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-purple-400 focus:border-purple-400 outline-none text-white placeholder-purple-200 transition-all"
              placeholder="you@example.com"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full px-6 py-4 bg-gradient-to-r from-purple-500 via-pink-500 to-red-500 text-white rounded-xl font-bold text-lg hover:from-purple-600 hover:via-pink-600 hover:to-red-600 transition-all shadow-2xl hover:shadow-3xl hover:scale-105 transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 relative overflow-hidden group"
          >
            <span className="absolute inset-0 bg-gradient-to-r from-white/20 to-transparent transform -skew-x-12 -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></span>
            {loading ? (
              <div className="flex items-center justify-center relative z-10">
                <svg className="animate-spin h-6 w-6 mr-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Sending...
              </div>
            ) : (
              <span className="relative z-10">Send Reset Link</span>
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link to="/login" className="text-sm text-purple-300 hover:text-purple-200 font-medium transition-colors">
            Back to Login
          </Link>
        </div>
      </div>

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

export default ForgotPassword;
