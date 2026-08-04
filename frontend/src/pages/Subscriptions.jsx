import React, { useState, useEffect } from 'react';
import { RefreshCw, Ghost, AlertTriangle, Calendar, CheckCircle } from 'lucide-react';
import { Card, CardTitle, Metric, Text } from '../components/ui/Card';
import { Alert } from '../components/ui/Alert';
import { Badge } from '../components/ui/Badge';
import { getSubscriptions } from '../api/client';

const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const daysUntil = (d) => Math.ceil((new Date(d).getTime() - Date.now()) / (1000 * 60 * 60 * 24));

export default function Subscriptions() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const res = await getSubscriptions();
        setData(res);
      } catch (err) {
        console.error('Failed to fetch subscriptions:', err);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-16 text-slate-400">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-indigo-500 rounded-full animate-spin mb-3" />
        <span className="text-sm font-medium">Analyzing recurring billing patterns...</span>
      </div>
    );
  }

  if (!data || data.subscriptions.length === 0) {
    return (
      <Card className="text-center py-16 px-4">
        <RefreshCw className="w-12 h-12 mx-auto text-slate-600 mb-3" />
        <CardTitle className="text-base text-slate-300">No Subscriptions Detected Yet</CardTitle>
        <Text className="max-w-md mx-auto mt-2">
          Subscription detection runs nightly on your transaction history. Once 2+ qualifying recurring charges are matched to a merchant, they will appear here.
        </Text>
      </Card>
    );
  }

  const filteredSubs = data.subscriptions.filter((sub) => {
    if (filter === 'ghost') return sub.ghost_flag;
    if (filter === 'price-change') return sub.price_change_flag;
    if (filter === 'active') return !sub.ghost_flag;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Tremor KPI Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardTitle>Active Subscriptions</CardTitle>
          <Metric>{data.summary.total_subscriptions}</Metric>
          <Text className="text-xs">Monitored recurring services</Text>
        </Card>

        <Card>
          <CardTitle>Monthly Recurring Cost</CardTitle>
          <Metric className="text-indigo-400">{fmt(data.summary.monthly_total)}</Metric>
          <Text className="text-xs">Normalized monthly burn</Text>
        </Card>

        <Card>
          <CardTitle>Upcoming Renewals (7 Days)</CardTitle>
          <Metric className="text-amber-400">{data.summary.upcoming_renewals}</Metric>
          <Text className="text-xs">Services renewing soon</Text>
        </Card>

        <Card>
          <CardTitle>Ghost Subscriptions</CardTitle>
          <Metric className={data.summary.ghost_subscriptions > 0 ? 'text-amber-400' : 'text-slate-300'}>
            {data.summary.ghost_subscriptions}
          </Metric>
          <Text className="text-xs">Unused active subscriptions</Text>
        </Card>
      </div>

      {/* Ghost Subscription Alert Banner (shadcn Alert component) */}
      {data.summary.ghost_subscriptions > 0 && (
        <Alert variant="ghost" title="Ghost Subscriptions Alert">
          You have <strong className="text-amber-300">{data.summary.ghost_subscriptions} ghost subscription{data.summary.ghost_subscriptions > 1 ? 's' : ''}</strong> — recurring charges with zero non-subscription merchant activity over the last 90 days.
        </Alert>
      )}

      {/* Filter Tabs */}
      <div className="flex flex-wrap gap-2">
        {[
          { id: 'all', label: `All (${data.subscriptions.length})` },
          { id: 'active', label: `Active (${data.subscriptions.filter(s => !s.ghost_flag).length})` },
          { id: 'ghost', label: `Ghost (${data.subscriptions.filter(s => s.ghost_flag).length})` },
          { id: 'price-change', label: `Price Changes (${data.subscriptions.filter(s => s.price_change_flag).length})` },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilter(tab.id)}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition ${filter === tab.id ? 'bg-indigo-600 border-indigo-500 text-white' : 'bg-[#12121a] border-slate-800 text-slate-400 hover:text-white'}`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Subscription Cards List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSubs.map((sub) => {
          const days = daysUntil(sub.next_expected_date);
          const isUpcoming = days >= 0 && days <= 7;

          return (
            <Card
              key={sub.id}
              className={`flex items-center justify-between p-5 ${sub.ghost_flag ? 'bg-amber-500/10 border-amber-500/30' : sub.price_change_flag ? 'bg-rose-500/10 border-rose-500/30' : ''}`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`p-3 rounded-xl ${sub.ghost_flag ? 'bg-amber-500/20 text-amber-300' : 'bg-indigo-500/10 text-indigo-400'}`}>
                  {sub.ghost_flag ? <Ghost className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
                </div>

                <div>
                  <div className="flex items-center gap-2 font-bold text-slate-100 text-base">
                    <span>{sub.display_name || sub.merchant_normalized}</span>
                    {sub.ghost_flag && <Badge variant="ghost">GHOST</Badge>}
                    {sub.price_change_flag && <Badge variant="danger">PRICE CHANGED</Badge>}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {sub.frequency} · Last charged {fmtDate(sub.last_charged_date)}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-lg font-extrabold text-white">
                  {fmt(sub.current_amount)}
                  {sub.price_change_flag && sub.previous_amount && (
                    <span className="text-xs text-slate-500 line-through ml-2">
                      {fmt(sub.previous_amount)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500 capitalize">/{sub.frequency}</div>
                {days >= 0 && (
                  <div className={`text-[11px] font-medium mt-1 ${isUpcoming ? 'text-amber-400 font-bold' : 'text-indigo-400'}`}>
                    {isUpcoming ? `Renews in ${days}d` : `Next: ${fmtDate(sub.next_expected_date)}`}
                  </div>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
