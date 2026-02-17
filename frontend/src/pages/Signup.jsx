import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { FaEye, FaEyeSlash } from 'react-icons/fa';
import { authAPI } from '../services/api';

const Signup = () => {
  const navigate = useNavigate();
  const { signup, isAuthenticated } = useAuth();

  const [formData, setFormData] = useState({
    email: '',
    username: '',
    password: '',
    fullName: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showVerification, setShowVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);
  
  // Effect for resend cooldown timer
  useEffect(() => {
    if (resendCooldown > 0) {
      const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [resendCooldown]);
  
  const handleResendCode = async () => {
    setResendLoading(true);
    setError('');
    
    try {
      const result = await authAPI.resendVerificationEmail(formData.email);
      if (result.success) {
        setMessage('A new verification code has been sent to your email.');
        setResendCooldown(60); // 60 seconds cooldown
      } else {
        setError(result.message || 'Failed to resend verification code');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Resend error:', err);
    } finally {
      setResendLoading(false);
    }
  };

  // Redirect if already authenticated
  if (isAuthenticated) {
    navigate('/dashboard');
    return null;
  }

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const validateForm = () => {
    if (!formData.email || !formData.username || !formData.password) {
      setError('Please fill in all required fields');
      return false;
    }

    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(formData.email)) {
      setError('Please enter a valid email address');
      return false;
    }

    // Username validation
    const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
    if (!usernameRegex.test(formData.username)) {
      setError('Username must be 3-20 characters (letters, numbers, underscores only)');
      return false;
    }

    // Password validation
    if (formData.password.length < 8) {
      setError('Password must be at least 8 characters long');
      return false;
    }

    if (!/[A-Z]/.test(formData.password)) {
      setError('Password must contain at least one uppercase letter');
      return false;
    }

    if (!/[a-z]/.test(formData.password)) {
      setError('Password must contain at least one lowercase letter');
      return false;
    }

    if (!/\d/.test(formData.password)) {
      setError('Password must contain at least one number');
      return false;
    }

    return true;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await signup(
        formData.email,
        formData.username,
        formData.password,
        formData.fullName
      );

      if (result.success) {
        // Show verification code input
        setShowVerification(true);
        setMessage('A verification code has been sent to your email.');
      } else {
        setError(result.message || 'Signup failed');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Signup error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerify = async () => {
    if (verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }

    setVerifying(true);
    setError('');

    try {
      const result = await authAPI.verifyEmail(formData.email, verificationCode);
      
      if (result.success) {
        setMessage('Email verified successfully! Logging you in...');
        // Auto-login after verification
        const loginResult = await authAPI.login(formData.email, formData.password);
        if (loginResult.success) {
          navigate('/dashboard');
        } else {
          navigate('/login', { state: { email: formData.email } });
        }
      } else {
        setError(result.message || 'Verification failed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred during verification. Please try again.');
      console.error('Verification error:', err);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="min-h-screen md:h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden flex items-center justify-center p-4">
      {/* Animated Background Elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-80 h-80 bg-purple-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-4000"></div>
      </div>

      <div className="relative z-10 bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-8 md:p-10 w-full max-w-3xl border border-white/20 animate-fade-in">
        <div className="text-center mb-6 md:mb-8">
          <div className="bg-gradient-to-br from-green-400 to-emerald-600 rounded-full p-5 w-20 h-20 mx-auto mb-6 flex items-center justify-center shadow-2xl transform hover:scale-110 transition-transform duration-300">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z" />
            </svg>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 md:mb-3 drop-shadow-lg">Create Account</h1>
          <p className="text-purple-200 text-base md:text-lg">Join us to start tracking emotions</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-500/20 backdrop-blur-sm border border-red-400/30 rounded-xl animate-shake">
            <p className="text-red-200 text-sm font-medium">{error}</p>
          </div>
        )}

        <form onSubmit={showVerification ? (e) => { e.preventDefault(); handleVerify(); } : handleSubmit} className="space-y-5 md:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 md:gap-6">
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Full Name
                </label>
                <input
                  type="text"
                  name="fullName"
                  value={formData.fullName}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-green-400 outline-none text-white placeholder-purple-200 transition-all"
                  placeholder="John Doe"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Username <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  name="username"
                  value={formData.username}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-green-400 outline-none text-white placeholder-purple-200 transition-all"
                  placeholder="johndoe"
                  required
                  autoComplete="username"
                />
                <p className="text-xs text-purple-300 mt-1">3-20 characters (letters, numbers, underscores)</p>
              </div>

              <div>
                <label className="block text-sm font-semibold text-white mb-2">
                  Email <span className="text-red-400">*</span>
                </label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  className="w-full px-4 py-3 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-green-400 outline-none text-white placeholder-purple-200 transition-all"
                  placeholder="you@example.com"
                  required
                  autoComplete="email"
                />
              </div>
              <div>
                <div className="relative">
                  <label className="block text-sm font-semibold text-white mb-2">
                    Password <span className="text-red-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      name="password"
                      value={formData.password}
                      onChange={handleChange}
                      className="w-full px-4 py-3 pr-10 bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-green-400 focus:border-green-400 outline-none text-white placeholder-purple-200 transition-all"
                      placeholder="••••••••"
                      required
                      autoComplete="new-password"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-purple-300 hover:text-white transition-colors"
                      aria-label={showPassword ? "Hide password" : "Show password"}
                    >
                      {showPassword ? <FaEyeSlash size={18} /> : <FaEye size={18} />}
                    </button>
                  </div>
                  <p className="text-xs text-purple-300 mt-1">Min 8 characters, 1 uppercase, 1 lowercase, 1 number</p>
                </div>
              </div>
            </div>

            {/* Inline verification block (appears after signup) */}
            {showVerification && (
              <div className="mb-4">
                <p className="text-sm text-purple-200 mb-2">Enter the 6-digit verification code sent to {formData.email}</p>

                <div className="flex items-center space-x-3">
                  <div className="flex space-x-2">
                    {[...Array(6)].map((_, index) => (
                      <input
                        key={index}
                        type="text"
                        maxLength={1}
                        value={verificationCode[index] || ''}
                        onChange={(e) => {
                          const newCode = verificationCode.split('');
                          newCode[index] = e.target.value.replace(/[^0-9]/g, '');
                          setVerificationCode(newCode.join(''));

                          // Auto-focus next input
                          if (e.target.value && index < 5) {
                            document.getElementById(`code-${index + 1}`)?.focus();
                          }
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Backspace' && !verificationCode[index] && index > 0) {
                            document.getElementById(`code-${index - 1}`)?.focus();
                          }
                        }}
                        id={`code-${index}`}
                        className="w-12 h-12 text-xl text-center bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-lg focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none text-white"
                      />
                    ))}
                  </div>

                  <div className="ml-2">
                    <button
                      type="button"
                      onClick={handleResendCode}
                      disabled={resendLoading || resendCooldown > 0}
                      className="px-3 py-2 bg-white/10 text-sm text-purple-200 rounded-md hover:bg-white/20 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {resendLoading ? 'Sending...' : (resendCooldown > 0 ? `Resend (${resendCooldown}s)` : 'Resend')}
                    </button>
                  </div>
                </div>
                {message && <p className="text-green-400 mt-2">{message}</p>}
              </div>
            )}

            <div className="md:col-span-2">
              <button
                type="submit"
                disabled={isSubmitting || (showVerification && (verifying || verificationCode.length !== 6))}
                className="w-full px-6 py-4 bg-gradient-to-r from-green-500 to-emerald-600 text-white rounded-xl font-bold text-lg hover:from-green-600 hover:to-emerald-700 transition-all shadow-2xl hover:shadow-3xl hover:scale-105 transform disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              >
                {showVerification ? (verifying ? 'Verifying...' : 'Verify Email') : (isSubmitting ? 'Creating Account...' : 'Create Account')}
              </button>
            </div>
          </form>

        <div className="mt-5 md:mt-6 text-center">
          <div className="text-center mt-6 space-y-4">
            <p className="text-sm text-purple-300">
              Already have an account?{' '}
              <Link to="/login" className="text-white font-semibold hover:text-green-300 transition-colors">
                Sign in
              </Link>
            </p>
            <p className="text-xs text-purple-400">
              By signing up, you agree to our{' '}
              <Link to="/terms" className="text-purple-300 hover:underline">Terms of Service</Link> and{' '}
              <Link to="/privacy" className="text-purple-300 hover:underline">Privacy Policy</Link>.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Signup;
