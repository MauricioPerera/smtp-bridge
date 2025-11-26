# SMTP to Cloudflare Webhook Bridge

A lightweight SMTP server that forwards emails to a Cloudflare Worker, enabling email sending using **100% Cloudflare infrastructure** - no external SMTP providers required.

## Overview

```
┌─────────────┐      SMTP       ┌──────────────┐      HTTPS      ┌─────────────────┐
│  Your App   │ ──────────────► │ SMTP Bridge  │ ──────────────► │ Cloudflare      │
│  (n8n, etc) │   Port 2525     │  (Node.js)   │    Webhook      │ Email Worker    │
└─────────────┘                 └──────────────┘                 └────────┬────────┘
                                       │                                  │
                                       ▼                                  ▼
                              ┌─────────────────┐                ┌─────────────────┐
                              │  Health Check   │                │ Email Recipient │
                              │  :2526/health   │                └─────────────────┘
                              └─────────────────┘
```

## Features

- **100% Cloudflare** - No external email providers needed
- **Free** - Uses Cloudflare's free tier (200 emails/day)
- **Rate Limiting** - Built-in protection against quota exhaustion
- **Queue & Retries** - SQLite-backed queue with automatic retries
- **Multiple Recipients** - Full TO/CC/BCC support
- **Attachments** - Base64-encoded file attachments
- **Health Checks** - HTTP endpoints for monitoring
- **Docker-friendly** - Works with containerized applications

## Quick Start

### 1. Set up the Cloudflare Worker

First, deploy the email worker to Cloudflare:

```bash
cd cloudflare-worker
cp wrangler.toml.example wrangler.toml
# Edit wrangler.toml with your account_id and domain
npm install
wrangler deploy
```

Set the API key secret:
```bash
openssl rand -hex 32  # Generate a key
wrangler secret put API_KEY  # Paste the generated key
```

### 2. Configure the SMTP Bridge

```bash
# Copy example config
cp .env.example .env

# Edit with your values
nano .env
```

Required configuration:
```env
WEBHOOK_URL=https://your-worker.workers.dev
WEBHOOK_API_KEY=your-generated-api-key
SMTP_HOST=0.0.0.0
SMTP_PORT=2525
```

### 3. Install and Run

```bash
# Install dependencies
npm install

# Run directly
npm start

# Or install as systemd service
sudo ./scripts/install.sh
```

### 4. Configure Your Application

Point your application's SMTP settings to the bridge:

| Setting | Value |
|---------|-------|
| Host | `127.0.0.1` (or `host.docker.internal` from Docker) |
| Port | `2525` |
| SSL/TLS | `false` |
| Authentication | None required |

---

## Cloudflare Free Tier Limits

| Resource | Limit |
|----------|-------|
| Emails per day | **200** |
| Email size | **25 MB** |
| Recipients per email | 1 (bridge sends individually) |
| Workers requests | 100,000/day |

The bridge includes a built-in rate limiter (default: 200/day) to prevent exceeding Cloudflare's free tier. Adjust `RATE_LIMIT_PER_DAY` if you have a paid plan.

---

## Configuration

### SMTP Bridge (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WEBHOOK_URL` | Yes | - | Cloudflare Worker URL |
| `WEBHOOK_API_KEY` | Yes | - | API key for authentication |
| `SMTP_PORT` | No | `2525` | SMTP port to listen on |
| `SMTP_HOST` | No | `127.0.0.1` | Host to bind (`0.0.0.0` for Docker) |
| `DEFAULT_FROM_NAME` | No | `System` | Default sender name |
| `RATE_LIMIT_PER_DAY` | No | `200` | Max emails per day |
| `ENABLE_QUEUE` | No | `true` | Enable SQLite queue |
| `MAX_RETRIES` | No | `3` | Retry attempts for failed emails |
| `RETRY_DELAY_MS` | No | `60000` | Delay between retries (ms) |
| `HEALTH_PORT` | No | `2526` | Health check HTTP port |
| `MAX_ATTACHMENT_SIZE` | No | `26214400` | Max attachment size (bytes) |

