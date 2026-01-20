const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireClient } = require('../middleware/auth');
const { parsePagination, paginationResponse, formatDateInput, getStartOfMonth } = require('../utils/helpers');

// Authentication routes are in auth.js
// This file handles client portal data routes

// All data routes require client authentication
router.use('/dashboard', requireClient);
router.use('/time-entries', requireClient);
router.use('/invoices', requireClient);
router.use('/projects', requireClient);

// Client dashboard stats
router.get('/dashboard/stats', async (req, res) => {
    try {
        const clientId = req.clientId;
        const monthStart = formatDateInput(getStartOfMonth());

        const [monthHours, unbilledHours, projectHours] = await Promise.all([
            // This month's hours
            db.query(
                `SELECT COALESCE(SUM(duration), 0) as hours
                 FROM time_entries
                 WHERE client_id = $1 AND date >= $2 AND billable = true`,
                [clientId, monthStart]
            ),

            // Unbilled hours
            db.query(
                `SELECT COALESCE(SUM(duration), 0) as hours
                 FROM time_entries
                 WHERE client_id = $1 AND invoiced = false AND billable = true`,
                [clientId]
            ),

            // Hours by project this month
            db.query(
                `SELECT
                    COALESCE(p.name, 'Loose Hours') as name,
                    COALESCE(SUM(te.duration), 0) as hours
                 FROM time_entries te
                 LEFT JOIN projects p ON te.project_id = p.id
                 WHERE te.client_id = $1 AND te.date >= $2 AND te.billable = true
                 GROUP BY p.id, p.name
                 ORDER BY hours DESC`,
                [clientId, monthStart]
            )
        ]);

        res.json({
            month_hours: parseFloat(monthHours.rows[0].hours),
            unbilled_hours: parseFloat(unbilledHours.rows[0].hours),
            hours_by_project: projectHours.rows.map(r => ({
                name: r.name,
                hours: parseFloat(r.hours)
            }))
        });
    } catch (err) {
        console.error('Client dashboard stats error:', err);
        res.status(500).json({ error: 'Failed to load dashboard statistics' });
    }
});

// Client timeline view
router.get('/dashboard/timeline', async (req, res) => {
    try {
        const clientId = req.clientId;
        const { date_from, date_to } = req.query;

        // Default to last 30 days
        const endDate = date_to || formatDateInput(new Date());
        const startDate = date_from || formatDateInput(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));

        const result = await db.query(
            `SELECT
                te.date,
                COALESCE(SUM(te.duration), 0) as total_hours,
                COUNT(te.id) as entry_count,
                JSON_AGG(JSON_BUILD_OBJECT(
                    'id', te.id,
                    'duration', te.duration,
                    'title', te.title,
                    'project', p.name
                ) ORDER BY te.start_time NULLS LAST) as entries
             FROM time_entries te
             LEFT JOIN projects p ON te.project_id = p.id
             WHERE te.client_id = $1
               AND te.date >= $2
               AND te.date <= $3
               AND te.billable = true
             GROUP BY te.date
             ORDER BY te.date DESC`,
            [clientId, startDate, endDate]
        );

        res.json(result.rows.map(row => ({
            date: row.date,
            total_hours: parseFloat(row.total_hours),
            entry_count: parseInt(row.entry_count, 10),
            entries: row.entries.map(e => ({
                ...e,
                duration: parseFloat(e.duration)
            }))
        })));
    } catch (err) {
        console.error('Client timeline error:', err);
        res.status(500).json({ error: 'Failed to load timeline' });
    }
});

