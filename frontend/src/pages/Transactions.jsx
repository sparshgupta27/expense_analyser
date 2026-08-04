import React, { useState, useEffect, useCallback } from 'react';
import { Search, Check, X, CreditCard, ArrowLeft, ArrowRight, Edit2, Landmark, Tag } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { getTransactions, updateCategory } from '../api/client';

const CATEGORIES = ['Food', 'Shopping', 'Bills', 'Transport', 'Entertainment', 'Subscriptions', 'Other'];
const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

// Dynamic Channel / Issuer Badge Helper
const getChannelBadge = (rawText = '') => {
  const text = rawText.toUpperCase();
  if (text.includes('UPI')) return { label: 'UPI', style: 'bg-[#EBF3F0] text-[#2D5C4E] border-[#D2E4DC]' };
  if (text.includes('HDFC')) return { label: 'HDFC Bank', style: 'bg-[#EDF3F7] text-[#3A6B88] border-[#D3E2EC]' };
  if (text.includes('ICICI')) return { label: 'ICICI', style: 'bg-[#F9EFF2] text-[#A84B68] border-[#EDD5DE]' };
  if (text.includes('SBI')) return { label: 'SBI', style: 'bg-[#F2EEF7] text-[#5B4A78] border-[#DFD7EB]' };
  if (text.includes('PAYTM')) return { label: 'Paytm', style: 'bg-[#FAF5EA] text-[#8C6D23] border-[#EFE2C5]' };
  if (text.includes('CARD') || text.includes('CREDIT') || text.includes('DEBIT')) {
    return { label: 'CARD', style: 'bg-[#F5F2EA] text-[#1C1B19] border-[#E8E3D8]' };
  }
  return { label: 'BANK EMAIL', style: 'bg-[#F5F2EA] text-[#6C6A65] border-[#E8E3D8]' };
};

