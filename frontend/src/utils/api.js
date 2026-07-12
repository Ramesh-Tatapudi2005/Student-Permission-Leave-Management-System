import axios from 'axios';

// Ensure this matches your FastAPI backend URL
const API = axios.create({ baseURL: 'http://localhost:8000' });

/**
 * Parses an Axios error into a human-readable string.
 *
 * FastAPI returns two shapes depending on the error source:
 *   - HTTPException  → { detail: "plain string message" }
 *   - Pydantic 422   → { detail: [{ loc: [...], msg: "...", type: "..." }, ...] }
 *
 * This function handles both, plus network-level errors (no response at all).
 */
export const getApiError = (err, fallback = 'An unexpected error occurred.') => {
  const detail = err?.response?.data?.detail;
  if (!detail) return err?.message || fallback;

  // Pydantic 422: detail is an array of validation error objects
  if (Array.isArray(detail)) {
    return detail
      .map((d) => {
        const field = d.loc && d.loc.length > 1 ? d.loc[d.loc.length - 1] : null;
        const msg = d.msg || 'Validation error';
        return field ? `${field}: ${msg}` : msg;
      })
      .join(' | ');
  }

  // HTTPException: detail is already a plain string
  if (typeof detail === 'string') return detail;

  return fallback;
};

export const authAPI = {
  loginStudent: (data) => API.post('/auth/login', data),
  loginFaculty: (data) => API.post('/auth/login/faculty', data),
  registerStudent: (data) => API.post('/auth/register', data),
  registerFaculty: (data) => API.post('/auth/register/faculty', data),
};

// FIX 1: Prevent "Not enough segments" by blocking 'undefined' strings
API.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  // Only attach the Bearer token if it actually exists and is not corrupted
  if (token && token !== 'undefined' && token !== 'null') {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const dashboardAPI = {
  // Password change with OTP
  requestPasswordOTP: (data) => API.post('/user/change-password/request-otp', data),
  verifyPasswordOTP: (data) => API.post('/user/change-password/verify-otp', data),

  // Student Endpoints
  getStudentProfile: () => API.get('/student/profile'),
  getStudentHistory: () => API.get('/leaves/student/history'),
  applyPermission: (formData) => API.post('/leaves/apply', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  viewParentLetter: (appId) => API.get(`/leaves/${appId}/attachment`),
  
  // Staff Endpoints (Faculty, HOD, Warden)
  getStaffProfile: () => API.get('/staff/profile'),
  getPendingApplications: () => API.get('/leaves/pending'),
  getReviewedApplications: (filters) => API.get('/leaves/reviewed', { params: filters }),
  processApplication: (id, actionData) => API.put(`/leaves/${id}/action`, actionData),
  
  updatePermission: (id, data) => API.put(`/leaves/student/applications/${id}`, data),
  deletePermission: (id) => API.delete(`/leaves/student/applications/${id}`),
  
  // File Generation
  downloadApprovalLetter: (id) => API.get(`/leaves/${id}/download`, { responseType: 'blob' }),
  generateReport: (filters) => API.get('/leaves/report', { params: filters, responseType: 'blob' }),
  
  // Announcements
  getAnnouncementFeed: (roll_no) => API.get(`/announcements/feed/${roll_no}`),
  createAnnouncement: (payload) => API.post('/announcements', payload),
  acknowledgeEmergency: (announcement_id, roll_no) => API.post(`/announcements/acknowledge`, null, { params: { announcement_id, user_identifier: roll_no } }),
  
  uploadAttachment: (file) => {
    const formData = new FormData();
    formData.append("file", file);
    return API.post('/announcements/upload', formData, {
        headers: { "Content-Type": "multipart/form-data" }
    });
  },
  
  getStaffAnnouncements: (emp_id) => API.get(`/announcements/staff/${emp_id}`),
  
  acknowledgeAnnouncement: (announcement_id, user_identifier) => 
    API.post(`/announcements/acknowledge?announcement_id=${announcement_id}&user_identifier=${user_identifier}`),

  // Proctor Announcement Replies
  postAnnouncementReply: (announcementId, data) =>
    API.post(`/announcements/${announcementId}/reply`, data),
  getAnnouncementReplies: (announcementId, empId) =>
    API.get(`/announcements/${announcementId}/replies`, { params: { emp_id: empId } }),
  getAnnouncementReplyCount: (announcementId) =>
    API.get(`/announcements/${announcementId}/reply-count`),
};

// FIX 2 & 3: Created standalone adminAPI and used capital 'API'.
// Note: Changed to /api/v1/admin/users assuming you used the prefix in main.py
export const adminAPI = {
  getAllUsers: () => API.get('/api/v1/admin/users'),
  provisionUser: (data) => API.post('/api/v1/admin/provision', data),
  bulkProvision: (formData) => API.post('/admin/provision/bulk', formData, {
    headers: { 'Content-Type': 'multipart/form-data' }
  }),
  updateUser: (id, data) => API.put(`/api/v1/admin/users/${id}`, data),
  resetPassword: (id) => API.post(`/api/v1/admin/users/${id}/reset-password`),
  deleteUser: (id) => API.delete(`/api/v1/admin/users/${id}`),
  bulkDelete: (data) => API.post('/api/v1/admin/users/bulk-delete', data),
  // Pillar 2 Endpoints
  getAllApplications: (filters) => API.get('/api/v1/admin/applications', { params: filters }),
  overrideApplication: (id, data) => API.put(`/api/v1/admin/applications/${id}/override`, data),
  exportReport: (filters) => API.get('/api/v1/admin/applications/export', { params: filters, responseType: 'blob' }),
  // Pillar 3 Endpoints
  getModerationFeed: () => API.get('/api/v1/admin/broadcasts/moderation'),
  deployBroadcast: (data) => API.post('/api/v1/admin/broadcasts/deploy', data),
  killBroadcast: (id) => API.delete(`/api/v1/admin/broadcasts/${id}/kill`),
  //Pillar 4 Endpoints
  getTelemetry: () => API.get('/api/v1/admin/telemetry'),
  addDepartment: (data) => API.post('/api/v1/admin/departments', data),
};