// List client's time entries (no internal notes)
router.get('/time-entries', async (req, res) => {
    try {
        const clientId = req.clientId;
        const { page, limit, offset } = parsePagination(req.query);
        const { project, date_from, date_to } = req.query;

        let whereClause = 'WHERE te.client_id = $1 AND te.billable = true';
        const params = [clientId];
        let paramCount = 1;

        if (project) {
            paramCount++;
            if (project === 'null' || project === 'none') {
                whereClause += ' AND te.project_id IS NULL';
            } else {
                whereClause += ` AND te.project_id = $${paramCount}`;
                params.push(project);
            }
        }

        if (date_from) {
            paramCount++;
            whereClause += ` AND te.date >= $${paramCount}`;
            params.push(date_from);
        }

        if (date_to) {
            paramCount++;
            whereClause += ` AND te.date <= $${paramCount}`;
            params.push(date_to);
        }

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) FROM time_entries te ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Get entries without internal notes
        const result = await db.query(
            `SELECT
                te.id,
                te.date,
                te.start_time,
                te.duration,
                te.title,
                te.description,
                te.invoiced,
                te.created_at,
                p.name as project_name,
                (SELECT COUNT(*) FROM resources WHERE time_entry_id = te.id) as resource_count
             FROM time_entries te
             LEFT JOIN projects p ON te.project_id = p.id
             ${whereClause}
             ORDER BY te.date DESC, te.start_time DESC NULLS LAST, te.created_at DESC
             LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
            [...params, limit, offset]
        );

        const entries = result.rows.map(row => ({
            ...row,
            duration: parseFloat(row.duration)
        }));

        res.json(paginationResponse(entries, total, { page, limit }));
    } catch (err) {
        console.error('Client time entries error:', err);
        res.status(500).json({ error: 'Failed to load time entries' });
    }
});

// Get single time entry (no internal notes)
router.get('/time-entries/:id', async (req, res) => {
    try {
        const entryId = parseInt(req.params.id, 10);
        if (isNaN(entryId)) {
            return res.status(400).json({ error: 'Invalid entry ID' });
        }

        const result = await db.query(
            `SELECT
                te.id,
                te.date,
                te.start_time,
                te.duration,
                te.title,
                te.description,
                te.invoiced,
                te.created_at,
                p.name as project_name
             FROM time_entries te
             LEFT JOIN projects p ON te.project_id = p.id
             WHERE te.id = $1 AND te.client_id = $2`,
            [entryId, req.clientId]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Time entry not found' });
        }

        // Get resources
        const resources = await db.query(
            'SELECT id, type, name, url, created_at FROM resources WHERE time_entry_id = $1 ORDER BY created_at',
            [entryId]
        );

        res.json({
            ...result.rows[0],
            duration: parseFloat(result.rows[0].duration),
            resources: resources.rows
        });
    } catch (err) {
        console.error('Client get entry error:', err);
        res.status(500).json({ error: 'Failed to load time entry' });
    }
});

// List client's projects
router.get('/projects', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                p.id,
                p.name,
                p.description,
                p.status,
                COALESCE(SUM(te.duration), 0) as total_hours,
                COALESCE(SUM(CASE WHEN te.invoiced = false THEN te.duration ELSE 0 END), 0) as unbilled_hours
             FROM projects p
             LEFT JOIN time_entries te ON p.id = te.project_id AND te.billable = true
             WHERE p.client_id = $1
             GROUP BY p.id
             ORDER BY p.status, p.name`,
            [req.clientId]
        );

        res.json(result.rows.map(row => ({
            ...row,
            total_hours: parseFloat(row.total_hours),
            unbilled_hours: parseFloat(row.unbilled_hours)
        })));
    } catch (err) {
        console.error('Client projects error:', err);
        res.status(500).json({ error: 'Failed to load projects' });
    }
});

// List client's invoices
router.get('/invoices', async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req.query);

        const countResult = await db.query(
            "SELECT COUNT(*) FROM invoices WHERE client_id = $1 AND status != 'draft'",
            [req.clientId]
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await db.query(
            `SELECT
                id,
                invoice_number,
                date_issued,
                date_due,
                total,
                status
             FROM invoices
             WHERE client_id = $1 AND status != 'draft'
             ORDER BY date_issued DESC
             LIMIT $2 OFFSET $3`,
            [req.clientId, limit, offset]
        );

        res.json(paginationResponse(
            result.rows.map(row => ({
                ...row,
                total: parseFloat(row.total)
            })),
            total,
            { page, limit }
        ));
    } catch (err) {
        console.error('Client invoices error:', err);
        res.status(500).json({ error: 'Failed to load invoices' });
    }
});

