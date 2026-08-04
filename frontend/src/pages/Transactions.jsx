import React, { useState, useEffect, useCallback } from 'react';
import { Search, Check, X, CreditCard, ArrowLeft, ArrowRight, Edit2 } from 'lucide-react';
import { Card } from '../components/ui/Card';
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '../components/ui/Table';
import { Badge } from '../components/ui/Badge';
import { getTransactions, updateCategory } from '../api/client';

const CATEGORIES = ['Food', 'Shopping', 'Bills', 'Transport', 'Entertainment', 'Subscriptions', 'Other'];
const fmt = (v) => '₹' + Number(v || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

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
            <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
            <input
              type="text"
              placeholder="Search merchants or raw email text..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-[#12121a] border border-slate-800 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 transition"
            />
          </div>
          <button
            type="submit"
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-sm transition"
          >
            Search
          </button>
        </form>

        <div className="flex gap-2">
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="bg-[#12121a] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
          </select>

          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="bg-[#12121a] border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500"
          >
            <option value="">All Types</option>
            <option value="debit">Debit (-)</option>
            <option value="credit">Credit (+)</option>
          </select>
        </div>
      </div>

      {/* Transaction Table */}
      <Card className="p-0 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-12 text-slate-400">
            <div className="w-6 h-6 border-2 border-slate-700 border-t-indigo-500 rounded-full animate-spin mr-3" />
            Loading transactions...
          </div>
        ) : safeTransactions.length === 0 ? (
          <div className="text-center py-16 px-4 text-slate-400">
            <CreditCard className="w-10 h-10 mx-auto text-slate-600 mb-3" />
            <div className="font-semibold text-slate-300">No transactions found</div>
            <div className="text-xs text-slate-500 mt-1">Adjust your search or sync your Gmail inbox</div>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Merchant</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Confidence</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {safeTransactions.map((txn) => (
                  <TableRow key={txn.id}>
                    <TableCell className="whitespace-nowrap font-medium text-slate-400 text-xs">
                      {fmtDate(txn.transaction_date)}
                    </TableCell>

                    <TableCell>
                      <div className="font-semibold text-slate-200">
                        {txn.merchant_normalized || txn.merchant_raw}
                      </div>
                      {txn.merchant_raw !== txn.merchant_normalized && (
                        <div className="text-[11px] text-slate-500 truncate max-w-[200px]">
                          Raw: {txn.merchant_raw}
                        </div>
                      )}
                    </TableCell>

                    <TableCell>
                      {editingId === txn.id ? (
                        <div className="flex items-center gap-1.5">
                          <select
                            value={editCategory}
                            onChange={(e) => setEditCategory(e.target.value)}
                            className="bg-slate-900 border border-indigo-500 rounded text-xs px-2 py-1 text-slate-200"
                          >
                            {CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                          </select>
                          <button
                            onClick={() => handleCategoryUpdate(txn.id)}
                            className="p-1 bg-indigo-600 text-white rounded hover:bg-indigo-500"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setEditingId(null)}
                            className="p-1 bg-slate-800 text-slate-400 rounded hover:bg-slate-700"
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
                            title="Click to override category"
                          >
                            {txn.category}
                            {txn.has_override && <Edit2 className="w-2.5 h-2.5 ml-1 opacity-70" />}
                          </Badge>
                        </div>
                      )}
                    </TableCell>

                    <TableCell className="text-right">
                      <span className={`font-semibold tabular-nums ${txn.transaction_type === 'credit' ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {txn.transaction_type === 'credit' ? '+' : '-'}{fmt(txn.amount)}
                      </span>
                    </TableCell>

                    <TableCell>
                      <div className="w-12 bg-slate-800 h-1.5 rounded-full overflow-hidden" title={`Parse confidence: ${(txn.parse_confidence || 0) * 100}%`}>
                        <div
                          className={`h-full rounded-full ${txn.parse_confidence >= 0.9 ? 'bg-emerald-400' : txn.parse_confidence >= 0.7 ? 'bg-amber-400' : 'bg-rose-400'}`}
                          style={{ width: `${(txn.parse_confidence || 0) * 100}%` }}
                        />
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            <div className="flex items-center justify-between px-4 py-3 border-t border-slate-800/80 bg-slate-900/40">
              <span className="text-xs text-slate-400">
                Page <strong className="text-slate-200">{pagination.page}</strong> of <strong className="text-slate-200">{pagination.total_pages}</strong> ({pagination.total} total)
              </span>
              <div className="flex items-center gap-2">
                <button
                  disabled={pagination.page <= 1}
                  onClick={() => fetchTxns(pagination.page - 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-300 transition"
                >
                  <ArrowLeft className="w-3.5 h-3.5" /> Prev
                </button>
                <button
                  disabled={pagination.page >= pagination.total_pages}
                  onClick={() => fetchTxns(pagination.page + 1)}
                  className="flex items-center gap-1 px-3 py-1.5 rounded bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-medium text-slate-300 transition"
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
