# GitLab Integration

Configure GitLab to send emails through the SMTP-to-Webhook bridge.

## Overview

GitLab uses SMTP for:
- User registration & confirmation
- Password reset emails
- Merge request notifications
- Issue notifications
- Pipeline status alerts
- Admin notifications
- Two-factor authentication codes

## Omnibus GitLab Configuration

### /etc/gitlab/gitlab.rb

```ruby
# Email Configuration for SMTP Bridge
gitlab_rails['smtp_enable'] = true
gitlab_rails['smtp_address'] = "127.0.0.1"
gitlab_rails['smtp_port'] = 2525
gitlab_rails['smtp_authentication'] = false
gitlab_rails['smtp_enable_starttls_auto'] = false
gitlab_rails['smtp_tls'] = false
gitlab_rails['smtp_openssl_verify_mode'] = 'none'

# From address configuration
gitlab_rails['gitlab_email_from'] = 'noreply@yourdomain.com'
gitlab_rails['gitlab_email_display_name'] = 'GitLab'
gitlab_rails['gitlab_email_reply_to'] = 'noreply@yourdomain.com'
```

Apply the configuration:

```bash
sudo gitlab-ctl reconfigure
```

---

## Docker Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  gitlab:
    image: gitlab/gitlab-ce:latest
    container_name: gitlab
    hostname: gitlab.yourdomain.com
    ports:
      - "80:80"
      - "443:443"
      - "22:22"
    environment:
      GITLAB_OMNIBUS_CONFIG: |
        external_url 'https://gitlab.yourdomain.com'

        # SMTP Configuration
        gitlab_rails['smtp_enable'] = true
        gitlab_rails['smtp_address'] = "host.docker.internal"
        gitlab_rails['smtp_port'] = 2525
        gitlab_rails['smtp_authentication'] = false
        gitlab_rails['smtp_enable_starttls_auto'] = false
        gitlab_rails['smtp_tls'] = false
        gitlab_rails['smtp_openssl_verify_mode'] = 'none'

        # From address
        gitlab_rails['gitlab_email_from'] = 'noreply@yourdomain.com'
        gitlab_rails['gitlab_email_display_name'] = 'GitLab'
        gitlab_rails['gitlab_email_reply_to'] = 'noreply@yourdomain.com'
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - gitlab-config:/etc/gitlab
      - gitlab-logs:/var/log/gitlab
      - gitlab-data:/var/opt/gitlab
    shm_size: '256m'

volumes:
  gitlab-config:
  gitlab-logs:
  gitlab-data:
```

---

## GitLab Helm Chart (Kubernetes)

### values.yaml

```yaml
global:
  smtp:
    enabled: true
    address: "smtp-bridge.default.svc.cluster.local"
    port: 2525
    authentication: ""
    starttls_auto: false
    openssl_verify_mode: "none"

  email:
    from: "noreply@yourdomain.com"
    display_name: "GitLab"
    reply_to: "noreply@yourdomain.com"
```

For the SMTP bridge in Kubernetes, deploy it as a service:

```yaml
# smtp-bridge-deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: smtp-bridge
spec:
  replicas: 1
  selector:
    matchLabels:
      app: smtp-bridge
  template:
    metadata:
      labels:
        app: smtp-bridge
    spec:
      containers:
      - name: smtp-bridge
        image: node:18-alpine
        command: ["node", "server.js"]
        ports:
        - containerPort: 2525
        envFrom:
        - secretRef:
            name: smtp-bridge-secrets
---
apiVersion: v1
kind: Service
metadata:
  name: smtp-bridge
spec:
  selector:
    app: smtp-bridge
  ports:
  - port: 2525
    targetPort: 2525
```

---

## Source Installation

### config/gitlab.yml

```yaml
production: &base
  gitlab:
    email_from: noreply@yourdomain.com
    email_display_name: GitLab
    email_reply_to: noreply@yourdomain.com

  gitlab_shell:
    # ... existing config ...

  # SMTP Configuration
  smtp:
    enabled: true
    address: 127.0.0.1
    port: 2525
    authentication: false
    enable_starttls_auto: false
