/**
 * SMTP to Cloudflare Email Worker Bridge
 *
 * This server receives emails via SMTP and forwards them to a Cloudflare Worker
 * that handles the actual email delivery using Cloudflare Email Routing.
 *
 * Features:
 *   - Rate limiting (configurable, default 200/day for free tier)
 *   - SQLite queue with automatic retries
 *   - Multiple recipients support (TO/CC/BCC)
 *   - Attachment support
 *   - Health check HTTP endpoint
 *
 * Environment variables:
 *   - WEBHOOK_URL: URL of the Cloudflare Worker (required)
 *   - WEBHOOK_API_KEY: API key for the Cloudflare Worker (required)
 *   - SMTP_PORT: Port to listen on (default: 2525)
 *   - SMTP_HOST: Host to bind to (default: 127.0.0.1)
 *   - DEFAULT_FROM_NAME: Default sender name (default: "System")
 *   - RATE_LIMIT_PER_DAY: Max emails per day (default: 200)
 *   - ENABLE_QUEUE: Enable SQLite queue for retries (default: true)
 *   - MAX_RETRIES: Max retry attempts (default: 3)
 *   - RETRY_DELAY_MS: Delay between retries in ms (default: 60000)
 *   - HEALTH_PORT: HTTP health check port (default: 2526)
 *   - MAX_ATTACHMENT_SIZE: Max attachment size in bytes (default: 25MB)
 */

const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');
const http = require('http');
const path = require('path');

// Optional SQLite - gracefully degrade if not available
let Database;
try {
  Database = require('better-sqlite3');
} catch (e) {
  console.log('Note: better-sqlite3 not installed. Queue/retry functionality disabled.');
  console.log('      Install with: npm install better-sqlite3');
}

// Configuration from environment variables
const config = {
  webhookUrl: process.env.WEBHOOK_URL,
  webhookApiKey: process.env.WEBHOOK_API_KEY,
  smtpPort: parseInt(process.env.SMTP_PORT || '2525'),
  smtpHost: process.env.SMTP_HOST || '127.0.0.1',
  defaultFromName: process.env.DEFAULT_FROM_NAME || 'System',
  rateLimitPerDay: parseInt(process.env.RATE_LIMIT_PER_DAY || '200'),
  enableQueue: process.env.ENABLE_QUEUE !== 'false' && !!Database,
  maxRetries: parseInt(process.env.MAX_RETRIES || '3'),
  retryDelayMs: parseInt(process.env.RETRY_DELAY_MS || '60000'),
  healthPort: parseInt(process.env.HEALTH_PORT || '2526'),
  maxAttachmentSize: parseInt(process.env.MAX_ATTACHMENT_SIZE || String(25 * 1024 * 1024))
};

// Validate required configuration
if (!config.webhookUrl || !config.webhookApiKey) {
  console.error('ERROR: Missing required environment variables:');
  if (!config.webhookUrl) console.error('  - WEBHOOK_URL');
  if (!config.webhookApiKey) console.error('  - WEBHOOK_API_KEY');
  console.error('\nPlease set these variables in your .env file or environment.');
  process.exit(1);
}

// ============================================================================
// Rate Limiter
// ============================================================================
class RateLimiter {
  constructor(limit) {
    this.limit = limit;
    this.counts = new Map(); // date string -> count
  }

  check() {
    const today = new Date().toISOString().split('T')[0];
    const count = this.counts.get(today) || 0;
    return {
      allowed: count < this.limit,
      remaining: Math.max(0, this.limit - count),
      resetAt: this.getResetTime()
    };
  }

  increment() {
    const today = new Date().toISOString().split('T')[0];
    const count = this.counts.get(today) || 0;
    this.counts.set(today, count + 1);
    // Clean old entries
    for (const [date] of this.counts) {
      if (date !== today) this.counts.delete(date);
    }
    return this.limit - count - 1;
  }

