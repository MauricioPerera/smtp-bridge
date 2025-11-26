# WordPress Integration

Configure WordPress to send emails through the SMTP-to-Webhook bridge.

## Overview

WordPress uses `wp_mail()` for all email functionality:
- User registration
- Password resets
- Comment notifications
- Contact form submissions
- WooCommerce order emails
- Plugin notifications

## Method 1: wp-config.php (No Plugin)

Add to your `wp-config.php`:

```php
// SMTP Configuration for smtp-to-webhook bridge
define('SMTP_HOST', '127.0.0.1');  // or 'host.docker.internal' for Docker
define('SMTP_PORT', 2525);
define('SMTP_FROM', 'noreply@yourdomain.com');
define('SMTP_FROM_NAME', 'Your Site Name');

// Hook into phpmailer
add_action('phpmailer_init', function($phpmailer) {
    $phpmailer->isSMTP();
    $phpmailer->Host = SMTP_HOST;
    $phpmailer->Port = SMTP_PORT;
    $phpmailer->SMTPAuth = false;
    $phpmailer->SMTPSecure = false;
    $phpmailer->SMTPAutoTLS = false;
    $phpmailer->From = SMTP_FROM;
    $phpmailer->FromName = SMTP_FROM_NAME;
});
```

## Method 2: Must-Use Plugin

Create `wp-content/mu-plugins/smtp-bridge.php`:

```php
<?php
/**
 * Plugin Name: SMTP Bridge Configuration
 * Description: Routes all WordPress emails through the SMTP-to-Webhook bridge
 * Version: 1.0
 */

// Prevent direct access
if (!defined('ABSPATH')) exit;

// SMTP Configuration
define('SMTP_BRIDGE_HOST', getenv('SMTP_HOST') ?: '127.0.0.1');
define('SMTP_BRIDGE_PORT', getenv('SMTP_PORT') ?: 2525);
define('SMTP_BRIDGE_FROM', getenv('SMTP_FROM') ?: 'noreply@' . parse_url(home_url(), PHP_URL_HOST));
define('SMTP_BRIDGE_FROM_NAME', getenv('SMTP_FROM_NAME') ?: get_bloginfo('name'));

add_action('phpmailer_init', function($phpmailer) {
    $phpmailer->isSMTP();
    $phpmailer->Host = SMTP_BRIDGE_HOST;
    $phpmailer->Port = SMTP_BRIDGE_PORT;
    $phpmailer->SMTPAuth = false;
    $phpmailer->SMTPSecure = false;
    $phpmailer->SMTPAutoTLS = false;
    $phpmailer->From = SMTP_BRIDGE_FROM;
    $phpmailer->FromName = SMTP_BRIDGE_FROM_NAME;

    // Debug mode (uncomment to troubleshoot)
    // $phpmailer->SMTPDebug = 2;
    // $phpmailer->Debugoutput = 'error_log';
});

// Optional: Log all sent emails
add_action('wp_mail_succeeded', function($mail_data) {
    error_log('Email sent to: ' . implode(', ', (array)$mail_data['to']));
});

add_action('wp_mail_failed', function($error) {
    error_log('Email failed: ' . $error->get_error_message());
});
```

## Method 3: WP Mail SMTP Plugin

If you prefer a plugin with UI:

1. Install "WP Mail SMTP" plugin
2. Go to **WP Mail SMTP → Settings**
3. Configure:

| Setting | Value |
|---------|-------|
| From Email | `noreply@yourdomain.com` |
| From Name | Your Site Name |
| Mailer | Other SMTP |
| SMTP Host | `127.0.0.1` (or server IP) |
| Encryption | None |
| SMTP Port | `2525` |
| Authentication | Off |

4. Click **Save Settings**
5. Go to **Email Test** tab to verify

---

## Docker Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  wordpress:
    image: wordpress:latest
    ports:
      - "8080:80"
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: ${DB_PASSWORD}
      WORDPRESS_DB_NAME: wordpress
      # SMTP Bridge settings
      SMTP_HOST: host.docker.internal
      SMTP_PORT: 2525
      SMTP_FROM: noreply@yourdomain.com
      SMTP_FROM_NAME: Your Site Name
    extra_hosts:
      - "host.docker.internal:host-gateway"
    volumes:
      - wordpress-data:/var/www/html
      - ./mu-plugins:/var/www/html/wp-content/mu-plugins

  db:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
    volumes:
      - db-data:/var/lib/mysql

volumes:
  wordpress-data:
  db-data:
```

### mu-plugins/smtp-bridge.php

Copy the mu-plugin code from Method 2 above into `./mu-plugins/smtp-bridge.php`.

---

## WooCommerce Configuration

WooCommerce uses WordPress's `wp_mail()`, so no additional configuration is needed. All order emails, customer notifications, and admin alerts will automatically use the bridge.

### Test WooCommerce Emails

1. Go to **WooCommerce → Settings → Emails**
2. Click on any email type (e.g., "New order")
3. Scroll down and click **"Send test email"** (if available)

Or place a test order to verify transactional emails work.

---

## Contact Form Plugins

### Contact Form 7

No configuration needed - uses `wp_mail()` by default.

### WPForms

No configuration needed - uses `wp_mail()` by default.

### Gravity Forms

No configuration needed - uses `wp_mail()` by default.

---

## Troubleshooting

### Emails not sending

1. **Check bridge is running:**
   ```bash
   systemctl status smtp-bridge
   ```

2. **Test connection from WordPress server:**
   ```bash
   nc -zv 127.0.0.1 2525
   ```

3. **Enable WordPress debug:**
   ```php
   // wp-config.php
   define('WP_DEBUG', true);
   define('WP_DEBUG_LOG', true);
   ```
   Check `wp-content/debug.log`

4. **Enable PHPMailer debug:**
   ```php
   $phpmailer->SMTPDebug = 2;
   $phpmailer->Debugoutput = 'error_log';
   ```

### "Could not connect to SMTP host"

- Verify SMTP_HOST is correct
- For Docker: use `host.docker.internal` and add `extra_hosts`
- Check firewall allows port 2525

### Emails going to spam

- Verify SPF, DKIM, DMARC records
- Use consistent From address
- Avoid spam trigger words in content

---

## Testing

### PHP Test Script

Create `test-email.php` in WordPress root:

```php
<?php
require_once('wp-load.php');

$to = 'your@email.com';
$subject = 'WordPress SMTP Test';
$message = 'This is a test email from WordPress via SMTP Bridge.';
$headers = array('Content-Type: text/html; charset=UTF-8');

$result = wp_mail($to, $subject, $message, $headers);

if ($result) {
    echo "Email sent successfully!";
} else {
    global $phpmailer;
    echo "Email failed: " . $phpmailer->ErrorInfo;
}
```

Run: `php test-email.php` or visit in browser (then delete the file).

### WP-CLI Test

```bash
wp eval 'wp_mail("your@email.com", "Test", "Test message");'
```

---

## Security Notes

- The mu-plugin approach is recommended as it loads before themes/plugins
- Don't expose port 2525 to the internet
- Use environment variables for sensitive configuration
- Remove test files after testing
