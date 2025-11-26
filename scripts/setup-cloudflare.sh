#!/bin/bash
#
# Cloudflare Email Worker - Setup Script
#
# This script helps you deploy the Cloudflare Worker for email sending.
#
# Prerequisites:
#   - Node.js 18+
#   - Cloudflare account with a domain
#   - Email Routing enabled on the domain
#   - Wrangler CLI: npm install -g wrangler
#
# Usage:
#   ./scripts/setup-cloudflare.sh
#

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

WORKER_DIR="cloudflare-worker"

echo ""
echo "========================================"
echo " Cloudflare Email Worker Setup"
echo "========================================"
echo ""

# Check prerequisites
echo "Checking prerequisites..."

if ! command -v node &> /dev/null; then
    echo -e "${RED}Error: Node.js is not installed${NC}"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo -e "${RED}Error: npm is not installed${NC}"
    exit 1
fi

if ! command -v wrangler &> /dev/null; then
    echo -e "${YELLOW}Wrangler not found. Installing...${NC}"
    npm install -g wrangler
fi

echo -e "${GREEN}✓ Prerequisites OK${NC}"
echo ""

# Navigate to worker directory
cd "$WORKER_DIR"

# Check for wrangler.toml
if [ ! -f "wrangler.toml" ]; then
    echo -e "${YELLOW}wrangler.toml not found. Creating from example...${NC}"

    if [ ! -f "wrangler.toml.example" ]; then
        echo -e "${RED}Error: wrangler.toml.example not found${NC}"
        exit 1
    fi

    cp wrangler.toml.example wrangler.toml

    echo ""
    echo -e "${CYAN}Please edit wrangler.toml with your configuration:${NC}"
    echo ""
    echo "  1. Set your account_id (find in Cloudflare dashboard)"
    echo "  2. Set the destination_address (your verified email)"
    echo "  3. Set SENDER_EMAIL to your domain's email"
    echo ""
    echo "Then run this script again."
    echo ""
    exit 0
fi

# Install dependencies
echo "Installing dependencies..."
npm install

# Check if logged in to Cloudflare
echo ""
echo "Checking Cloudflare authentication..."
if ! wrangler whoami &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Cloudflare.${NC}"
    echo ""
    echo "You can either:"
    echo "  1. Run 'wrangler login' for interactive login"
    echo "  2. Set CLOUDFLARE_API_TOKEN environment variable"
    echo ""
    read -p "Do you want to login now? (y/n) " -n 1 -r
    echo ""
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        wrangler login
    else
        echo "Please set CLOUDFLARE_API_TOKEN and run again."
        exit 1
    fi
fi

echo -e "${GREEN}✓ Authenticated with Cloudflare${NC}"
echo ""

# Generate API key
echo "Generating API key for the worker..."
API_KEY=$(openssl rand -hex 32)
echo ""
echo -e "${CYAN}Generated API Key:${NC}"
echo "  $API_KEY"
echo ""
echo -e "${YELLOW}Save this key! You'll need it for the SMTP bridge configuration.${NC}"
echo ""

# Set API key as secret
echo "Setting API_KEY secret in Cloudflare..."
echo "$API_KEY" | wrangler secret put API_KEY

# Deploy worker
echo ""
echo "Deploying worker..."
wrangler deploy

echo ""
echo -e "${GREEN}========================================"
echo " Deployment Complete!"
echo "========================================${NC}"
echo ""
echo "Next steps:"
echo ""
echo "1. Copy the worker URL from the output above"
echo ""
echo "2. Create your SMTP bridge .env file:"
echo "   cp .env.example .env"
echo ""
echo "3. Add these values to your .env file:"
echo "   WEBHOOK_URL=<worker-url-from-above>"
echo "   WEBHOOK_API_KEY=$API_KEY"
echo ""
echo "4. Run the install script:"
echo "   sudo ./scripts/install.sh"
echo ""
