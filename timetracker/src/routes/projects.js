const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireUser } = require('../middleware/auth');
const { validateBody, validateId } = require('../middleware/validation');
const { parsePagination, paginationResponse } = require('../utils/helpers');

// All routes require user authentication
router.use(requireUser);

// List all projects
router.get('/', async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const clientId = req.query.client;
        const status = req.query.status || 'all';

        let whereClause = '';
        const params = [];
        let paramCount = 0;

        if (clientId) {
            paramCount++;
            whereClause = `WHERE p.client_id = $${paramCount}`;
            params.push(clientId);
        }

        if (status !== 'all') {
            paramCount++;
            const statusCondition = `p.status = $${paramCount}`;
            whereClause += whereClause ? ` AND ${statusCondition}` : `WHERE ${statusCondition}`;
            params.push(status);
        }

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) FROM projects p ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Get projects with stats
        const result = await db.query(
            `SELECT
                p.id,
                p.client_id,
                p.name,
                p.description,
                p.hourly_rate,
                p.status,
                p.created_at,
                c.name as client_name,
                c.hourly_rate as client_hourly_rate,
                COALESCE(SUM(CASE WHEN te.invoiced = false AND te.billable = true THEN te.duration ELSE 0 END), 0) as unbilled_hours,
                COALESCE(SUM(te.duration), 0) as total_hours,
                COUNT(DISTINCT te.id) as entry_count
             FROM projects p
             JOIN clients c ON p.client_id = c.id
             LEFT JOIN time_entries te ON p.id = te.project_id
             ${whereClause}
             GROUP BY p.id, c.name, c.hourly_rate
             ORDER BY p.status, p.name
             LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
            [...params, limit, offset]
        );

        const projects = result.rows.map(row => ({
            ...row,
            hourly_rate: row.hourly_rate ? parseFloat(row.hourly_rate) : null,
            client_hourly_rate: parseFloat(row.client_hourly_rate),
            effective_rate: parseFloat(row.hourly_rate || row.client_hourly_rate),
            unbilled_hours: parseFloat(row.unbilled_hours),
            total_hours: parseFloat(row.total_hours)
        }));

        res.json(paginationResponse(projects, total, { page, limit }));
    } catch (err) {
        console.error('List projects error:', err);
        res.status(500).json({ error: 'Failed to load projects' });
    }
});

// Get single project
router.get('/:id', validateId(), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                p.*,
                c.name as client_name,
                c.hourly_rate as client_hourly_rate,
                COALESCE(SUM(CASE WHEN te.invoiced = false AND te.billable = true THEN te.duration ELSE 0 END), 0) as unbilled_hours,
                COALESCE(SUM(CASE WHEN te.invoiced = false AND te.billable = true
                    THEN te.duration * COALESCE(p.hourly_rate, c.hourly_rate, 0)
                    ELSE 0 END), 0) as unbilled_amount,
                COALESCE(SUM(te.duration), 0) as total_hours,
                COUNT(DISTINCT te.id) as entry_count
             FROM projects p
             JOIN clients c ON p.client_id = c.id
             LEFT JOIN time_entries te ON p.id = te.project_id
             WHERE p.id = $1
             GROUP BY p.id, c.name, c.hourly_rate`,
            [req.params.id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Project not found' });
        }

        const project = result.rows[0];

        res.json({
            ...project,
            hourly_rate: project.hourly_rate ? parseFloat(project.hourly_rate) : null,
            client_hourly_rate: parseFloat(project.client_hourly_rate),
            effective_rate: parseFloat(project.hourly_rate || project.client_hourly_rate),
            unbilled_hours: parseFloat(project.unbilled_hours),
            unbilled_amount: parseFloat(project.unbilled_amount),
            total_hours: parseFloat(project.total_hours)
        });
    } catch (err) {
        console.error('Get project error:', err);
        res.status(500).json({ error: 'Failed to load project' });
    }
});

