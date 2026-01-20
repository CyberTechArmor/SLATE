const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireUser } = require('../middleware/auth');
const { validateBody, validateId } = require('../middleware/validation');
const { parsePagination, paginationResponse, roundToTenth } = require('../utils/helpers');
const { events } = require('../websocket/handler');

// All routes require user authentication
router.use(requireUser);

// List time entries with filters
router.get('/', async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const {
            client,
            project,
            invoiced,
            billable,
            date_from,
            date_to,
            search
        } = req.query;

        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramCount = 0;

        if (client) {
            paramCount++;
            whereClause += ` AND te.client_id = $${paramCount}`;
            params.push(client);
        }

        if (project) {
            paramCount++;
            if (project === 'null' || project === 'none') {
                whereClause += ' AND te.project_id IS NULL';
            } else {
                whereClause += ` AND te.project_id = $${paramCount}`;
                params.push(project);
            }
        }

        if (invoiced !== undefined) {
            paramCount++;
            whereClause += ` AND te.invoiced = $${paramCount}`;
            params.push(invoiced === 'true');
        }

        if (billable !== undefined) {
            paramCount++;
            whereClause += ` AND te.billable = $${paramCount}`;
            params.push(billable === 'true');
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

        if (search) {
            paramCount++;
            whereClause += ` AND (te.title ILIKE $${paramCount} OR te.description ILIKE $${paramCount})`;
            params.push(`%${search}%`);
        }

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) FROM time_entries te ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Get entries with related data
        const result = await db.query(
            `SELECT
                te.id,
                te.client_id,
                te.project_id,
                te.date,
                te.start_time,
                te.duration,
                te.title,
                te.description,
                te.internal_notes,
                te.billable,
                te.invoiced,
                te.invoice_id,
                te.created_at,
                te.updated_at,
                c.name as client_name,
                p.name as project_name,
                COALESCE(p.hourly_rate, c.hourly_rate, 0) as effective_rate,
                (SELECT COUNT(*) FROM resources WHERE time_entry_id = te.id) as resource_count
             FROM time_entries te
             LEFT JOIN clients c ON te.client_id = c.id
             LEFT JOIN projects p ON te.project_id = p.id
             ${whereClause}
             ORDER BY te.date DESC, te.start_time DESC NULLS LAST, te.created_at DESC
             LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
            [...params, limit, offset]
        );

        const entries = result.rows.map(row => ({
            ...row,
            duration: parseFloat(row.duration),
            effective_rate: parseFloat(row.effective_rate)
        }));

        res.json(paginationResponse(entries, total, { page, limit }));
    } catch (err) {
        console.error('List time entries error:', err);
        res.status(500).json({ error: 'Failed to load time entries' });
    }
});

// Get single time entry
router.get('/:id', validateId(), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                te.*,
                c.name as client_name,
                c.hourly_rate as client_hourly_rate,
                p.name as project_name,
                p.hourly_rate as project_hourly_rate,
                COALESCE(p.hourly_rate, c.hourly_rate, 0) as effective_rate
             FROM time_entries te
             LEFT JOIN clients c ON te.client_id = c.id
             LEFT JOIN projects p ON te.project_id = p.id
             WHERE te.id = $1`,
            [req.params.id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Time entry not found' });
        }

        // Get resources
        const resources = await db.query(
            'SELECT * FROM resources WHERE time_entry_id = $1 ORDER BY created_at',
            [req.params.id]
        );

        const entry = result.rows[0];

        res.json({
            ...entry,
            duration: parseFloat(entry.duration),
            effective_rate: parseFloat(entry.effective_rate),
            client_hourly_rate: parseFloat(entry.client_hourly_rate),
            project_hourly_rate: entry.project_hourly_rate ? parseFloat(entry.project_hourly_rate) : null,
            resources: resources.rows
        });
    } catch (err) {
        console.error('Get time entry error:', err);
        res.status(500).json({ error: 'Failed to load time entry' });
    }
});

