import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor: attach Authorization header
// NOTE: sessionStorage is intentionally used here (not localStorage) so that
// each browser tab/window has its own isolated session. This prevents a new
// tab from inheriting a previously-logged-in user's token.
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('spendlens_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

export const setSessionToken = (token) => {
  if (token) {
    sessionStorage.setItem('spendlens_token', token);
  }
};

export const clearSessionToken = () => {
  sessionStorage.removeItem('spendlens_token');
};

export const getStoredToken = () => sessionStorage.getItem('spendlens_token');

// Dashboard
export const getDashboardSummary = (month, range = 1) =>
  api.get('/api/dashboard/summary', { params: { month, range } }).then((r) => r.data);

export const getMonthlyTrend = (range = 12) =>
  api.get('/api/dashboard/monthly-trend', { params: { range } }).then((r) => r.data);

export const getCategoryBreakdown = (month, range = 1) =>
  api.get('/api/dashboard/category-breakdown', { params: { month, range } }).then((r) => r.data);

export const getTopMerchants = (month, limit = 10, range = 1) =>
  api.get('/api/dashboard/top-merchants', { params: { month, limit, range } }).then((r) => r.data);

export const getAnomalies = (month) =>
  api.get('/api/dashboard/anomalies', { params: { month } }).then((r) => r.data);

export const getInsights = (month, range = 1) =>
  api.get('/api/dashboard/insights', { params: { month, range } }).then((r) => r.data);

// Transactions
export const getTransactions = (params) =>
  api.get('/api/transactions', { params }).then((r) => r.data);

export const getTransaction = (id) =>
  api.get(`/api/transactions/${id}`).then((r) => r.data);

export const updateCategory = (id, category) =>
  api.patch(`/api/transactions/${id}/category`, { category }).then((r) => r.data);

// Subscriptions
export const getSubscriptions = () =>
  api.get('/api/subscriptions').then((r) => r.data);

export const getUpcomingRenewals = () =>
  api.get('/api/subscriptions/upcoming').then((r) => r.data);

// Auth & Sync
export const getAuthStatus = () =>
  api.get('/auth/status').then((r) => r.data);

export const triggerSync = () =>
  api.post('/api/sync', {}, { timeout: 120000 }).then((r) => r.data);

export const disconnectAuth = () =>
  api.post('/auth/logout').then((r) => r.data);

export default api;
