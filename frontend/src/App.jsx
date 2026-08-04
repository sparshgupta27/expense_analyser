import React, { useState, useEffect, useRef } from 'react';
import {
  LayoutDashboard, CreditCard, RefreshCw, ChevronLeft, ChevronRight,
  Wallet, AlertCircle, CheckCircle, ChevronDown, LogOut, RotateCw
} from 'lucide-react';
import Dashboard from './pages/Dashboard';
import Transactions from './pages/Transactions';
import Subscriptions from './pages/Subscriptions';
import { getAuthStatus, triggerSync } from './api/client';

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

export default function App() {
  const [activePage, setActivePage] = useState('dashboard');
  const [selectedMonth, setSelectedMonth] = useState(getLocalYearMonth());
  const [timeRange, setTimeRange] = useState(1); // 1, 3, 6, 12 months
  const [authBanner, setAuthBanner] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const dropdownRef = useRef(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('connected') === 'true') {
      localStorage.setItem('gmail_connected', 'true');
      setIsConnected(true);
      setAuthBanner('Gmail Account Connected Successfully!');
    } else if (localStorage.getItem('gmail_connected') === 'true') {
      setIsConnected(true);
    }

    getAuthStatus()
      .then((res) => {
        if (res?.authenticated) {
          setIsConnected(true);
          localStorage.setItem('gmail_connected', 'true');
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    function handleClickOutside(event) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target)) {
        setDropdownOpen(false);
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

    if (direction > 0 && nextMonth > currentMaxMonth) {
      return;
    }
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
    try {
      await triggerSync();
      setAuthBanner('Sync completed! Clean transaction history updated.');
    } catch (err) {
      setAuthBanner('Sync triggered.');
    } finally {
      setIsSyncing(false);
      setDropdownOpen(false);
    }
  };

  const handleDisconnect = () => {
    localStorage.removeItem('gmail_connected');
    setIsConnected(false);
    setDropdownOpen(false);
  };

  const renderPage = () => {
    switch (activePage) {
      case 'dashboard':
        return <Dashboard month={selectedMonth} range={timeRange} />;
      case 'transactions':
        return <Transactions month={selectedMonth} range={timeRange} />;
      case 'subscriptions':
        return <Subscriptions />;
      default:
        return <Dashboard month={selectedMonth} range={timeRange} />;
    }
  };

  return (
    <ErrorBoundary>
      <div className="flex min-h-screen bg-[#0a0a0f] text-slate-100 font-sans">
        {/* Sidebar Navigation */}
        <aside className="w-64 bg-[#12121a] border-r border-slate-800/80 p-6 flex flex-col fixed inset-y-0 z-50">
          <div className="flex items-center gap-3 mb-8">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white shadow-lg shadow-indigo-500/20">
              <Wallet className="w-5 h-5" />
            </div>
            <div>
              <h1 className="font-extrabold text-lg bg-gradient-to-r from-indigo-400 to-purple-400 bg-clip-text text-transparent">
                SpendLens
              </h1>
              <p className="text-[10px] text-slate-500 font-medium tracking-wide uppercase">Gmail Intelligence</p>
            </div>
          </div>

          <nav className="space-y-1.5 flex-1">
            {NAV_ITEMS.map((item) => {
              const Icon = item.icon;
              const isActive = activePage === item.id;

              return (
                <button
                  key={item.id}
                  onClick={() => setActivePage(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-indigo-500/15 text-indigo-400 border border-indigo-500/30 shadow-sm'
                      : 'text-slate-400 hover:bg-slate-800/60 hover:text-slate-200'
                  }`}
                >
                  <Icon className="w-4 h-4 flex-shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>

          <div className="pt-4 border-t border-slate-800/80 text-center">
            <p className="text-[11px] text-slate-500">Gmail Expense Analyzer v1.0</p>
          </div>
        </aside>

        {/* Main Content Area */}
        <main className="flex-1 ml-64 p-8 min-h-screen">
          {authBanner && (
            <div className="flex items-center justify-between p-4 mb-6 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-sm font-semibold animate-fadeIn">
              <div className="flex items-center gap-3">
                <CheckCircle className="w-5 h-5 text-emerald-400" />
                <span>{authBanner}</span>
              </div>
              <button
                onClick={() => setAuthBanner(null)}
                className="text-xs text-emerald-400 hover:text-white"
              >
                ✕
              </button>
            </div>
          )}

          <header className="flex items-center justify-between mb-8">
            <div>
              <h2 className="text-2xl font-bold text-white tracking-tight">
                {NAV_ITEMS.find((n) => n.id === activePage)?.label}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">Automated expense insights parsed directly from your inbox</p>
            </div>

            {activePage !== 'subscriptions' && (
              <div className="flex items-center gap-3">
                {/* Time Range Selector Pills (1M | 3M | 6M | 12M) */}
                <div className="flex items-center bg-[#12121a] border border-slate-800 rounded-xl p-1 gap-1">
                  {TIME_RANGES.map((r) => (
                    <button
                      key={r.id}
                      onClick={() => setTimeRange(r.id)}
                      className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition ${
                        timeRange === r.id
                          ? 'bg-indigo-600 text-white shadow-sm'
                          : 'text-slate-400 hover:text-white hover:bg-slate-800'
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>

                {/* Gmail Connection Status Button / Dropdown */}
                <div className="relative" ref={dropdownRef}>
                  {isConnected ? (
                    <button
                      onClick={() => setDropdownOpen(!dropdownOpen)}
                      className="flex items-center gap-2 px-3.5 py-2 bg-emerald-500/15 border border-emerald-500/30 hover:bg-emerald-500/20 text-emerald-300 rounded-xl text-xs font-semibold shadow-sm transition"
                    >
                      <CheckCircle className="w-4 h-4 text-emerald-400" />
                      <span>Gmail Connected</span>
                      <ChevronDown className="w-3.5 h-3.5 opacity-70 ml-1" />
                    </button>
                  ) : (
                    <a
                      href="http://localhost:3001/auth/google"
                      className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-xs font-semibold shadow-md shadow-indigo-500/20 transition"
                    >
                      <Wallet className="w-4 h-4" />
                      <span>Connect Gmail</span>
                    </a>
                  )}

                  {/* Dropdown Menu */}
                  {dropdownOpen && (
                    <div className="absolute right-0 mt-2 w-56 bg-[#12121a] border border-slate-800 rounded-xl shadow-2xl p-1.5 z-50 animate-fadeIn">
                      <button
                        onClick={handleSyncNow}
                        disabled={isSyncing}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded-lg transition"
                      >
                        <RotateCw className={`w-3.5 h-3.5 text-indigo-400 ${isSyncing ? 'animate-spin' : ''}`} />
                        <span>{isSyncing ? 'Syncing Emails...' : 'Sync Emails Now'}</span>
                      </button>

                      <a
                        href="http://localhost:3001/auth/google"
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800 rounded-lg transition"
                      >
                        <Wallet className="w-3.5 h-3.5 text-purple-400" />
                        <span>Change Account</span>
                      </a>

                      <div className="my-1 border-t border-slate-800" />

                      <button
                        onClick={handleDisconnect}
                        className="w-full flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-rose-400 hover:bg-rose-500/10 rounded-lg transition"
                      >
                        <LogOut className="w-3.5 h-3.5" />
                        <span>Disconnect</span>
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2 bg-[#12121a] border border-slate-800 rounded-xl p-1">
                  <button
                    onClick={() => navigateMonth(-1)}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white transition"
                    title="Previous Month"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <span className="text-xs font-semibold text-slate-200 px-3 min-w-[130px] text-center">
                    {monthLabel}
                  </span>
                  <button
                    onClick={() => navigateMonth(1)}
                    disabled={isNextDisabled}
                    className="p-1.5 rounded-lg hover:bg-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition"
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
