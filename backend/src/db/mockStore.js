/**
 * Active In-Memory Store & Mock Fallback
 *
 * Supports single-month OR multi-month range filtering (1m, 3m, 6m, 12m)!
 */

let realTransactions = [];
let isRealDataActive = false;

const DEMO_TRANSACTIONS = [
  {
    id: 'tx-1',
    gmail_message_id: 'msg-101',
    amount: 2450.00,
    merchant_raw: 'Swiggy Food Order',
    merchant_normalized: 'Swiggy',
    category: 'Food',
    transaction_type: 'debit',
    transaction_date: new Date('2026-07-31T19:30:00Z'),
    parse_confidence: 1.0,
    has_override: false,
  },
  {
    id: 'tx-2',
    gmail_message_id: 'msg-102',
    amount: 15200.00,
    merchant_raw: 'Amazon India',
    merchant_normalized: 'Amazon',
    category: 'Shopping',
    transaction_type: 'debit',
    transaction_date: new Date('2026-07-28T14:15:00Z'),
    parse_confidence: 1.0,
    has_override: false,
  },
  {
    id: 'tx-3',
    gmail_message_id: 'msg-103',
    amount: 649.00,
    merchant_raw: 'Netflix India',
    merchant_normalized: 'Netflix',
    category: 'Entertainment',
    transaction_type: 'debit',
    transaction_date: new Date('2026-07-25T08:00:00Z'),
    parse_confidence: 1.0,
    has_override: false,
  },
  {
    id: 'tx-4',
    gmail_message_id: 'msg-104',
    amount: 1200.00,
    merchant_raw: 'Uber India',
    merchant_normalized: 'Uber',
    category: 'Transport',
    transaction_type: 'debit',
    transaction_date: new Date('2026-07-20T11:45:00Z'),
    parse_confidence: 1.0,
    has_override: false,
  },
];

const CATEGORY_MAP = {
  // Food & Dining Senders
  Swiggy: 'Food',
  Zomato: 'Food',
  Blinkit: 'Food',
  Zepto: 'Food',
  Instamart: 'Food',
  Dominos: 'Food',
  Pizza: 'Food',
  McDonalds: 'Food',
  KFC: 'Food',
  Starbucks: 'Food',
  Dineout: 'Food',
  Eats: 'Food',

  // Shopping & E-Commerce Senders
  Amazon: 'Shopping',
  Flipkart: 'Shopping',
  Myntra: 'Shopping',
  Ajio: 'Shopping',
  Nykaa: 'Shopping',
  Tata: 'Shopping',
  Decathlon: 'Shopping',
  Croma: 'Shopping',
  Reliance: 'Shopping',
  Shoppers: 'Shopping',

  // Transport & Travel Senders
  Uber: 'Transport',
  Ola: 'Transport',
  Rapido: 'Transport',
  IRCTC: 'Transport',
  MakeMyTrip: 'Transport',
  Goibibo: 'Transport',
  Indigo: 'Transport',
  AirIndia: 'Transport',
  Vistara: 'Transport',
  Cleartrip: 'Transport',
  redBus: 'Transport',

  // Entertainment & Subscription Senders
  Netflix: 'Entertainment',
  Spotify: 'Subscriptions',
  Youtube: 'Subscriptions',
  Prime: 'Subscriptions',
  Hotstar: 'Entertainment',
  BookMyShow: 'Entertainment',
  PVR: 'Entertainment',
  INOX: 'Entertainment',
  Cursor: 'Subscriptions',
  OpenAI: 'Subscriptions',
  ChatGPT: 'Subscriptions',
  Github: 'Subscriptions',
  Apple: 'Subscriptions',

  // Bills & Utilities Senders
  Bescom: 'Bills',
  Airtel: 'Bills',
  Jio: 'Bills',
  Vodafone: 'Bills',
  CRED: 'Bills',
  BillDesk: 'Bills',
  'HDFC Bank': 'Bills',
  'ICICI Bank': 'Bills',
  'SBI Card': 'Bills',
  'Axis Bank': 'Bills',
  'Kotak Bank': 'Bills',
  'PhonePe': 'Bills',
  'Paytm': 'Bills',
  'Google Pay': 'Bills',
};

function inferCategory(merchant) {
  if (!merchant) return 'Other';
  const mLower = merchant.toLowerCase();
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (mLower.includes(key.toLowerCase())) {
      return cat;
    }
  }
  return 'Other';
}

function clearRealTransactions() {
  realTransactions = [];
  isRealDataActive = false;
}