```

---

## Testing

### GitLab Rails Console

```bash
# Omnibus
sudo gitlab-rails console

# Docker
docker exec -it gitlab gitlab-rails console
```

```ruby
# Test email
Notify.test_email('your@email.com', 'GitLab SMTP Test', 'Test message').deliver_now
```

### Check Email Configuration

```ruby
# In rails console
ActionMailer::Base.smtp_settings
```

### Admin Area Test

1. Go to **Admin Area → Settings → General**
2. Expand **Sign-up restrictions**
3. Enter an email in "Send test email to"
4. Click **Send**

---

## Verify SMTP Configuration

```bash
# Omnibus
sudo gitlab-rake gitlab:smtp:check

# Docker
docker exec -it gitlab gitlab-rake gitlab:smtp:check
```

---

## Sidekiq Email Queue

GitLab uses Sidekiq for background email processing. Check queue status:

```bash
# Omnibus
sudo gitlab-ctl status sidekiq

# View Sidekiq logs
sudo gitlab-ctl tail sidekiq
```

### Monitor Email Queue

In rails console:

```ruby
# Check pending email jobs
Sidekiq::Queue.new('mailers').size

# Check failed jobs
Sidekiq::RetrySet.new.size
```

---

## Incoming Email (Optional)

If you want to reply to notifications via email, configure incoming email separately. This guide covers outgoing email only.

---

## Troubleshooting

### Emails not sending

1. **Check Sidekiq is running:**
   ```bash
   sudo gitlab-ctl status sidekiq
   ```

2. **Check GitLab logs:**
   ```bash
   sudo gitlab-ctl tail gitlab-rails/production.log
   sudo gitlab-ctl tail sidekiq/current
   ```

3. **Verify SMTP settings:**
   ```bash
   sudo gitlab-rake gitlab:smtp:check
   ```

### Connection Refused

```
Errno::ECONNREFUSED: Connection refused - connect(2) for "127.0.0.1" port 2525
```

**Solutions:**
1. Verify bridge is running: `systemctl status smtp-bridge`
2. For Docker: use `host.docker.internal` instead of `127.0.0.1`
3. Ensure `extra_hosts` is configured
4. Check firewall allows port 2525

### Timeout Errors

Add timeout configuration to gitlab.rb:

```ruby
gitlab_rails['smtp_open_timeout'] = 30
gitlab_rails['smtp_read_timeout'] = 30
```

### Debug SMTP

Enable verbose SMTP logging:

```ruby
# In gitlab.rb
gitlab_rails['smtp_enable_starttls_auto'] = false
```

Check logs at `/var/log/gitlab/gitlab-rails/production.log`

### Reconfigure After Changes

Always run after modifying gitlab.rb:

```bash
sudo gitlab-ctl reconfigure
sudo gitlab-ctl restart
```

---

## Email Templates

GitLab uses built-in email templates. To customize:

1. **Custom logo:** Admin Area → Settings → General → Sign-in/Sign-up restrictions
2. **Custom header:** Admin Area → Settings → Preferences → Email
3. **Custom footer:** Add to gitlab.rb:
   ```ruby
   gitlab_rails['gitlab_email_smime_enabled'] = false
   ```

---

## Security Notes

- Don't expose port 2525 to the internet
- Use HTTPS for GitLab access
- Configure proper SPF, DKIM, DMARC records
- Regularly update GitLab
- Enable 2FA for all users

---

## Production Checklist

- [ ] Configure gitlab_email_from with valid domain
- [ ] Set gitlab_email_display_name appropriately
- [ ] Run `gitlab-rake gitlab:smtp:check` successfully
- [ ] Test email from Admin Area
- [ ] Verify Sidekiq is processing email queue
- [ ] Configure SPF, DKIM, DMARC records
- [ ] Don't expose port 2525 to the internet
- [ ] Set up monitoring for Sidekiq queue
- [ ] Enable GitLab logging for troubleshooting
