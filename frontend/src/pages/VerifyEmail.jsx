import { useState, useEffect } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { authAPI } from '../services/api';

const VerifyEmail = () => {
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [email, setEmail] = useState('');
  const [countdown, setCountdown] = useState(30);
  
  const navigate = useNavigate();
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  
  useEffect(() => {
    // Get email from URL params or location state
    const emailFromParams = searchParams.get('email');
    if (emailFromParams) {
      setEmail(emailFromParams);
    } else if (location.state?.email) {
      setEmail(location.state.email);
    } else {
      // Redirect to signup if no email is provided
      navigate('/signup');
    }
    
    // Start countdown for resend button
    const timer = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) {
          clearInterval(timer);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    
    return () => clearInterval(timer);
  }, [navigate, location, searchParams]);
  
  const handleCodeChange = (index, value) => {
    if (value === '' || /^[0-9]$/.test(value)) {
      const newCode = [...code];
      newCode[index] = value;
      setCode(newCode);
      
      // Auto focus next input
      if (value !== '' && index < 5) {
        document.getElementById(`code-${index + 1}`)?.focus();
      }
    }
  };
  
  const handlePaste = (e) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text/plain').trim();
    if (/^\d{6}$/.test(pasteData)) {
      const newCode = pasteData.split('');
      setCode([...newCode, ...Array(6 - newCode.length).fill('')].slice(0, 6));
    }
  };
  
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    
    const verificationCode = code.join('');
    if (verificationCode.length !== 6) {
      setError('Please enter a valid 6-digit code');
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await authAPI.verifyEmail(email, verificationCode);
      
      if (response.success) {
        setMessage('Email verified successfully! Redirecting to login...');
        setTimeout(() => {
          navigate('/login', { state: { email, verified: true } });
        }, 2000);
      } else {
        setError(response.message || 'Verification failed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Verification error:', err);
    } finally {
      setLoading(false);
    }
  };
  
  const handleResendCode = async () => {
    if (countdown > 0) return;
    
    setResendLoading(true);
    setError('');
    setResendSuccess(false);
    
    try {
      const response = await authAPI.resendVerificationEmail(email);
      
      if (response.success) {
        setResendSuccess(true);
        setCountdown(30);
        // Restart countdown
        const timer = setInterval(() => {
          setCountdown(prev => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(response.message || 'Failed to resend verification code');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
      console.error('Resend error:', err);
    } finally {
      setResendLoading(false);
    }
  };
  
  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-900 via-purple-900 to-pink-900 relative overflow-hidden flex items-center justify-center p-4">
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-green-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500 rounded-full mix-blend-multiply filter blur-xl opacity-20 animate-blob animation-delay-2000"></div>
      </div>
      
      <div className="relative z-10 bg-white/10 backdrop-blur-xl rounded-2xl shadow-2xl p-8 md:p-10 w-full max-w-md border border-white/20 animate-fade-in">
        <div className="text-center mb-6 md:mb-8">
          <div className="bg-gradient-to-br from-blue-400 to-indigo-600 rounded-full p-5 w-20 h-20 mx-auto mb-6 flex items-center justify-center shadow-2xl transform hover:scale-110 transition-transform duration-300">
            <svg className="w-10 h-10 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2 md:mb-3 drop-shadow-lg">Verify Your Email</h1>
          <p className="text-purple-200 text-base md:text-lg">We've sent a verification code to <span className="font-semibold text-white">{email}</span></p>
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

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label className="block text-sm font-semibold text-white mb-3">
              Enter the 6-digit code
            </label>
            <div className="flex justify-between space-x-2">
              {[0, 1, 2, 3, 4, 5].map((index) => (
                <input
                  key={index}
                  id={`code-${index}`}
                  type="text"
                  inputMode="numeric"
                  pattern="[0-9]*"
                  maxLength={1}
                  value={code[index]}
                  onChange={(e) => handleCodeChange(index, e.target.value)}
                  onPaste={handlePaste}
                  className="w-full h-16 text-2xl text-center bg-white/10 backdrop-blur-sm border-2 border-white/20 rounded-xl focus:ring-2 focus:ring-blue-400 focus:border-blue-400 outline-none text-white placeholder-purple-200 transition-all"
                  autoFocus={index === 0}
                />
              ))}
            </div>
          </div>

          <div className="text-center">
            <button
              type="submit"
              disabled={loading || code.join('').length !== 6}
              className={`w-full px-6 py-4 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500 text-white rounded-xl font-bold text-lg transition-all shadow-2xl hover:shadow-3xl hover:scale-105 transform ${
                loading || code.join('').length !== 6 ? 'opacity-50 cursor-not-allowed' : ''
              }`}
            >
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-purple-300 mb-2">
            Didn't receive a code?{' '}
            <button
              type="button"
              onClick={handleResendCode}
              disabled={resendLoading || countdown > 0}
              className={`font-medium ${
                countdown > 0 ? 'text-purple-400' : 'text-white hover:text-blue-300'
              } transition-colors`}
            >
              {resendLoading
                ? 'Sending...'
                : countdown > 0
                ? `Resend in ${countdown}s`
                : 'Resend Code'}
            </button>
          </p>
          {resendSuccess && (
            <p className="text-sm text-green-400 mt-2">
              Verification code has been resent to your email.
            </p>
          )}
          <div className="mt-6 pt-6 border-t border-white/10">
            <Link
              to="/login"
              className="text-sm text-purple-300 hover:text-purple-200 font-medium transition-colors"
            >
              Back to Login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default VerifyEmail;
