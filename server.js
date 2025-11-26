/**
 * SMTP to Cloudflare Email Worker Bridge
 *
 * This server receives emails via SMTP and forwards them to a Cloudflare Worker
 * that handles the actual email delivery using Cloudflare Email Routing.
 *
 * Environment variables:
 *   - WEBHOOK_URL: URL of the Cloudflare Worker (required)
 *   - WEBHOOK_API_KEY: API key for the Cloudflare Worker (required)
 *   - SMTP_PORT: Port to listen on (default: 2525)
 *   - SMTP_HOST: Host to bind to (default: 127.0.0.1)
 *   - DEFAULT_FROM_NAME: Default sender name (default: "System")
 */

const { SMTPServer } = require('smtp-server');
const { simpleParser } = require('mailparser');

// Configuration from environment variables
const config = {
  webhookUrl: process.env.WEBHOOK_URL,
  webhookApiKey: process.env.WEBHOOK_API_KEY,
  smtpPort: parseInt(process.env.SMTP_PORT || '2525'),
  smtpHost: process.env.SMTP_HOST || '127.0.0.1',
  defaultFromName: process.env.DEFAULT_FROM_NAME || 'System'
};

// Validate required configuration
if (!config.webhookUrl || !config.webhookApiKey) {
  console.error('ERROR: Missing required environment variables:');
  if (!config.webhookUrl) console.error('  - WEBHOOK_URL');
  if (!config.webhookApiKey) console.error('  - WEBHOOK_API_KEY');
  console.error('\nPlease set these variables in your .env file or environment.');
  process.exit(1);
}

// Create SMTP server
const server = new SMTPServer({
  secure: false,
  authOptional: true,
  disabledCommands: ['STARTTLS'],
  banner: 'SMTP-to-Webhook Bridge Ready',

  // Validate sender (optional - allow all by default)
  onMailFrom(address, session, callback) {
    console.log(`[${timestamp()}] MAIL FROM: ${address.address}`);
    callback();
  },

  // Validate recipient (optional - allow all by default)
  onRcptTo(address, session, callback) {
    console.log(`[${timestamp()}] RCPT TO: ${address.address}`);
    callback();
  },

  // Process incoming email
  onData(stream, session, callback) {
    simpleParser(stream, async (err, parsed) => {
      if (err) {
        console.error(`[${timestamp()}] Parse error:`, err.message);
        return callback(err);
      }

      // Extract email data
      const emailData = {
        to: extractEmail(parsed.to),
        subject: parsed.subject || '(no subject)',
        text: parsed.text || '',
        html: parsed.html || null,
        from_name: extractName(parsed.from) || config.defaultFromName
      };

      // Log the email
      console.log(`[${timestamp()}] Processing email:`);
      console.log(`  To: ${emailData.to}`);
      console.log(`  Subject: ${emailData.subject}`);
      console.log(`  From Name: ${emailData.from_name}`);

      // Validate required fields
      if (!emailData.to) {
        console.error(`[${timestamp()}] ERROR: No recipient address`);
        return callback(new Error('No recipient address'));
      }

      // Forward to Cloudflare Worker
      try {
        const response = await fetch(config.webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': config.webhookApiKey
          },
          body: JSON.stringify(emailData)
        });

        const result = await response.json();

        if (result.success) {
          console.log(`[${timestamp()}] ✓ Email sent successfully`);
          callback();
        } else {
          console.error(`[${timestamp()}] ✗ Webhook error:`, result.error);
          callback(new Error(result.error || 'Webhook error'));
        }
      } catch (error) {
        console.error(`[${timestamp()}] ✗ Network error:`, error.message);
        callback(error);
      }
    });
  }
});

// Helper functions
function timestamp() {
  return new Date().toISOString();
}

function extractEmail(addressObj) {
  if (!addressObj) return null;
  if (addressObj.value && addressObj.value[0]) {
    return addressObj.value[0].address;
  }
  if (addressObj.text) {
    const match = addressObj.text.match(/<(.+)>/);
    return match ? match[1] : addressObj.text;
  }
  return null;
}

function extractName(addressObj) {
  if (!addressObj) return null;
  if (addressObj.value && addressObj.value[0]) {
    return addressObj.value[0].name;
  }
  return null;
}

// Start server
server.listen(config.smtpPort, config.smtpHost, () => {
  console.log('');
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║         SMTP to Cloudflare Webhook Bridge                  ║');
  console.log('╠════════════════════════════════════════════════════════════╣');
  console.log(`║  SMTP Server:  ${config.smtpHost}:${config.smtpPort}`.padEnd(62) + '║');
  console.log(`║  Webhook URL:  ${config.webhookUrl.substring(0, 45)}...`.padEnd(62) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log('');
  console.log('Ready to receive emails...');
  console.log('');
});

// Error handling
server.on('error', (err) => {
  console.error(`[${timestamp()}] Server error:`, err.message);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log(`[${timestamp()}] Received SIGTERM, shutting down...`);
  server.close(() => {
    console.log(`[${timestamp()}] Server closed`);
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log(`[${timestamp()}] Received SIGINT, shutting down...`);
  server.close(() => {
    console.log(`[${timestamp()}] Server closed`);
    process.exit(0);
  });
});
