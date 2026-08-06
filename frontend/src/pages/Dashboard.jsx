import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar
} from 'recharts';
import {
  TrendingUp, TrendingDown, DollarSign, CreditCard, Layers,
  ShoppingBag, Sparkles, Receipt, ArrowUpRight, ArrowDownRight
} from 'lucide-react';
import { Card, CardTitle, Metric, Text } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import {
  getDashboardSummary, getMonthlyTrend, getCategoryBreakdown,
  getTopMerchants, getAnomalies, getInsights
} from '../api/client';

const CATEGORY_COLORS = {
  Food: '#A35C37',          // Warm Rust
  Shopping: '#5B4A78',      // Deep Plum
  Bills: '#2D5C4E',         // Ledger Green
  Transport: '#3A6B88',     // Passbook Slate Blue
  Entertainment: '#A84B68', // Warm Rose
  Subscriptions: '#8C6D23', // Dark Antique Gold
  Other: '#6C6A65',         // Muted Charcoal
};

const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });

const formatMonthLabel = (monthStr) => {
  if (!monthStr || !monthStr.includes('-')) return monthStr;
  const [y, m] = monthStr.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const monthName = d.toLocaleString('en-US', { month: 'short' });
  const shortYear = String(y).slice(-2);
  return `${monthName} '${shortYear}`;
};

