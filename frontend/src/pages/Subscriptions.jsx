import React, { useState, useEffect } from 'react';
import { RefreshCw, Ghost, AlertTriangle, Calendar, CheckCircle, Ticket } from 'lucide-react';
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
      <div className="flex flex-col items-center justify-center p-16 text-[#6C6A65]">
        <div className="w-7 h-7 border-3 border-[#E8E3D8] border-t-[#2D5C4E] rounded-full animate-spin mb-3" />
        <span className="text-xs font-mono font-medium">Auditing recurring subscription stubs...</span>
      </div>
    );
  }

  if (!data || data.subscriptions.length === 0) {
    return (
      <Card className="text-center py-16 px-4 bg-white border-[#E8E3D8]">
        <Ticket className="w-12 h-12 mx-auto text-[#6C6A65] mb-3 opacity-60" />
        <CardTitle className="text-base text-[#1C1B19]">No Subscription Stubs Detected</CardTitle>
        <Text className="max-w-md mx-auto mt-2 text-xs">
          Subscription detection audits your bank emails for recurring charges. Once 2+ qualifying charges match a merchant, they will be ticketed here.
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
      {/* KPI Stats Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardTitle>ACTIVE SERVICES</CardTitle>
          <Metric>{data.summary.total_subscriptions}</Metric>
          <Text className="text-xs">Monitored recurring stubs</Text>
        </Card>

        <Card>
          <CardTitle>MONTHLY BURN RATE</CardTitle>
          <Metric className="text-[#2D5C4E]">{fmt(data.summary.monthly_total)}</Metric>
          <Text className="text-xs">Normalized monthly total</Text>
        </Card>

        <Card>
          <CardTitle>UPCOMING RENEWALS (7D)</CardTitle>
          <Metric className="text-[#8C6D23]">{data.summary.upcoming_renewals}</Metric>
          <Text className="text-xs">Services renewing soon</Text>
        </Card>

        <Card>
          <CardTitle>GHOST SUBSCRIPTIONS</CardTitle>
          <Metric className={data.summary.ghost_subscriptions > 0 ? 'text-[#B33F3F]' : 'text-[#6C6A65]'}>
            {data.summary.ghost_subscriptions}
          </Metric>
          <Text className="text-xs">Unused active services</Text>
        </Card>
      </div>

      {/* Ghost Subscription Alert Banner */}
      {data.summary.ghost_subscriptions > 0 && (
        <Alert variant="ghost" title="Ghost Subscription Alert">
          You have <strong className="text-[#1C1B19]">{data.summary.ghost_subscriptions} ghost subscription{data.summary.ghost_subscriptions > 1 ? 's' : ''}</strong> — recurring charges with zero non-subscription activity over the last 90 days.
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
            className={`px-3 py-1.5 rounded-md text-xs font-semibold border transition ${
              filter === tab.id
                ? 'bg-[#2D5C4E] border-[#2D5C4E] text-white shadow-xs'
                : 'bg-white border-[#E8E3D8] text-[#6C6A65] hover:text-[#1C1B19] hover:bg-[#F5F2EA]'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Subscription Ticket Stub Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {filteredSubs.map((sub) => {
          const days = daysUntil(sub.next_expected_date);
          const isUpcoming = days >= 0 && days <= 7;
          const isGhost = sub.ghost_flag;

          return (
            <div
              key={sub.id}
              className={`flex items-center justify-between p-5 rounded-lg border transition-all ${
                isGhost
                  ? 'ticket-stub-disabled'
                  : sub.price_change_flag
                  ? 'bg-[#FBF0F0] border-[#F4D6D6] border-l-4 border-l-[#B33F3F]'
                  : 'ticket-stub'
              }`}
            >
              <div className="flex items-center gap-3.5">
                <div className={`p-3 rounded-lg ${isGhost ? 'bg-[#E5E0D4] text-[#6C6A65]' : 'bg-[#FAF5EA] text-[#8C6D23] border border-[#EFE2C5]'}`}>
                  {isGhost ? <Ghost className="w-5 h-5" /> : <Ticket className="w-5 h-5" />}
                </div>

                <div>
                  <div className="flex items-center gap-2 font-bold text-[#1C1B19] text-sm sm:text-base">
                    <span>{sub.display_name || sub.merchant_normalized}</span>
                    {isGhost && <Badge variant="ghost">GHOST STUB</Badge>}
                    {sub.price_change_flag && <Badge variant="danger">PRICE CHANGED</Badge>}
                  </div>
                  <div className="text-xs text-[#6C6A65] mt-0.5 font-mono">
                    {sub.frequency} · Last: {fmtDate(sub.last_charged_date)}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <div className="text-base sm:text-lg font-bold font-mono text-[#1C1B19]">
                  {fmt(sub.current_amount)}
                  {sub.price_change_flag && sub.previous_amount && (
                    <span className="text-xs text-[#6C6A65] line-through ml-1.5 font-normal">
                      {fmt(sub.previous_amount)}
                    </span>
                  )}
                </div>
                <div className="text-xs text-[#6C6A65] capitalize">/{sub.frequency}</div>
                {days >= 0 && (
                  <div className={`text-[11px] font-mono font-medium mt-1 ${isUpcoming ? 'text-[#8C6D23] font-bold' : 'text-[#2D5C4E]'}`}>
                    {isUpcoming ? `Renews in ${days}d` : `Next: ${fmtDate(sub.next_expected_date)}`}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

