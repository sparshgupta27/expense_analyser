/**
 * Mock Store Utilities
 */

const CATEGORY_MAP = {
  Swiggy: 'Food', Zomato: 'Food', Blinkit: 'Food', Zepto: 'Food', Instamart: 'Food',
  Amazon: 'Shopping', Flipkart: 'Shopping', Myntra: 'Shopping', Ajio: 'Shopping',
  Uber: 'Transport', Ola: 'Transport', Rapido: 'Transport',
  Netflix: 'Entertainment', Spotify: 'Subscriptions', Youtube: 'Subscriptions',
  Airtel: 'Bills', Jio: 'Bills', CRED: 'Bills',
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

module.exports = {
  CATEGORY_MAP,
  inferCategory,
  clearRealTransactions: () => {},
  addRealParsedTransaction: () => {},
  getStoreTransactions: () => [],
  getLatestTransactionMonth: () => `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
  getStoreCategories: () => [],
  getStoreMerchants: () => [],
  getStoreMonthlyTrend: () => [],
  getStoreInsights: () => [],
  isUsingRealData: () => false,
};