export default function Dashboard({ month, range = 1, refreshKey = 0 }) {
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
  }, [month, range, refreshKey]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-[#6C6A65]">
        <div className="w-7 h-7 border-3 border-[#E8E3D8] border-t-[#2D5C4E] rounded-full animate-spin mb-3" />
        <span className="text-xs font-mono font-medium">Reading bank statement entries...</span>
      </div>
    );
  }

  const safeTrend = Array.isArray(trend) ? trend : [];
  const safeCategories = Array.isArray(categories) ? categories : [];
  const safeMerchants = Array.isArray(merchants) ? merchants : [];
  const safeAnomalies = Array.isArray(anomalies) ? anomalies : [];
  const safeInsights = Array.isArray(insights) ? insights : [];

  const trendData = safeTrend.map((t) => ({
    month: formatMonthLabel(t.month),
    rawMonth: t.month,
    spent: parseFloat(t.total_debit || 0),
    income: parseFloat(t.total_credit || 0),
  }));

  const totalSpent = parseFloat(summary?.total_spent || 0);
  const totalIncome = parseFloat(summary?.total_income || 0);
  const netBalance = totalIncome - totalSpent;
  const rangeLabel = range === 1 ? 'Selected Month' : `Last ${range} Months`;

  return (
    <div className="space-y-6">
      {/* SIGNATURE PASSBOOK ENTRY LINE HEADER */}
      <section className="bg-white border-t border-b border-[#E8E3D8] py-4 px-4 sm:px-6 shadow-2xs">
        <div className="flex items-center justify-between text-[11px] font-mono tracking-widest text-[#6C6A65] uppercase pb-2 border-b border-dashed border-[#E8E3D8] mb-3">
          <div className="flex items-center gap-2">
            <Receipt className="w-3.5 h-3.5 text-[#2D5C4E]" />
            <span>STATEMENT ENTRY LINE // PERIOD: {month} ({rangeLabel})</span>
          </div>
          <span className="hidden sm:inline">COUNT: {summary?.transaction_count || 0} DEBITS/CREDITS</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6 py-1">
          <div>
            <div className="text-[11px] font-semibold text-[#6C6A65] uppercase tracking-wider">TOTAL DEBITS</div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#B33F3F] mt-0.5">
              {fmt(totalSpent)}
            </div>
            <div className="text-[11px] text-[#6C6A65] mt-0.5">Outflow total</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#6C6A65] uppercase tracking-wider">TOTAL CREDITS</div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#2D5C4E] mt-0.5">
              {fmt(totalIncome)}
            </div>
            <div className="text-[11px] text-[#6C6A65] mt-0.5">Income & refunds</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#6C6A65] uppercase tracking-wider">NET FLOW</div>
            <div className={`text-xl sm:text-2xl font-bold font-mono mt-0.5 ${netBalance >= 0 ? 'text-[#2D5C4E]' : 'text-[#B33F3F]'}`}>
              {netBalance >= 0 ? `+${fmt(netBalance)}` : fmt(netBalance)}
            </div>
            <div className="text-[11px] text-[#6C6A65] mt-0.5">Calculated net</div>
          </div>

          <div>
            <div className="text-[11px] font-semibold text-[#6C6A65] uppercase tracking-wider">ACTIVE CATEGORIES</div>
            <div className="text-xl sm:text-2xl font-bold font-mono text-[#1C1B19] mt-0.5">
              {safeCategories.length}
            </div>
            <div className="text-[11px] text-[#6C6A65] mt-0.5">Parsed expense groups</div>
          </div>
        </div>
      </section>

      {/* Anomaly Alerts */}
      {safeAnomalies.map((a, idx) => (
        <Alert
          key={idx}
          variant={a.severity === 'high' ? 'danger' : 'warning'}
          title={`Statement Alert: High Volume in ${a.category}`}
        >
          Expense in <strong className="text-[#1C1B19] font-semibold">{a.category}</strong> is{' '}
          <span className="font-mono font-bold text-[#B33F3F]">{a.pct_over}% higher</span> than your rolling average.
        </Alert>
      ))}

      {/* Main Visualizations Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Category Breakdown - Receipt Line Item List */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E8E3D8]">
              <div>
                <CardTitle>Category Line-Item Receipt</CardTitle>
                <p className="text-xs text-[#6C6A65] mt-0.5">Categorized breakdown of parsed transactions</p>
              </div>
              <span className="text-xs font-mono text-[#8C6D23] font-medium bg-[#FAF5EA] px-2 py-0.5 rounded border border-[#EFE2C5]">
                {safeCategories.length} Categories
              </span>
            </div>

            {safeCategories.length > 0 ? (
              <>
                {/* Horizontal Stacked Bar */}
                <div className="h-3.5 w-full bg-[#F5F2EA] rounded-full overflow-hidden flex mb-5 border border-[#E8E3D8]">
                  {safeCategories.map((c, i) => (
                    <div
                      key={c.category}
                      style={{
                        width: `${Math.max(c.percentage, 2)}%`,
                        backgroundColor: CATEGORY_COLORS[c.category] || CATEGORY_COLORS.Other,
                      }}
                      title={`${c.category}: ${fmt(c.amount)} (${c.percentage}%)`}
                    />
                  ))}
                </div>

                {/* Line Item Receipt Table */}
                <div className="divide-y divide-[#E8E3D8]/70 text-xs">
                  {safeCategories.map((c) => {
                    const color = CATEGORY_COLORS[c.category] || CATEGORY_COLORS.Other;
                    return (
                      <div key={c.category} className="py-2.5 flex items-center justify-between hover:bg-[#F8F6F0] px-1 rounded transition-colors">
                        <div className="flex items-center gap-2.5">
                          <span
                            className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                            style={{ backgroundColor: color }}
                          />
                          <span className="font-medium text-[#1C1B19]">{c.category}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="text-[#6C6A65] font-mono text-[11px] w-12 text-right">
                            {c.percentage}%
                          </span>
                          <span className="font-mono font-bold text-[#1C1B19] w-20 text-right">
                            {fmt(c.amount)}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </>
            ) : (
              <div className="text-center py-12 text-[#6C6A65] text-xs font-mono">No category data for this period.</div>
            )}
          </div>
        </Card>

        {/* Monthly Spend Trend */}
        <Card className="flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E8E3D8]">
              <div>
                <CardTitle>Monthly Ledger Flow</CardTitle>
                <p className="text-xs text-[#6C6A65] mt-0.5">Historical credit & debit trends</p>
              </div>
              <span className="text-xs font-mono text-[#6C6A65]">{rangeLabel}</span>
            </div>

            {trendData.length > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="ledgerSpentGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#B33F3F" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#B33F3F" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="ledgerIncomeGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2D5C4E" stopOpacity={0.2} />
                      <stop offset="95%" stopColor="#2D5C4E" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 2" stroke="#E8E3D8" />
                  <XAxis dataKey="month" stroke="#6C6A65" fontSize={11} fontFamily="IBM Plex Mono" />
                  <YAxis stroke="#6C6A65" fontSize={11} fontFamily="IBM Plex Mono" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                  <Tooltip
                    contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E8E3D8', borderRadius: '6px', fontSize: '12px', fontFamily: 'IBM Plex Mono' }}
                    formatter={(v, name) => [fmt(v), name === 'spent' ? 'Debits' : 'Credits']}
                  />
                  <Area type="linear" dataKey="spent" stroke="#B33F3F" strokeWidth={2} fill="url(#ledgerSpentGrad)" name="spent" dot={{ r: 3, fill: '#B33F3F' }} activeDot={{ r: 5 }} />
                  <Area type="linear" dataKey="income" stroke="#2D5C4E" strokeWidth={2} fill="url(#ledgerIncomeGrad)" name="income" dot={{ r: 3, fill: '#2D5C4E' }} activeDot={{ r: 5 }} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="text-center py-12 text-[#6C6A65] text-xs font-mono">No transaction trend data available.</div>
            )}
          </div>
        </Card>

        {/* Top Merchants Leaderboard */}
        <Card className="lg:col-span-2">
          <div className="flex items-center justify-between mb-3 pb-2 border-b border-[#E8E3D8]">
            <div>
              <CardTitle>Top Merchant Ledger</CardTitle>
              <p className="text-xs text-[#6C6A65] mt-0.5">Highest volume recipients across parsed receipts</p>
            </div>
            <span className="text-xs font-mono text-[#6C6A65]">{rangeLabel}</span>
          </div>

          {safeMerchants.length > 0 ? (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={safeMerchants.slice(0, 7)} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 2" stroke="#E8E3D8" />
                <XAxis type="number" stroke="#6C6A65" fontSize={11} fontFamily="IBM Plex Mono" tickFormatter={(v) => `₹${(v / 1000).toFixed(0)}k`} />
                <YAxis type="category" dataKey="merchant" stroke="#1C1B19" width={110} tick={{ fontSize: 11, fontFamily: 'Inter' }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#FFFFFF', borderColor: '#E8E3D8', borderRadius: '6px', fontSize: '12px', fontFamily: 'IBM Plex Mono' }}
                  formatter={(v) => [fmt(v), 'Total Outflow']}
                />
                <Bar dataKey="amount" fill="#2D5C4E" radius={[0, 4, 4, 0]} barSize={16} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-center py-12 text-[#6C6A65] text-xs font-mono">No merchant spend data available.</div>
          )}
        </Card>
      </div>

      {/* Auto-Generated Insights */}
      {safeInsights.length > 0 && (
        <Card className="bg-[#FAF5EA] border-[#EFE2C5]">
          <div className="flex items-center gap-2 mb-3 pb-2 border-b border-[#EFE2C5]">
            <Sparkles className="w-4 h-4 text-[#8C6D23]" />
            <h3 className="text-xs font-bold uppercase tracking-wider text-[#8C6D23]">
              Passbook Intelligence & Pattern Notes ({rangeLabel})
            </h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {safeInsights.map((ins, idx) => (
              <div key={idx} className="flex items-start gap-2.5 p-3 rounded-md bg-white border border-[#EFE2C5] text-xs text-[#1C1B19]">
                <span className="text-sm flex-shrink-0 mt-0.5">{ins.icon}</span>
                <span className="leading-relaxed font-sans">{ins.message}</span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}

