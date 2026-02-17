import { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // Check if user is authenticated on mount
  useEffect(() => {
    checkAuth();
  }, []);

  const checkAuth = async () => {
    const storedToken = localStorage.getItem('token');

    if (!storedToken) {
      setLoading(false);
      setIsAuthenticated(false);
      return;
    }

    try {
      const response = await authAPI.verifyToken();
      if (response.success) {
        setUser(response.user);
        setToken(storedToken);
        setIsAuthenticated(true);
      } else {
        // Token is invalid
        logout();
      }
    } catch (error) {
      console.error('Auth check failed:', error);
      logout();
    } finally {
      setLoading(false);
    }
  };

  const login = async (email, password) => {
    try {
      const response = await authAPI.login(email, password);

      if (response.success) {
        localStorage.setItem('token', response.token);
        setToken(response.token);
        setUser(response.user);
        setIsAuthenticated(true);
        return { success: true };
      } else {
        return { success: false, message: response.message };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Login failed'
      };
    }
  };

  const signup = async (email, username, password, fullName) => {
    try {
      const response = await authAPI.signup(email, username, password, fullName);

      if (response.success) {
        // Only treat user as authenticated if server returned a token
        if (response.token) {
          localStorage.setItem('token', response.token);
          setToken(response.token);
          setUser(response.user);
          setIsAuthenticated(true);
          return { success: true };
        }

        // No token means account created but verification is required
        return { success: true, needsVerification: true };
      } else {
        return { success: false, message: response.message };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Signup failed'
      };
    }
  };

  const logout = async () => {
    try {
      // Best-effort notify server (no-op if not required)
      await authAPI.logout();
    } catch (err) {
      // Ignore server logout failures; proceed with client-side logout
    } finally {
      localStorage.removeItem('token');
      setToken(null);
      setUser(null);
      setIsAuthenticated(false);
    }
  };

  const updateProfile = async (updates) => {
    try {
      const response = await authAPI.updateProfile(updates);

      if (response.success) {
        setUser(response.user);
        if (response.token) {
          localStorage.setItem('token', response.token);
          setToken(response.token);
        }
        return { success: true };
      } else {
        return { success: false, message: response.message };
      }
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Update failed'
      };
    }
  };

  const changePassword = async (currentPassword, newPassword) => {
    try {
      const response = await authAPI.changePassword(currentPassword, newPassword);
      return {
        success: response.success,
        message: response.message
      };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || 'Password change failed'
      };
    }
  };

  const value = {
    user,
    token,
    loading,
    isAuthenticated,
    login,
    signup,
    logout,
    updateProfile,
    changePassword,
    checkAuth
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