// Create time entry
router.post('/', validateBody('timeEntry'), async (req, res) => {
    try {
        const {
            client_id,
            project_id,
            date,
            start_time,
            duration,
            title,
            description,
            internal_notes,
            billable,
            resources
        } = req.body;

        // Validate client exists
        const clientCheck = await db.query(
            'SELECT id FROM clients WHERE id = $1',
            [client_id]
        );

        if (!clientCheck.rows[0]) {
            return res.status(400).json({ error: 'Client not found' });
        }

        // Validate project belongs to client (if provided)
        if (project_id) {
            const projectCheck = await db.query(
                'SELECT id FROM projects WHERE id = $1 AND client_id = $2',
                [project_id, client_id]
            );

            if (!projectCheck.rows[0]) {
                return res.status(400).json({ error: 'Project not found or does not belong to this client' });
            }
        }

        // Round duration to nearest 0.1
        const roundedDuration = roundToTenth(parseFloat(duration));

        // Insert time entry
        const result = await db.query(
            `INSERT INTO time_entries (
                client_id, project_id, date, start_time, duration,
                title, description, internal_notes, billable
             )
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
             RETURNING *`,
            [
                client_id,
                project_id || null,
                date,
                start_time || null,
                roundedDuration,
                title,
                description || null,
                internal_notes || null,
                billable !== false
            ]
        );

        const entry = result.rows[0];

        // Insert resources if provided
        if (resources && Array.isArray(resources) && resources.length > 0) {
            for (const resource of resources) {
                if (resource.name && resource.type && resource.url) {
                    await db.query(
                        'INSERT INTO resources (time_entry_id, type, name, url) VALUES ($1, $2, $3, $4)',
                        [entry.id, resource.type, resource.name, resource.url]
                    );
                }
            }
        }

        // Get full entry with relations
        const fullEntry = await db.query(
            `SELECT
                te.*,
                c.name as client_name,
                p.name as project_name,
                COALESCE(p.hourly_rate, c.hourly_rate, 0) as effective_rate,
                (SELECT COUNT(*) FROM resources WHERE time_entry_id = te.id) as resource_count
             FROM time_entries te
             LEFT JOIN clients c ON te.client_id = c.id
             LEFT JOIN projects p ON te.project_id = p.id
             WHERE te.id = $1`,
            [entry.id]
        );

        // Broadcast WebSocket event
        events.timeEntryCreated(fullEntry.rows[0], client_id);

        res.status(201).json({
            ...fullEntry.rows[0],
            duration: parseFloat(fullEntry.rows[0].duration),
            effective_rate: parseFloat(fullEntry.rows[0].effective_rate)
        });
    } catch (err) {
        console.error('Create time entry error:', err);
        res.status(500).json({ error: 'Failed to create time entry' });
    }
});

// Update time entry
router.put('/:id', validateId(), validateBody('timeEntryUpdate'), async (req, res) => {
    try {
        // Check if entry exists and is not invoiced
        const existing = await db.query(
            'SELECT * FROM time_entries WHERE id = $1',
            [req.params.id]
        );

        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'Time entry not found' });
        }

        if (existing.rows[0].invoiced) {
            return res.status(400).json({
                error: 'Cannot edit invoiced time entry',
                invoiced: true
            });
        }

        const {
            project_id,
            date,
            start_time,
            duration,
            title,
            description,
            internal_notes,
            billable
        } = req.body;

        // Validate project belongs to client (if provided)
        if (project_id !== undefined && project_id !== null) {
            const projectCheck = await db.query(
                'SELECT id FROM projects WHERE id = $1 AND client_id = $2',
                [project_id, existing.rows[0].client_id]
            );

            if (!projectCheck.rows[0]) {
                return res.status(400).json({ error: 'Project not found or does not belong to this client' });
            }
        }

        // Build update query
        const updates = [];
        const values = [];
        let paramCount = 0;

        if (project_id !== undefined) {
            paramCount++;
            updates.push(`project_id = $${paramCount}`);
            values.push(project_id || null);
        }
        if (date !== undefined) {
            paramCount++;
            updates.push(`date = $${paramCount}`);
            values.push(date);
        }
        if (start_time !== undefined) {
            paramCount++;
            updates.push(`start_time = $${paramCount}`);
            values.push(start_time || null);
        }
        if (duration !== undefined) {
            paramCount++;
            updates.push(`duration = $${paramCount}`);
            values.push(roundToTenth(parseFloat(duration)));
        }
        if (title !== undefined) {
            paramCount++;
            updates.push(`title = $${paramCount}`);
            values.push(title);
        }
        if (description !== undefined) {
            paramCount++;
            updates.push(`description = $${paramCount}`);
            values.push(description || null);
        }
        if (internal_notes !== undefined) {
            paramCount++;
            updates.push(`internal_notes = $${paramCount}`);
            values.push(internal_notes || null);
        }
        if (billable !== undefined) {
            paramCount++;
            updates.push(`billable = $${paramCount}`);
            values.push(billable);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        paramCount++;
        values.push(req.params.id);

        await db.query(
            `UPDATE time_entries SET ${updates.join(', ')}
             WHERE id = $${paramCount}`,
            values
        );

        // Get full updated entry
        const fullEntry = await db.query(
            `SELECT
                te.*,
                c.name as client_name,
                p.name as project_name,
                COALESCE(p.hourly_rate, c.hourly_rate, 0) as effective_rate,
                (SELECT COUNT(*) FROM resources WHERE time_entry_id = te.id) as resource_count
             FROM time_entries te
             LEFT JOIN clients c ON te.client_id = c.id
             LEFT JOIN projects p ON te.project_id = p.id
             WHERE te.id = $1`,
            [req.params.id]
        );

        // Broadcast WebSocket event
        events.timeEntryUpdated(fullEntry.rows[0], existing.rows[0].client_id);

        res.json({
            ...fullEntry.rows[0],
            duration: parseFloat(fullEntry.rows[0].duration),
            effective_rate: parseFloat(fullEntry.rows[0].effective_rate)
        });
    } catch (err) {
        console.error('Update time entry error:', err);
        res.status(500).json({ error: 'Failed to update time entry' });
    }
});

