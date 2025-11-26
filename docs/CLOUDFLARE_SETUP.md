# Cloudflare Setup Guide

Step-by-step guide to configure Cloudflare Email Routing and deploy the email worker.

## Prerequisites

- Cloudflare account (free tier works)
- Domain with nameservers pointing to Cloudflare
- Node.js 18+ installed
- Wrangler CLI: `npm install -g wrangler`

---

## Step 1: Add Domain to Cloudflare

If your domain isn't already on Cloudflare:

1. Go to https://dash.cloudflare.com
2. Click **"Add a Site"**
3. Enter your domain name
4. Select the **Free** plan
5. Cloudflare will scan existing DNS records
6. Update your domain's nameservers at your registrar

Wait for DNS propagation (up to 24 hours, usually faster).

---

## Step 2: Enable Email Routing

1. In Cloudflare dashboard, select your domain
2. Go to **Email** → **Email Routing**
3. Click **"Get started"** or **"Enable Email Routing"**
4. Cloudflare will automatically create required DNS records:
   - MX records pointing to Cloudflare
   - SPF record

### Verify DNS Records

```bash
# Check MX records
dig MX yourdomain.com +short
# Should show: route1.mx.cloudflare.net, route2.mx.cloudflare.net, route3.mx.cloudflare.net

# Check SPF record
dig TXT yourdomain.com +short
# Should include: v=spf1 include:_spf.mx.cloudflare.net
```

---

## Step 3: Add Destination Address

1. In Email Routing, go to **Destination addresses**
2. Click **"Add destination address"**
3. Enter your personal email (e.g., your@gmail.com)
4. Check your email and click the verification link

This email will be used as the `destination_address` in the worker configuration.

---

## Step 4: Add DMARC Record (Recommended)

1. Go to **DNS** → **Records**
2. Add a new TXT record:
   - Name: `_dmarc`
   - Content: `v=DMARC1; p=quarantine; rua=mailto:dmarc@yourdomain.com`
   - TTL: Auto

---

## Step 5: Get Account ID

1. In Cloudflare dashboard, select your domain
2. On the **Overview** page, look at the right sidebar
3. Copy your **Account ID**

---

## Step 6: Create API Token

### Option A: Via Dashboard

1. Go to https://dash.cloudflare.com/profile/api-tokens
2. Click **"Create Token"**
3. Select **"Create Custom Token"**
4. Add permissions:
   - Account → Workers Scripts → Edit
   - Zone → DNS → Edit (for your zone)
5. Click **"Continue to summary"** → **"Create Token"**
6. **Save the token immediately** (shown only once)

### Option B: Via CLI

```bash
wrangler login
```

This opens a browser for OAuth authentication.

---

## Step 7: Configure the Worker

```bash
cd cloudflare-worker

# Copy the example configuration
cp wrangler.toml.example wrangler.toml
```

Edit `wrangler.toml`:

```toml
name = "email-sender"
main = "worker.js"
compatibility_date = "2024-11-20"
compatibility_flags = ["nodejs_compat"]

# Your Cloudflare Account ID (from Step 5)
account_id = "your-account-id-here"

# Email binding
# destination_address = your verified email from Step 3
send_email = [
    { name = "EMAIL", destination_address = "your@gmail.com" }
]

# Environment variables
[vars]
SENDER_EMAIL = "noreply@yourdomain.com"
DEFAULT_FROM_NAME = "Your App Name"
```

---

## Step 8: Deploy the Worker

```bash
# Install dependencies
npm install

# Deploy
CLOUDFLARE_API_TOKEN="your-token" wrangler deploy
```

Note the worker URL from the output (e.g., `https://email-sender.your-subdomain.workers.dev`).

---

## Step 9: Set API Key Secret

Generate a secure API key:

```bash
openssl rand -hex 32
```

Set it as a secret in Cloudflare:

```bash
echo "your-generated-key" | CLOUDFLARE_API_TOKEN="your-token" wrangler secret put API_KEY
```

---

## Step 10: Test the Worker

```bash
curl -X POST "https://email-sender.your-subdomain.workers.dev" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: your-api-key" \
  -d '{
    "to": "your@gmail.com",
    "subject": "Test from Cloudflare Worker",
    "text": "If you receive this, the worker is configured correctly!"
  }'
```

---

## Troubleshooting

### "Email Routing not enabled"

Enable it in: Dashboard → Email → Email Routing → Enable

### "Destination address not verified"

Check your email inbox (including spam) for the verification link.

### "Invalid sender address"

The sender must be from the domain with Email Routing enabled:
- ✅ `noreply@yourdomain.com`
- ❌ `noreply@otherdomain.com`

### "Authentication error"

- Verify your API token has the correct permissions
- Check that `account_id` in wrangler.toml is correct
- Try re-authenticating: `wrangler login`

### Worker returns 500 error

Check logs:
```bash
wrangler tail
```

---

## DNS Records Summary

After setup, your domain should have these records:

| Type | Name | Content |
|------|------|---------|
| MX | @ | route1.mx.cloudflare.net (pri 8) |
| MX | @ | route2.mx.cloudflare.net (pri 78) |
| MX | @ | route3.mx.cloudflare.net (pri 94) |
| TXT | @ | v=spf1 include:_spf.mx.cloudflare.net ~all |
| TXT | _dmarc | v=DMARC1; p=quarantine; rua=mailto:... |

---

## Useful Commands

```bash
# View worker logs in real-time
wrangler tail

# Check worker status
wrangler whoami

# List deployed workers
wrangler list

# Delete worker
wrangler delete email-sender
```

---

## Cost

Everything used is in Cloudflare's free tier:

| Service | Free Limit |
|---------|------------|
| Workers | 100,000 requests/day |
| Email Routing | Unlimited |
| DNS | Unlimited |

**Total cost: $0**
