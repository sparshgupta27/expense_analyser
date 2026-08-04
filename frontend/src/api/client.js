import axios from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
});

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
  api.post('/api/sync').then((r) => r.data);

export default api;
