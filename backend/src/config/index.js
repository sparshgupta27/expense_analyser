const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
require('dotenv').config(); // Fallback to local .env

const config = {
  port: parseInt(process.env.PORT || process.env.BACKEND_PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  postgres: {
    connectionString: process.env.DATABASE_URL,
    host: process.env.POSTGRES_HOST || 'localhost',
    port: parseInt(process.env.POSTGRES_PORT || '5432', 10),
    database: process.env.POSTGRES_DB || 'expense_analyzer',
    user: process.env.POSTGRES_USER || 'postgres',
    password: process.env.POSTGRES_PASSWORD || 'postgres_dev_password',
  },

  redis: {
    url: process.env.REDIS_URL,
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
  },

  kafka: {
    brokers: (process.env.KAFKA_BROKERS || 'localhost:9092').split(','),
    clientId: 'expense-analyzer',
    topics: {
      rawEmails: 'raw-emails',
    },
  },

  google: {
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: process.env.GOOGLE_REDIRECT_URI || 'http://localhost:3001/auth/google/callback',
    scopes: ['https://www.googleapis.com/auth/gmail.readonly'],
  },

  anthropic: {
    apiKey: process.env.ANTHROPIC_API_KEY,
  },

  jwt: {
    secret: process.env.JWT_SECRET || 'dev-fallback-secret-change-in-production',
    expiresIn: '30d',
  },

  // Sync config
  sync: {
    cronSchedule: '*/15 * * * *', // Every 15 minutes
    gmailQuery: [
      'from:(hdfcbank OR sbicard OR icicibank OR googleplay OR phonepe OR paytm',
      'OR swiggy OR zomato OR amazon)',
      'subject:(transaction OR payment OR debited OR credited OR order OR UPI)',
    ].join(' '),
  },

  // Batch jobs config
  jobs: {
    llmBatch: '0 2 * * *',           // 2 AM daily
    aggregation: '0 3 * * *',        // 3 AM daily
    subscriptionDetection: '0 4 * * *', // 4 AM daily
  },

  // Anomaly detection
  anomaly: {
    thresholdMultiplier: 1.4, // Flag if spending exceeds 140% of rolling avg
    rollingMonths: 3,
  },

  // Subscription detection
  subscription: {
    amountTolerance: 0.05,   // ±5%
    dayTolerance: 3,         // ±3 days
    minOccurrences: 2,       // Need 2+ to flag as subscription
    ghostInactiveDays: 90,   // No non-subscription activity in 90 days
  },

  // Dedupe
  dedupe: {
    timeBucketMinutes: 5,    // 5-minute window for date bucketing
  },
};

module.exports = config;
