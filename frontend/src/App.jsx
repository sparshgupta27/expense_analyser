import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, CreditCard, RefreshCw, ChevronLeft, ChevronRight,
  Wallet, AlertCircle, CheckCircle, ChevronDown, LogOut, RotateCw,
  Trash2, UserCircle2
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Subscriptions from './pages/Subscriptions';
import SignInWall from './components/SignInWall';
import {
  getAuthStatus, triggerSync, disconnectAuth, resetAllData, signInAsGuest,
  setSessionToken, clearSessionToken, storeUserFromToken, getStoredUser,
  API_URL
} from './api/client';

class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('ErrorBoundary caught error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-lg mx-auto bg-[#12121a] border border-rose-500/30 rounded-xl text-center my-12">
          <AlertCircle className="w-10 h-10 text-rose-400 mx-auto mb-3" />
          <h3 className="text-lg font-bold text-white">Something went wrong</h3>
          <p className="text-xs text-slate-400 mt-1 mb-4">{this.state.error?.message || 'An unexpected rendering error occurred.'}</p>
          <button
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-xs font-semibold hover:bg-indigo-500 transition"
          >
            Reload Dashboard
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const NAV_ITEMS = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'transactions', label: 'Transactions', icon: CreditCard },
  { id: 'subscriptions', label: 'Subscriptions', icon: RefreshCw },
];

const TIME_RANGES = [
  { id: 1, label: '1M' },
  { id: 3, label: '3M' },
  { id: 6, label: '6M' },
  { id: 12, label: '12M' },
];

