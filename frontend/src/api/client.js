import axios from 'axios';

export const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_URL,
  timeout: 60000,
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

// ── Session Storage (sessionStorage → per-tab isolation) ─────────────────────
// sessionStorage is used intentionally: each browser tab has its own isolated
// session. Opening a new tab will NOT inherit another user's token.

export const setSessionToken = (token) => {
  if (token) sessionStorage.setItem('spendlens_token', token);
};

export const clearSessionToken = () => {
  sessionStorage.removeItem('spendlens_token');
  sessionStorage.removeItem('spendlens_user');
};

export const getStoredToken = () => sessionStorage.getItem('spendlens_token');

/**
 * Decode JWT payload (client-side, no verification).
 * Used only for reading display fields (email, sub). Auth is always
 * enforced server-side via the Bearer token on every request.
 */
export function decodeJwtPayload(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')));
    return payload;
  } catch {
    return null;
  }
}

/**
 * Store decoded user identity from JWT in sessionStorage.
 * Keeps { id, email } available without re-decoding on every render.
 */
export function storeUserFromToken(token) {
  const payload = decodeJwtPayload(token);
  if (!payload?.sub || !payload?.email) return null;
  const user = { id: payload.sub, email: payload.email };
  sessionStorage.setItem('spendlens_user', JSON.stringify(user));
  return user;
}

export function getStoredUser() {
  try {
    const raw = sessionStorage.getItem('spendlens_user');
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

// ── Request interceptor: attach Authorization header ─────────────────────────
api.interceptors.request.use((config) => {
  const token = getStoredToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.headers['X-Authorization'] = `Bearer ${token}`; // Bypass IIS dropping header
  }
  return config;
});

// ── Response interceptor: handle 401 globally ────────────────────────────────
// If any API call returns 401 (expired/invalid JWT), clear the session and
// trigger a state update instead of a hard reload, to preserve debugging.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error?.response?.status === 401) {
      const isAuthStatusCheck = error?.config?.url?.includes('/auth/status');
      if (!isAuthStatusCheck) {
        clearSessionToken();
        // Softly clear URL params and let React re-render
        window.history.replaceState({}, document.title, '/');
        // Dispatch a custom event so App.jsx can respond with details
        window.dispatchEvent(new CustomEvent('spendlens:401', { 
          detail: { url: error.config.url, response: error.response.data } 
        }));
      }
    }
    return Promise.reject(error);
  }
);

// ── Dashboard ─────────────────────────────────────────────────────────────────
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

// ── Transactions ──────────────────────────────────────────────────────────────
export const getTransactions = (params) =>
  api.get('/api/transactions', { params }).then((r) => r.data);

export const getTransaction = (id) =>
  api.get(`/api/transactions/${id}`).then((r) => r.data);

export const updateCategory = (id, category) =>
  api.patch(`/api/transactions/${id}/category`, { category }).then((r) => r.data);

// ── Subscriptions ─────────────────────────────────────────────────────────────
export const getSubscriptions = () =>
  api.get('/api/subscriptions').then((r) => r.data);

export const getUpcomingRenewals = () =>
  api.get('/api/subscriptions/upcoming').then((r) => r.data);

// ── Auth & Sync ───────────────────────────────────────────────────────────────
export const getAuthStatus = () =>
  api.get('/auth/status', { timeout: 10000 }).then((r) => r.data);

export const signInAsGuest = () =>
  api.post('/auth/guest').then((r) => r.data);

export const triggerSync = () =>
  api.post('/api/sync', {}, { timeout: 120000 }).then((r) => r.data);

export const disconnectAuth = () =>
  api.post('/auth/logout').then((r) => r.data);

export const resetAllData = () =>
  api.post('/api/reset').then((r) => r.data);

export default api;
