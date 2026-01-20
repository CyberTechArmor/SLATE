#!/bin/bash

# Slate - Uninstall Script
# Usage: ./uninstall.sh

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║          Slate Uninstall                  ║"
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

echo "This will completely remove Slate including:"
echo "  - All Docker containers"
echo "  - All Docker volumes (DATABASE WILL BE DELETED)"
echo "  - All Docker networks"
echo "  - The application directory: $SCRIPT_DIR"
echo ""
read -p "Are you sure you want to uninstall? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    echo "Uninstall cancelled."
    exit 0
fi

echo ""
echo "Stopping and removing containers, networks, and volumes..."
$COMPOSE_CMD down -v --remove-orphans 2>/dev/null || true

# Remove any dangling images from this project
echo "Removing Docker images..."
docker images | grep -E "timetracker|slate" | awk '{print $3}' | xargs -r docker rmi -f 2>/dev/null || true

echo ""
read -p "Do you also want to delete the application files? (yes/no): " DELETE_FILES

if [ "$DELETE_FILES" = "yes" ]; then
    echo ""
    echo "Removing application files..."
    cd ..
    rm -rf "$SCRIPT_DIR"
    echo "Application files removed."
fi

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     Slate uninstalled successfully!       ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "All Slate containers, volumes, and networks have been removed."
if [ "$DELETE_FILES" = "yes" ]; then
    echo "Application files have been deleted."
else
    echo "Application files are still at: $SCRIPT_DIR"
fi
echo ""
