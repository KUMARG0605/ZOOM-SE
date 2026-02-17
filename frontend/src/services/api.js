import axios from 'axios';

const API_BASE_URL = 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests if available
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => {
    return Promise.reject(error);
  }
);

export const sessionAPI = {
  startSession: async (sessionName) => {
    const response = await api.post('/session/start', {
      session_id: `session_${Date.now()}`,
      session_name: sessionName,
    });
    return response.data;
  },

  stopSession: async (sessionId) => {
    const response = await api.post(`/session/${sessionId}/stop`);
    return response.data;
  },

  getSessionStats: async (sessionId) => {
    const response = await api.get(`/session/${sessionId}/stats`);
    return response.data;
  },

  getAllReports: async () => {
    const response = await api.get('/reports');
    return response.data;
  },

  getSessionReport: async (sessionId) => {
    const response = await api.get(`/reports/${sessionId}`);
    return response.data;
  },
};

export const emotionAPI = {
  analyzeEmotion: async (sessionId, participantId, imageData) => {
    const response = await api.post('/emotions/analyze', {
      session_id: sessionId,
      participant_id: participantId,
      image: imageData,
    });
    return response.data;
  },
};

export const googleMeetAPI = {
  checkAuthStatus: async () => {
    const response = await api.get('/google-meet/auth/status');
    return response.data;
  },

  initiateAuth: async () => {
    const response = await api.get('/google-meet/auth');
    return response.data;
  },

  createMeeting: async (meetingData) => {
    const response = await api.post('/google-meet/create-meeting', meetingData);
    return response.data;
  },

  listMeetings: async () => {
    const response = await api.get('/google-meet/meetings');
    return response.data;
  },

  deleteMeeting: async (eventId) => {
    const response = await api.delete(`/google-meet/meeting/${eventId}`);
    return response.data;
  },

  captureFrame: async (sessionId, participantId, imageData) => {
    const response = await api.post('/google-meet/capture/frame', {
      session_id: sessionId,
      participant_id: participantId,
      image: imageData,
    });
    return response.data;
  },
};

export const authAPI = {
  login: async (email, password) => {
    const response = await api.post('/auth/login', { email, password });
    return response.data;
  },

  signup: async (email, username, password, fullName) => {
    const response = await api.post('/auth/signup', {
      email,
      username,
      password,
      full_name: fullName
    });
    return response.data;
  },

  verifyEmail: async (email, code) => {
    const response = await api.post('/auth/verify-code', {
      email,
      code,
      purpose: 'verification'
    });
    return response.data;
  },

  resendVerificationEmail: async (email) => {
    const response = await api.post('/auth/resend-verification', { email });
    return response.data;
  },

  verifyPasswordResetCode: async (email, code) => {
    const response = await api.post('/auth/verify-code', {
      email,
      code,
      purpose: 'password_reset'
    });
    return response.data;
  },

  verifyToken: async () => {
    const response = await api.get('/auth/verify-token');
    return response.data;
  },

  getProfile: async () => {
    const response = await api.get('/auth/profile');
    return response.data;
  },

  updateProfile: async (updates) => {
    const response = await api.put('/auth/profile', updates);
    return response.data;
  },

  changePassword: async (currentPassword, newPassword) => {
    const response = await api.post('/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword
    });
    return response.data;
  },

  forgotPassword: async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  resetPassword: async (email, code, newPassword) => {
    const response = await api.post('/auth/reset-password', {
      email,
      code,
      new_password: newPassword
    });
    return response.data;
  },

  requestPasswordReset: async (email) => {
    const response = await api.post('/auth/forgot-password', { email });
    return response.data;
  },

  logout: async () => {
    const response = await api.post('/auth/logout');
    return response.data;
  }
};

export const adminAPI = {
  getUsers: async (params = {}) => {
    const response = await api.get('/admin/users', { params });
    return response.data;
  },

  getUserDetails: async (userId) => {
    const response = await api.get(`/admin/users/${userId}`);
    return response.data;
  },

  updateUser: async (userId, updates) => {
    const response = await api.put(`/admin/users/${userId}`, updates);
    return response.data;
  },

  deleteUser: async (userId) => {
    const response = await api.delete(`/admin/users/${userId}`);
    return response.data;
  },

  getStats: async () => {
    const response = await api.get('/admin/stats');
    return response.data;
  },

  getAllSessions: async (params = {}) => {
    const response = await api.get('/admin/sessions', { params });
    return response.data;
  },

  deleteSession: async (sessionId) => {
    const response = await api.delete(`/admin/sessions/${sessionId}`);
    return response.data;
  },

  bulkUpdateUsers: async (userIds, updates) => {
    const response = await api.post('/admin/users/bulk-update', {
      user_ids: userIds,
      updates
    });
    return response.data;
  },

  grantAdmin: async (userId) => {
    const response = await api.post(`/admin/users/${userId}/grant-admin`);
    return response.data;
  },

  revokeAdmin: async (userId) => {
    const response = await api.post(`/admin/users/${userId}/revoke-admin`);
    return response.data;
  },

  grantAdminByEmail: async (email) => {
    const response = await api.post('/admin/grant-admin', { email });
    return response.data;
  },

  revokeAdminByEmail: async (email) => {
    const response = await api.post('/admin/revoke-admin', { email });
    return response.data;
  }
};

export const dailyAPI = {
  createRoom: async (roomData) => {
    const response = await api.post('/daily/create-room', roomData);
    return response.data;
  },

  listRooms: async () => {
    const response = await api.get('/daily/rooms');
    return response.data;
  },

  getRoom: async (roomName) => {
    const response = await api.get(`/daily/room/${roomName}`);
    return response.data;
  },

  deleteRoom: async (roomName) => {
    const response = await api.delete(`/daily/room/${roomName}`);
    return response.data;
  },

  createMeetingToken: async (tokenData) => {
    const response = await api.post('/daily/meeting-token', tokenData);
    return response.data;
  }
};

export const healthCheck = async () => {
  const response = await api.get('/health');
  return response.data;
};

export default api;