export default function Transactions({ month, range = 1 }) {
  const [transactions, setTransactions] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, total: 0, total_pages: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [editingId, setEditingId] = useState(null);
  const [editCategory, setEditCategory] = useState('');

  const fetchTxns = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 20,
        month,
        range,
      };
      if (search) params.search = search;
      if (categoryFilter) params.category = categoryFilter;
      if (typeFilter) params.type = typeFilter;

      const result = await getTransactions(params);
      setTransactions(Array.isArray(result?.data) ? result.data : []);
      setPagination(result?.pagination || { page: 1, total: 0, total_pages: 1 });
    } catch (err) {
      console.error('Failed to fetch transactions:', err);
      setTransactions([]);
    } finally {
      setLoading(false);
    }
  }, [month, range, search, categoryFilter, typeFilter]);

  useEffect(() => {
    fetchTxns(1);
  }, [fetchTxns]);

  const handleCategoryUpdate = async (id) => {
    try {
      await updateCategory(id, editCategory);
      setEditingId(null);
      fetchTxns(pagination.page);
    } catch (err) {
      console.error('Update failed:', err);
    }
  };

  const safeTransactions = (Array.isArray(transactions) ? transactions : [])
    .slice()
    .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

  return (
    <div className="space-y-4">
      {/* Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <form
          onSubmit={(e) => { e.preventDefault(); fetchTxns(1); }}
          className="flex-1 flex gap-2"
        >
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-2.5 text-[#6C6A65]" />
            <input
              type="text"
              placeholder="Search merchant, bank name, or raw text..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-white border border-[#E8E3D8] rounded-md pl-9 pr-4 py-2 text-xs text-[#1C1B19] focus:outline-none focus:border-[#2D5C4E] shadow-2xs transition"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-[#2D5C4E] hover:bg-[#254B40] text-white font-semibold rounded-md text-xs transition shadow-xs"
          >
            Search
          </button>
        </form>

        <div className="flex gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-white border border-[#E8E3D8] rounded-md px-3 py-2 text-xs text-[#1C1B19] focus:outline-none focus:border-[#2D5C4E] shadow-2xs"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-white border border-[#E8E3D8] rounded-md px-3 py-2 text-xs text-[#1C1B19] focus:outline-none focus:border-[#2D5C4E] shadow-2xs"
          >
            <option value="">All Types</option>
            <option value="debit">Debits (-)</option>
            <option value="credit">Credits (+)</option>
          </select>
        </div>
      </div>

      {/* Transaction Passbook Table */}
      <Card className="p-0 overflow-hidden bg-white border-[#E8E3D8]">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-[#6C6A65] text-xs font-mono">
            <div className="w-5 h-5 border-2 border-[#E8E3D8] border-t-[#2D5C4E] rounded-full animate-spin mr-3" />
            Loading transaction entries...
          </div>
        ) : safeTransactions.length === 0 ? (
          <div className="text-center py-16 px-4 text-[#6C6A65]">
            <CreditCard className="w-10 h-10 mx-auto text-[#6C6A65] mb-3 opacity-50" />
            <div className="font-semibold text-[#1C1B19]">No transactions found</div>
            <div className="text-xs text-[#6C6A65] mt-1">Adjust your search query or trigger a Gmail sync</div>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>DATE</TableHead>
                  <TableHead>MERCHANT & CHANNEL</TableHead>
                  <TableHead>CATEGORY</TableHead>
                  <TableHead className="text-right">AMOUNT</TableHead>
                  <TableHead>CONFIDENCE</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeTransactions.map((txn) => {
                  const channel = getChannelBadge(txn.merchant_raw || '');
                  return (
                    <TableRow key={txn.id}>
                      <TableCell className="whitespace-nowrap font-mono font-medium text-[#6C6A65] text-xs">
                        {fmtDate(txn.transaction_date)}
                      </TableCell>

                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-[#1C1B19]">
                            {txn.merchant_normalized || txn.merchant_raw}
                          </span>
                          <span className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded border ${channel.style}`}>
                            {channel.label}
                          </span>
                        </div>
                        {txn.merchant_raw && txn.merchant_raw !== txn.merchant_normalized && (
                          <div className="text-[11px] text-[#6C6A65] font-mono truncate max-w-[240px] mt-0.5">
                            {txn.merchant_raw}
                          </div>
                        )}
                      </TableCell>

                      <TableCell>
                        {editingId === txn.id ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="bg-white border border-[#2D5C4E] rounded text-xs px-2 py-1 text-[#1C1B19]"
                            >
                              {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                            </select>
                            <button
                              onClick={() => handleCategoryUpdate(txn.id)}
                              className="p-1 bg-[#2D5C4E] text-white rounded hover:bg-[#254B40]"
                            >
                              <Check className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="p-1 bg-[#F5F2EA] text-[#6C6A65] rounded hover:bg-[#E8E3D8]"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <Badge
                              variant={txn.category.toLowerCase()}
                              onClick={() => {
                                setEditingId(txn.id);
                                setEditCategory(txn.category);
                              }}
                              className="cursor-pointer"
                              title="Click to override category"
                            >
                              {txn.category}
                              {txn.has_override && <Edit2 className="w-2.5 h-2.5 ml-1 opacity-70" />}
                            </Badge>
                          </div>
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        <span className={`font-mono font-bold text-sm ${txn.transaction_type === 'credit' ? 'text-[#2D5C4E]' : 'text-[#B33F3F]'}`}>
                          {txn.transaction_type === 'credit' ? '+' : '-'}{fmt(txn.amount)}
                        </span>
                      </TableCell>

                      <TableCell>
                        <div className="w-12 bg-[#F5F2EA] border border-[#E8E3D8] h-2 rounded-full overflow-hidden" title={`Parse confidence: ${(txn.parse_confidence || 0) * 100}%`}>
                          <div
                            className={`h-full rounded-full ${txn.parse_confidence >= 0.9 ? 'bg-[#2D5C4E]' : txn.parse_confidence >= 0.7 ? 'bg-[#8C6D23]' : 'bg-[#B33F3F]'}`}
                            style={{ width: `${(txn.parse_confidence || 0) * 100}%` }}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-[#E8E3D8] bg-[#FAF8F3]">
              <span className="text-xs text-[#6C6A65] font-mono">
                Page <strong className="text-[#1C1B19]">{pagination.page}</strong> of <strong className="text-[#1C1B19]">{pagination.total_pages}</strong> ({pagination.total} entries)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchTxns(pagination.page - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-white border border-[#E8E3D8] hover:bg-[#F5F2EA] disabled:opacity-40 text-xs font-semibold text-[#1C1B19] transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  disabled={pagination.page >= pagination.total_pages}
                  onClick={() => fetchTxns(pagination.page + 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-white border border-[#E8E3D8] hover:bg-[#F5F2EA] disabled:opacity-40 text-xs font-semibold text-[#1C1B19] transition"
                >
                  Next <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </>
        )}
      </Card>
    </div>
  );
}
