const WebSocket = require('ws');
const { getSession } = require('../middleware/auth');
const cookie = require('cookie');

// Store connected clients
const clients = new Map();
const clientSubscriptions = new Map(); // Map of client_id -> Set of WebSocket connections

// Heartbeat interval (30 seconds)
const HEARTBEAT_INTERVAL = 30000;

function setupWebSocket(server) {
    const wss = new WebSocket.Server({
        server,
        path: '/ws'
    });

    // Heartbeat to keep connections alive
    const heartbeatInterval = setInterval(() => {
        wss.clients.forEach((ws) => {
            if (ws.isAlive === false) {
                return ws.terminate();
            }
            ws.isAlive = false;
            ws.ping();
        });
    }, HEARTBEAT_INTERVAL);

    wss.on('close', () => {
        clearInterval(heartbeatInterval);
    });

    wss.on('connection', async (ws, req) => {
        ws.isAlive = true;

        // Parse session from cookies
        const cookies = cookie.parse(req.headers.cookie || '');
        const sessionId = cookies.session;

        if (!sessionId) {
            ws.close(4001, 'Authentication required');
            return;
        }

        try {
            const session = await getSession(sessionId);
            if (!session) {
                ws.close(4001, 'Invalid session');
                return;
            }

            // Store session info on the WebSocket
            ws.session = session;
            ws.userId = session.user_id;
            ws.clientId = session.client_id;
            ws.userType = session.user_type;

            // Add to clients map
            const clientKey = session.user_type === 'user'
                ? `user:${session.user_id}`
                : `client:${session.client_id}`;

            if (!clients.has(clientKey)) {
                clients.set(clientKey, new Set());
            }
            clients.get(clientKey).add(ws);

            // If it's a client, subscribe them to their own updates
            if (session.user_type === 'client') {
                if (!clientSubscriptions.has(session.client_id)) {
                    clientSubscriptions.set(session.client_id, new Set());
                }
                clientSubscriptions.get(session.client_id).add(ws);
            }

            console.log(`WebSocket connected: ${clientKey}`);

            // Send welcome message
            ws.send(JSON.stringify({
                type: 'connected',
                data: {
                    userType: session.user_type,
                    name: session.user_name || session.client_name
                }
            }));

        } catch (err) {
            console.error('WebSocket auth error:', err);
            ws.close(4001, 'Authentication error');
            return;
        }

        // Handle pong (heartbeat response)
        ws.on('pong', () => {
            ws.isAlive = true;
        });

        // Handle messages from client
        ws.on('message', (data) => {
            try {
                const message = JSON.parse(data.toString());
                handleMessage(ws, message);
            } catch (err) {
                console.error('Invalid WebSocket message:', err);
            }
        });

        // Handle disconnect
        ws.on('close', () => {
            const clientKey = ws.userType === 'user'
                ? `user:${ws.userId}`
                : `client:${ws.clientId}`;

            const clientSet = clients.get(clientKey);
            if (clientSet) {
                clientSet.delete(ws);
                if (clientSet.size === 0) {
                    clients.delete(clientKey);
                }
            }

            // Remove from client subscriptions
            if (ws.userType === 'client' && ws.clientId) {
                const subs = clientSubscriptions.get(ws.clientId);
                if (subs) {
                    subs.delete(ws);
                    if (subs.size === 0) {
                        clientSubscriptions.delete(ws.clientId);
                    }
                }
            }

            console.log(`WebSocket disconnected: ${clientKey}`);
        });

        ws.on('error', (err) => {
            console.error('WebSocket error:', err);
        });
    });

    return wss;
}

// Handle incoming messages
function handleMessage(ws, message) {
    switch (message.type) {
        case 'ping':
            ws.send(JSON.stringify({ type: 'pong' }));
            break;

        case 'timer:start':
            // Broadcast timer start to all user's connections
            broadcastToUser(ws.userId, {
                type: 'timer:started',
                data: message.data
            }, ws);
            break;

        case 'timer:stop':
            // Broadcast timer stop to all user's connections
            broadcastToUser(ws.userId, {
                type: 'timer:stopped',
                data: message.data
            }, ws);
            break;

        case 'subscribe:client':
            // User subscribing to client updates
            if (ws.userType === 'user' && message.data?.clientId) {
                if (!clientSubscriptions.has(message.data.clientId)) {
                    clientSubscriptions.set(message.data.clientId, new Set());
                }
                clientSubscriptions.get(message.data.clientId).add(ws);
            }
            break;

        case 'unsubscribe:client':
            // User unsubscribing from client updates
            if (ws.userType === 'user' && message.data?.clientId) {
                const subs = clientSubscriptions.get(message.data.clientId);
                if (subs) {
                    subs.delete(ws);
                }
            }
            break;

        default:
            console.log('Unknown message type:', message.type);
    }
}

// Broadcast to all connections of a specific user
function broadcastToUser(userId, message, excludeWs = null) {
    const clientKey = `user:${userId}`;
    const userClients = clients.get(clientKey);

    if (userClients) {
        const messageStr = JSON.stringify(message);
        userClients.forEach((ws) => {
            if (ws !== excludeWs && ws.readyState === WebSocket.OPEN) {
                ws.send(messageStr);
            }
        });
    }
}

// Broadcast to all connections subscribed to a client
function broadcastToClient(clientId, message) {
    const subs = clientSubscriptions.get(clientId);

    if (subs) {
        const messageStr = JSON.stringify(message);
        subs.forEach((ws) => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(messageStr);
            }
        });
    }
}

// Broadcast to all users (service providers)
function broadcastToAllUsers(message) {
    const messageStr = JSON.stringify(message);

    clients.forEach((clientSet, key) => {
        if (key.startsWith('user:')) {
            clientSet.forEach((ws) => {
                if (ws.readyState === WebSocket.OPEN) {
                    ws.send(messageStr);
                }
            });
        }
    });
}

// Event emitters for other parts of the application
const events = {
    timeEntryCreated: (entry, clientId) => {
        broadcastToAllUsers({
            type: 'time_entry:created',
            data: entry
        });
        broadcastToClient(clientId, {
            type: 'time_entry:created',
            data: {
                ...entry,
                internal_notes: undefined // Don't send internal notes to client
            }
        });
    },

    timeEntryUpdated: (entry, clientId) => {
        broadcastToAllUsers({
            type: 'time_entry:updated',
            data: entry
        });
        broadcastToClient(clientId, {
            type: 'time_entry:updated',
            data: {
                ...entry,
                internal_notes: undefined
            }
        });
    },

    timeEntryDeleted: (entryId, clientId) => {
        broadcastToAllUsers({
            type: 'time_entry:deleted',
            data: { id: entryId }
        });
        broadcastToClient(clientId, {
            type: 'time_entry:deleted',
            data: { id: entryId }
        });
    },

    invoiceCreated: (invoice) => {
        broadcastToAllUsers({
            type: 'invoice:created',
            data: invoice
        });
    },

    invoiceUpdated: (invoice) => {
        broadcastToAllUsers({
            type: 'invoice:updated',
            data: invoice
        });
        // Notify client if invoice status changed to 'sent'
        if (invoice.status === 'sent') {
            broadcastToClient(invoice.client_id, {
                type: 'invoice:sent',
                data: { id: invoice.id, invoice_number: invoice.invoice_number }
            });
        }
    }
};

module.exports = {
    setupWebSocket,
    broadcastToUser,
    broadcastToClient,
    broadcastToAllUsers,
    events
};