### Cloudflare Worker (wrangler.toml)

| Setting | Description |
|---------|-------------|
| `account_id` | Your Cloudflare account ID |
| `send_email.destination_address` | Verified email in Email Routing |
| `vars.SENDER_EMAIL` | From address (must be on your domain) |
| `vars.DEFAULT_FROM_NAME` | Default sender name |

---

## Health Check Endpoints

The bridge exposes HTTP endpoints for monitoring on port 2526 (configurable):

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Full health status with stats |
| `GET /stats` | Rate limit and queue statistics |
| `GET /ready` | Kubernetes readiness probe |
| `GET /live` | Kubernetes liveness probe |

### Example Response

```bash
curl http://localhost:2526/health
```

```json
{
  "status": "healthy",
  "timestamp": "2024-11-26T10:30:00.000Z",
  "uptime": 3600,
  "smtp": {
    "host": "0.0.0.0",
    "port": 2525
  },
  "rateLimit": {
    "used": 45,
    "limit": 200,
    "remaining": 155,
    "resetAt": "2024-11-27T00:00:00.000Z"
  },
  "queue": {
    "enabled": true,
    "total": 50,
    "pending": 2,
    "sent": 45,
    "failed": 3
  }
}
```

---

## Queue & Retries

When `ENABLE_QUEUE=true` (default), emails are:

1. Immediately accepted by SMTP
2. Stored in SQLite database
3. Processed in background
4. Automatically retried on failure

Benefits:
- Fast SMTP responses (no blocking)
- Resilience to Worker downtime
- Automatic retries for transient failures
- Persistent queue survives restarts

To disable: `ENABLE_QUEUE=false`

**Note:** Requires `better-sqlite3` (optional dependency). Without it, emails are sent immediately without queue/retry.

---

## Attachments

The bridge supports file attachments:

```javascript
// Nodemailer example with attachment
await transporter.sendMail({
  from: 'app@yourdomain.com',
  to: 'user@example.com',
  subject: 'Report',
  text: 'Please find attached.',
  attachments: [{
    filename: 'report.pdf',
    path: './report.pdf'
  }]
});
```

**Limitations:**
- Max size: 25 MB total (Cloudflare limit)
- Attachments are base64 encoded (33% size increase)
- Large attachments count against rate limits

---

## Multiple Recipients (TO/CC/BCC)

All recipient types are supported:

```javascript
await transporter.sendMail({
  from: 'app@yourdomain.com',
  to: ['user1@example.com', 'user2@example.com'],
  cc: 'manager@example.com',
  bcc: 'archive@example.com',
  subject: 'Team Update',
  text: 'Hello team!'
});
```

**Note:** Due to Cloudflare Email Routing limitations, each recipient receives an individual email. For 3 TO + 1 CC + 1 BCC, this counts as 5 emails against your daily limit.

---

## Project Structure

```
smtp-to-webhook/
├── server.js                 # SMTP bridge server
├── package.json
├── .env.example              # Configuration template
├── email_queue.db            # SQLite queue (auto-created)
│
├── cloudflare-worker/        # Cloudflare Worker
│   ├── worker.js             # Worker code
│   ├── wrangler.toml.example # Wrangler config template
│   └── package.json
│
├── scripts/
│   ├── install.sh            # Systemd service installer
│   ├── setup-cloudflare.sh   # Cloudflare Worker setup
│   └── test-smtp.js          # Test script
│
└── docs/
    ├── CLOUDFLARE_SETUP.md   # Detailed Cloudflare setup
    └── integrations/         # App integration guides
        ├── N8N.md
        ├── WORDPRESS.md
        ├── LARAVEL.md
        ├── DJANGO.md
        ├── NEXTCLOUD.md
        └── GITLAB.md
```

---

## API

### Cloudflare Worker

