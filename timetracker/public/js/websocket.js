// WebSocket Client for Slate

class WebSocketClient {
    constructor() {
        this.ws = null;
        this.reconnectAttempts = 0;
        this.maxReconnectAttempts = 5;
        this.reconnectDelay = 1000;
        this.listeners = new Map();
        this.connected = false;
    }

    connect() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const url = `${protocol}//${window.location.host}/ws`;

        try {
            this.ws = new WebSocket(url);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.connected = true;
                this.reconnectAttempts = 0;
                this.emit('connected');
            };

            this.ws.onmessage = (event) => {
                try {
                    const message = JSON.parse(event.data);
                    this.handleMessage(message);
                } catch (e) {
                    console.error('Failed to parse WebSocket message:', e);
                }
            };

            this.ws.onclose = (event) => {
                console.log('WebSocket disconnected:', event.code, event.reason);
                this.connected = false;
                this.emit('disconnected');

                // Attempt to reconnect
                if (this.reconnectAttempts < this.maxReconnectAttempts) {
                    this.reconnectAttempts++;
                    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
                    console.log(`Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
                    setTimeout(() => this.connect(), delay);
                }
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
            };

        } catch (e) {
            console.error('Failed to create WebSocket:', e);
        }
    }

    handleMessage(message) {
        const { type, data } = message;

        // Emit to specific listeners
        if (this.listeners.has(type)) {
            this.listeners.get(type).forEach(callback => callback(data));
        }

        // Emit to wildcard listeners
        if (this.listeners.has('*')) {
            this.listeners.get('*').forEach(callback => callback(type, data));
        }
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, new Set());
        }
        this.listeners.get(event).add(callback);
        return () => this.off(event, callback);
    }

    off(event, callback) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).delete(callback);
        }
    }

    emit(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }

    send(type, data) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify({ type, data }));
        }
    }

    subscribeToClient(clientId) {
        this.send('subscribe:client', { clientId });
    }

    unsubscribeFromClient(clientId) {
        this.send('unsubscribe:client', { clientId });
    }

    startTimer(data) {
        this.send('timer:start', data);
    }

    stopTimer(data) {
        this.send('timer:stop', data);
    }

    disconnect() {
        if (this.ws) {
            this.ws.close();
            this.ws = null;
        }
    }
}

// Create global instance
const ws = new WebSocketClient();

// Auto-connect on page load
document.addEventListener('DOMContentLoaded', () => {
    ws.connect();
});
