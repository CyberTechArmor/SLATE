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

# Pull latest changes - handle non-git directories
echo ""
echo "Pulling latest changes..."

if [ -d ".git" ]; then
    # It's a git repo, pull normally
    git pull origin main 2>/dev/null || git pull origin master 2>/dev/null || {
        echo "Warning: Could not pull from git"
    }
else
    # Not a git repo, download latest from GitHub
    echo "Downloading latest version from GitHub..."
    TEMP_DIR=$(mktemp -d)

    if command -v curl &> /dev/null; then
        curl -sL https://github.com/CyberTechArmor/SLATE/archive/refs/heads/main.tar.gz | tar xz -C "$TEMP_DIR"
    elif command -v wget &> /dev/null; then
        wget -qO- https://github.com/CyberTechArmor/SLATE/archive/refs/heads/main.tar.gz | tar xz -C "$TEMP_DIR"
    else
        echo "Error: curl or wget is required for updates"
        exit 1
    fi

    # Copy updated files (preserve .env)
    if [ -f ".env" ]; then
        cp .env "$TEMP_DIR/.env.backup"
    fi

    # Copy new files
    cp -r "$TEMP_DIR"/SLATE-main/timetracker/* "$SCRIPT_DIR/"

    # Restore .env
    if [ -f "$TEMP_DIR/.env.backup" ]; then
        cp "$TEMP_DIR/.env.backup" .env
    fi

    rm -rf "$TEMP_DIR"
    echo "Latest version downloaded successfully"
fi

# Rebuild and start
echo ""
echo "Rebuilding and starting containers..."
$COMPOSE_CMD up -d --build

# Wait for services
echo ""
echo "Waiting for services to start..."
sleep 15

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
