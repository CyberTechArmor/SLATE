const { v4: uuidv4 } = require('uuid');

// Generate a unique session ID
function generateSessionId() {
    return uuidv4();
}

// Round duration to nearest 0.1 hour (6 minutes)
function roundToTenth(duration) {
    return Math.round(duration * 10) / 10;
}

// Format duration for display (e.g., "1.5 hrs" or "0.5 hr")
function formatDuration(hours) {
    const rounded = roundToTenth(hours);
    return `${rounded} ${rounded === 1 ? 'hr' : 'hrs'}`;
}

// Format currency
function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

// Format date for display
function formatDate(date) {
    return new Date(date).toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Format date for input fields (YYYY-MM-DD)
function formatDateInput(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

// Calculate hours between two times
function calculateHours(startTime, endTime) {
    const start = new Date(`1970-01-01T${startTime}`);
    const end = new Date(`1970-01-01T${endTime}`);
    const diffMs = end - start;
    const hours = diffMs / (1000 * 60 * 60);
    return roundToTenth(hours);
}

// Get effective hourly rate (project rate overrides client rate)
function getEffectiveRate(projectRate, clientRate) {
    return projectRate !== null && projectRate !== undefined ? projectRate : clientRate;
}

// Calculate line item amount
function calculateAmount(duration, rate) {
    return roundToTenth(duration) * rate;
}

// Generate invoice number
function generateInvoiceNumber(lastNumber) {
    const year = new Date().getFullYear();
    if (!lastNumber || !lastNumber.startsWith(year.toString())) {
        return `${year}-0001`;
    }
    const num = parseInt(lastNumber.split('-')[1], 10) + 1;
    return `${year}-${num.toString().padStart(4, '0')}`;
}

// Validate email format
function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
}

// Validate duration (must be positive and in 0.1 increments)
function isValidDuration(duration) {
    if (typeof duration !== 'number' || duration <= 0) return false;
    // Check if it's a valid 0.1 increment (allowing for floating point imprecision)
    const rounded = Math.round(duration * 10);
    return Math.abs(duration * 10 - rounded) < 0.001;
}

// Sanitize string to prevent XSS
function sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Parse and validate pagination parameters
function parsePagination(query, defaults = { page: 1, limit: 20 }) {
    const page = Math.max(1, parseInt(query.page, 10) || defaults.page);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || defaults.limit));
    const offset = (page - 1) * limit;
    return { page, limit, offset };
}

// Build pagination response
function paginationResponse(data, total, { page, limit }) {
    return {
        data,
        pagination: {
            page,
            limit,
            total,
            totalPages: Math.ceil(total / limit),
            hasNext: page * limit < total,
            hasPrev: page > 1
        }
    };
}

// Date range helpers
function getStartOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getEndOfDay(date = new Date()) {
    const d = new Date(date);
    d.setHours(23, 59, 59, 999);
    return d;
}

function getStartOfWeek(date = new Date()) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = d.getDate() - day + (day === 0 ? -6 : 1);
    d.setDate(diff);
    d.setHours(0, 0, 0, 0);
    return d;
}

function getStartOfMonth(date = new Date()) {
    const d = new Date(date);
    d.setDate(1);
    d.setHours(0, 0, 0, 0);
    return d;
}

module.exports = {
    generateSessionId,
    roundToTenth,
    formatDuration,
    formatCurrency,
    formatDate,
    formatDateInput,
    calculateHours,
    getEffectiveRate,
    calculateAmount,
    generateInvoiceNumber,
    isValidEmail,
    isValidDuration,
    sanitizeString,
    parsePagination,
    paginationResponse,
    getStartOfDay,
    getEndOfDay,
    getStartOfWeek,
    getStartOfMonth
};
