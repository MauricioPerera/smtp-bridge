# Django Integration

Configure Django applications to send emails through the SMTP-to-Webhook bridge.

## Overview

Django's email system handles:
- User registration & password resets
- Admin notifications
- Contact forms
- Transactional emails
- django-allauth authentication emails

## Configuration

### settings.py

```python
# Email Configuration for SMTP Bridge
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = '127.0.0.1'  # or 'host.docker.internal' for Docker
EMAIL_PORT = 2525
EMAIL_USE_TLS = False
EMAIL_USE_SSL = False
EMAIL_HOST_USER = ''
EMAIL_HOST_PASSWORD = ''
DEFAULT_FROM_EMAIL = 'noreply@yourdomain.com'
SERVER_EMAIL = 'server@yourdomain.com'  # For error notifications
```

### Environment Variables (Recommended)

```python
import os

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.environ.get('EMAIL_HOST', '127.0.0.1')
EMAIL_PORT = int(os.environ.get('EMAIL_PORT', 2525))
EMAIL_USE_TLS = os.environ.get('EMAIL_USE_TLS', 'False').lower() == 'true'
EMAIL_USE_SSL = os.environ.get('EMAIL_USE_SSL', 'False').lower() == 'true'
EMAIL_HOST_USER = os.environ.get('EMAIL_HOST_USER', '')
EMAIL_HOST_PASSWORD = os.environ.get('EMAIL_HOST_PASSWORD', '')
DEFAULT_FROM_EMAIL = os.environ.get('DEFAULT_FROM_EMAIL', 'noreply@yourdomain.com')
SERVER_EMAIL = os.environ.get('SERVER_EMAIL', 'server@yourdomain.com')
```

### .env File

```env
EMAIL_HOST=127.0.0.1
EMAIL_PORT=2525
EMAIL_USE_TLS=False
EMAIL_USE_SSL=False
EMAIL_HOST_USER=
EMAIL_HOST_PASSWORD=
DEFAULT_FROM_EMAIL=noreply@yourdomain.com
SERVER_EMAIL=server@yourdomain.com
```

---

## Docker Configuration

### docker-compose.yml

```yaml
version: '3.8'

services:
  web:
    build: .
    command: gunicorn myproject.wsgi:application --bind 0.0.0.0:8000
    ports:
      - "8000:8000"
    environment:
      - DEBUG=False
      - EMAIL_HOST=host.docker.internal
      - EMAIL_PORT=2525
      - EMAIL_USE_TLS=False
      - DEFAULT_FROM_EMAIL=noreply@yourdomain.com
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      - db
      - redis

  db:
    image: postgres:15
    environment:
      POSTGRES_DB: django
      POSTGRES_USER: django
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres-data:/var/lib/postgresql/data

  redis:
    image: redis:alpine
    volumes:
      - redis-data:/data

  celery:
    build: .
    command: celery -A myproject worker -l info
    environment:
      - EMAIL_HOST=host.docker.internal
      - EMAIL_PORT=2525
    extra_hosts:
      - "host.docker.internal:host-gateway"
    depends_on:
      - db
      - redis

volumes:
  postgres-data:
  redis-data:
```

---

## Testing

### Django Shell

```bash
python manage.py shell
```

```python
from django.core.mail import send_mail

send_mail(
    'Test Subject',
    'Test message from Django SMTP Bridge.',
    'noreply@yourdomain.com',
    ['your@email.com'],
    fail_silently=False,
)
```

### Management Command

Create `yourapp/management/commands/test_email.py`:

```python
from django.core.management.base import BaseCommand
from django.core.mail import send_mail

class Command(BaseCommand):
    help = 'Send a test email'

    def add_arguments(self, parser):
        parser.add_argument('to_email', type=str, help='Recipient email address')

    def handle(self, *args, **options):
        to_email = options['to_email']

        try:
            send_mail(
                'Django SMTP Bridge Test',
                'This is a test email from Django using the SMTP-to-Webhook bridge.',
                None,  # Uses DEFAULT_FROM_EMAIL
                [to_email],
                fail_silently=False,
            )
            self.stdout.write(self.style.SUCCESS(f'Email sent to {to_email}'))
        except Exception as e:
            self.stdout.write(self.style.ERROR(f'Failed to send email: {e}'))
```