function addRealParsedTransaction(tx) {
  isRealDataActive = true;
  const existingIdx = realTransactions.findIndex(
    (t) => t.gmail_message_id === tx.gmail_message_id
  );

  const formattedTx = {
    id: tx.id || `tx-real-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
    gmail_message_id: tx.gmail_message_id || `msg-${Date.now()}`,
    amount: parseFloat(tx.amount),
    merchant_raw: tx.merchant_raw || tx.merchant_normalized || 'Bank Transaction',
    merchant_normalized: tx.merchant_normalized || 'Bank Merchant',
    category: tx.category || inferCategory(tx.merchant_normalized),
    transaction_type: tx.transaction_type || 'debit',
    transaction_date: new Date(tx.transaction_date || Date.now()),
    parse_confidence: tx.confidence || 0.9,
    has_override: false,
  };

  if (existingIdx >= 0) {
    realTransactions[existingIdx] = formattedTx;
  } else {
    realTransactions.push(formattedTx);
  }
}

/**
 * Filter transactions by month string and rangeMonths count (1, 3, 6, 12).
 */
function getStoreTransactions(month, rangeMonths = 1) {
  const allTxs = isRealDataActive && realTransactions.length > 0 ? realTransactions : DEMO_TRANSACTIONS;
  if (!month) return [...allTxs].sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

  const [year, mNum] = month.split('-').map(Number);
  const endLimit = new Date(year, mNum, 0, 23, 59, 59); // End of target month
  const startLimit = new Date(year, mNum - parseInt(rangeMonths || 1), 1, 0, 0, 0); // Start N months back

  let filtered = allTxs.filter((t) => {
    const d = new Date(t.transaction_date);
    return d >= startLimit && d <= endLimit;
  });

  if (filtered.length === 0 && allTxs.length > 0) {
    filtered = allTxs;
  }

  return [...filtered].sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
}

function getLatestTransactionMonth() {
  const txs = getStoreTransactions();
  if (txs.length === 0) return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const latestDate = new Date(txs[0].transaction_date);
  return `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, '0')}`;
}

function getStoreCategories(month, rangeMonths = 1) {
  const txs = getStoreTransactions(month, rangeMonths);

  const totals = {};
  let grandTotal = 0;

  txs.forEach((t) => {
    if (t.transaction_type === 'debit') {
      totals[t.category] = (totals[t.category] || 0) + t.amount;
      grandTotal += t.amount;
    }
  });

  return Object.entries(totals).map(([category, amount]) => ({
    category,
    amount,
    count: txs.filter((t) => t.category === category).length,
    percentage: grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0,
  })).sort((a, b) => b.amount - a.amount);
}

function getStoreMerchants(month, rangeMonths = 1) {
  const txs = getStoreTransactions(month, rangeMonths);

  const totals = {};
  const counts = {};

  txs.forEach((t) => {
    if (t.transaction_type === 'debit') {
      const m = t.merchant_normalized || t.merchant_raw;
      totals[m] = (totals[m] || 0) + t.amount;
      counts[m] = (counts[m] || 0) + 1;
    }
  });

  return Object.entries(totals).map(([merchant, amount]) => ({
    merchant,
    amount,
    count: counts[merchant],
  })).sort((a, b) => b.amount - a.amount);
}

function getStoreMonthlyTrend(rangeMonths = 12) {
  const allTxs = isRealDataActive && realTransactions.length > 0 ? realTransactions : DEMO_TRANSACTIONS;
  const count = parseInt(rangeMonths || 12);
  const monthsMap = {};

  allTxs.forEach((t) => {
    const d = new Date(t.transaction_date);
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    if (!monthsMap[monthKey]) {
      monthsMap[monthKey] = { month: monthKey, total_debit: 0, total_credit: 0, transaction_count: 0 };
    }
    if (t.transaction_type === 'debit') {
      monthsMap[monthKey].total_debit += t.amount;
    } else {
      monthsMap[monthKey].total_credit += t.amount;
    }
    monthsMap[monthKey].transaction_count += 1;
  });

  // Determine latest date in dataset or current date
  let latestDate = new Date();
  if (allTxs.length > 0) {
    const dates = allTxs.map((t) => new Date(t.transaction_date).getTime());
    latestDate = new Date(Math.max(...dates));
  }

  // Generate contiguous sequence of `count` months ending at latestDate
  const result = [];
  for (let i = count - 1; i >= 0; i--) {
    const targetDate = new Date(latestDate.getFullYear(), latestDate.getMonth() - i, 1);
    const y = targetDate.getFullYear();
    const m = String(targetDate.getMonth() + 1).padStart(2, '0');
    const monthKey = `${y}-${m}`;

    if (monthsMap[monthKey]) {
      result.push(monthsMap[monthKey]);
    } else {
      result.push({ month: monthKey, total_debit: 0, total_credit: 0, transaction_count: 0 });
    }
  }

  return result;
}

function getStoreInsights(month, rangeMonths = 1) {
  const txs = getStoreTransactions(month, rangeMonths);
  const total = txs.reduce((acc, t) => acc + (t.transaction_type === 'debit' ? t.amount : 0), 0);
  const maxTx = txs.reduce((max, t) => (!max || t.amount > max.amount ? t : max), null);

  const insights = [];
  if (maxTx) {
    insights.push({
      type: 'biggest_expense',
      icon: '💰',
      message: `Biggest expense in period: ₹${maxTx.amount.toLocaleString()} at ${maxTx.merchant_normalized} on ${new Date(maxTx.transaction_date).toLocaleDateString()}`,
    });
  }
  insights.push({
    type: 'summary',
    icon: '📊',
    message: `${txs.length} parsed transactions in selected period, total spend ₹${total.toLocaleString()}`,
  });

  return insights;
}

module.exports = {
  DEMO_TRANSACTIONS,
  DEMO_SUBSCRIPTIONS: [],
  DEMO_MONTHLY_TREND: getStoreMonthlyTrend(12),
  DEMO_CATEGORIES: getStoreCategories(),
  DEMO_MERCHANTS: getStoreMerchants(),
  DEMO_ANOMALIES: [],
  DEMO_INSIGHTS: getStoreInsights(),
  clearRealTransactions,
  addRealParsedTransaction,
  getStoreTransactions,
  getLatestTransactionMonth,
  getStoreCategories,
  getStoreMerchants,
  getStoreMonthlyTrend,
  getStoreInsights,
  isUsingRealData: () => isRealDataActive,
};