// Get single invoice (only if sent or paid)
router.get('/invoices/:id', async (req, res) => {
    try {
        const invoiceId = parseInt(req.params.id, 10);
        if (isNaN(invoiceId)) {
            return res.status(400).json({ error: 'Invalid invoice ID' });
        }

        const result = await db.query(
            `SELECT
                id,
                invoice_number,
                date_issued,
                date_due,
                subtotal,
                tax_rate,
                tax_amount,
                total,
                status,
                notes
             FROM invoices
             WHERE id = $1 AND client_id = $2 AND status != 'draft'`,
            [invoiceId, req.clientId]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Get time entries (without internal notes or rates)
        const entries = await db.query(
            `SELECT
                te.date,
                te.duration,
                te.title,
                te.description,
                p.name as project_name
             FROM time_entries te
             LEFT JOIN projects p ON te.project_id = p.id
             WHERE te.invoice_id = $1
             ORDER BY te.date, te.created_at`,
            [invoiceId]
        );

        // Get manual line items (no rate details, just description and amount)
        const items = await db.query(
            'SELECT description, amount FROM invoice_items WHERE invoice_id = $1 ORDER BY id',
            [invoiceId]
        );

        const invoice = result.rows[0];

        res.json({
            ...invoice,
            subtotal: parseFloat(invoice.subtotal),
            tax_rate: parseFloat(invoice.tax_rate),
            tax_amount: parseFloat(invoice.tax_amount),
            total: parseFloat(invoice.total),
            time_entries: entries.rows.map(e => ({
                ...e,
                duration: parseFloat(e.duration)
            })),
            items: items.rows.map(i => ({
                ...i,
                amount: parseFloat(i.amount)
            }))
        });
    } catch (err) {
        console.error('Client get invoice error:', err);
        res.status(500).json({ error: 'Failed to load invoice' });
    }
});

// Export time entries as CSV
router.get('/time-entries/export', async (req, res) => {
    try {
        const clientId = req.clientId;
        const { date_from, date_to, project } = req.query;

        let whereClause = 'WHERE te.client_id = $1 AND te.billable = true';
        const params = [clientId];
        let paramCount = 1;

        if (project) {
            paramCount++;
            if (project === 'null' || project === 'none') {
                whereClause += ' AND te.project_id IS NULL';
            } else {
                whereClause += ` AND te.project_id = $${paramCount}`;
                params.push(project);
            }
        }

        if (date_from) {
            paramCount++;
            whereClause += ` AND te.date >= $${paramCount}`;
            params.push(date_from);
        }

        if (date_to) {
            paramCount++;
            whereClause += ` AND te.date <= $${paramCount}`;
            params.push(date_to);
        }

        const result = await db.query(
            `SELECT
                te.date,
                te.duration,
                te.title,
                te.description,
                COALESCE(p.name, 'Loose Hours') as project_name,
                CASE WHEN te.invoiced THEN 'Yes' ELSE 'No' END as invoiced
             FROM time_entries te
             LEFT JOIN projects p ON te.project_id = p.id
             ${whereClause}
             ORDER BY te.date DESC, te.created_at DESC`,
            params
        );

        // Build CSV
        const headers = ['Date', 'Duration (hrs)', 'Title', 'Description', 'Project', 'Invoiced'];
        const csvRows = [headers.join(',')];

        for (const row of result.rows) {
            const values = [
                row.date,
                row.duration,
                `"${(row.title || '').replace(/"/g, '""')}"`,
                `"${(row.description || '').replace(/"/g, '""')}"`,
                `"${(row.project_name || '').replace(/"/g, '""')}"`,
                row.invoiced
            ];
            csvRows.push(values.join(','));
        }

        const csv = csvRows.join('\n');

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=time-entries-${formatDateInput(new Date())}.csv`);
        res.send(csv);
    } catch (err) {
        console.error('Export CSV error:', err);
        res.status(500).json({ error: 'Failed to export time entries' });
    }
});

module.exports = router;
