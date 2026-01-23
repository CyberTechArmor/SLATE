# Inquiry

A minimalistic platform for cataloging questions and ideas.

## Features

- Clean, professional design using white, black, and charcoal colors
- Create and organize inquiries with markdown content
- Attach resources (links and files) to inquiries
- Real-time updates via WebSocket
- Secure JWT-based authentication with refresh tokens
- Fully mobile responsive

## Tech Stack

### Backend
- Node.js with TypeScript (ES modules)
- Express.js
- SQLite with Drizzle ORM
- Socket.io for real-time updates
- Argon2id for password hashing
- JWT authentication with refresh tokens

### Frontend
- React 18 with TypeScript
- Vite
- Tailwind CSS
- Zustand for state management
- @uiw/react-md-editor for markdown editing

## Getting Started

### Prerequisites
- Node.js 18+
- npm 9+

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create environment file:
```bash
cp server/.env.example server/.env
```

3. Update the JWT_SECRET in server/.env with a secure random string.

### Development

Run both server and client in development mode:
```bash
npm run dev
```

- Server runs on http://localhost:3000
- Client runs on http://localhost:5173

### Production Build

```bash
npm run build
npm run start
```

## Project Structure

```
inquiry/
├── package.json              # Workspace root
├── server/                   # Backend API
│   ├── src/
│   │   ├── index.ts          # Express + Socket.io
│   │   ├── db/               # Database schema
│   │   ├── lib/              # Auth utilities
│   │   ├── middleware/       # Auth middleware
│   │   └── routes/           # API routes
│   └── ...
└── client/                   # Frontend React app
    ├── src/
    │   ├── lib/              # API client
    │   ├── stores/           # Zustand stores
    │   ├── hooks/            # Custom hooks
    │   ├── pages/            # Page components
    │   └── components/       # UI components
    └── ...
```

## License

MIT