// Delete time entry
router.delete('/:id', validateId(), async (req, res) => {
    try {
        // Check if entry exists and is not invoiced
        const existing = await db.query(
            'SELECT * FROM time_entries WHERE id = $1',
            [req.params.id]
        );

        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'Time entry not found' });
        }

        if (existing.rows[0].invoiced) {
            return res.status(400).json({
                error: 'Cannot delete invoiced time entry',
                invoiced: true
            });
        }

        // Delete entry (resources will cascade delete)
        await db.query('DELETE FROM time_entries WHERE id = $1', [req.params.id]);

        // Broadcast WebSocket event
        events.timeEntryDeleted(req.params.id, existing.rows[0].client_id);

        res.json({ success: true });
    } catch (err) {
        console.error('Delete time entry error:', err);
        res.status(500).json({ error: 'Failed to delete time entry' });
    }
});

// Add resource to time entry
router.post('/:id/resources', validateId(), validateBody('resource'), async (req, res) => {
    try {
        // Check if entry exists
        const entry = await db.query(
            'SELECT id, client_id FROM time_entries WHERE id = $1',
            [req.params.id]
        );

        if (!entry.rows[0]) {
            return res.status(404).json({ error: 'Time entry not found' });
        }

        const { type, name, url } = req.body;

        const result = await db.query(
            'INSERT INTO resources (time_entry_id, type, name, url) VALUES ($1, $2, $3, $4) RETURNING *',
            [req.params.id, type, name, url]
        );

        // Broadcast update
        events.timeEntryUpdated({ id: req.params.id }, entry.rows[0].client_id);

        res.status(201).json(result.rows[0]);
    } catch (err) {
        console.error('Add resource error:', err);
        res.status(500).json({ error: 'Failed to add resource' });
    }
});

// Remove resource from time entry
router.delete('/:id/resources/:resourceId', validateId(), async (req, res) => {
    try {
        const resourceId = parseInt(req.params.resourceId, 10);
        if (isNaN(resourceId)) {
            return res.status(400).json({ error: 'Invalid resource ID' });
        }

        // Check if resource belongs to this entry
        const resource = await db.query(
            `SELECT r.id, te.client_id
             FROM resources r
             JOIN time_entries te ON r.time_entry_id = te.id
             WHERE r.id = $1 AND r.time_entry_id = $2`,
            [resourceId, req.params.id]
        );

        if (!resource.rows[0]) {
            return res.status(404).json({ error: 'Resource not found' });
        }

        await db.query('DELETE FROM resources WHERE id = $1', [resourceId]);

        // Broadcast update
        events.timeEntryUpdated({ id: req.params.id }, resource.rows[0].client_id);

        res.json({ success: true });
    } catch (err) {
        console.error('Remove resource error:', err);
        res.status(500).json({ error: 'Failed to remove resource' });
    }
});

// Get resources for time entry
router.get('/:id/resources', validateId(), async (req, res) => {
    try {
        const result = await db.query(
            'SELECT * FROM resources WHERE time_entry_id = $1 ORDER BY created_at',
            [req.params.id]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Get resources error:', err);
        res.status(500).json({ error: 'Failed to load resources' });
    }
});

module.exports = router;
