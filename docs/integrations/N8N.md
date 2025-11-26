# n8n Integration

Configure n8n to send emails through the SMTP-to-Webhook bridge.

## Overview

n8n uses SMTP for:
- User invitations
- Password reset emails
- Workflow error notifications
- Send Email nodes in workflows

## Docker Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  n8n:
    image: n8nio/n8n:latest
    ports:
      - "5678:5678"
    environment:
      - N8N_HOST=n8n.yourdomain.com
      - N8N_PORT=5678
      - N8N_PROTOCOL=https
      - NODE_ENV=production
      - WEBHOOK_URL=https://n8n.yourdomain.com/
      - GENERIC_TIMEZONE=America/New_York

      # Database
      - DB_TYPE=postgresdb
      - DB_POSTGRESDB_HOST=postgres
      - DB_POSTGRESDB_PORT=5432
      - DB_POSTGRESDB_DATABASE=n8n
      - DB_POSTGRESDB_USER=n8n
      - DB_POSTGRESDB_PASSWORD=${POSTGRES_PASSWORD}

      # SMTP Configuration
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
      - postgres

  postgres:
    image: postgres:15
    environment:
      - POSTGRES_USER=n8n
      - POSTGRES_PASSWORD=${POSTGRES_PASSWORD}
      - POSTGRES_DB=n8n
    volumes:
      - postgres-data:/var/lib/postgresql/data

volumes:
  n8n-data:
  postgres-data:
```

### .env File

```env
POSTGRES_PASSWORD=your_secure_password
```

---

## Environment Variables

| Variable | Value | Description |
|----------|-------|-------------|
| `N8N_EMAIL_MODE` | `smtp` | Enable SMTP email |
| `N8N_SMTP_HOST` | `host.docker.internal` | Bridge host (Docker) |
| `N8N_SMTP_PORT` | `2525` | Bridge port |
| `N8N_SMTP_SSL` | `false` | Disable SSL |
| `N8N_SMTP_SENDER` | `noreply@yourdomain.com` | From address |

### Optional Variables

| Variable | Description |
|----------|-------------|
| `N8N_SMTP_USER` | SMTP username (not needed) |
| `N8N_SMTP_PASS` | SMTP password (not needed) |

---

## Non-Docker Installation

### systemd Service

If running n8n via systemd, add environment variables:

```ini
# /etc/systemd/system/n8n.service
[Unit]
Description=n8n
After=network.target

[Service]
Type=simple
User=n8n
Environment="N8N_EMAIL_MODE=smtp"
Environment="N8N_SMTP_HOST=127.0.0.1"
Environment="N8N_SMTP_PORT=2525"
Environment="N8N_SMTP_SSL=false"
Environment="N8N_SMTP_SENDER=noreply@yourdomain.com"
ExecStart=/usr/bin/n8n start
Restart=always

[Install]
WantedBy=multi-user.target
```

### PM2

```bash
pm2 start n8n --name n8n -- start

# Set environment
pm2 set n8n:N8N_EMAIL_MODE smtp
pm2 set n8n:N8N_SMTP_HOST 127.0.0.1
pm2 set n8n:N8N_SMTP_PORT 2525
pm2 set n8n:N8N_SMTP_SSL false
pm2 set n8n:N8N_SMTP_SENDER noreply@yourdomain.com

pm2 restart n8n
```

---

## Testing

### 1. User Invitation Test

1. Go to **Settings → Users**
2. Click **Invite**
3. Enter an email address
4. Check if the invitation email arrives

### 2. Password Reset Test

1. Log out of n8n
2. Click **Forgot password**
3. Enter your email
4. Check if the reset email arrives

### 3. Workflow Email Node

Create a test workflow:

1. Add a **Manual Trigger** node
2. Add a **Send Email** node
3. Configure:
   - **From Email**: `noreply@yourdomain.com`
   - **To Email**: `your@email.com`
   - **Subject**: `n8n SMTP Test`
   - **Text**: `Test email from n8n workflow`
4. Execute the workflow

---

## Workflow Examples

### Send Email Node Configuration

```json
{
  "nodes": [
    {
      "name": "Send Email",
      "type": "n8n-nodes-base.emailSend",
      "parameters": {
        "fromEmail": "noreply@yourdomain.com",
        "toEmail": "recipient@email.com",
        "subject": "Hello from n8n",
        "text": "This is a test email sent via SMTP Bridge.",
        "options": {}
      }
    }
  ]
}
```

### HTML Email

```json
{
  "parameters": {
    "fromEmail": "noreply@yourdomain.com",
    "toEmail": "recipient@email.com",
    "subject": "HTML Email Test",
    "html": "<h1>Hello!</h1><p>This is an <strong>HTML</strong> email.</p>",
    "options": {}
  }
}
```

### With Attachments

```json
{
  "parameters": {
    "fromEmail": "noreply@yourdomain.com",
    "toEmail": "recipient@email.com",
    "subject": "Report Attached",
    "text": "Please find the report attached.",
    "options": {
      "attachments": "data"
    },
    "attachmentsPropertyName": "data.attachment"
  }
}
```

---

## Error Notifications

Configure n8n to send workflow error notifications:

### Per Workflow

1. Open workflow settings (three dots menu)
2. Click **Settings**
3. Enable **Error Workflow**
4. Select your error notification workflow

### Error Notification Workflow

Create a workflow that:
1. Triggers on **Error Trigger**
2. Formats the error message
3. Sends email via **Send Email** node

---

## Troubleshooting

### Connection Refused

```
Error: connect ECONNREFUSED 172.17.0.1:2525
```

**Solutions:**
1. Verify bridge is running: `systemctl status smtp-bridge`
2. Check `extra_hosts` is configured in docker-compose.yml
3. Verify bridge is listening on `0.0.0.0`:
   ```bash
   netstat -tlnp | grep 2525
   ```

### Email Not Arriving

1. Check bridge logs:
   ```bash
   journalctl -u smtp-bridge -f
   ```

2. Check n8n logs:
   ```bash
   docker logs n8n
   ```

3. Verify SMTP configuration:
   ```bash
   docker exec n8n printenv | grep SMTP
   ```

### Test SMTP Connection

From inside the n8n container:

```bash
docker exec -it n8n sh
nc -zv host.docker.internal 2525
```

---

## Security Notes

- Don't expose port 2525 to the internet
- Use HTTPS for n8n access (configure `N8N_PROTOCOL=https`)
- Configure proper SPF, DKIM, DMARC records
- Use strong database passwords
- Enable n8n authentication

---

## Production Checklist

- [ ] Set `N8N_SMTP_SENDER` to valid domain email
- [ ] Configure `extra_hosts` for Docker
- [ ] Test user invitation emails
- [ ] Test password reset emails
- [ ] Set up error notification workflow
- [ ] Configure SPF, DKIM, DMARC records
- [ ] Don't expose port 2525 to the internet
- [ ] Use HTTPS with valid SSL certificate
- [ ] Enable basic auth or user management
