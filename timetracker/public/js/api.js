// API Wrapper for TimeTracker

const API = {
    // Get CSRF token from cookie
    getCSRFToken() {
        const value = `; ${document.cookie}`;
        const parts = value.split('; csrf=');
        if (parts.length === 2) return parts.pop().split(';').shift();
        return '';
    },

    // Base fetch with error handling
    async request(url, options = {}) {
        const defaultOptions = {
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': this.getCSRFToken()
            }
        };

        const response = await fetch(url, {
            ...defaultOptions,
            ...options,
            headers: {
                ...defaultOptions.headers,
                ...options.headers
            }
        });

        // Handle 401 - redirect to login
        if (response.status === 401) {
            const isClientPortal = window.location.pathname.startsWith('/client/');
            window.location.href = isClientPortal ? '/client/login.html' : '/login.html';
            return;
        }

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.error || 'Request failed');
        }

        return data;
    },

    // GET request
    async get(url) {
        return this.request(url);
    },

    // POST request
    async post(url, body) {
        return this.request(url, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    // PUT request
    async put(url, body) {
        return this.request(url, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    },

    // DELETE request
    async delete(url) {
        return this.request(url, {
            method: 'DELETE'
        });
    },

    // Auth
    auth: {
        async me() {
            return API.get('/api/auth/me');
        },
        async logout() {
            return API.post('/api/auth/logout');
        },
        async clientLogout() {
            return API.post('/api/auth/client/logout');
        }
    },

    // Dashboard
    dashboard: {
        async stats() {
            return API.get('/api/dashboard/stats');
        },
        async recent(limit = 10) {
            return API.get(`/api/dashboard/recent?limit=${limit}`);
        },
        async clientsSummary() {
            return API.get('/api/dashboard/clients-summary');
        },
        async invoicesSummary() {
            return API.get('/api/dashboard/invoices-summary');
        }
    },

    // Clients
    clients: {
        async list(params = {}) {
            const query = new URLSearchParams(params).toString();
            return API.get(`/api/clients${query ? '?' + query : ''}`);
        },
        async get(id) {
            return API.get(`/api/clients/${id}`);
        },
        async create(data) {
            return API.post('/api/clients', data);
        },
        async update(id, data) {
            return API.put(`/api/clients/${id}`, data);
        },
        async delete(id) {
            return API.delete(`/api/clients/${id}`);
        },
        async getProjects(id) {
            return API.get(`/api/clients/${id}/projects`);
        }
    },

    // Projects
    projects: {
        async list(params = {}) {
            const query = new URLSearchParams(params).toString();
            return API.get(`/api/projects${query ? '?' + query : ''}`);
        },
        async get(id) {
            return API.get(`/api/projects/${id}`);
        },
        async create(data) {
            return API.post('/api/projects', data);
        },
        async update(id, data) {
            return API.put(`/api/projects/${id}`, data);
        },
        async delete(id) {
            return API.delete(`/api/projects/${id}`);
        }
    },

    // Time Entries
    entries: {
        async list(params = {}) {
            const query = new URLSearchParams(params).toString();
            return API.get(`/api/time-entries${query ? '?' + query : ''}`);
        },
        async get(id) {
            return API.get(`/api/time-entries/${id}`);
        },
        async create(data) {
            return API.post('/api/time-entries', data);
        },
        async update(id, data) {
            return API.put(`/api/time-entries/${id}`, data);
        },
        async delete(id) {
            return API.delete(`/api/time-entries/${id}`);
        },
        async addResource(id, data) {
            return API.post(`/api/time-entries/${id}/resources`, data);
        },
        async removeResource(id, resourceId) {
            return API.delete(`/api/time-entries/${id}/resources/${resourceId}`);
        }
    },

    // Invoices
    invoices: {
        async list(params = {}) {
            const query = new URLSearchParams(params).toString();
            return API.get(`/api/invoices${query ? '?' + query : ''}`);
        },
        async get(id) {
            return API.get(`/api/invoices/${id}`);
        },
        async create(data) {
            return API.post('/api/invoices', data);
        },
        async update(id, data) {
            return API.put(`/api/invoices/${id}`, data);
        },
        async delete(id) {
            return API.delete(`/api/invoices/${id}`);
        },
        async send(id) {
            return API.post(`/api/invoices/${id}/send`);
        },
        async markPaid(id) {
            return API.post(`/api/invoices/${id}/paid`);
        }
    },

    // Client Portal
    clientPortal: {
        async dashboardStats() {
            return API.get('/api/client/dashboard/stats');
        },
        async timeline(params = {}) {
            const query = new URLSearchParams(params).toString();
            return API.get(`/api/client/dashboard/timeline${query ? '?' + query : ''}`);
        },
        async entries(params = {}) {
            const query = new URLSearchParams(params).toString();
            return API.get(`/api/client/time-entries${query ? '?' + query : ''}`);
        },
        async getEntry(id) {
            return API.get(`/api/client/time-entries/${id}`);
        },
        async projects() {
            return API.get('/api/client/projects');
        },
        async invoices(params = {}) {
            const query = new URLSearchParams(params).toString();
            return API.get(`/api/client/invoices${query ? '?' + query : ''}`);
        },
        async getInvoice(id) {
            return API.get(`/api/client/invoices/${id}`);
        }
    }
};
