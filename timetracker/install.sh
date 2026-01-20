#!/bin/bash

# TimeTracker - Single Line Install Script
# Usage: curl -fsSL https://your-domain.com/install.sh | bash

set -e

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║       TimeTracker Installation            ║"
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

echo "Docker and Docker Compose detected."

# Create installation directory
INSTALL_DIR="${INSTALL_DIR:-$HOME/timetracker}"
echo "Installing to: $INSTALL_DIR"

if [ -d "$INSTALL_DIR" ]; then
    read -p "Directory exists. Overwrite? (y/N) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Installation cancelled."
        exit 1
    fi
fi

mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

echo ""
echo "Downloading TimeTracker..."

# For local development, we're already in the directory
# For production, you would download from a release:
# curl -fsSL https://github.com/user/timetracker/archive/main.tar.gz | tar -xz --strip-components=1

# Generate secure session secret
SESSION_SECRET=$(openssl rand -hex 32 2>/dev/null || head -c 32 /dev/urandom | xxd -p)

# Create .env file
cat > .env << EOF
SESSION_SECRET=$SESSION_SECRET
NODE_ENV=production
PORT=3000
EOF

echo "Secure session secret generated."

# Start services
echo ""
echo "Starting TimeTracker services..."
$COMPOSE_CMD up -d --build

# Wait for database to be ready
echo "Waiting for database to be ready..."
sleep 10

# Check if services are running
if ! $COMPOSE_CMD ps | grep -q "running"; then
    echo ""
    echo "Warning: Services may not have started correctly."
    echo "Check logs with: $COMPOSE_CMD logs"
fi

# Create default admin user
echo ""
echo "Creating default admin user..."

$COMPOSE_CMD exec -T app node -e "
const bcrypt = require('bcrypt');
const { Pool } = require('pg');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL
});

async function createAdmin() {
    try {
        // Check if admin already exists
        const existing = await pool.query(\"SELECT id FROM users WHERE email = 'admin@localhost'\");
        if (existing.rows.length > 0) {
            console.log('Admin user already exists');
            process.exit(0);
        }

        // Create admin with password 'admin'
        const hash = await bcrypt.hash('admin', 12);
        await pool.query(
            'INSERT INTO users (email, password_hash, name) VALUES (\$1, \$2, \$3)',
            ['admin@localhost', hash, 'Admin User']
        );
        console.log('Admin user created successfully');
    } catch (err) {
        console.error('Error creating admin:', err.message);
        process.exit(1);
    } finally {
        await pool.end();
    }
}

createAdmin();
" 2>/dev/null || echo "Admin user may already exist."

echo ""
echo "╔═══════════════════════════════════════════╗"
echo "║     TimeTracker installed successfully!   ║"
echo "╚═══════════════════════════════════════════╝"
echo ""
echo "Access the application at: http://localhost:3000"
echo ""
echo "Default admin credentials:"
echo "  Email:    admin@localhost"
echo "  Password: admin"
echo ""
echo "IMPORTANT: Change your password after first login!"
echo ""
echo "Useful commands:"
echo "  Start:    $COMPOSE_CMD up -d"
echo "  Stop:     $COMPOSE_CMD down"
echo "  Logs:     $COMPOSE_CMD logs -f"
echo "  Reset DB: $COMPOSE_CMD down -v && $COMPOSE_CMD up -d"
echo ""
