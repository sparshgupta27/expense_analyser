/**
 * Active In-Memory Store & Mock Fallback (Multi-User Scoped)
 *
 * Supports single-month OR multi-month range filtering (1m, 3m, 6m, 12m)
 * isolated by user_email!
 */

const realTransactionsByUser = {};

const DEMO_TRANSACTIONS = [];

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

function autoCategorize(merchant) {
  if (!merchant) return 'Other';
  const mLower = merchant.toLowerCase();
  for (const [key, cat] of Object.entries(CATEGORY_MAP)) {
    if (mLower.includes(key.toLowerCase())) {
      return cat;
    }
  }
  return 'Other';
}

function clearRealTransactions(userEmail) {
  if (userEmail) {
    delete realTransactionsByUser[userEmail];
  } else {
    Object.keys(realTransactionsByUser).forEach((k) => delete realTransactionsByUser[k]);
  }
}

function setRealTransactions(txs, userEmail = 'default_user@gmail.com') {
  realTransactionsByUser[userEmail] = txs.map((t) => ({
    ...t,
    user_email: userEmail,
    category: t.category || autoCategorize(t.merchant_normalized || t.merchant_raw),
  }));
}

function addRealParsedTransaction(tx, userEmail = 'default_user@gmail.com') {
  const email = userEmail || tx.user_email || 'default_user@gmail.com';
  if (!realTransactionsByUser[email]) {
    realTransactionsByUser[email] = [];
  }
  const enriched = {
    ...tx,
    user_email: email,
    category: tx.category || autoCategorize(tx.merchant_normalized || tx.merchant_raw),
  };
  const existingIdx = realTransactionsByUser[email].findIndex((t) => t.gmail_message_id === tx.gmail_message_id);
  if (existingIdx >= 0) {
    realTransactionsByUser[email][existingIdx] = enriched;
  } else {
    realTransactionsByUser[email].push(enriched);
  }
}

function getStoreTransactions(month, rangeMonths = 1, userEmail) {
  let email = userEmail || require('../auth/google').getCurrentUserEmail();
  if (!email && process.env.NODE_ENV === 'test') {
    email = 'default_user@gmail.com';
  }
  if (!email || (email === 'default_user@gmail.com' && process.env.NODE_ENV !== 'test')) {
    return [];
  }
  const userTxs = realTransactionsByUser[email] || [];
  if (userTxs.length === 0) {
    return [];
  }

  if (!month) return [...userTxs].sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));

  const [year, mNum] = month.split('-').map(Number);
  const endLimit = new Date(year, mNum, 0, 23, 59, 59); // End of target month
  const startLimit = new Date(year, mNum - parseInt(rangeMonths || 1), 1, 0, 0, 0); // Start N months back

  let filtered = userTxs.filter((t) => {
    const d = new Date(t.transaction_date);
    return d >= startLimit && d <= endLimit;
  });

  if (filtered.length === 0 && userTxs.length > 0) {
    filtered = userTxs;
  }

  return [...filtered].sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date));
}

function getLatestTransactionMonth(userEmail) {
  const txs = getStoreTransactions(null, 1, userEmail);
  if (txs.length === 0) return `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;
  const latestDate = new Date(txs[0].transaction_date);
  return `${latestDate.getFullYear()}-${String(latestDate.getMonth() + 1).padStart(2, '0')}`;
}

function getStoreCategories(month, rangeMonths = 1, userEmail) {
  const txs = getStoreTransactions(month, rangeMonths, userEmail);

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

function getStoreMerchants(month, rangeMonths = 1, userEmail) {
  const txs = getStoreTransactions(month, rangeMonths, userEmail);

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

function getStoreMonthlyTrend(rangeMonths = 12, userEmail) {
  const allTxs = getStoreTransactions(null, 1, userEmail);
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

  let latestDate = new Date();
  if (allTxs.length > 0) {
    const dates = allTxs.map((t) => new Date(t.transaction_date).getTime());
    latestDate = new Date(Math.max(...dates));
  }

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

function getStoreInsights(month, rangeMonths = 1, userEmail) {
  const txs = getStoreTransactions(month, rangeMonths, userEmail);
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
  DEMO_MONTHLY_TREND: [],
  DEMO_CATEGORIES: [],
  DEMO_MERCHANTS: [],
  DEMO_ANOMALIES: [],
  DEMO_INSIGHTS: [],
  clearRealTransactions,
  setRealTransactions,
  addRealParsedTransaction,
  getStoreTransactions,
  getLatestTransactionMonth,
  getStoreCategories,
  getStoreMerchants,
  getStoreMonthlyTrend,
  getStoreInsights,
  isUsingRealData: (userEmail) => {
    let email = userEmail || require('../auth/google').getCurrentUserEmail();
    if (!email && process.env.NODE_ENV === 'test') {
      email = 'default_user@gmail.com';
    }
    if (!email || (email === 'default_user@gmail.com' && process.env.NODE_ENV !== 'test')) return false;
    return !!(realTransactionsByUser[email] && realTransactionsByUser[email].length > 0);
  },
};
