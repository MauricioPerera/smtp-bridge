# Laravel Integration

Configure Laravel applications to send emails through the SMTP-to-Webhook bridge.

## Overview

Laravel uses the Mail facade for all email functionality:
- User registration & verification
- Password resets
- Notifications
- Queued emails
- Marketing campaigns

## Configuration

### .env File

```env
MAIL_MAILER=smtp
MAIL_HOST=127.0.0.1
MAIL_PORT=2525
MAIL_USERNAME=null
MAIL_PASSWORD=null
MAIL_ENCRYPTION=null
MAIL_FROM_ADDRESS=noreply@yourdomain.com
MAIL_FROM_NAME="${APP_NAME}"
```

### config/mail.php

Default Laravel configuration should work. Verify these settings:

```php
'mailers' => [
    'smtp' => [
        'transport' => 'smtp',
        'host' => env('MAIL_HOST', '127.0.0.1'),
        'port' => env('MAIL_PORT', 2525),
        'encryption' => env('MAIL_ENCRYPTION', null),
        'username' => env('MAIL_USERNAME'),
        'password' => env('MAIL_PASSWORD'),
        'timeout' => null,
        'local_domain' => env('MAIL_EHLO_DOMAIN'),
    ],
],
```

---

## Docker Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  app:
    build: .
    ports:
      - "8000:8000"
    environment:
      APP_NAME: "My Laravel App"
      MAIL_MAILER: smtp
      MAIL_HOST: host.docker.internal
      MAIL_PORT: 2525
      MAIL_USERNAME: null
      MAIL_PASSWORD: null
      MAIL_ENCRYPTION: null
      MAIL_FROM_ADDRESS: noreply@yourdomain.com
      MAIL_FROM_NAME: "${APP_NAME}"
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      - db
      - redis

  db:
    image: mysql:8.0
    environment:
      MYSQL_DATABASE: laravel
      MYSQL_USER: laravel
      MYSQL_PASSWORD: ${DB_PASSWORD}
      MYSQL_ROOT_PASSWORD: ${DB_ROOT_PASSWORD}
    volumes:
      - db-data:/var/lib/mysql

  redis:
    image: redis:alpine
    volumes:
      - redis-data:/data

volumes:
  db-data:
  redis-data:
```

---

## Laravel Sail (Docker)

For Laravel Sail users, add to `docker-compose.yml`:

```yaml
services:
  laravel.test:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      MAIL_HOST: host.docker.internal
      MAIL_PORT: 2525
```

Or update your `.env`:

```env
MAIL_HOST=host.docker.internal
MAIL_PORT=2525
```

---

## Testing

### Artisan Tinker

```bash
php artisan tinker
```

```php
Mail::raw('Test email from Laravel', function ($message) {
    $message->to('your@email.com')
            ->subject('SMTP Bridge Test');
});
```

### Test Route

Add to `routes/web.php`:

```php
Route::get('/test-email', function () {
    Mail::raw('Test email from Laravel SMTP Bridge', function ($message) {
        $message->to('your@email.com')
                ->subject('Laravel SMTP Bridge Test');
    });

    return 'Email sent!';
});
```

### Using Mailable

```php
// app/Mail/TestMail.php
namespace App\Mail;

use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class TestMail extends Mailable
{
    public function envelope(): Envelope
    {
        return new Envelope(
            subject: 'Test Mail',
        );
    }

    public function content(): Content
    {
        return new Content(
            view: 'emails.test',
        );
    }
}
```

```php
// Send it
use App\Mail\TestMail;
use Illuminate\Support\Facades\Mail;

Mail::to('your@email.com')->send(new TestMail());
```

---

## Queue Configuration

For queued emails, ensure your queue worker is running:

```bash
php artisan queue:work
```

The SMTP bridge will handle queued emails the same way as immediate ones.

### Retry Configuration

In `config/queue.php`, you can configure retries for failed emails:

```php
'connections' => [
    'redis' => [
        'driver' => 'redis',
        'connection' => 'default',
        'queue' => env('REDIS_QUEUE', 'default'),
        'retry_after' => 90,
        'block_for' => null,
    ],
],
```

---

## Notifications

Laravel notifications using the mail channel will automatically use the SMTP bridge:

```php
// app/Notifications/WelcomeNotification.php
namespace App\Notifications;

use Illuminate\Notifications\Notification;
use Illuminate\Notifications\Messages\MailMessage;

class WelcomeNotification extends Notification
{
    public function via($notifiable): array
    {
        return ['mail'];
    }

    public function toMail($notifiable): MailMessage
    {
        return (new MailMessage)
            ->subject('Welcome!')
            ->line('Thank you for registering.')
            ->action('Get Started', url('/dashboard'))
            ->line('We are excited to have you!');
    }
}
```

---

## Troubleshooting

### Connection Refused

```
Connection could not be established with host "127.0.0.1:2525"
```

**Solutions:**
1. Check bridge is running: `systemctl status smtp-bridge`
2. For Docker: use `host.docker.internal` instead of `127.0.0.1`
3. Add `extra_hosts` to docker-compose.yml

### Timeout Errors

```
Connection to 127.0.0.1:2525 Timed Out
```

**Solutions:**
1. Increase timeout in `config/mail.php`:
   ```php
   'smtp' => [
       'timeout' => 30,
   ],
   ```
2. Check bridge logs: `journalctl -u smtp-bridge -f`

### Enable Debug Logging

In `config/logging.php`, ensure mail events are logged:

```php
'channels' => [
    'stack' => [
        'driver' => 'stack',
        'channels' => ['single', 'mail'],
    ],
    'mail' => [
        'driver' => 'single',
        'path' => storage_path('logs/mail.log'),
        'level' => 'debug',
    ],
],
```

### Check Failed Jobs

```bash
php artisan queue:failed
```

Retry failed emails:

```bash
php artisan queue:retry all
```

---

## Production Checklist

- [ ] Set `MAIL_FROM_ADDRESS` to a valid domain email
- [ ] Configure SPF, DKIM, DMARC records
- [ ] Use queue driver for production (redis recommended)
- [ ] Set up queue worker with supervisor
- [ ] Don't expose port 2525 to the internet
- [ ] Monitor bridge logs for errors