  getResetTime() {
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);
    return tomorrow.toISOString();
  }

  getStats() {
    const today = new Date().toISOString().split('T')[0];
    const count = this.counts.get(today) || 0;
    return {
      used: count,
      limit: this.limit,
      remaining: Math.max(0, this.limit - count),
      resetAt: this.getResetTime()
    };
  }
}

const rateLimiter = new RateLimiter(config.rateLimitPerDay);

// ============================================================================
// Email Queue (SQLite)
// ============================================================================
let db = null;
let queueProcessor = null;

function initDatabase() {
  if (!config.enableQueue || !Database) return;

  const dbPath = path.join(__dirname, 'email_queue.db');
  db = new Database(dbPath);

  // Create tables
  db.exec(`
    CREATE TABLE IF NOT EXISTS email_queue (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email_data TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      attempts INTEGER DEFAULT 0,
      last_error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
      next_retry_at TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_status ON email_queue(status);
    CREATE INDEX IF NOT EXISTS idx_next_retry ON email_queue(next_retry_at);

    CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      recipient TEXT,
      subject TEXT,
      status TEXT,
      error TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );
  `);

  console.log(`[${timestamp()}] SQLite queue initialized: ${dbPath}`);
}

function queueEmail(emailData) {
  if (!db) return null;

  const stmt = db.prepare(`
    INSERT INTO email_queue (email_data, status, next_retry_at)
    VALUES (?, 'pending', datetime('now'))
  `);
  const result = stmt.run(JSON.stringify(emailData));
  return result.lastInsertRowid;
}

function getNextQueuedEmail() {
  if (!db) return null;

  return db.prepare(`
    SELECT * FROM email_queue
    WHERE status = 'pending'
      AND attempts < ?
      AND (next_retry_at IS NULL OR datetime(next_retry_at) <= datetime('now'))
    ORDER BY created_at ASC
    LIMIT 1
  `).get(config.maxRetries);
}

function updateQueueItem(id, status, error = null) {
  if (!db) return;

  const nextRetry = status === 'pending'
    ? `datetime('now', '+${Math.floor(config.retryDelayMs / 1000)} seconds')`
    : 'NULL';

  db.prepare(`
    UPDATE email_queue
    SET status = ?,
        last_error = ?,
        attempts = attempts + 1,
        updated_at = CURRENT_TIMESTAMP,
        next_retry_at = ${nextRetry}
    WHERE id = ?
  `).run(status, error, id);
}

function logEmail(recipient, subject, status, error = null) {
  if (!db) return;

  db.prepare(`
    INSERT INTO email_log (recipient, subject, status, error)
    VALUES (?, ?, ?, ?)
  `).run(recipient, subject, status, error);
}

function getQueueStats() {
  if (!db) return { enabled: false };

  const stats = db.prepare(`
    SELECT
      COUNT(*) as total,
      SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
      SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) as sent,
      SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM email_queue
    WHERE created_at >= datetime('now', '-24 hours')
  `).get();

  return { enabled: true, ...stats };
}

// Process queue in background
function startQueueProcessor() {
  if (!config.enableQueue || !db) return;

  queueProcessor = setInterval(async () => {
    const email = getNextQueuedEmail();
    if (!email) return;

    console.log(`[${timestamp()}] Processing queued email #${email.id}`);

    try {
      const emailData = JSON.parse(email.email_data);
      await sendToWebhook(emailData);
      updateQueueItem(email.id, 'sent');
      logEmail(emailData.to, emailData.subject, 'sent');
      console.log(`[${timestamp()}] ✓ Queued email #${email.id} sent successfully`);
    } catch (error) {
      const isFinalAttempt = email.attempts + 1 >= config.maxRetries;
      updateQueueItem(email.id, isFinalAttempt ? 'failed' : 'pending', error.message);

      if (isFinalAttempt) {
        const emailData = JSON.parse(email.email_data);
        logEmail(emailData.to, emailData.subject, 'failed', error.message);
        console.error(`[${timestamp()}] ✗ Queued email #${email.id} failed permanently: ${error.message}`);
      } else {
        console.log(`[${timestamp()}] ⟳ Queued email #${email.id} will retry (attempt ${email.attempts + 1}/${config.maxRetries})`);
      }
    }
  }, 5000); // Check queue every 5 seconds
}

