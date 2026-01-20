const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireUser, hashPassword } = require('../middleware/auth');
const { validateBody, validateId } = require('../middleware/validation');
const { parsePagination, paginationResponse } = require('../utils/helpers');

// All routes require user authentication
router.use(requireUser);

// List all clients
router.get('/', async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const status = req.query.status || 'all';
        const search = req.query.search || '';

        let whereClause = '';
        const params = [];
        let paramCount = 0;

        if (status !== 'all') {
            paramCount++;
            whereClause += `WHERE c.status = $${paramCount}`;
            params.push(status);
        }

        if (search) {
            paramCount++;
            const searchCondition = `(c.name ILIKE $${paramCount} OR c.contact_name ILIKE $${paramCount} OR c.email ILIKE $${paramCount})`;
            whereClause += whereClause ? ` AND ${searchCondition}` : `WHERE ${searchCondition}`;
            params.push(`%${search}%`);
        }

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) FROM clients ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Get clients with stats
        const result = await db.query(
            `SELECT
                c.id,
                c.name,
                c.contact_name,
                c.email,
                c.phone,
                c.hourly_rate,
                c.status,
                c.created_at,
                COALESCE(SUM(CASE WHEN te.invoiced = false AND te.billable = true THEN te.duration ELSE 0 END), 0) as unbilled_hours,
                COUNT(DISTINCT p.id) as project_count
             FROM clients c
             LEFT JOIN time_entries te ON c.id = te.client_id
             LEFT JOIN projects p ON c.id = p.client_id AND p.status = 'active'
             ${whereClause}
             GROUP BY c.id
             ORDER BY c.name
             LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
            [...params, limit, offset]
        );

        const clients = result.rows.map(row => ({
            ...row,
            hourly_rate: parseFloat(row.hourly_rate),
            unbilled_hours: parseFloat(row.unbilled_hours)
        }));

        res.json(paginationResponse(clients, total, { page, limit }));
    } catch (err) {
        console.error('List clients error:', err);
        res.status(500).json({ error: 'Failed to load clients' });
    }
});

// Get single client
router.get('/:id', validateId(), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                c.*,
                COALESCE(SUM(CASE WHEN te.invoiced = false AND te.billable = true THEN te.duration ELSE 0 END), 0) as unbilled_hours,
                COALESCE(SUM(CASE WHEN te.invoiced = false AND te.billable = true
                    THEN te.duration * COALESCE(p.hourly_rate, c.hourly_rate, 0)
                    ELSE 0 END), 0) as unbilled_amount,
                COUNT(DISTINCT te.id) as total_entries,
                COUNT(DISTINCT p.id) as total_projects
             FROM clients c
             LEFT JOIN time_entries te ON c.id = te.client_id
             LEFT JOIN projects p ON c.id = p.client_id
             WHERE c.id = $1
             GROUP BY c.id`,
            [req.params.id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Client not found' });
        }

        const client = result.rows[0];

        // Remove password hash from response
        delete client.password_hash;

        res.json({
            ...client,
            hourly_rate: parseFloat(client.hourly_rate),
            unbilled_hours: parseFloat(client.unbilled_hours),
            unbilled_amount: parseFloat(client.unbilled_amount)
        });
    } catch (err) {
        console.error('Get client error:', err);
        res.status(500).json({ error: 'Failed to load client' });
    }
});

// Create client
router.post('/', validateBody('client'), async (req, res) => {
    try {
        const {
            name,
            contact_name,
            email,
            password,
            phone,
            address,
            hourly_rate,
            status
        } = req.body;

        // Check if email already exists
        const existing = await db.query(
            'SELECT id FROM clients WHERE email = $1',
            [email.toLowerCase()]
        );

        if (existing.rows.length > 0) {
            return res.status(400).json({ error: 'A client with this email already exists' });
        }

        // Hash password
        const passwordHash = await hashPassword(password);

        const result = await db.query(
            `INSERT INTO clients (name, contact_name, email, password_hash, phone, address, hourly_rate, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
             RETURNING id, name, contact_name, email, phone, address, hourly_rate, status, created_at`,
            [
                name,
                contact_name || null,
                email.toLowerCase(),
                passwordHash,
                phone || null,
                address || null,
                hourly_rate || 0,
                status || 'active'
            ]
        );

        res.status(201).json({
            ...result.rows[0],
            hourly_rate: parseFloat(result.rows[0].hourly_rate)
        });
    } catch (err) {
        console.error('Create client error:', err);
        res.status(500).json({ error: 'Failed to create client' });
    }
});

