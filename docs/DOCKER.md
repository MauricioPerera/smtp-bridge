# Docker Usage Guide

How to use the SMTP-to-Webhook bridge with Docker containers.

## The Challenge

When running applications in Docker containers, they can't directly access services on `localhost` of the host machine. The SMTP bridge runs on the host, so we need to configure networking properly.

## Solution: host.docker.internal

Docker provides `host.docker.internal` as a way for containers to reach the host machine.

### Step 1: Configure the Bridge

The SMTP bridge must listen on all interfaces (`0.0.0.0`), not just localhost:

```env
# /opt/smtp-to-webhook/.env
SMTP_HOST=0.0.0.0
SMTP_PORT=2525
```

### Step 2: Configure Docker Compose

Add `extra_hosts` to your container:

```yaml
services:
  myapp:
    image: myapp:latest
    extra_hosts:
      - "host.docker.internal:host-gateway"
    environment:
      - SMTP_HOST=host.docker.internal
      - SMTP_PORT=2525
```

### Step 3: Configure Your Application

Point your app's SMTP settings to `host.docker.internal:2525`.

---

## Running the Bridge in Docker

Alternatively, you can run the SMTP bridge itself in Docker:

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY server.js ./

EXPOSE 2525

CMD ["node", "server.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  smtp-bridge:
    build: .
    ports:
      - "2525:2525"
    environment:
      - WEBHOOK_URL=${WEBHOOK_URL}
      - WEBHOOK_API_KEY=${WEBHOOK_API_KEY}
      - SMTP_HOST=0.0.0.0
      - SMTP_PORT=2525
    restart: unless-stopped

  myapp:
    image: myapp:latest
    environment:
      - SMTP_HOST=smtp-bridge
      - SMTP_PORT=2525
    depends_on:
      - smtp-bridge
```

With this setup, your app connects to `smtp-bridge:2525` using Docker's internal networking.

---

## Docker Network Modes

### Bridge Network (Default)

Containers are isolated. Use `host.docker.internal` or run bridge in Docker.

```yaml
services:
  myapp:
    extra_hosts:
      - "host.docker.internal:host-gateway"
```

### Host Network

Container shares the host's network. Can access `localhost` directly.

```yaml
services:
  myapp:
    network_mode: host
    environment:
      - SMTP_HOST=127.0.0.1
```

**Note:** Host network mode has security implications and may not work on all platforms.

---

## Kubernetes

For Kubernetes deployments, run the SMTP bridge as a sidecar or separate deployment:

### As a Deployment

```yaml
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
        image: your-registry/smtp-bridge:latest
        ports:
        - containerPort: 2525
        env:
        - name: WEBHOOK_URL
          valueFrom:
            secretKeyRef:
              name: smtp-bridge-secrets
              key: webhook-url
        - name: WEBHOOK_API_KEY
          valueFrom:
            secretKeyRef:
              name: smtp-bridge-secrets
              key: webhook-api-key
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

### As a Sidecar

```yaml
spec:
  containers:
  - name: myapp
    image: myapp:latest
    env:
    - name: SMTP_HOST
      value: "127.0.0.1"
    - name: SMTP_PORT
      value: "2525"

  - name: smtp-bridge
    image: your-registry/smtp-bridge:latest
    ports:
    - containerPort: 2525
    env:
    - name: WEBHOOK_URL
      valueFrom:
        secretKeyRef:
          name: smtp-bridge-secrets
          key: webhook-url
```

---

## Troubleshooting

### Container can't connect to bridge

1. Verify bridge is listening on `0.0.0.0`:
   ```bash
   ss -tlnp | grep 2525
   ```

2. Check `extra_hosts` is configured

3. Test from inside container:
   ```bash
   docker exec myapp nc -zv host.docker.internal 2525
   ```

### "No route to host"

The container network can't reach the host. Try:

1. Using host network mode
2. Running the bridge in Docker
3. Checking firewall rules

### Connection refused

The bridge isn't running or not listening on the right interface.

```bash
# Check bridge status
systemctl status smtp-bridge

# Check what it's listening on
ss -tlnp | grep 2525
```

---

## Platform-Specific Notes

### Linux

`host.docker.internal` works with Docker 20.10+. For older versions:

```yaml
extra_hosts:
  - "host.docker.internal:172.17.0.1"
```

Get the gateway IP:
```bash
docker network inspect bridge | grep Gateway
```

### macOS

`host.docker.internal` works out of the box.

### Windows

`host.docker.internal` works with Docker Desktop.

For WSL2, you may need additional configuration.