// ============================================================================
// Email Sending
// ============================================================================
async function sendToWebhook(emailData) {
  const response = await fetch(config.webhookUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-API-Key': config.webhookApiKey
    },
    body: JSON.stringify(emailData)
  });

  const result = await response.json();

  if (!result.success) {
    throw new Error(result.error || 'Webhook error');
  }

  return result;
}

// ============================================================================
// Helper Functions
// ============================================================================
function timestamp() {
  return new Date().toISOString();
}

function extractEmails(addressObj) {
  if (!addressObj) return [];
  if (addressObj.value && Array.isArray(addressObj.value)) {
    return addressObj.value.map(v => v.address).filter(Boolean);
  }
  if (addressObj.text) {
    const match = addressObj.text.match(/<(.+)>/);
    return match ? [match[1]] : [addressObj.text];
  }
  return [];
}

function extractName(addressObj) {
  if (!addressObj) return null;
  if (addressObj.value && addressObj.value[0]) {
    return addressObj.value[0].name;
  }
  return null;
}

function processAttachments(attachments) {
  if (!attachments || !attachments.length) return [];

  return attachments.map(att => {
    // Check size limit
    if (att.size > config.maxAttachmentSize) {
      console.warn(`[${timestamp()}] Warning: Attachment "${att.filename}" exceeds size limit (${att.size} > ${config.maxAttachmentSize})`);
      return null;
    }

    return {
      filename: att.filename || 'attachment',
      contentType: att.contentType || 'application/octet-stream',
      content: att.content.toString('base64'),
      size: att.size
    };
  }).filter(Boolean);
}

// ============================================================================
// SMTP Server
// ============================================================================
const smtpServer = new SMTPServer({
  secure: false,
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  banner: 'SMTP-to-Webhook Bridge Ready',
  size: config.maxAttachmentSize + (1024 * 1024), // Allow message size + 1MB overhead

  onMailFrom(address, session, callback) {
    console.log(`[${timestamp()}] MAIL FROM: ${address.address}`);
    callback();
  },

  onRcptTo(address, session, callback) {
    console.log(`[${timestamp()}] RCPT TO: ${address.address}`);
    callback();
  },

  onData(stream, session, callback) {
    // Check rate limit first
    const rateCheck = rateLimiter.check();
    if (!rateCheck.allowed) {
      console.error(`[${timestamp()}] ✗ Rate limit exceeded (${config.rateLimitPerDay}/day)`);
      return callback(new Error(`Rate limit exceeded. Resets at ${rateCheck.resetAt}`));
    }

    simpleParser(stream, async (err, parsed) => {
      if (err) {
        console.error(`[${timestamp()}] Parse error:`, err.message);
        return callback(err);
      }

      // Extract all recipients
      const toAddresses = extractEmails(parsed.to);
      const ccAddresses = extractEmails(parsed.cc);
      const bccAddresses = extractEmails(parsed.bcc);
      const allRecipients = [...toAddresses, ...ccAddresses, ...bccAddresses];

      if (allRecipients.length === 0) {
        console.error(`[${timestamp()}] ERROR: No recipient addresses`);
        return callback(new Error('No recipient address'));
      }

      // Process attachments
      const attachments = processAttachments(parsed.attachments);

      // Build email data
      const emailData = {
        to: toAddresses,
        cc: ccAddresses.length > 0 ? ccAddresses : undefined,
        bcc: bccAddresses.length > 0 ? bccAddresses : undefined,
        subject: parsed.subject || '(no subject)',
        text: parsed.text || '',
        html: parsed.html || null,
        from_name: extractName(parsed.from) || config.defaultFromName,
        attachments: attachments.length > 0 ? attachments : undefined,
        headers: {
          replyTo: parsed.replyTo ? extractEmails(parsed.replyTo)[0] : undefined
        }
      };

      // Log the email
      console.log(`[${timestamp()}] Processing email:`);
      console.log(`  To: ${toAddresses.join(', ')}`);
      if (ccAddresses.length) console.log(`  CC: ${ccAddresses.join(', ')}`);
      if (bccAddresses.length) console.log(`  BCC: ${bccAddresses.join(', ')}`);
      console.log(`  Subject: ${emailData.subject}`);
      console.log(`  From Name: ${emailData.from_name}`);
      if (attachments.length) {
        console.log(`  Attachments: ${attachments.map(a => `${a.filename} (${a.size} bytes)`).join(', ')}`);
      }

      // If queue is enabled, add to queue and return success immediately
      if (config.enableQueue && db) {
        const queueId = queueEmail(emailData);
        rateLimiter.increment();
        console.log(`[${timestamp()}] ✓ Email queued (#${queueId}), ${rateLimiter.check().remaining} remaining today`);
        return callback();
      }

      // Direct send (no queue)
      try {
        await sendToWebhook(emailData);
        rateLimiter.increment();
        console.log(`[${timestamp()}] ✓ Email sent successfully, ${rateLimiter.check().remaining} remaining today`);
        callback();
      } catch (error) {
        console.error(`[${timestamp()}] ✗ Send error:`, error.message);
        callback(error);
      }
    });
  }
});