```http
POST https://your-worker.workers.dev
Content-Type: application/json
X-API-Key: your-api-key

{
  "to": ["recipient@example.com"],
  "cc": ["copy@example.com"],
  "bcc": ["blind@example.com"],
  "subject": "Email subject",
  "text": "Plain text body",
  "html": "<p>HTML body</p>",
  "from_name": "Sender Name",
  "attachments": [{
    "filename": "file.pdf",
    "contentType": "application/pdf",
    "content": "base64-encoded-content"
  }],
  "headers": {
    "replyTo": "reply@example.com"
  }
}
```

Response:
```json
{
  "success": true,
  "message": "Email sent to 3 recipient(s)",
  "recipients": [
    { "email": "recipient@example.com", "type": "to", "status": "sent" },
    { "email": "copy@example.com", "type": "cc", "status": "sent" },
    { "email": "blind@example.com", "type": "bcc", "status": "sent" }
  ],
  "subject": "Email subject"
}
```

---

## Usage Examples

### n8n Integration

```yaml
services:
  n8n:
    environment:
      - N8N_EMAIL_MODE=smtp
      - N8N_SMTP_HOST=host.docker.internal
      - N8N_SMTP_PORT=2525
      - N8N_SMTP_SSL=false
      - N8N_SMTP_SENDER=noreply@yourdomain.com
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### Node.js with Nodemailer

```javascript
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  host: '127.0.0.1',
  port: 2525,
  secure: false
});

await transporter.sendMail({
  from: 'app@yourdomain.com',
  to: 'user@example.com',
  subject: 'Hello',
  text: 'Hello World!',
  attachments: [{
    filename: 'report.pdf',
    path: './report.pdf'
  }]
});
```

### Python with smtplib

```python
import smtplib
from email.message import EmailMessage

msg = EmailMessage()
msg['From'] = 'app@yourdomain.com'
msg['To'] = 'user@example.com'
msg['Cc'] = 'manager@example.com'
msg['Subject'] = 'Hello'
msg.set_content('Hello World!')

with smtplib.SMTP('127.0.0.1', 2525) as server:
    server.send_message(msg)
```

---

## Testing

```bash
# Test the SMTP bridge
npm test your-email@example.com

# Check health status
curl http://localhost:2526/health

# Check rate limit status
curl http://localhost:2526/stats
```

---

## Troubleshooting

### Rate Limit Exceeded

```
Error: Rate limit exceeded. Resets at 2024-11-27T00:00:00.000Z
```

- Check current usage: `curl http://localhost:2526/stats`
- Wait for reset at midnight UTC
- Or upgrade Cloudflare plan and increase `RATE_LIMIT_PER_DAY`

### Connection Refused

- Ensure the bridge is running: `systemctl status smtp-bridge`
- Check host binding (use `0.0.0.0` for Docker)
- Verify port: `nc -zv localhost 2525`

### Queue Not Working

- Install optional dependency: `npm install better-sqlite3`
- Check if queue is enabled: `curl http://localhost:2526/health`
- View pending emails in `email_queue.db`

### Emails Going to Spam

- Verify SPF record exists for your domain
- Add DMARC record: `v=DMARC1; p=quarantine`
- Use consistent sender address

---

## Security Considerations

- The SMTP bridge has no authentication by default
- Only bind to `127.0.0.1` unless Docker requires `0.0.0.0`
- Use firewall rules to restrict access to ports 2525 and 2526
- Keep API keys secure and rotate regularly

---

## Known Limitations

1. **200 emails/day on free tier** - Each recipient counts separately
2. **No DKIM signing** - Cloudflare Email Routing handles authentication
3. **No email tracking** - Opens/clicks not tracked
4. **Sequential recipient delivery** - CC/BCC recipients get individual emails
5. **25 MB max email size** - Including base64-encoded attachments

---

## Requirements

- Node.js 18+
- npm
- Domain with Cloudflare DNS
- Cloudflare Email Routing enabled
- (Optional) better-sqlite3 for queue functionality

---

## License

MIT

## Credits

Built with:
- [smtp-server](https://nodemailer.com/extras/smtp-server/) - SMTP server
- [mailparser](https://nodemailer.com/extras/mailparser/) - Email parsing
- [better-sqlite3](https://github.com/WiseLibs/better-sqlite3) - Queue storage
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless execution
- [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) - Email infrastructure