// Update client
router.put('/:id', validateId(), validateBody('clientUpdate'), async (req, res) => {
    try {
        const {
            name,
            contact_name,
            email,
            password,
            phone,
            address,
            hourly_rate,
            status
        } = req.body;

        // Check if client exists
        const existing = await db.query(
            'SELECT id FROM clients WHERE id = $1',
            [req.params.id]
        );

        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'Client not found' });
        }

        // Check if new email conflicts with another client
        if (email) {
            const emailCheck = await db.query(
                'SELECT id FROM clients WHERE email = $1 AND id != $2',
                [email.toLowerCase(), req.params.id]
            );

            if (emailCheck.rows.length > 0) {
                return res.status(400).json({ error: 'A client with this email already exists' });
            }
        }

        // Build update query dynamically
        const updates = [];
        const values = [];
        let paramCount = 0;

        if (name !== undefined) {
            paramCount++;
            updates.push(`name = $${paramCount}`);
            values.push(name);
        }
        if (contact_name !== undefined) {
            paramCount++;
            updates.push(`contact_name = $${paramCount}`);
            values.push(contact_name || null);
        }
        if (email !== undefined) {
            paramCount++;
            updates.push(`email = $${paramCount}`);
            values.push(email.toLowerCase());
        }
        if (password !== undefined && password.length >= 6) {
            paramCount++;
            updates.push(`password_hash = $${paramCount}`);
            values.push(await hashPassword(password));
        }
        if (phone !== undefined) {
            paramCount++;
            updates.push(`phone = $${paramCount}`);
            values.push(phone || null);
        }
        if (address !== undefined) {
            paramCount++;
            updates.push(`address = $${paramCount}`);
            values.push(address || null);
        }
        if (hourly_rate !== undefined) {
            paramCount++;
            updates.push(`hourly_rate = $${paramCount}`);
            values.push(hourly_rate);
        }
        if (status !== undefined) {
            paramCount++;
            updates.push(`status = $${paramCount}`);
            values.push(status);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        paramCount++;
        values.push(req.params.id);

        const result = await db.query(
            `UPDATE clients SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING id, name, contact_name, email, phone, address, hourly_rate, status, created_at, updated_at`,
            values
        );

        res.json({
            ...result.rows[0],
            hourly_rate: parseFloat(result.rows[0].hourly_rate)
        });
    } catch (err) {
        console.error('Update client error:', err);
        res.status(500).json({ error: 'Failed to update client' });
    }
});

// Archive/delete client (soft delete by setting status to inactive)
router.delete('/:id', validateId(), async (req, res) => {
    try {
        // Check if client has any invoices
        const invoiceCheck = await db.query(
            'SELECT COUNT(*) FROM invoices WHERE client_id = $1',
            [req.params.id]
        );

        if (parseInt(invoiceCheck.rows[0].count, 10) > 0) {
            // Soft delete - set to inactive
            await db.query(
                "UPDATE clients SET status = 'inactive' WHERE id = $1",
                [req.params.id]
            );
            return res.json({ success: true, archived: true });
        }

        // Hard delete if no invoices
        const result = await db.query(
            'DELETE FROM clients WHERE id = $1 RETURNING id',
            [req.params.id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Client not found' });
        }

        res.json({ success: true, deleted: true });
    } catch (err) {
        console.error('Delete client error:', err);
        res.status(500).json({ error: 'Failed to delete client' });
    }
});

// Get client's time entries
router.get('/:id/entries', validateId(), async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const invoiced = req.query.invoiced; // 'true', 'false', or undefined (all)

        let whereClause = 'WHERE te.client_id = $1';
        const params = [req.params.id];

        if (invoiced !== undefined) {
            params.push(invoiced === 'true');
            whereClause += ` AND te.invoiced = $${params.length}`;
        }

        const countResult = await db.query(
            `SELECT COUNT(*) FROM time_entries te ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await db.query(
            `SELECT
                te.*,
                p.name as project_name,
                (SELECT COUNT(*) FROM resources WHERE time_entry_id = te.id) as resource_count
             FROM time_entries te
             LEFT JOIN projects p ON te.project_id = p.id
             ${whereClause}
             ORDER BY te.date DESC, te.created_at DESC
             LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
            [...params, limit, offset]
        );

        res.json(paginationResponse(result.rows, total, { page, limit }));
    } catch (err) {
        console.error('Get client entries error:', err);
        res.status(500).json({ error: 'Failed to load client entries' });
    }
});

// Get client's projects
router.get('/:id/projects', validateId(), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                p.*,
                COALESCE(SUM(CASE WHEN te.invoiced = false THEN te.duration ELSE 0 END), 0) as unbilled_hours,
                COALESCE(SUM(te.duration), 0) as total_hours
             FROM projects p
             LEFT JOIN time_entries te ON p.id = te.project_id
             WHERE p.client_id = $1
             GROUP BY p.id
             ORDER BY p.status, p.name`,
            [req.params.id]
        );

        res.json(result.rows.map(row => ({
            ...row,
            hourly_rate: row.hourly_rate ? parseFloat(row.hourly_rate) : null,
            unbilled_hours: parseFloat(row.unbilled_hours),
            total_hours: parseFloat(row.total_hours)
        })));
    } catch (err) {
        console.error('Get client projects error:', err);
        res.status(500).json({ error: 'Failed to load client projects' });
    }
});

// Get client's invoices
router.get('/:id/invoices', validateId(), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                i.*,
                (SELECT COUNT(*) FROM time_entries WHERE invoice_id = i.id) as entry_count
             FROM invoices i
             WHERE i.client_id = $1
             ORDER BY i.date_issued DESC`,
            [req.params.id]
        );

        res.json(result.rows.map(row => ({
            ...row,
            subtotal: parseFloat(row.subtotal),
            tax_rate: parseFloat(row.tax_rate),
            tax_amount: parseFloat(row.tax_amount),
            total: parseFloat(row.total)
        })));
    } catch (err) {
        console.error('Get client invoices error:', err);
        res.status(500).json({ error: 'Failed to load client invoices' });
    }
});

module.exports = router;
