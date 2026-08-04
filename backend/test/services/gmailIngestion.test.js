const { cleanMerchantName, strictTransactionParser } = require('../../src/services/gmailIngestion');

describe('Gmail Ingestion Service - Merchant Normalization', () => {
  test('correctly identifies Swiggy from sender or subject', () => {
    expect(cleanMerchantName('Swiggy Orders <no-reply@swiggy.in>', 'Your Swiggy order receipt')).toBe('Swiggy');
    expect(cleanMerchantName('no-reply@swiggy.in', 'Order Delivered')).toBe('Swiggy');
  });

  test('correctly identifies Zomato from subject', () => {
    expect(cleanMerchantName('Zomato <info@zomato.com>', 'Payment confirmation for Zomato order')).toBe('Zomato');
  });

  test('correctly identifies Banks (HDFC, ICICI, SBI)', () => {
    expect(cleanMerchantName('alerts@hdfcbank.net', 'Alert: Rs 500 debited from HDFC Bank A/C')).toBe('HDFC Bank');
    expect(cleanMerchantName('ibanking@icicibank.com', 'INR 1,200 spent on ICICI Credit Card')).toBe('ICICI Bank');
    expect(cleanMerchantName('alerts@sbicard.com', 'Transaction alert for SBI Card')).toBe('SBI Card');
  });

  test('correctly identifies UPI Apps (Google Pay, PhonePe, Paytm)', () => {
    expect(cleanMerchantName('Google Pay <no-reply@google.com>', 'Paid Rs 250 via Google Pay')).toBe('Google Pay');
    expect(cleanMerchantName('PhonePe <noreply@phonepe.com>', 'Payment of Rs 150 successful on PhonePe')).toBe('PhonePe');
    expect(cleanMerchantName('Paytm <no-reply@paytm.com>', 'Paid to Paytm merchant')).toBe('Paytm');
  });

  test('falls back to sender clean name or default', () => {
    expect(cleanMerchantName('Chai Point <orders@chaipoint.com>', 'Invoice #1234')).toBe('Chai Point');
    expect(cleanMerchantName('unknown@randomvendor.com', 'Receipt')).toBe('Bank Merchant');
  });
});

describe('Gmail Ingestion Service - Strict Transaction Parser', () => {
  const sampleDate = new Date('2026-08-01T10:00:00Z');

  test('parses debit transaction with Rs.', () => {
    const subject = 'Rs 450.00 debited from A/C XX1234';
    const body = 'Dear Customer, Rs 450.00 has been debited from your account XX1234 for Swiggy order on 01-Aug-2026.';
    const result = strictTransactionParser(subject, body, 'Swiggy <orders@swiggy.in>', sampleDate);

    expect(result).not.toBeNull();
    expect(result.amount).toBe(450.00);
    expect(result.merchant_normalized).toBe('Swiggy');
    expect(result.transaction_type).toBe('debit');
  });

  test('parses credit transaction with INR and commas', () => {
    const subject = 'INR 12,500.00 credited to A/C';
    const body = 'Your account has been credited by INR 12,500.00 towards cashback refund.';
    const result = strictTransactionParser(subject, body, 'HDFC Bank <alerts@hdfcbank.net>', sampleDate);

    expect(result).not.toBeNull();
    expect(result.amount).toBe(12500.00);
    expect(result.transaction_type).toBe('credit');
    expect(result.merchant_normalized).toBe('HDFC Bank');
  });

  test('ignores marketing & promo emails', () => {
    const subject = '50% DISCOUNT OFFER! Unsubscribe anytime';
    const body = 'Check out our latest deals on shoes and get instant coupon.';
    const result = strictTransactionParser(subject, body, 'Marketing <promo@deals.com>', sampleDate);

    expect(result).toBeNull();
  });

  test('ignores emails without valid payment amount', () => {
    const subject = 'Your statement is ready';
    const body = 'Please find attached your monthly e-statement for review.';
    const result = strictTransactionParser(subject, body, 'HDFC Bank <alerts@hdfcbank.net>', sampleDate);

    expect(result).toBeNull();
  });
});
