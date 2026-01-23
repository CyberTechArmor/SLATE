#!/bin/bash

# Inquiry - Single Line Install Script
# Usage: curl -fsSL https://raw.githubusercontent.com/CyberTechArmor/SLATE/main/inquiry/install.sh | bash

set -e

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║         Inquiry Installation              ║"
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
INSTALL_DIR="${INSTALL_DIR:-$HOME/inquiry}"
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
echo "Cloning Inquiry from CyberTechArmor/SLATE..."
git clone --depth 1 https://github.com/CyberTechArmor/SLATE.git "$INSTALL_DIR-temp"
mv "$INSTALL_DIR-temp/inquiry" "$INSTALL_DIR"
rm -rf "$INSTALL_DIR-temp"

cd "$INSTALL_DIR"

# Generate secure random credentials
echo ""
echo "Generating secure credentials..."

# Generate strong random password (64 characters for JWT secret)
generate_secret() {
    if command -v openssl &> /dev/null; then
        openssl rand -base64 48 | tr -dc 'a-zA-Z0-9' | head -c 64
    else
        cat /dev/urandom | tr -dc 'a-zA-Z0-9' | head -c 64
    fi
}

JWT_SECRET=$(generate_secret)

# Create .env file
cat > .env << EOF
# Inquiry Configuration
# Generated on $(date)
# WARNING: Keep this file secure and do not commit to version control

# JWT Secret for authentication
JWT_SECRET=$JWT_SECRET
EOF

chmod 600 .env

echo "✓ Secure credentials generated and saved to .env"

# Start services
echo ""
echo "Building and starting Inquiry services..."
echo "This may take a few minutes on first run..."
$COMPOSE_CMD up -d --build

# Wait for service to be ready
echo ""
echo "Waiting for service to initialize..."
sleep 10

# Check if services are running
if $COMPOSE_CMD ps | grep -q "running\|Up"; then
    echo "✓ Services started successfully"
else
    echo ""
    echo "Warning: Services may not have started correctly."
    echo "Check logs with: $COMPOSE_CMD logs"
    exit 1
fi

# Health check
echo ""
echo "Running health check..."
for i in {1..10}; do
    if curl -s http://localhost:3100/api/health | grep -q "ok"; then
        echo "✓ Health check passed"
        break
    fi
    if [ $i -eq 10 ]; then
        echo "Warning: Health check did not pass. Service may still be starting."
    fi
    sleep 2
done

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║    Inquiry installed successfully!        ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "Access the application at: http://localhost:3100"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  CREATE YOUR ACCOUNT TO GET STARTED"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Go to http://localhost:3100"
echo "2. Click 'Sign up' to create an account"
echo "3. Start cataloging your questions and ideas!"
echo ""
echo "Your configuration has been saved to: $INSTALL_DIR/.env"
echo "(Keep this file secure!)"
echo ""
echo "Useful commands:"
echo "  Start:    cd $INSTALL_DIR && $COMPOSE_CMD up -d"
echo "  Stop:     cd $INSTALL_DIR && $COMPOSE_CMD down"
echo "  Logs:     cd $INSTALL_DIR && $COMPOSE_CMD logs -f"
echo "  Reset:    cd $INSTALL_DIR && $COMPOSE_CMD down -v && $COMPOSE_CMD up -d"
echo ""
