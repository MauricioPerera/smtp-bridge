#!/bin/bash
#
# SMTP to Webhook Bridge - Installation Script
#
# This script installs and configures the SMTP bridge as a systemd service.
#
# Usage:
#   sudo ./scripts/install.sh
#

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
INSTALL_DIR="/opt/smtp-to-webhook"
SERVICE_NAME="smtp-bridge"
SERVICE_USER="root"

echo ""
echo "=================================="
echo " SMTP to Webhook Bridge Installer"
echo "=================================="
echo ""

# Check if running as root
if [ "$EUID" -ne 0 ]; then
    echo -e "${RED}Error: Please run as root (sudo)${NC}"
    exit 1
fi

# Check if .env file exists
if [ ! -f "$INSTALL_DIR/.env" ]; then
    echo -e "${YELLOW}Warning: .env file not found${NC}"
    echo ""
    echo "Please create .env file with your configuration:"
    echo "  cp $INSTALL_DIR/.env.example $INSTALL_DIR/.env"
    echo "  nano $INSTALL_DIR/.env"
    echo ""
    exit 1
fi

# Install Node.js dependencies
echo "Installing dependencies..."
cd "$INSTALL_DIR"
npm install --production

# Create systemd service file
echo "Creating systemd service..."
cat > /etc/systemd/system/${SERVICE_NAME}.service << EOF
[Unit]
Description=SMTP to Cloudflare Webhook Bridge
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
WorkingDirectory=${INSTALL_DIR}
EnvironmentFile=${INSTALL_DIR}/.env
ExecStart=/usr/bin/node ${INSTALL_DIR}/server.js
Restart=always
RestartSec=10

# Security hardening
NoNewPrivileges=true
ProtectSystem=strict
ProtectHome=true
ReadWritePaths=${INSTALL_DIR}

[Install]
WantedBy=multi-user.target
EOF

# Reload systemd and enable service
echo "Enabling service..."
systemctl daemon-reload
systemctl enable ${SERVICE_NAME}

# Start service
echo "Starting service..."
systemctl start ${SERVICE_NAME}

# Check status
sleep 2
if systemctl is-active --quiet ${SERVICE_NAME}; then
    echo ""
    echo -e "${GREEN}✓ Installation complete!${NC}"
    echo ""
    echo "Service status:"
    systemctl status ${SERVICE_NAME} --no-pager -l
    echo ""
    echo "Useful commands:"
    echo "  systemctl status ${SERVICE_NAME}   - Check status"
    echo "  systemctl restart ${SERVICE_NAME}  - Restart service"
    echo "  journalctl -u ${SERVICE_NAME} -f   - View logs"
    echo ""
else
    echo ""
    echo -e "${RED}✗ Service failed to start${NC}"
    echo ""
    echo "Check logs with:"
    echo "  journalctl -u ${SERVICE_NAME} -n 50"
    echo ""
    exit 1
fi
