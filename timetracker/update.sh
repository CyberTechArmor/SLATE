#!/bin/bash

# Slate - Update Script
# Usage: ./update.sh

set -e

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║           Slate Update                    ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Detect docker compose command
if docker compose version &> /dev/null 2>&1; then
    COMPOSE_CMD="docker compose"
elif command -v docker-compose &> /dev/null; then
    COMPOSE_CMD="docker-compose"
else
    echo "Error: Docker Compose is required."
    exit 1
fi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

echo "Updating Slate in: $SCRIPT_DIR"
echo ""

# Stop current containers
echo "Stopping current containers..."
$COMPOSE_CMD down

# Pull latest changes
echo ""
echo "Pulling latest changes..."
git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || {
    echo "Note: Could not pull from git (may be a local install)"
}

# Rebuild and start
echo ""
echo "Rebuilding and starting containers..."
$COMPOSE_CMD up -d --build

# Wait for services
echo ""
echo "Waiting for services to start..."
sleep 10

# Check status
if $COMPOSE_CMD ps | grep -q "running\|Up"; then
    echo ""
    echo "╔═══════════════════════════════════════════╗"
    echo "║       Slate updated successfully!         ║"
    echo "╚═══════════════════════════════════════════╝"
    echo ""
    echo "Access the application at: http://localhost:1440"
else
    echo ""
    echo "Warning: Services may not have started correctly."
    echo "Check logs with: $COMPOSE_CMD logs"
    exit 1
fi
