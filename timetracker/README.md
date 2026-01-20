# TimeTracker

A modern time tracking application with a client portal. Track billable hours in 6-minute (0.1 hour) increments, manage clients and projects, attach resources, and generate invoices.

## Features

- **Time Tracking**: Log time in 0.1-hour increments with a quick-add form and timer
- **Client Management**: Create and manage clients with portal access
- **Project Organization**: Group time entries by project or as "loose hours"
- **Invoice Generation**: Create invoices from unbilled time entries
- **Client Portal**: Clients can view their time entries and resources (but not internal notes)
- **Real-time Updates**: WebSocket-powered live updates across all tabs
- **Mobile Responsive**: Touch-friendly design with bottom navigation for mobile

## Tech Stack

- **Frontend**: Vanilla HTML, CSS, JavaScript (no frameworks)
- **Backend**: Node.js with Express
- **Database**: PostgreSQL
- **Real-time**: Native WebSockets
- **Containerization**: Docker with Docker Compose
- **Icons**: Lucide Icons (CDN)

## Quick Start

### Using Docker (Recommended)

```bash
# Clone or download the project
cd timetracker

# Start the application
docker compose up -d

# Access at http://localhost:3000
```

### Default Credentials

- **Admin Email**: admin@localhost
- **Admin Password**: admin

Change your password after first login!

## Development

```bash
# Install dependencies
npm install

# Start PostgreSQL (or use Docker)
docker compose up -d db

# Set environment variables
export DATABASE_URL="postgresql://timetrack:timetrack@localhost:5432/timetrack"
export SESSION_SECRET="your-dev-secret"

# Run in development mode
npm run dev
```

## Project Structure

```
timetracker/
├── docker-compose.yml
├── Dockerfile
├── package.json
├── install.sh
├── src/
│   ├── server.js
│   ├── config/
│   │   └── database.js
│   ├── middleware/
│   │   ├── auth.js
│   │   └── validation.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── dashboard.js
│   │   ├── clients.js
│   │   ├── projects.js
│   │   ├── time-entries.js
│   │   ├── invoices.js
│   │   └── client-portal.js
│   ├── websocket/
│   │   └── handler.js
│   └── utils/
│       └── helpers.js
├── public/
│   ├── css/
│   ├── js/
│   ├── user/
│   └── client/
└── scripts/
    ├── init-db.sql
    └── seed.sql
```

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/logout` - Logout
- `GET /api/auth/me` - Get current user
- `POST /api/auth/client/login` - Client login

### Clients
- `GET /api/clients` - List clients
- `POST /api/clients` - Create client
- `GET /api/clients/:id` - Get client
- `PUT /api/clients/:id` - Update client
- `DELETE /api/clients/:id` - Delete/archive client

### Projects
- `GET /api/projects` - List projects
- `POST /api/projects` - Create project
- `GET /api/projects/:id` - Get project
- `PUT /api/projects/:id` - Update project
- `DELETE /api/projects/:id` - Delete project

### Time Entries
- `GET /api/time-entries` - List entries
- `POST /api/time-entries` - Create entry
- `GET /api/time-entries/:id` - Get entry
- `PUT /api/time-entries/:id` - Update entry
- `DELETE /api/time-entries/:id` - Delete entry
- `POST /api/time-entries/:id/resources` - Add resource
- `DELETE /api/time-entries/:id/resources/:rid` - Remove resource

### Invoices
- `GET /api/invoices` - List invoices
- `POST /api/invoices` - Create invoice
- `GET /api/invoices/:id` - Get invoice
- `PUT /api/invoices/:id` - Update invoice
- `DELETE /api/invoices/:id` - Delete draft invoice
- `POST /api/invoices/:id/send` - Mark as sent
- `POST /api/invoices/:id/paid` - Mark as paid

### Client Portal
- `GET /api/client/dashboard/stats` - Client stats
- `GET /api/client/time-entries` - Client's entries
- `GET /api/client/projects` - Client's projects
- `GET /api/client/invoices` - Client's invoices

## WebSocket Events

### Server → Client
- `time_entry:created` - New entry added
- `time_entry:updated` - Entry modified
- `time_entry:deleted` - Entry removed
- `invoice:created` - New invoice created
- `invoice:updated` - Invoice status changed

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `NODE_ENV` | Environment | development |
| `DATABASE_URL` | PostgreSQL connection string | - |
| `SESSION_SECRET` | Session signing secret | - |

## License

MIT