// Create project
router.post('/', validateBody('project'), async (req, res) => {
    try {
        const { client_id, name, description, hourly_rate, status } = req.body;

        // Check if client exists
        const clientCheck = await db.query(
            'SELECT id FROM clients WHERE id = $1',
            [client_id]
        );

        if (!clientCheck.rows[0]) {
            return res.status(400).json({ error: 'Client not found' });
        }

        const result = await db.query(
            `INSERT INTO projects (client_id, name, description, hourly_rate, status)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [
                client_id,
                name,
                description || null,
                hourly_rate || null,
                status || 'active'
            ]
        );

        // Get client name for response
        const client = await db.query(
            'SELECT name FROM clients WHERE id = $1',
            [client_id]
        );

        res.status(201).json({
            ...result.rows[0],
            hourly_rate: result.rows[0].hourly_rate ? parseFloat(result.rows[0].hourly_rate) : null,
            client_name: client.rows[0].name
        });
    } catch (err) {
        console.error('Create project error:', err);
        res.status(500).json({ error: 'Failed to create project' });
    }
});

// Update project
router.put('/:id', validateId(), validateBody('projectUpdate'), async (req, res) => {
    try {
        const { name, description, hourly_rate, status } = req.body;

        // Check if project exists
        const existing = await db.query(
            'SELECT id FROM projects WHERE id = $1',
            [req.params.id]
        );

        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'Project not found' });
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
        if (description !== undefined) {
            paramCount++;
            updates.push(`description = $${paramCount}`);
            values.push(description || null);
        }
        if (hourly_rate !== undefined) {
            paramCount++;
            updates.push(`hourly_rate = $${paramCount}`);
            values.push(hourly_rate || null);
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
            `UPDATE projects SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING *`,
            values
        );

        // Get full project with client info
        const fullProject = await db.query(
            `SELECT p.*, c.name as client_name, c.hourly_rate as client_hourly_rate
             FROM projects p
             JOIN clients c ON p.client_id = c.id
             WHERE p.id = $1`,
            [req.params.id]
        );

        res.json({
            ...fullProject.rows[0],
            hourly_rate: fullProject.rows[0].hourly_rate ? parseFloat(fullProject.rows[0].hourly_rate) : null,
            client_hourly_rate: parseFloat(fullProject.rows[0].client_hourly_rate),
            effective_rate: parseFloat(fullProject.rows[0].hourly_rate || fullProject.rows[0].client_hourly_rate)
        });
    } catch (err) {
        console.error('Update project error:', err);
        res.status(500).json({ error: 'Failed to update project' });
    }
});

// Delete project
router.delete('/:id', validateId(), async (req, res) => {
    try {
        // Check if project has any invoiced entries
        const invoicedCheck = await db.query(
            'SELECT COUNT(*) FROM time_entries WHERE project_id = $1 AND invoiced = true',
            [req.params.id]
        );

        if (parseInt(invoicedCheck.rows[0].count, 10) > 0) {
            // Cannot delete, mark as completed instead
            await db.query(
                "UPDATE projects SET status = 'completed' WHERE id = $1",
                [req.params.id]
            );
            return res.json({ success: true, archived: true, message: 'Project has invoiced entries, marked as completed instead' });
        }

        // Delete the project (time entries will have project_id set to NULL)
        const result = await db.query(
            'DELETE FROM projects WHERE id = $1 RETURNING id',
            [req.params.id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Project not found' });
        }

        res.json({ success: true, deleted: true });
    } catch (err) {
        console.error('Delete project error:', err);
        res.status(500).json({ error: 'Failed to delete project' });
    }
});

// Get project's time entries
router.get('/:id/entries', validateId(), async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req.query);

        const countResult = await db.query(
            'SELECT COUNT(*) FROM time_entries WHERE project_id = $1',
            [req.params.id]
        );
        const total = parseInt(countResult.rows[0].count, 10);

        const result = await db.query(
            `SELECT
                te.*,
                (SELECT COUNT(*) FROM resources WHERE time_entry_id = te.id) as resource_count
             FROM time_entries te
             WHERE te.project_id = $1
             ORDER BY te.date DESC, te.created_at DESC
             LIMIT $2 OFFSET $3`,
            [req.params.id, limit, offset]
        );

        res.json(paginationResponse(result.rows, total, { page, limit }));
    } catch (err) {
        console.error('Get project entries error:', err);
        res.status(500).json({ error: 'Failed to load project entries' });
    }
});

module.exports = router;
