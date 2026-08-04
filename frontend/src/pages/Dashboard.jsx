import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, BarChart, Bar
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard, Layers,
  ShoppingBag, Sparkles
} from 'lucide-react';
import { Card, CardTitle, Metric, Text } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import {
  getDashboardSummary, getMonthlyTrend, getCategoryBreakdown,
  getTopMerchants, getAnomalies, getInsights
} from '../api/client';

const CATEGORY_COLORS = {
  Food: '#f97316',
  Shopping: '#8b5cf6',
  Bills: '#06b6d4',
  Transport: '#22c55e',
  Entertainment: '#ec4899',
  Subscriptions: '#eab308',
  Other: '#64748b',
};

const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

export default function Dashboard({ month, range = 1 }) {
  const [summary, setSummary] = useState(null);
  const [trend, setTrend] = useState([]);
  const [categories, setCategories] = useState([]);
  const [merchants, setMerchants] = useState([]);
  const [anomalies, setAnomalies] = useState([]);
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      try {
        const [s, t, c, m, a, i] = await Promise.all([
          getDashboardSummary(month, range).catch(() => null),
          getMonthlyTrend(range === 1 ? 12 : range).catch(() => []),
          getCategoryBreakdown(month, range).catch(() => []),
          getTopMerchants(month, 10, range).catch(() => []),
          getAnomalies(month).catch(() => []),
          getInsights(month, range).catch(() => []),
        ]);
        setSummary(s);
        setTrend(Array.isArray(t) ? t : []);
        setCategories(Array.isArray(c) ? c : []);
        setMerchants(Array.isArray(m) ? m : []);
        setAnomalies(Array.isArray(a) ? a : []);
        setInsights(Array.isArray(i) ? i : []);
      } catch (err) {
        console.error('Dashboard fetch error:', err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [month, range]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-400">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin mb-3" />
        <span className="text-sm font-medium">Loading financial intelligence...</span>
      </div>
    );
  }

  const safeTrend = Array.isArray(trend) ? trend : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeMerchants = Array.isArray(merchants) ? merchants : [];
  const safeAnomalies = Array.isArray(anomalies) ? anomalies : [];
  const safeInsights = Array.isArray(insights) ? insights : [];

  const trendData = safeTrend.map((t) => ({
    month: t.month?.substring(5) || '',
    spent: parseFloat(t.total_debit || 0),
    income: parseFloat(t.total_credit || 0),
  }));

  const rangeLabel = range === 1 ? 'Selected Month' : `Last ${range} Months`;

  return (
    <div className="space-y-6">
      {/* Tremor-style KPI Card Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Total Spent ({rangeLabel})</CardTitle>
            <div className="p-2 bg-indigo-500/10 rounded-lg text-indigo-400">
              <CreditCard className="w-4 h-4" />
            </div>
          </div>
          <Metric>{fmt(summary?.total_spent)}</Metric>
          <Text className="text-xs">{rangeLabel} spending total</Text>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Income / Refunds</CardTitle>
            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-400">
              <DollarSign className="w-4 h-4" />
            </div>
          </div>
          <Metric className="text-emerald-400">{fmt(summary?.total_income)}</Metric>
          <Text className="text-xs">Credits & refunds received</Text>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Transactions</CardTitle>
            <div className="p-2 bg-purple-500/10 rounded-lg text-purple-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <Metric>{summary?.transaction_count || 0}</Metric>
          <Text className="text-xs">Parsed transaction emails</Text>
        </Card>

        <Card>
          <div className="flex items-center justify-between">
            <CardTitle>Active Categories</CardTitle>
            <div className="p-2 bg-cyan-500/10 rounded-lg text-cyan-400">
              <Layers className="w-4 h-4" />
            </div>
          </div>
          <Metric>{safeCategories.length}</Metric>
          <Text className="text-xs">Active spend categories</Text>
        </Card>
      </div>

      {/* Anomaly Alerts */}
      {safeAnomalies.map((a, idx) => (
        <Alert
          key={idx}
          variant={a.severity === 'high' ? 'danger' : 'warning'}
          title={`Spending Anomaly Detected in ${a.category}`}
        >
          Your spending in <strong className="text-white font-bold">{a.category}</strong> is{' '}
          <span className="font-semibold text-amber-300">{a.pct_over}% above</span> your rolling average.
        </Alert>
      ))}

      {/* Main Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Monthly Spend Trend */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Monthly Spend Trend</CardTitle>
            <span className="text-xs text-slate-400">{rangeLabel} Trend</span>
          </div>
          {trendData.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <AreaChart data={trendData}>
                <defs>
                  <linearGradient id="spentGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#252540" />
                <XAxis dataKey="month" stroke="#64748b" fontSize={12} />
                <YAxis stroke="#64748b" fontSize={12} tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v) => [fmt(v), 'Spent']} />
                <Area type="monotone" dataKey="spent" stroke="#818cf8" strokeWidth={2.5} fill="url(#spentGrad)" name="Spent" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-slate-500 text-sm">No transaction trend data available.</div>
          )}
        </Card>

        {/* Category Breakdown */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Category Breakdown</CardTitle>
            <span className="text-xs text-slate-400">{rangeLabel}</span>
          </div>
          {safeCategories.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={safeCategories}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={90}
                    paddingAngle={3}
                  >
                    {safeCategories.map((c, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[c.category] || CATEGORY_COLORS.Other} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v, n) => [fmt(v), n]} />
                </PieChart>
              </ResponsiveContainer>
              <div className="flex flex-wrap gap-2 mt-4 pt-4 border-t border-slate-800/80">
                {safeCategories.map((c) => (
                  <Badge key={c.category} variant={c.category.toLowerCase()}>
                    {c.category} ({c.percentage}%)
                  </Badge>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-12 text-slate-500 text-sm">No category data for this period.</div>
          )}
        </Card>

        {/* Top Merchants */}
        <Card>
          <div className="flex items-center justify-between mb-4">
            <CardTitle>Merchant Leaderboard</CardTitle>
            <span className="text-xs text-slate-400">{rangeLabel}</span>
          </div>
          {safeMerchants.length > 0 ? (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={safeMerchants.slice(0, 7)} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#252540" />
                <XAxis type="number" stroke="#64748b" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="merchant" stroke="#94a3b8" width={110} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v) => [fmt(v), 'Total Spend']} />
                <Bar dataKey="amount" fill="#818cf8" radius={[0, 4, 4, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-slate-500 text-sm">No merchant spend data available.</div>
          )}
        </Card>
      </div>

      {/* Auto-Generated Insights */}
      {safeInsights.length > 0 && (
        <Card>
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-4 h-4 text-indigo-400" />
            <CardTitle>Automated Spending Insights ({rangeLabel})</CardTitle>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {safeInsights.map((ins, idx) => (
              <div key={idx} className="flex items-start gap-3 p-3.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-300">
                <span className="text-base flex-shrink-0">{ins.icon}</span>
                <span className="leading-relaxed">{ins.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
