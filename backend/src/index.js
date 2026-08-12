const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');
const cron = require('node-cron');
const config = require('./config');
const { pool, withUserTransaction } = require('./db/pool');
const { runMigrations } = require('./db/migrate');
const { seed } = require('./db/seed');
const { startParserConsumer } = require('./services/parserService');
const { syncEmails } = require('./services/gmailIngestion');
const { processLlmBatch } = require('./jobs/llmBatchParser');
const { runAggregation } = require('./jobs/aggregation');
const { runSubscriptionDetection } = require('./jobs/subscriptionDetector');
const { detectAnomalies } = require('./jobs/anomalyDetector');
const { requireAuth } = require('./middleware/auth');
const { getAllAuthenticatedUsers } = require('./auth/google');
const { auditLog } = require('./utils/audit');

const app = express();

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin) return callback(null, true);
    if (
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      return callback(null, true);
    }
    callback(null, false);
  },
  credentials: true,
}));
app.use(express.json());
app.use(cookieParser());

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
// Auth routes — no requireAuth (need to work pre-login)
app.use('/auth', require('./routes/auth'));

// Protected API routes — require valid JWT
app.use('/api/dashboard', requireAuth, require('./routes/dashboard'));
app.use('/api/transactions', requireAuth, require('./routes/transactions'));
app.use('/api/subscriptions', requireAuth, require('./routes/subscriptions'));

// Manual sync trigger — user-scoped
app.post('/api/sync', requireAuth, (req, res) => {
  const { id: userId, email: userEmail } = req.user;
  auditLog({ userId, action: 'sync_started', req, metadata: { email: userEmail } });
  syncEmails({ userId, userEmail })
    .then((result) => console.log(`[API] Sync completed for ${userEmail}:`, result))
    .catch((err) => console.error(`[API] Sync error for ${userEmail}:`, err.message));

  res.json({ message: 'Gmail sync started in background', status: 'syncing' });
});

// Database reset — runs all deletes inside one RLS-scoped transaction
app.post('/api/reset', requireAuth, async (req, res) => {
  const { id: userId, email: userEmail } = req.user;
  try {
    await withUserTransaction(userId, async (client) => {
      await client.query('DELETE FROM category_overrides WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM subscriptions      WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM transactions        WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM raw_emails          WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM merchant_profiles   WHERE user_id = $1', [userId]);
      await client.query('DELETE FROM sync_state          WHERE user_id = $1', [userId]);
    });
    console.log(`[API] Database reset for ${userEmail} (id=${userId})`);
    await auditLog({ userId, action: 'data_reset', req, metadata: { email: userEmail } });
    res.json({ message: 'Your data reset successfully.' });
  } catch (err) {
    console.error('[API] Reset error:', err.message);
    res.status(500).json({ error: 'Reset failed', details: err.message });
  }
});

app.post('/api/jobs/aggregate', requireAuth, async (req, res) => {
  try {
    await runAggregation(req.user.id);
    res.json({ message: 'Aggregation complete' });
  } catch (err) {
    res.status(500).json({ error: 'Aggregation failed', details: err.message });
  }
});

app.post('/api/jobs/detect-subscriptions', requireAuth, async (req, res) => {
  try {
    const result = await runSubscriptionDetection(req.user.id);
    res.json({ message: 'Subscription detection complete', ...result });
  } catch (err) {
    res.status(500).json({ error: 'Detection failed', details: err.message });
  }
});

app.post('/api/jobs/detect-anomalies', requireAuth, async (req, res) => {
  try {
    const result = await detectAnomalies(req.user.id);
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
    }

    // Start Kafka consumer if available
    try {
      await startParserConsumer();
    } catch (err) {
      // Kafka optional in standalone mode
    }

    // Schedule cron jobs — sync all authenticated users
    cron.schedule(config.sync.cronSchedule, async () => {
      try {
        // getAllAuthenticatedUsers now returns [{ id, email }]
        const users = await getAllAuthenticatedUsers();
        for (const user of users) {
          try {
            await syncEmails({ userId: user.id, userEmail: user.email });
          } catch (e) {
            console.error(`[Cron] Sync failed for ${user.email}:`, e.message);
          }
        }
      } catch (e) {}
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
