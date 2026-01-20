const { isValidEmail, isValidDuration } = require('../utils/helpers');

// Validation error class
class ValidationError extends Error {
    constructor(message, field) {
        super(message);
        this.name = 'ValidationError';
        this.field = field;
        this.status = 400;
    }
}

// Generic validation helper
function validate(value, rules, fieldName) {
    const errors = [];

    for (const rule of rules) {
        const error = rule(value, fieldName);
        if (error) {
            errors.push(error);
        }
    }

    return errors;
}

// Validation rules
const rules = {
    required: (value, field) => {
        if (value === undefined || value === null || value === '') {
            return `${field} is required`;
        }
        return null;
    },

    email: (value, field) => {
        if (value && !isValidEmail(value)) {
            return `${field} must be a valid email address`;
        }
        return null;
    },

    minLength: (min) => (value, field) => {
        if (value && value.length < min) {
            return `${field} must be at least ${min} characters`;
        }
        return null;
    },

    maxLength: (max) => (value, field) => {
        if (value && value.length > max) {
            return `${field} must be at most ${max} characters`;
        }
        return null;
    },

    duration: (value, field) => {
        if (value !== undefined && value !== null && !isValidDuration(parseFloat(value))) {
            return `${field} must be a positive number in 0.1 increments`;
        }
        return null;
    },

    numeric: (value, field) => {
        if (value !== undefined && value !== null && isNaN(parseFloat(value))) {
            return `${field} must be a number`;
        }
        return null;
    },

    positiveNumber: (value, field) => {
        const num = parseFloat(value);
        if (value !== undefined && value !== null && (isNaN(num) || num < 0)) {
            return `${field} must be a positive number`;
        }
        return null;
    },

    date: (value, field) => {
        if (value && isNaN(Date.parse(value))) {
            return `${field} must be a valid date`;
        }
        return null;
    },

    enum: (allowedValues) => (value, field) => {
        if (value && !allowedValues.includes(value)) {
            return `${field} must be one of: ${allowedValues.join(', ')}`;
        }
        return null;
    },

    url: (value, field) => {
        if (value) {
            try {
                new URL(value);
            } catch {
                return `${field} must be a valid URL`;
            }
        }
        return null;
    }
};

// Validation schemas
const schemas = {
    client: {
        name: [rules.required, rules.maxLength(255)],
        email: [rules.required, rules.email, rules.maxLength(255)],
        password: [rules.required, rules.minLength(6)],
        contact_name: [rules.maxLength(255)],
        phone: [rules.maxLength(50)],
        hourly_rate: [rules.positiveNumber],
        status: [rules.enum(['active', 'inactive'])]
    },

    clientUpdate: {
        name: [rules.maxLength(255)],
        email: [rules.email, rules.maxLength(255)],
        contact_name: [rules.maxLength(255)],
        phone: [rules.maxLength(50)],
        hourly_rate: [rules.positiveNumber],
        status: [rules.enum(['active', 'inactive'])]
    },

    project: {
        name: [rules.required, rules.maxLength(255)],
        client_id: [rules.required, rules.numeric],
        hourly_rate: [rules.positiveNumber],
        status: [rules.enum(['active', 'completed', 'on_hold'])]
    },

    projectUpdate: {
        name: [rules.maxLength(255)],
        hourly_rate: [rules.positiveNumber],
        status: [rules.enum(['active', 'completed', 'on_hold'])]
    },

    timeEntry: {
        client_id: [rules.required, rules.numeric],
        date: [rules.required, rules.date],
        duration: [rules.required, rules.duration],
        title: [rules.required, rules.maxLength(255)]
    },

    timeEntryUpdate: {
        date: [rules.date],
        duration: [rules.duration],
        title: [rules.maxLength(255)]
    },

    resource: {
        name: [rules.required, rules.maxLength(255)],
        type: [rules.required, rules.enum(['link', 'document'])],
        url: [rules.required]
    },

    invoice: {
        client_id: [rules.required, rules.numeric],
        date_issued: [rules.required, rules.date],
        tax_rate: [rules.positiveNumber]
    },

    invoiceUpdate: {
        date_due: [rules.date],
        tax_rate: [rules.positiveNumber],
        status: [rules.enum(['draft', 'sent', 'paid', 'overdue'])]
    },

    login: {
        email: [rules.required, rules.email],
        password: [rules.required]
    },

    signup: {
        email: [rules.required, rules.email, rules.maxLength(255)],
        password: [rules.required, rules.minLength(6)],
        name: [rules.required, rules.maxLength(255)]
    }
};

// Validate request body against schema
function validateBody(schemaName) {
    return (req, res, next) => {
        const schema = schemas[schemaName];
        if (!schema) {
            return next(new Error(`Unknown validation schema: ${schemaName}`));
        }

        const errors = [];

        for (const [field, fieldRules] of Object.entries(schema)) {
            const value = req.body[field];
            const fieldErrors = validate(value, fieldRules, field);
            errors.push(...fieldErrors);
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Validation failed',
                details: errors
            });
        }

        next();
    };
}

// Validate query parameters
function validateQuery(params) {
    return (req, res, next) => {
        const errors = [];

        for (const [param, paramRules] of Object.entries(params)) {
            const value = req.query[param];
            if (value !== undefined) {
                const paramErrors = validate(value, paramRules, param);
                errors.push(...paramErrors);
            }
        }

        if (errors.length > 0) {
            return res.status(400).json({
                error: 'Invalid query parameters',
                details: errors
            });
        }

        next();
    };
}

// Validate ID parameter
function validateId(paramName = 'id') {
    return (req, res, next) => {
        const id = parseInt(req.params[paramName], 10);
        if (isNaN(id) || id < 1) {
            return res.status(400).json({
                error: `Invalid ${paramName}: must be a positive integer`
            });
        }
        req.params[paramName] = id;
        next();
    };
}

module.exports = {
    ValidationError,
    validate,
    rules,
    schemas,
    validateBody,
    validateQuery,
    validateId
};
