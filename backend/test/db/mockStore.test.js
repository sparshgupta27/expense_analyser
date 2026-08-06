const mockStore = require('../../src/db/mockStore');

describe('MockStore In-Memory Data Management', () => {
  beforeEach(() => {
    mockStore.clearRealTransactions();
  });

  test('returns 0 transactions when no real transactions exist', () => {
    const txs = mockStore.getStoreTransactions();
    expect(txs.length).toBe(0);
    expect(mockStore.isUsingRealData()).toBe(false);
  });

  test('adds real parsed transactions and sets active state', () => {
    const sampleTx = {
      id: 'real-tx-1',
      gmail_message_id: 'msg-999',
      amount: 1499.00,
      merchant_raw: 'Netflix Premium',
      merchant_normalized: 'Netflix',
      category: 'Subscriptions',
      transaction_type: 'debit',
      transaction_date: new Date('2026-08-02T12:00:00Z'),
      confidence: 0.95,
    };

    mockStore.addRealParsedTransaction(sampleTx);

    expect(mockStore.isUsingRealData()).toBe(true);
    const txs = mockStore.getStoreTransactions('2026-08', 1);
    expect(txs.length).toBe(1);
    expect(txs[0].merchant_normalized).toBe('Netflix');
    expect(txs[0].amount).toBe(1499.00);
  });

  test('updates existing transaction if duplicate gmail_message_id is added', () => {
    const sampleTx1 = {
      gmail_message_id: 'msg-dup-1',
      amount: 500,
      merchant_normalized: 'Swiggy',
      transaction_date: new Date('2026-08-01'),
    };
    const sampleTx2 = {
      gmail_message_id: 'msg-dup-1',
      amount: 550, // updated amount
      merchant_normalized: 'Swiggy',
      transaction_date: new Date('2026-08-01'),
    };

    mockStore.addRealParsedTransaction(sampleTx1);
    mockStore.addRealParsedTransaction(sampleTx2);

    const txs = mockStore.getStoreTransactions('2026-08', 1);
    expect(txs.length).toBe(1);
    expect(txs[0].amount).toBe(550);
  });

  test('correctly calculates category totals and percentages', () => {
    mockStore.addRealParsedTransaction({
      gmail_message_id: 'm1',
      amount: 600,
      merchant_normalized: 'Swiggy',
      category: 'Food',
      transaction_type: 'debit',
      transaction_date: new Date('2026-08-01'),
    });
    mockStore.addRealParsedTransaction({
      gmail_message_id: 'm2',
      amount: 400,
      merchant_normalized: 'Zomato',
      category: 'Food',
      transaction_type: 'debit',
      transaction_date: new Date('2026-08-02'),
    });
    mockStore.addRealParsedTransaction({
      gmail_message_id: 'm3',
      amount: 1000,
      merchant_normalized: 'Amazon',
      category: 'Shopping',
      transaction_type: 'debit',
      transaction_date: new Date('2026-08-03'),
    });

    const categories = mockStore.getStoreCategories('2026-08', 1);
    expect(categories.length).toBe(2);

    const foodCat = categories.find((c) => c.category === 'Food');
    const shopCat = categories.find((c) => c.category === 'Shopping');

    expect(foodCat.amount).toBe(1000);
    expect(foodCat.percentage).toBe(50);
    expect(shopCat.amount).toBe(1000);
    expect(shopCat.percentage).toBe(50);
  });

  test('correctly aggregates top merchants sorted by total spend', () => {
    mockStore.addRealParsedTransaction({
      gmail_message_id: 'm1',
      amount: 100,
      merchant_normalized: 'Uber',
      transaction_type: 'debit',
      transaction_date: new Date('2026-08-01'),
    });
    mockStore.addRealParsedTransaction({
      gmail_message_id: 'm2',
      amount: 900,
      merchant_normalized: 'Swiggy',
      transaction_type: 'debit',
      transaction_date: new Date('2026-08-02'),
    });

    const merchants = mockStore.getStoreMerchants('2026-08', 1);
    expect(merchants[0].merchant).toBe('Swiggy');
    expect(merchants[0].amount).toBe(900);
    expect(merchants[1].merchant).toBe('Uber');
    expect(merchants[1].amount).toBe(100);
  });

  test('clears real transactions correctly', () => {
    mockStore.addRealParsedTransaction({
      gmail_message_id: 'm1',
      amount: 100,
      merchant_normalized: 'Uber',
      transaction_type: 'debit',
      transaction_date: new Date('2026-08-01'),
    });

    mockStore.clearRealTransactions();
    // When real transactions cleared, falls back to demo transactions
    expect(mockStore.isUsingRealData()).toBe(false);
  });
});