// ============================================================================
// Health Check HTTP Server
// ============================================================================
const healthServer = http.createServer((req, res) => {
  if (req.url === '/health' || req.url === '/') {
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      smtp: {
        host: config.smtpHost,
        port: config.smtpPort
      },
      rateLimit: rateLimiter.getStats(),
      queue: getQueueStats()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(health, null, 2));
  } else if (req.url === '/stats') {
    const stats = {
      rateLimit: rateLimiter.getStats(),
      queue: getQueueStats()
    };

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(stats, null, 2));
  } else if (req.url === '/ready') {
    // Kubernetes readiness probe
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else if (req.url === '/live') {
    // Kubernetes liveness probe
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

// ============================================================================
// Start Servers
// ============================================================================
initDatabase();

smtpServer.listen(config.smtpPort, config.smtpHost, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         SMTP to Cloudflare Webhook Bridge                  ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  SMTP Server:    ${config.smtpHost}:${config.smtpPort}`.padEnd(62) + '║');
  console.log(`║  Health Check:   http://localhost:${config.healthPort}/health`.padEnd(62) + '║');
  console.log(`║  Rate Limit:     ${config.rateLimitPerDay} emails/day`.padEnd(62) + '║');
  console.log(`║  Queue Enabled:  ${config.enableQueue ? 'Yes (SQLite)' : 'No'}`.padEnd(62) + '║');
  console.log(`║  Max Retries:    ${config.maxRetries}`.padEnd(62) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Ready to receive emails...');
  console.log('');
});

healthServer.listen(config.healthPort, '0.0.0.0', () => {
  console.log(`[${timestamp()}] Health check server listening on port ${config.healthPort}`);
});

startQueueProcessor();

// ============================================================================
// Error Handling & Graceful Shutdown
// ============================================================================
smtpServer.on('error', (err) => {
  console.error(`[${timestamp()}] SMTP Server error:`, err.message);
});

healthServer.on('error', (err) => {
  console.error(`[${timestamp()}] Health Server error:`, err.message);
});

function shutdown() {
  console.log(`[${timestamp()}] Shutting down...`);

  if (queueProcessor) {
    clearInterval(queueProcessor);
  }

  Promise.all([
    new Promise(resolve => smtpServer.close(resolve)),
    new Promise(resolve => healthServer.close(resolve))
  ]).then(() => {
    if (db) {
      db.close();
      console.log(`[${timestamp()}] Database closed`);
    }
    console.log(`[${timestamp()}] Shutdown complete`);
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
