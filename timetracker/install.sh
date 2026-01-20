#!/bin/bash

# Slate - Single Line Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/CyberTechArmor/SLATE/main/timetracker/install.sh | bash

set -e

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║       Slate Installation            ║"
echo "╚═══════════════════════════════════════════╝"
echo ""

# Check for Docker
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is required. Please install Docker first."
    echo "Visit: https://docs.docker.com/get-docker/"
    exit 1
fi

# Check for Docker Compose
if ! docker compose version &> /dev/null 2>&1; then
    if ! command -v docker-compose &> /dev/null; then
        echo "Error: Docker Compose is required. Please install Docker Compose first."
        echo "Visit: https://docs.docker.com/compose/install/"
        exit 1
    fi
    COMPOSE_CMD="docker-compose"
else
    COMPOSE_CMD="docker compose"
fi

# Check for git
if ! command -v git &> /dev/null; then
    echo "Error: Git is required. Please install Git first."
    exit 1
fi

echo "✓ Docker and Docker Compose detected."
echo "✓ Git detected."

# Create installation directory
INSTALL_DIR="${INSTALL_DIR:-$HOME/timetracker}"
echo ""
echo "Installing to: $INSTALL_DIR"

if [ -d "$INSTALL_DIR" ]; then
    read -p "Directory exists. Overwrite? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 1
    fi
    rm -rf "$INSTALL_DIR"
fi

# Clone repository
echo ""
echo "Cloning Slate from CyberTechArmor/SLATE..."
git clone --depth 1 https://github.com/CyberTechArmor/SLATE.git "$INSTALL_DIR-temp"
mv "$INSTALL_DIR-temp/timetracker" "$INSTALL_DIR"
rm -rf "$INSTALL_DIR-temp"

cd "$INSTALL_DIR"

# Generate secure random credentials
echo ""
echo "Generating secure credentials..."

# Generate strong random passwords (32 characters, alphanumeric)
generate_password() {
    if command -v openssl &> /dev/null; then
        openssl rand -base64 32 | tr -dc 'a-zA-Z0-9' | head -c 32
    else
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 32
    fi
}

POSTGRES_PASSWORD=$(generate_password)
SESSION_SECRET=$(generate_password)
POSTGRES_USER="timetrack_$(cat /dev/urandom | tr -dc 'a-z0-9' | head -c 8)"
POSTGRES_DB="timetrack_db"

# Create .env file with all credentials
cat > .env << EOF
# Slate Configuration
# Generated on $(date)
# WARNING: Keep this file secure and do not commit to version control

# PostgreSQL Database Credentials
POSTGRES_USER=$POSTGRES_USER
POSTGRES_PASSWORD=$POSTGRES_PASSWORD
POSTGRES_DB=$POSTGRES_DB

# Application Settings
SESSION_SECRET=$SESSION_SECRET
NODE_ENV=production
PORT=3000

# Database URL (constructed from above)
DATABASE_URL=postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@db:5432/${POSTGRES_DB}
EOF

chmod 600 .env

echo "✓ Secure credentials generated and saved to .env"

# Start services
echo ""
echo "Building and starting Slate services..."
$COMPOSE_CMD up -d --build

# Wait for database to be ready
echo "Waiting for database to initialize..."
sleep 15

# Check if services are running
if $COMPOSE_CMD ps | grep -q "running\|Up"; then
    echo "✓ Services started successfully"
else
    echo ""
    echo "Warning: Services may not have started correctly."
    echo "Check logs with: $COMPOSE_CMD logs"
    exit 1
fi

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     Slate installed successfully!   ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "Access the application at: http://localhost:1440"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  FIRST USER TO SIGN UP BECOMES ADMIN"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Go to http://localhost:1440"
echo "2. Click 'Create an account'"
echo "3. The first account created will have admin privileges"
echo ""
echo "Your database credentials have been saved to: $INSTALL_DIR/.env"
echo "(Keep this file secure!)"
echo ""
echo "Useful commands:"
echo "  Start:    cd $INSTALL_DIR && $COMPOSE_CMD up -d"
echo "  Stop:     cd $INSTALL_DIR && $COMPOSE_CMD down"
echo "  Logs:     cd $INSTALL_DIR && $COMPOSE_CMD logs -f"
echo "  Reset DB: cd $INSTALL_DIR && $COMPOSE_CMD down -v && $COMPOSE_CMD up -d"
echo ""
