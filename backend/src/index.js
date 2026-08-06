const express = require('express');
const cors = require('cors');
const cron = require('node-cron');
const config = require('./config');
const { pool } = require('./db/pool');
const { runMigrations } = require('./db/migrate');
const { seed } = require('./db/seed');
const { startParserConsumer } = require('./services/parserService');
const { syncEmails } = require('./services/gmailIngestion');
const { processLlmBatch } = require('./jobs/llmBatchParser');
const { runAggregation } = require('./jobs/aggregation');
const { runSubscriptionDetection } = require('./jobs/subscriptionDetector');
const { detectAnomalies } = require('./jobs/anomalyDetector');

const app = express();

// Middleware
const allowedOrigins = process.env.FRONTEND_URL 
  ? [process.env.FRONTEND_URL, 'http://localhost:3000', 'http://localhost:5173']
  : '*';

app.use(cors({
  origin: allowedOrigins,
  credentials: true,
}));
app.use(express.json());

// ============================================================
// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'SpendLens — Gmail Expense Analyzer API',
    status: 'running',
    frontend_url: 'http://localhost:3000',
    health_check: 'http://localhost:3001/health',
    auth_connect: 'http://localhost:3001/auth/google',
  });
});

// Health check
// ============================================================
app.get('/health', async (req, res) => {
  const checks = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    services: {},
  };

  // Check Postgres
  try {
    await pool.query('SELECT 1');
    checks.services.postgres = 'connected';
  } catch (err) {
    checks.services.postgres = `error: ${err.message}`;
    checks.status = 'degraded';
  }

  // Check Redis (optional in standalone mode)
  try {
    const Redis = require('ioredis');
    const redis = config.redis.url
      ? new Redis(config.redis.url)
      : new Redis({
          host: config.redis.host,
          port: config.redis.port,
          lazyConnect: true,
          connectTimeout: 1000,
        });
    await redis.ping();
    checks.services.redis = 'connected';
    await redis.quit();
  } catch (err) {
    checks.services.redis = 'unavailable (optional)';
  }

  const statusCode = checks.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(checks);
});

// ============================================================
// API routes
// ============================================================
app.use('/auth', require('./routes/auth'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/transactions', require('./routes/transactions'));
app.use('/api/subscriptions', require('./routes/subscriptions'));

// Manual sync trigger (Async Non-Blocking for instant response)
app.post('/api/sync', (req, res) => {
  syncEmails()
    .then((result) => console.log('[API] Background sync completed:', result))
    .catch((err) => console.error('[API] Background sync error:', err.message));

  res.json({ message: 'Gmail sync started in background', status: 'syncing' });
});

app.post('/api/jobs/aggregate', async (req, res) => {
  try {
    await runAggregation();
    res.json({ message: 'Aggregation complete' });
  } catch (err) {
    res.status(500).json({ error: 'Aggregation failed', details: err.message });
  }
});

app.post('/api/jobs/detect-subscriptions', async (req, res) => {
  try {
    const result = await runSubscriptionDetection();
    res.json({ message: 'Subscription detection complete', ...result });
  } catch (err) {
    res.status(500).json({ error: 'Detection failed', details: err.message });
  }
});

app.post('/api/jobs/detect-anomalies', async (req, res) => {
  try {
    const result = await detectAnomalies();
    res.json({ message: 'Anomaly detection complete', anomalies: result });
  } catch (err) {
    res.status(500).json({ error: 'Detection failed', details: err.message });
  }
});

// ============================================================
// 404 handler
// ============================================================
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ============================================================
// Error handler
// ============================================================
app.use((err, req, res, next) => {
  console.error('[Server] Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ============================================================
// Startup
// ============================================================
async function start() {
  try {
    console.log('[Server] Connecting to database...');
    try {
      await runMigrations();
      console.log('[Server] Seeding initial data...');
      await seed();
    } catch (dbErr) {
      console.warn('[Server] Database connection unavailable:', dbErr.message);
      console.warn('[Server] Starting API in Demo Mode (using in-memory fallback store)...');
    }

    // Start Kafka consumer if available
    try {
      await startParserConsumer();
    } catch (err) {
      // Kafka optional in standalone mode
    }

    // Schedule cron jobs if DB available
    cron.schedule(config.sync.cronSchedule, async () => {
      try { await syncEmails(); } catch (e) {}
    });

    app.listen(config.port, () => {
      console.log(`[Server] Expense Analyzer API running on port ${config.port}`);
      console.log(`[Server] Environment: ${config.nodeEnv}`);
      console.log(`[Server] Health check: http://localhost:${config.port}/health`);
    });
  } catch (err) {
    console.error('[Server] Failed to start:', err);
    process.exit(1);
  }
}

start();

module.exports = app;