function getLocalYearMonth(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function getSyncErrorMessage(err, fallback) {
  const data = err?.response?.data;
  if (data?.details) return data.details;
  if (data?.error) return data.error;
  if (err?.code === 'ECONNABORTED') return 'Sync timed out before the server replied.';
  if (err?.message) return err.message;
  return fallback;
}

/** Derive a two-letter avatar from an email or display name */
function getInitials(emailOrName = '') {
  const parts = emailOrName.split(/[@.\s]+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return (parts[0]?.[0] || '?').toUpperCase();
}

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(getLocalYearMonth());
  const [timeRange, setTimeRange] = useState(1);
  const [authBanner, setAuthBanner] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncOverlay, setSyncOverlay] = useState(false);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const [currentUser, setCurrentUser] = useState(null);  // { id, email }
  const [resetConfirm, setResetConfirm] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleUnauthorized = (e) => {
      setIsConnected(false);
      setCurrentUser(null);
      
      let errorMsg = 'Session expired or invalid.';
      if (e && e.detail) {
        errorMsg = `401 from ${e.detail.url}: ${JSON.stringify(e.detail.response)}`;
      }
      setAuthBanner(errorMsg);
    };
    window.addEventListener('spendlens:401', handleUnauthorized);
    return () => window.removeEventListener('spendlens:401', handleUnauthorized);
  }, []);

  useEffect(() => {
    if (window.location.pathname === '/auth/google/callback') {
      const callbackUrl = new URL(`${API_URL}/auth/google/callback`);
      callbackUrl.search = window.location.search;
      window.location.replace(callbackUrl.toString());
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const justConnected = params.get('connected') === 'true';
    const needsAutoSync = params.get('autosync') === 'true';
    const token = params.get('token');

    if (token) {
      setSessionToken(token);
      // Decode JWT to get user identity (sub=UUID, email)
      const user = storeUserFromToken(token);
      if (user) setCurrentUser(user);
    }

    if (justConnected) {
      setIsConnected(true);
      setAuthLoading(false);
      window.history.replaceState({}, document.title, window.location.pathname);

      if (needsAutoSync) {
        setSyncOverlay(true);
        triggerSync()
          .then((result) => {
            setSyncOverlay(false);
            if (result?.latest_month) setSelectedMonth(result.latest_month);
            setRefreshNonce((n) => n + 1);
            setAuthBanner(
              result?.parsed > 0
                ? `Gmail connected. Parsed ${result.parsed} transactions.`
                : `Gmail connected, but no transaction emails were parsed from ${result?.fetched || 0} matched emails.`
            );
          })
          .catch((err) => {
            setSyncOverlay(false);
            setAuthBanner(getSyncErrorMessage(err, 'Gmail connected, but sync failed.'));
          });
      } else {
        setAuthBanner('Gmail Account Connected Successfully!');
      }
    } else if (params.get('error')) {
      setAuthBanner('Authorization was cancelled or failed.');
      window.history.replaceState({}, document.title, window.location.pathname);
      setAuthLoading(false);
    } else {
      // No URL params — restore user from sessionStorage, then verify server auth
      const storedUser = getStoredUser();
      if (storedUser) setCurrentUser(storedUser);

      getAuthStatus()
        .then((res) => {
          if (res?.authenticated) {
            setIsConnected(true);
            // Sync server email into state (authoritative)
            if (res.email && storedUser) {
              setCurrentUser((u) => ({ ...u, email: res.email }));
            }
          } else {
            clearSessionToken();
            setCurrentUser(null);
            setIsConnected(false);
          }
        })
        .catch(() => {
          clearSessionToken();
          setCurrentUser(null);
          setIsConnected(false);
        })
        .finally(() => {
          setAuthLoading(false);
        });
      return;
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
        setResetConfirm(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const currentMaxMonth = getLocalYearMonth(new Date());

  const navigateMonth = (direction) => {
    const [year, month] = selectedMonth.split('-').map(Number);
    const date = new Date(year, month - 1 + direction, 1);
    const nextMonth = getLocalYearMonth(date);
    if (direction > 0 && nextMonth > currentMaxMonth) return;
    setSelectedMonth(nextMonth);
  };

  const [yearNum, monthNum] = selectedMonth.split('-').map(Number);
  const monthLabel = new Date(yearNum, monthNum - 1, 1).toLocaleDateString('en-IN', {
    month: 'long',
    year: 'numeric',
  });

  const isNextDisabled = selectedMonth >= currentMaxMonth;

  const handleSyncNow = async () => {
    setIsSyncing(true);
    setDropdownOpen(false);
    try {
      await triggerSync();
      setAuthBanner('Gmail sync running! Fetching and parsing your bank & UPI emails...');
      setTimeout(() => {
        setRefreshNonce((n) => n + 1);
        setIsSyncing(false);
      }, 4000);
    } catch (err) {
      setIsSyncing(false);
      setAuthBanner(getSyncErrorMessage(err, 'Sync failed. Please try reconnecting Gmail.'));
    }
  };

  const handleDisconnect = async () => {
    try {
      await disconnectAuth();
    } catch (e) {}
    clearSessionToken();
    setCurrentUser(null);
    setIsConnected(false);
    setDropdownOpen(false);
    setResetConfirm(false);
    setAuthBanner(null);
  };

  const handleResetData = async () => {
    if (!resetConfirm) {
      setResetConfirm(true);
      return;
    }
    setIsResetting(true);
    try {
      await resetAllData();
      setRefreshNonce((n) => n + 1);
      setAuthBanner('All your data has been reset successfully.');
    } catch (err) {
      setAuthBanner(getSyncErrorMessage(err, 'Reset failed. Please try again.'));
    } finally {
      setIsResetting(false);
      setResetConfirm(false);
      setDropdownOpen(false);
    }
  };

  const handleGuestLogin = async () => {
    setAuthLoading(true);
    try {
      const res = await signInAsGuest();
      if (res.token) {
        setSessionToken(res.token);
        const user = storeUserFromToken(res.token);
        setCurrentUser(user);
        setIsConnected(true);
        setAuthBanner('Logged in as Demo Guest. Mock data loaded!');
        setRefreshNonce((n) => n + 1); // trigger refresh
      }
    } catch (err) {
      console.error(err);
      setAuthBanner('Failed to enter Guest Mode.');
    } finally {
      setAuthLoading(false);
    }
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard month={selectedMonth} range={timeRange} refreshKey={refreshNonce} />;
      case 'transactions':
        return <Transactions month={selectedMonth} range={timeRange} />;
      case 'subscriptions':
        return <Subscriptions />;
      default:
        return <Dashboard month={selectedMonth} range={timeRange} />;
    }
  };

  // ── Auth gate: loading spinner ──
  if (authLoading) {
    return (
      <div className="min-h-screen bg-[#FAF8F3] flex flex-col items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[#E8E3D8] border-t-[#2D5C4E] rounded-full animate-spin" />
          <p className="text-sm text-[#6C6A65] font-medium">Loading SpendLens…</p>
        </div>
      </div>
    );
  }

  // ── Auth gate: sign-in wall ──
  if (!isConnected) {
    return <SignInWall apiUrl={API_URL} onGuestLogin={handleGuestLogin} />;
  }

  const userInitials = getInitials(currentUser?.email || '');
  const userEmail = currentUser?.email || '';

  return (
    <ErrorBoundary>
      {/* Full-screen syncing overlay */}
      {syncOverlay && (
        <div className="fixed inset-0 z-[9999] bg-[#FAF8F3]/95 backdrop-blur-sm flex flex-col items-center justify-center">
          <div className="flex flex-col items-center gap-5 p-10 rounded-2xl bg-white border border-[#E8E3D8] shadow-lg max-w-sm mx-4">
            <div className="w-14 h-14 border-4 border-[#E8E3D8] border-t-[#2D5C4E] rounded-full animate-spin" />
            <div className="text-center">
              <h3 className="text-lg font-bold text-[#1C1B19] tracking-tight">Syncing Emails</h3>
              <p className="text-sm text-[#6C6A65] mt-1.5">Scanning your Gmail for transaction emails...</p>
              <p className="text-xs text-[#6C6A65] mt-3 font-mono">This may take a moment</p>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-col md:flex-row min-h-screen bg-[#FAF8F3] text-[#1C1B19] font-sans">
        {/* Sidebar */}
        <aside className="w-full md:w-64 bg-white border-b md:border-b-0 md:border-r border-[#E8E3D8] p-5 flex flex-col md:fixed md:inset-y-0 z-50 shadow-[1px_0_3px_rgba(28,27,25,0.02)]">
          {/* Logo */}
          <div className="flex items-center justify-between md:justify-start gap-3 mb-6 md:mb-8">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-lg bg-[#2D5C4E] flex items-center justify-center text-white shadow-sm">
                <Wallet className="w-5 h-5" />
              </div>
              <div>
                <h1 className="font-bold text-lg text-[#1C1B19] tracking-tight">SpendLens</h1>
                <p className="text-[10px] text-[#6C6A65] font-semibold tracking-wider uppercase">UPI & Bank Passbook</p>
              </div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex md:flex-col gap-1.5 flex-1 overflow-x-auto pb-2 md:pb-0">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`flex items-center gap-2.5 px-3.5 py-2 rounded-md text-xs font-semibold whitespace-nowrap transition-all ${
                    isActive
                      ? 'bg-[#EBF3F0] text-[#2D5C4E] border border-[#D2E4DC] shadow-xs'
                      : 'text-[#6C6A65] hover:bg-[#F5F2EA] hover:text-[#1C1B19]'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          {/* User Identity Badge — shown on desktop sidebar */}
          {userEmail && (
            <div className="hidden md:flex items-center gap-2.5 mt-4 pt-4 border-t border-[#E8E3D8]">
              <div className="w-8 h-8 rounded-full bg-[#EBF3F0] border border-[#D2E4DC] flex items-center justify-center text-[#2D5C4E] text-[11px] font-bold flex-shrink-0 select-none">
                {userInitials}
              </div>
              <div className="min-w-0">
                <p className="text-[11px] font-semibold text-[#1C1B19] truncate" title={userEmail}>
                  {userEmail.split('@')[0]}
                </p>
                <p className="text-[10px] text-[#6C6A65] truncate" title={userEmail}>
                  {userEmail}
                </p>
              </div>
            </div>
          )}

          <div className="hidden md:block pt-3 text-center">
            <p className="text-[10px] text-[#6C6A65] font-mono">SpendLens Ledger v1.0</p>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 md:ml-64 p-4 sm:p-6 lg:p-8 min-h-screen">
          {authBanner && (
            <div className="flex items-center justify-between p-4 mb-6 rounded-lg bg-[#EBF3F0] border border-[#D2E4DC] text-[#2D5C4E] text-xs font-medium animate-fadeIn">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-4 h-4 text-[#2D5C4E]" />
                <span>{authBanner}</span>
              </div>
              <button
                onClick={() => setAuthBanner(null)}
                className="text-xs text-[#2D5C4E] hover:text-[#1C1B19]"
              >
                ✕
              </button>
            </div>
          )}

          <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6 pb-4 border-b border-[#E8E3D8]">
            <div>
              <h2 className="text-xl sm:text-2xl font-bold text-[#1C1B19] tracking-tight">
                {NAV_ITEMS.find((n) => n.id === activePage)?.label}
              </h2>
              <p className="text-xs text-[#6C6A65] mt-0.5">Automated expense insights parsed directly from bank & UPI emails</p>
            </div>

            {activePage !== 'subscriptions' && (
              <div className="flex flex-wrap items-center gap-3">
                {/* Time Range Selector */}
                <div className="flex items-center bg-white border border-[#E8E3D8] rounded-md p-1 gap-1 shadow-2xs">
                  {TIME_RANGES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setTimeRange(r.id)}
                      className={`px-2.5 py-1 text-xs font-semibold font-mono rounded transition ${
                        timeRange === r.id
                          ? 'bg-[#2D5C4E] text-white shadow-2xs'
                          : 'text-[#6C6A65] hover:text-[#1C1B19] hover:bg-[#F5F2EA]'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                {/* Gmail Connection Status / Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  {isConnected ? (
                    <button
                      onClick={() => { setDropdownOpen(!dropdownOpen); setResetConfirm(false); }}
                      className="flex items-center gap-2 px-3 py-1.5 bg-[#EBF3F0] border border-[#D2E4DC] hover:bg-[#E2EFEA] text-[#2D5C4E] rounded-md text-xs font-semibold transition"
                    >
                      {/* Show user initial inside the connected button */}
                      <span className="w-4 h-4 rounded-full bg-[#2D5C4E] text-white text-[9px] font-bold flex items-center justify-center flex-shrink-0">
                        {userInitials}
                      </span>
                      <span className="hidden sm:inline max-w-[120px] truncate" title={userEmail}>
                        {userEmail.split('@')[0]}
                      </span>
                      <span className="sm:hidden">Account</span>
                      <ChevronDown className="w-3.5 h-3.5 opacity-70 ml-1" />
                    </button>
                  ) : (
                    <a
                      href={`${API_URL}/auth/google?origin=${encodeURIComponent(window.location.origin)}`}
                      className="flex items-center gap-2 px-3 py-1.5 bg-[#2D5C4E] hover:bg-[#254B40] text-white rounded-md text-xs font-semibold transition shadow-xs"
                    >
                      <Wallet className="w-3.5 h-3.5" />
                      <span>Connect Gmail</span>
                    </a>
                  )}

                  {/* Dropdown Menu */}
                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-64 bg-white border border-[#E8E3D8] rounded-lg shadow-lg p-1.5 z-50">
                      {/* User info header inside dropdown */}
                      {userEmail && (
                        <div className="flex items-center gap-2.5 px-3 py-2.5 mb-1 border-b border-[#E8E3D8]">
                          <div className="w-8 h-8 rounded-full bg-[#EBF3F0] border border-[#D2E4DC] flex items-center justify-center text-[#2D5C4E] text-[11px] font-bold flex-shrink-0">
                            {userInitials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-[11px] font-semibold text-[#1C1B19] truncate">{userEmail.split('@')[0]}</p>
                            <p className="text-[10px] text-[#6C6A65] truncate" title={userEmail}>{userEmail}</p>
                          </div>
                        </div>
                      )}

                      <button
                        onClick={handleSyncNow}
                        disabled={isSyncing}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1C1B19] hover:bg-[#F5F2EA] rounded transition"
                      >
                        <RotateCw className={`w-3.5 h-3.5 text-[#2D5C4E] ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>{isSyncing ? 'Syncing Emails...' : 'Sync Emails Now'}</span>
                      </button>

                      <a
                        href={`${API_URL}/auth/google?origin=${encodeURIComponent(window.location.origin)}`}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#1C1B19] hover:bg-[#F5F2EA] rounded transition"
                      >
                        <UserCircle2 className="w-3.5 h-3.5 text-[#8C6D23]" />
                        <span>Change Account</span>
                      </a>

                      <div className="my-1 border-t border-[#E8E3D8]" />

                      {/* Reset Data — two-step confirm */}
                      {resetConfirm ? (
                        <div className="px-3 py-2 rounded bg-[#FBF0F0] border border-[#EDD5D5] mx-0.5">
                          <p className="text-[11px] text-[#B33F3F] font-semibold mb-2">
                            This deletes ALL your transactions, subscriptions, and merchant profiles. Continue?
                          </p>
                          <div className="flex gap-2">
                            <button
                              onClick={handleResetData}
                              disabled={isResetting}
                              className="flex-1 px-2 py-1 bg-[#B33F3F] text-white rounded text-[11px] font-bold hover:bg-[#9C3535] disabled:opacity-50 transition"
                            >
                              {isResetting ? 'Resetting...' : 'Yes, Reset'}
                            </button>
                            <button
                              onClick={() => setResetConfirm(false)}
                              className="flex-1 px-2 py-1 bg-white border border-[#E8E3D8] text-[#6C6A65] rounded text-[11px] font-medium hover:bg-[#F5F2EA] transition"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <button
                          onClick={handleResetData}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#8C6D23] hover:bg-[#FAF5EA] rounded transition"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>Reset My Data</span>
                        </button>
                      )}

                      <button
                        onClick={handleDisconnect}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-[#B33F3F] hover:bg-[#FBF0F0] rounded transition"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  )}
                </div>

                {/* Month Selector */}
                <div className="flex items-center bg-white border border-[#E8E3D8] rounded-md p-1">
                  <button
                    onClick={() => navigateMonth(-1)}
                    className="p-1 rounded hover:bg-[#F5F2EA] text-[#6C6A65] hover:text-[#1C1B19] transition"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-mono font-semibold text-[#1C1B19] px-2.5 min-w-[120px] text-center">
                    {monthLabel}
                  </span>
                  <button
                    onClick={() => navigateMonth(1)}
                    disabled={isNextDisabled}
                    className="p-1 rounded hover:bg-[#F5F2EA] text-[#6C6A65] hover:text-[#1C1B19] disabled:opacity-30 disabled:cursor-not-allowed transition"
                    title="Next Month"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )}
          </header>

          {renderPage()}
        </main>
      </div>
    </ErrorBoundary>
  );
}
