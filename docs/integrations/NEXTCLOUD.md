# Nextcloud Integration

Configure Nextcloud to send emails through the SMTP-to-Webhook bridge.

## Overview

Nextcloud uses SMTP for:
- User registration notifications
- Password reset emails
- Share notifications
- Activity notifications
- Calendar invitations
- Admin alerts

## Method 1: Web Interface

1. Log in as admin
2. Go to **Settings → Administration → Basic settings**
3. Scroll to **Email server** section
4. Configure:

| Setting | Value |
|---------|-------|
| Send mode | SMTP |
| Encryption | None |
| From address | `noreply` @ `yourdomain.com` |
| Authentication method | None |
| Server address | `127.0.0.1` : `2525` |

5. Click **Send email** to test

---

## Method 2: config.php

Edit `/var/www/nextcloud/config/config.php` (or your Nextcloud config location):

```php
<?php
$CONFIG = array (
  // ... other config ...

  // Email Configuration
  'mail_smtpmode' => 'smtp',
  'mail_smtphost' => '127.0.0.1',
  'mail_smtpport' => 2525,
  'mail_smtpsecure' => '',
  'mail_smtpauth' => false,
  'mail_from_address' => 'noreply',
  'mail_domain' => 'yourdomain.com',
);
```

---

## Method 3: OCC Command

```bash
# Set SMTP mode
sudo -u www-data php occ config:system:set mail_smtpmode --value="smtp"

# Set SMTP host and port
sudo -u www-data php occ config:system:set mail_smtphost --value="127.0.0.1"
sudo -u www-data php occ config:system:set mail_smtpport --value="2525" --type=integer

# Disable encryption
sudo -u www-data php occ config:system:set mail_smtpsecure --value=""

# Disable authentication
sudo -u www-data php occ config:system:set mail_smtpauth --value="false" --type=boolean

# Set from address
sudo -u www-data php occ config:system:set mail_from_address --value="noreply"
sudo -u www-data php occ config:system:set mail_domain --value="yourdomain.com"
```

---

## Docker Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  nextcloud:
    image: nextcloud:latest
    ports:
      - "8080:80"
    environment:
      - MYSQL_HOST=db
      - MYSQL_DATABASE=nextcloud
      - MYSQL_USER=nextcloud
      - MYSQL_PASSWORD=${DB_PASSWORD}
      - NEXTCLOUD_ADMIN_USER=admin
      - NEXTCLOUD_ADMIN_PASSWORD=${ADMIN_PASSWORD}
      - NEXTCLOUD_TRUSTED_DOMAINS=cloud.yourdomain.com
      # SMTP Configuration
      - SMTP_HOST=host.docker.internal
      - SMTP_PORT=2525
      - SMTP_SECURE=
      - SMTP_AUTHTYPE=
      - MAIL_FROM_ADDRESS=noreply
      - MAIL_DOMAIN=yourdomain.com
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - nextcloud-data:/var/www/html
    depends_on:
      - db
      - redis

  db:
    image: mariadb:10.11
    environment:
      - MYSQL_DATABASE=nextcloud
      - MYSQL_USER=nextcloud
      - MYSQL_PASSWORD=${DB_PASSWORD}
      - MYSQL_ROOT_PASSWORD=${DB_ROOT_PASSWORD}
    volumes:
      - db-data:/var/lib/mysql

  redis:
    image: redis:alpine
    volumes:
      - redis-data:/data

volumes:
  nextcloud-data:
  db-data:
  redis-data:
```

### Using Nextcloud AIO (All-in-One)

For Nextcloud AIO, configure SMTP after initial setup:

1. Access admin settings in Nextcloud
2. Configure SMTP using web interface
3. Use `host.docker.internal` as SMTP host

---

## Testing

### OCC Command Test

```bash
sudo -u www-data php occ mail:test your@email.com
```

### Web Interface Test

1. Go to **Settings → Administration → Basic settings**
2. Enter your email in the test field
3. Click **Send email**

---

## Background Jobs

Ensure background jobs are running for email notifications:

### Cron (Recommended)

Add to system crontab:

```bash
*/5 * * * * sudo -u www-data php -f /var/www/nextcloud/cron.php
```

Or using Docker:

```bash
docker exec -u www-data nextcloud php cron.php
```

### systemd Timer

```ini
# /etc/systemd/system/nextcloud-cron.service
[Unit]
Description=Nextcloud Cron Job

[Service]
User=www-data
ExecStart=/usr/bin/php -f /var/www/nextcloud/cron.php
```

```ini
# /etc/systemd/system/nextcloud-cron.timer
[Unit]
Description=Run Nextcloud Cron every 5 minutes

[Timer]
OnBootSec=5min
OnUnitActiveSec=5min

[Install]
WantedBy=timers.target
```

```bash
sudo systemctl enable --now nextcloud-cron.timer
```

---

## Notification Settings

### User Notification Preferences

Users can configure their email notifications:

1. Click profile icon → **Settings**
2. Go to **Notifications**
3. Configure email frequency:
   - As soon as possible
   - Hourly
   - Daily
   - Weekly

### Admin Notification Settings

1. **Settings → Administration → Activity**
2. Configure default notification settings
3. Enable/disable specific notification types

---

## Troubleshooting

### Emails not sending

1. **Check background jobs:**
   ```bash
   sudo -u www-data php occ background:cron
   sudo -u www-data php occ status
   ```

2. **Check Nextcloud logs:**
   ```bash
   tail -f /var/www/nextcloud/data/nextcloud.log
   ```

3. **Verify SMTP settings:**
   ```bash
   sudo -u www-data php occ config:system:get mail_smtpmode
   sudo -u www-data php occ config:system:get mail_smtphost
   sudo -u www-data php occ config:system:get mail_smtpport
   ```

### Connection Refused

- Verify SMTP_HOST is correct
- For Docker: ensure `extra_hosts` is configured
- Check firewall allows port 2525
- Verify bridge is running: `systemctl status smtp-bridge`

### Test SMTP Connection

```bash
# From Nextcloud server
nc -zv 127.0.0.1 2525

# Should show:
# Connection to 127.0.0.1 2525 port [tcp/*] succeeded!
```

### Debug Mode

Enable debug logging in config.php:

```php
'loglevel' => 0,
'log_type' => 'file',
```

Check `/var/www/nextcloud/data/nextcloud.log` for errors.

---

## Security Notes

- Don't expose port 2525 to the internet
- Use trusted_domains to restrict access
- Configure proper SPF, DKIM, DMARC records
- Use HTTPS for Nextcloud access
- Regularly update Nextcloud and all apps

---

## Production Checklist

- [ ] Configure mail_from_address and mail_domain
- [ ] Set up cron job for background tasks
- [ ] Test email sending from admin panel
- [ ] Configure user notification defaults
- [ ] Set up proper DNS records (SPF, DKIM, DMARC)
- [ ] Don't expose port 2525 to the internet
- [ ] Enable Nextcloud logging for troubleshooting
- [ ] Configure trusted_domains properly
