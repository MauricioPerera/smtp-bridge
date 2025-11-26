# n8n Integration Guide

How to configure n8n to use the SMTP-to-Webhook bridge for password reset emails, user invitations, and other system emails.

## Overview

n8n requires SMTP for:
- Password reset emails
- User invitation emails
- Email notifications from workflows

This guide shows how to configure n8n to use the SMTP bridge instead of a traditional SMTP server.

---

## Docker Compose Configuration

Add these environment variables to your n8n service:

```yaml
services:
  n8n:
    image: n8nio/n8n:latest
    environment:
      # ... your other environment variables ...

      # SMTP Configuration
      - N8N_EMAIL_MODE=smtp
      - N8N_SMTP_HOST=host.docker.internal
      - N8N_SMTP_PORT=2525
      - N8N_SMTP_SSL=false
      - N8N_SMTP_SENDER=noreply@yourdomain.com

    # Required for Docker to reach the host
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### Complete Example

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:16-alpine
    environment:
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=n8n
    volumes:
      - postgres-data:/var/lib/postgresql/data
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U n8n']
      interval: 10s
      timeout: 5s
      retries: 5

  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      # Database
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}

      # n8n settings
      - N8N_HOST=${N8N_HOST}
      - N8N_PROTOCOL=https
      - WEBHOOK_URL=https://${N8N_HOST}/

      # SMTP via bridge
      - N8N_EMAIL_MODE=smtp
      - N8N_SMTP_HOST=host.docker.internal
      - N8N_SMTP_PORT=2525
      - N8N_SMTP_SSL=false
      - N8N_SMTP_SENDER=noreply@yourdomain.com

    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - n8n-data:/home/node/.n8n
    depends_on:
      postgres:
        condition: service_healthy

volumes:
  postgres-data:
  n8n-data:
```

---

## Environment File (.env)

```env
# n8n
N8N_HOST=n8n.yourdomain.com
POSTGRES_PASSWORD=your-secure-password
```

---

## SMTP Bridge Configuration

Ensure the SMTP bridge is listening on all interfaces so Docker can connect:

```env
# /opt/smtp-to-webhook/.env
WEBHOOK_URL=https://your-worker.workers.dev
WEBHOOK_API_KEY=your-api-key
SMTP_PORT=2525
SMTP_HOST=0.0.0.0  # Important: listen on all interfaces
DEFAULT_FROM_NAME=n8n
```

---

## Verification

### 1. Check Bridge is Running

```bash
systemctl status smtp-bridge
```

### 2. Test Connection from n8n Container

```bash
docker exec n8n nc -zv host.docker.internal 2525
# Should output: host.docker.internal (172.17.0.1:2525) open
```

### 3. Check n8n Environment

```bash
docker exec n8n env | grep SMTP
```

Expected output:
```
N8N_SMTP_SENDER=noreply@yourdomain.com
N8N_SMTP_PORT=2525
N8N_EMAIL_MODE=smtp
N8N_SMTP_HOST=host.docker.internal
N8N_SMTP_SSL=false
```

### 4. Test Password Reset

1. Go to your n8n login page
2. Click "Forgot password"
3. Enter your email
4. Check the bridge logs: `journalctl -u smtp-bridge -f`
5. Check your email inbox

---

## Troubleshooting

### "ECONNREFUSED"

The n8n container can't reach the SMTP bridge.

**Solutions:**
1. Ensure bridge is listening on `0.0.0.0`:
   ```bash
   ss -tlnp | grep 2525
   # Should show: 0.0.0.0:2525
   ```

2. Verify `extra_hosts` is in docker-compose.yml

3. Restart the bridge:
   ```bash
   systemctl restart smtp-bridge
   ```

### "Please contact your administrator"

n8n's generic SMTP error.

**Check bridge logs:**
```bash
journalctl -u smtp-bridge -n 50
```

**Check n8n logs:**
```bash
docker logs n8n --tail 50
```

### Emails Not Arriving

1. Check bridge logs for successful delivery
2. Check spam folder
3. Verify Cloudflare Worker is working:
   ```bash
   curl -X POST "https://your-worker.workers.dev" \
     -H "Content-Type: application/json" \
     -H "X-API-Key: your-key" \
     -d '{"to": "your@email.com", "subject": "Test", "text": "Test"}'
   ```

---

## Using n8n's Email Send Node

For workflow emails (not system emails), you can also configure the SMTP bridge in n8n's Email Send node:

1. Add an "Email Send" node to your workflow
2. Create new credentials:
   - **SMTP Server**: `host.docker.internal` (or server IP)
   - **Port**: `2525`
   - **SSL/TLS**: Off
   - **Authentication**: None (leave user/password empty)
3. Configure the email:
   - **From**: `noreply@yourdomain.com`
   - **To/Subject/Body**: As needed

---

## Security Notes

- The SMTP bridge has no authentication
- It should only be accessible from localhost and Docker network
- Use firewall rules to restrict access:
  ```bash
  # Allow only localhost and Docker
  iptables -A INPUT -p tcp --dport 2525 -s 127.0.0.1 -j ACCEPT
  iptables -A INPUT -p tcp --dport 2525 -s 172.16.0.0/12 -j ACCEPT
  iptables -A INPUT -p tcp --dport 2525 -j DROP
  ```

---

## Alternative: Direct API Calls

For workflows, you can bypass SMTP entirely and call the Cloudflare Worker directly using an HTTP Request node:

```
Method: POST
URL: https://your-worker.workers.dev
Headers:
  Content-Type: application/json
  X-API-Key: {{$credentials.cloudflareEmailApiKey}}
Body:
  {
    "to": "{{$json.email}}",
    "subject": "{{$json.subject}}",
    "text": "{{$json.message}}"
  }
```

This is more efficient for high-volume email sending in workflows.