Run:
```bash
python manage.py test_email your@email.com
```

### HTML Email Test

```python
from django.core.mail import EmailMultiAlternatives

subject = 'HTML Email Test'
text_content = 'This is a plain text version.'
html_content = '<h1>Hello!</h1><p>This is an <strong>HTML</strong> email.</p>'

msg = EmailMultiAlternatives(subject, text_content, 'noreply@yourdomain.com', ['your@email.com'])
msg.attach_alternative(html_content, "text/html")
msg.send()
```

---

## Django-Allauth Configuration

If using django-allauth for authentication:

```python
# settings.py
ACCOUNT_EMAIL_VERIFICATION = 'mandatory'  # or 'optional'
ACCOUNT_EMAIL_REQUIRED = True
ACCOUNT_EMAIL_SUBJECT_PREFIX = '[YourSite] '

# Email templates are in templates/account/email/
```

No additional SMTP configuration needed - allauth uses Django's email backend.

---

## Celery Async Emails

### Using Celery for Background Emails

```python
# tasks.py
from celery import shared_task
from django.core.mail import send_mail

@shared_task
def send_email_task(subject, message, from_email, recipient_list):
    send_mail(subject, message, from_email, recipient_list)
```

```python
# Usage
from yourapp.tasks import send_email_task

send_email_task.delay(
    'Subject',
    'Message body',
    'noreply@yourdomain.com',
    ['recipient@email.com']
)
```

### Using django-celery-email

Install:
```bash
pip install django-celery-email
```

Configure:
```python
# settings.py
INSTALLED_APPS = [
    # ...
    'djcelery_email',
]

EMAIL_BACKEND = 'djcelery_email.backends.CeleryEmailBackend'
CELERY_EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'

# SMTP settings as before
CELERY_EMAIL_TASK_CONFIG = {
    'name': 'djcelery_email_send',
    'ignore_result': True,
}
```

All `send_mail()` calls will automatically be queued to Celery.

---

## Django REST Framework

For API-triggered emails:

```python
# views.py
from rest_framework.views import APIView
from rest_framework.response import Response
from django.core.mail import send_mail

class ContactView(APIView):
    def post(self, request):
        email = request.data.get('email')
        message = request.data.get('message')

        send_mail(
            f'Contact Form: {request.data.get("subject")}',
            message,
            email,  # From user's email
            ['support@yourdomain.com'],  # To support
        )

        return Response({'status': 'sent'})
```

---

## Troubleshooting

### Connection Refused

```
ConnectionRefusedError: [Errno 111] Connection refused
```

**Solutions:**
1. Check bridge is running: `systemctl status smtp-bridge`
2. For Docker: use `host.docker.internal` as EMAIL_HOST
3. Ensure `extra_hosts` is configured in docker-compose.yml

### Timeout Errors

```
socket.timeout: timed out
```

**Solutions:**
1. Add timeout setting:
   ```python
   EMAIL_TIMEOUT = 30  # seconds
   ```
2. Check bridge logs: `journalctl -u smtp-bridge -f`

### Debug Mode

For debugging, use console backend temporarily:

```python
# settings.py (development only!)
if DEBUG:
    EMAIL_BACKEND = 'django.core.mail.backends.console.EmailBackend'
```

Or file backend:

```python
EMAIL_BACKEND = 'django.core.mail.backends.filebased.EmailBackend'
EMAIL_FILE_PATH = '/tmp/app-emails'
```

### Check Connection

```python
from django.core.mail import get_connection

connection = get_connection()
try:
    connection.open()
    print("Connection successful!")
    connection.close()
except Exception as e:
    print(f"Connection failed: {e}")
```

---

## Production Checklist

- [ ] Set `DEFAULT_FROM_EMAIL` to a valid domain email
- [ ] Configure `SERVER_EMAIL` for error notifications
- [ ] Set up Celery for async email sending
- [ ] Configure SPF, DKIM, DMARC records
- [ ] Don't expose port 2525 to the internet
- [ ] Use environment variables for all email settings
- [ ] Set `DEBUG = False` in production
- [ ] Monitor bridge logs for errors
