const { query } = require('./pool');

const SEED_RULES = [
  // Food & Dining
  { pattern: 'swiggy', category: 'Food' },
  { pattern: 'zomato', category: 'Food' },
  { pattern: 'dominos', category: 'Food' },
  { pattern: 'mcdonalds', category: 'Food' },
  { pattern: 'starbucks', category: 'Food' },
  { pattern: 'dunzo', category: 'Food' },
  { pattern: 'blinkit', category: 'Food' },
  { pattern: 'zepto', category: 'Food' },
  { pattern: 'bigbasket', category: 'Food' },

  // Shopping
  { pattern: 'amazon', category: 'Shopping' },
  { pattern: 'flipkart', category: 'Shopping' },
  { pattern: 'myntra', category: 'Shopping' },
  { pattern: 'ajio', category: 'Shopping' },
  { pattern: 'nykaa', category: 'Shopping' },
  { pattern: 'meesho', category: 'Shopping' },

  // Transport
  { pattern: 'uber', category: 'Transport' },
  { pattern: 'ola', category: 'Transport' },
  { pattern: 'rapido', category: 'Transport' },
  { pattern: 'irctc', category: 'Transport' },
  { pattern: 'makemytrip', category: 'Transport' },
  { pattern: 'goibibo', category: 'Transport' },
  { pattern: 'redbus', category: 'Transport' },

  // Entertainment
  { pattern: 'netflix', category: 'Entertainment' },
  { pattern: 'spotify', category: 'Entertainment' },
  { pattern: 'hotstar', category: 'Entertainment' },
  { pattern: 'prime video', category: 'Entertainment' },
  { pattern: 'youtube', category: 'Entertainment' },
  { pattern: 'bookmyshow', category: 'Entertainment' },
  { pattern: 'jiocinema', category: 'Entertainment' },
  { pattern: 'sony liv', category: 'Entertainment' },

  // Bills & Utilities
  { pattern: 'airtel', category: 'Bills' },
  { pattern: 'jio', category: 'Bills' },
  { pattern: 'vi vodafone', category: 'Bills' },
  { pattern: 'bsnl', category: 'Bills' },
  { pattern: 'tata power', category: 'Bills' },
  { pattern: 'bescom', category: 'Bills' },
  { pattern: 'act fibernet', category: 'Bills' },

  // Subscriptions (common SaaS / digital)
  { pattern: 'github', category: 'Subscriptions' },
  { pattern: 'notion', category: 'Subscriptions' },
  { pattern: 'chatgpt', category: 'Subscriptions' },
  { pattern: 'openai', category: 'Subscriptions' },
  { pattern: 'cursor', category: 'Subscriptions' },
  { pattern: 'google one', category: 'Subscriptions' },
  { pattern: 'icloud', category: 'Subscriptions' },
  { pattern: 'adobe', category: 'Subscriptions' },
];

async function seed() {
  console.log('[Seed] Inserting category rules in batch...');

  const values = [];
  const valueStrings = [];
  SEED_RULES.forEach((rule, idx) => {
    valueStrings.push(`($${idx * 2 + 1}, $${idx * 2 + 2})`);
    values.push(rule.pattern, rule.category);
  });

  const sql = `
    INSERT INTO category_rules (pattern, category)
    VALUES ${valueStrings.join(', ')}
    ON CONFLICT DO NOTHING
  `;

  await query(sql, values);
  console.log(`[Seed] Inserted ${SEED_RULES.length} category rules`);
}

// Run if called directly
if (require.main === module) {
  seed()
    .then(() => {
      console.log('[Seed] Done');
      process.exit(0);
    })
    .catch((err) => {
      console.error('[Seed] Error:', err);
      process.exit(1);
    });
}

module.exports = { seed };
