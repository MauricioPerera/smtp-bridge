# Integration Guides

Ready-to-use configuration templates for popular applications.

## Available Integrations

| Application | Type | Guide |
|-------------|------|-------|
| [n8n](./N8N.md) | Workflow Automation | Docker, systemd |
| [WordPress](./WORDPRESS.md) | CMS | wp-config, mu-plugin, WP Mail SMTP |
| [Laravel](./LARAVEL.md) | PHP Framework | .env, Docker, Sail, Celery |
| [Django](./DJANGO.md) | Python Framework | settings.py, Docker, Celery |
| [Nextcloud](./NEXTCLOUD.md) | File Sync/Share | config.php, OCC, Docker |
| [GitLab](./GITLAB.md) | DevOps Platform | Omnibus, Docker, Kubernetes |

## Quick Reference

### Common SMTP Settings

| Setting | Value |
|---------|-------|
| Host | `127.0.0.1` or `host.docker.internal` |
| Port | `2525` |
| Encryption | None |
| Authentication | None (disabled) |
| TLS/SSL | Disabled |

### Docker Host Access

For Docker containers to reach the bridge on the host:

```yaml
services:
  yourapp:
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - SMTP_HOST=host.docker.internal
      - SMTP_PORT=2525
```

### Kubernetes Service

```yaml
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

## Adding New Integrations

To add a guide for another application:

1. Create `docs/integrations/APPNAME.md`
2. Include:
   - Overview of email functionality
   - Configuration methods (config file, env vars, UI)
   - Docker configuration with `extra_hosts`
   - Testing procedures
   - Troubleshooting section
   - Production checklist
3. Update this README

## Request an Integration

Missing your application? Open an issue on GitHub with:

- Application name and version
- Current SMTP configuration method
- Docker/Kubernetes setup (if applicable)
