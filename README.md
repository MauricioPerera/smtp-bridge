# SMTP to Cloudflare Webhook Bridge

A lightweight SMTP server that forwards emails to a Cloudflare Worker, enabling email sending using **100% Cloudflare infrastructure** - no external SMTP providers required.

## Overview

```
┌─────────────┐      SMTP       ┌──────────────┐      HTTPS      ┌─────────────────┐
│  Your App   │ ──────────────► │ SMTP Bridge  │ ──────────────► │ Cloudflare      │
│  (n8n, etc) │   Port 2525     │  (Node.js)   │    Webhook      │ Email Worker    │
└─────────────┘                 └──────────────┘                 └────────┬────────┘
                                                                          │
                                                                          ▼
                                                                 ┌─────────────────┐
                                                                 │ Email Recipient │
                                                                 └─────────────────┘
```

## Features

- **100% Cloudflare** - No external email providers needed
- **Free** - Uses Cloudflare's free tier
- **Simple** - Drop-in SMTP replacement for apps that require SMTP
- **Secure** - API key authentication between bridge and worker
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

## Project Structure

```
smtp-to-webhook/
├── server.js                 # SMTP bridge server
├── package.json
├── .env.example              # Configuration template
├── .env                      # Your configuration (create this)
│
├── cloudflare-worker/        # Cloudflare Worker for email sending
│   ├── worker.js             # Worker code
│   ├── wrangler.toml.example # Wrangler config template
│   └── package.json
│
├── scripts/
│   ├── install.sh            # Systemd service installer
│   ├── setup-cloudflare.sh   # Cloudflare Worker setup helper
│   └── test-smtp.js          # Test script
│
└── docs/
    ├── CLOUDFLARE_SETUP.md   # Detailed Cloudflare setup guide
    ├── N8N_INTEGRATION.md    # n8n integration guide
    └── DOCKER.md             # Docker usage guide
```

## Configuration

### SMTP Bridge (.env)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `WEBHOOK_URL` | Yes | - | Cloudflare Worker URL |
| `WEBHOOK_API_KEY` | Yes | - | API key for authentication |
| `SMTP_PORT` | No | `2525` | Port to listen on |
| `SMTP_HOST` | No | `127.0.0.1` | Host to bind to (`0.0.0.0` for Docker) |
| `DEFAULT_FROM_NAME` | No | `System` | Default sender name |

### Cloudflare Worker (wrangler.toml)

| Setting | Description |
|---------|-------------|
| `account_id` | Your Cloudflare account ID |
| `send_email.destination_address` | Verified email in Email Routing |
| `vars.SENDER_EMAIL` | From address (must be on your domain) |
| `vars.DEFAULT_FROM_NAME` | Default sender name |

## Requirements

### Prerequisites

- Node.js 18+
- npm
- Domain with Cloudflare DNS
- Cloudflare Email Routing enabled

### Cloudflare Setup

1. Add your domain to Cloudflare
2. Enable Email Routing: Dashboard → Email → Email Routing
3. Add a destination address and verify it
4. Cloudflare automatically creates MX and SPF records

## API

### SMTP Bridge

The bridge accepts standard SMTP connections on the configured port. No authentication required for local connections.

### Cloudflare Worker

```http
POST https://your-worker.workers.dev
Content-Type: application/json
X-API-Key: your-api-key

{
  "to": "recipient@example.com",
  "subject": "Email subject",
  "text": "Plain text body",
  "html": "<p>HTML body</p>",
  "from_name": "Sender Name"
}
```

Response:
```json
{
  "success": true,
  "message": "Email sent successfully",
  "to": "recipient@example.com",
  "subject": "Email subject"
}
```

## Usage Examples

### n8n Integration

Add to your n8n `docker-compose.yml`:

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
  text: 'Hello World!'
});
```

### Python with smtplib

```python
import smtplib
from email.message import EmailMessage

msg = EmailMessage()
msg['From'] = 'app@yourdomain.com'
msg['To'] = 'user@example.com'
msg['Subject'] = 'Hello'
msg.set_content('Hello World!')

with smtplib.SMTP('127.0.0.1', 2525) as server:
    server.send_message(msg)
```

### cURL (direct to Worker)

```bash
curl -X POST "https://your-worker.workers.dev" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{"to": "user@example.com", "subject": "Hello", "text": "Hello World!"}'
```

## Testing

```bash
# Test the SMTP bridge
npm test your-email@example.com

# Or manually
node scripts/test-smtp.js your-email@example.com
```

## Troubleshooting

### Connection Refused

If you see `ECONNREFUSED`:
- Ensure the bridge is running: `systemctl status smtp-bridge`
- Check if binding to correct host (use `0.0.0.0` for Docker)
- Verify the port is open: `nc -zv localhost 2525`

### Emails Not Sending

- Check bridge logs: `journalctl -u smtp-bridge -f`
- Verify Cloudflare Worker is deployed: `wrangler tail`
- Ensure API key matches in both .env and Worker secret

### Emails Going to Spam

- Verify SPF record exists for your domain
- Add DMARC record: `v=DMARC1; p=quarantine`
- Use consistent sender address

## Security Considerations

- The SMTP bridge has no authentication by default
- Only bind to `127.0.0.1` unless Docker requires `0.0.0.0`
- Use firewall rules to restrict access to port 2525
- Keep API keys secure and rotate regularly

## License

MIT

## Contributing

Pull requests welcome! Please read the contributing guidelines first.

## Credits

Built with:
- [smtp-server](https://nodemailer.com/extras/smtp-server/) - SMTP server implementation
- [mailparser](https://nodemailer.com/extras/mailparser/) - Email parsing
- [Cloudflare Workers](https://workers.cloudflare.com/) - Serverless execution
- [Cloudflare Email Routing](https://developers.cloudflare.com/email-routing/) - Email infrastructure
