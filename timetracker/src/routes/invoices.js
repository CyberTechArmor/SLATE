const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireUser } = require('../middleware/auth');
const { validateBody, validateId } = require('../middleware/validation');
const { parsePagination, paginationResponse, withTransaction } = require('../utils/helpers');
const { events } = require('../websocket/handler');

// All routes require user authentication
router.use(requireUser);

// List invoices with filters
router.get('/', async (req, res) => {
    try {
        const { page, limit, offset } = parsePagination(req.query);
        const { client, status, date_from, date_to } = req.query;

        let whereClause = 'WHERE 1=1';
        const params = [];
        let paramCount = 0;

        if (client) {
            paramCount++;
            whereClause += ` AND i.client_id = $${paramCount}`;
            params.push(client);
        }

        if (status) {
            paramCount++;
            whereClause += ` AND i.status = $${paramCount}`;
            params.push(status);
        }

        if (date_from) {
            paramCount++;
            whereClause += ` AND i.date_issued >= $${paramCount}`;
            params.push(date_from);
        }

        if (date_to) {
            paramCount++;
            whereClause += ` AND i.date_issued <= $${paramCount}`;
            params.push(date_to);
        }

        // Get total count
        const countResult = await db.query(
            `SELECT COUNT(*) FROM invoices i ${whereClause}`,
            params
        );
        const total = parseInt(countResult.rows[0].count, 10);

        // Get invoices
        const result = await db.query(
            `SELECT
                i.*,
                c.name as client_name,
                c.email as client_email,
                (SELECT COUNT(*) FROM time_entries WHERE invoice_id = i.id) as entry_count,
                (SELECT COUNT(*) FROM invoice_items WHERE invoice_id = i.id) as item_count
             FROM invoices i
             JOIN clients c ON i.client_id = c.id
             ${whereClause}
             ORDER BY i.date_issued DESC, i.created_at DESC
             LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`,
            [...params, limit, offset]
        );

        const invoices = result.rows.map(row => ({
            ...row,
            subtotal: parseFloat(row.subtotal),
            tax_rate: parseFloat(row.tax_rate),
            tax_amount: parseFloat(row.tax_amount),
            total: parseFloat(row.total)
        }));

        res.json(paginationResponse(invoices, total, { page, limit }));
    } catch (err) {
        console.error('List invoices error:', err);
        res.status(500).json({ error: 'Failed to load invoices' });
    }
});

// Get single invoice with all details
router.get('/:id', validateId(), async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                i.*,
                c.name as client_name,
                c.contact_name as client_contact,
                c.email as client_email,
                c.phone as client_phone,
                c.address as client_address
             FROM invoices i
             JOIN clients c ON i.client_id = c.id
             WHERE i.id = $1`,
            [req.params.id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Get time entries
        const entries = await db.query(
            `SELECT
                te.id,
                te.date,
                te.duration,
                te.title,
                te.description,
                p.name as project_name,
                COALESCE(p.hourly_rate, c.hourly_rate, 0) as rate,
                te.duration * COALESCE(p.hourly_rate, c.hourly_rate, 0) as amount
             FROM time_entries te
             LEFT JOIN projects p ON te.project_id = p.id
             LEFT JOIN clients c ON te.client_id = c.id
             WHERE te.invoice_id = $1
             ORDER BY te.date, te.created_at`,
            [req.params.id]
        );

        // Get manual line items
        const items = await db.query(
            'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id',
            [req.params.id]
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
                duration: parseFloat(e.duration),
                rate: parseFloat(e.rate),
                amount: parseFloat(e.amount)
            })),
            items: items.rows.map(i => ({
                ...i,
                quantity: parseFloat(i.quantity),
                rate: parseFloat(i.rate),
                amount: parseFloat(i.amount)
            }))
        });
    } catch (err) {
        console.error('Get invoice error:', err);
        res.status(500).json({ error: 'Failed to load invoice' });
    }
});

// Create invoice from time entries
router.post('/', validateBody('invoice'), async (req, res) => {
    try {
        const {
            client_id,
            date_issued,
            date_due,
            tax_rate,
            notes,
            time_entry_ids,
            items
        } = req.body;

        // Validate client exists
        const clientCheck = await db.query(
            'SELECT id, hourly_rate FROM clients WHERE id = $1',
            [client_id]
        );

        if (!clientCheck.rows[0]) {
            return res.status(400).json({ error: 'Client not found' });
        }

        // Validate time entries belong to client and are not already invoiced
        if (time_entry_ids && time_entry_ids.length > 0) {
            const entriesCheck = await db.query(
                `SELECT id, invoiced FROM time_entries
                 WHERE id = ANY($1) AND client_id = $2`,
                [time_entry_ids, client_id]
            );

            if (entriesCheck.rows.length !== time_entry_ids.length) {
                return res.status(400).json({ error: 'Some time entries not found or do not belong to this client' });
            }

            const alreadyInvoiced = entriesCheck.rows.filter(e => e.invoiced);
            if (alreadyInvoiced.length > 0) {
                return res.status(400).json({
                    error: 'Some time entries are already invoiced',
                    invoiced_ids: alreadyInvoiced.map(e => e.id)
                });
            }
        }

        // Use transaction for invoice creation
        const invoice = await db.withTransaction(async (client) => {
            // Generate invoice number
            const lastInvoice = await client.query(
                `SELECT invoice_number FROM invoices
                 WHERE invoice_number LIKE $1
                 ORDER BY invoice_number DESC LIMIT 1`,
                [`${new Date().getFullYear()}-%`]
            );

            let invoiceNumber;
            if (lastInvoice.rows[0]) {
                const lastNum = parseInt(lastInvoice.rows[0].invoice_number.split('-')[1], 10);
                invoiceNumber = `${new Date().getFullYear()}-${(lastNum + 1).toString().padStart(4, '0')}`;
            } else {
                invoiceNumber = `${new Date().getFullYear()}-0001`;
            }

            // Calculate subtotal from time entries
            let subtotal = 0;

            if (time_entry_ids && time_entry_ids.length > 0) {
                const entriesSum = await client.query(
                    `SELECT SUM(te.duration * COALESCE(p.hourly_rate, c.hourly_rate, 0)) as total
                     FROM time_entries te
                     LEFT JOIN projects p ON te.project_id = p.id
                     LEFT JOIN clients c ON te.client_id = c.id
                     WHERE te.id = ANY($1)`,
                    [time_entry_ids]
                );
                subtotal = parseFloat(entriesSum.rows[0].total || 0);
            }

            // Add manual items to subtotal
            if (items && items.length > 0) {
                for (const item of items) {
                    subtotal += parseFloat(item.quantity) * parseFloat(item.rate);
                }
            }

            // Calculate tax
            const taxRateNum = parseFloat(tax_rate || 0);
            const taxAmount = subtotal * (taxRateNum / 100);
            const total = subtotal + taxAmount;

            // Create invoice
            const invoiceResult = await client.query(
                `INSERT INTO invoices (
                    client_id, invoice_number, date_issued, date_due,
                    subtotal, tax_rate, tax_amount, total, notes
                 )
                 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                 RETURNING *`,
                [
                    client_id,
                    invoiceNumber,
                    date_issued,
                    date_due || null,
                    subtotal,
                    taxRateNum,
                    taxAmount,
                    total,
                    notes || null
                ]
            );

            const newInvoice = invoiceResult.rows[0];

            // Mark time entries as invoiced
            if (time_entry_ids && time_entry_ids.length > 0) {
                await client.query(
                    `UPDATE time_entries
                     SET invoiced = true, invoice_id = $1
                     WHERE id = ANY($2)`,
                    [newInvoice.id, time_entry_ids]
                );
            }

            // Add manual line items
            if (items && items.length > 0) {
                for (const item of items) {
                    await client.query(
                        `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount)
                         VALUES ($1, $2, $3, $4, $5)`,
                        [
                            newInvoice.id,
                            item.description,
                            item.quantity,
                            item.rate,
                            parseFloat(item.quantity) * parseFloat(item.rate)
                        ]
                    );
                }
            }

            return newInvoice;
        });

        // Get full invoice for response
        const fullInvoice = await db.query(
            `SELECT i.*, c.name as client_name
             FROM invoices i
             JOIN clients c ON i.client_id = c.id
             WHERE i.id = $1`,
            [invoice.id]
        );

        // Broadcast WebSocket event
        events.invoiceCreated(fullInvoice.rows[0]);

        res.status(201).json({
            ...fullInvoice.rows[0],
            subtotal: parseFloat(fullInvoice.rows[0].subtotal),
            tax_rate: parseFloat(fullInvoice.rows[0].tax_rate),
            tax_amount: parseFloat(fullInvoice.rows[0].tax_amount),
            total: parseFloat(fullInvoice.rows[0].total)
        });
    } catch (err) {
        console.error('Create invoice error:', err);
        res.status(500).json({ error: 'Failed to create invoice' });
    }
});

// Update invoice (only draft invoices)
router.put('/:id', validateId(), validateBody('invoiceUpdate'), async (req, res) => {
    try {
        const existing = await db.query(
            'SELECT * FROM invoices WHERE id = $1',
            [req.params.id]
        );

        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Can only update draft invoices
        if (existing.rows[0].status !== 'draft') {
            return res.status(400).json({ error: 'Can only edit draft invoices' });
        }

        const { date_due, tax_rate, notes } = req.body;

        const updates = [];
        const values = [];
        let paramCount = 0;

        if (date_due !== undefined) {
            paramCount++;
            updates.push(`date_due = $${paramCount}`);
            values.push(date_due || null);
        }
        if (notes !== undefined) {
            paramCount++;
            updates.push(`notes = $${paramCount}`);
            values.push(notes || null);
        }
        if (tax_rate !== undefined) {
            // Recalculate totals
            const newTaxRate = parseFloat(tax_rate || 0);
            const subtotal = parseFloat(existing.rows[0].subtotal);
            const taxAmount = subtotal * (newTaxRate / 100);
            const total = subtotal + taxAmount;

            paramCount++;
            updates.push(`tax_rate = $${paramCount}`);
            values.push(newTaxRate);

            paramCount++;
            updates.push(`tax_amount = $${paramCount}`);
            values.push(taxAmount);

            paramCount++;
            updates.push(`total = $${paramCount}`);
            values.push(total);
        }

        if (updates.length === 0) {
            return res.status(400).json({ error: 'No fields to update' });
        }

        paramCount++;
        values.push(req.params.id);

        const result = await db.query(
            `UPDATE invoices SET ${updates.join(', ')}
             WHERE id = $${paramCount}
             RETURNING *`,
            values
        );

        res.json({
            ...result.rows[0],
            subtotal: parseFloat(result.rows[0].subtotal),
            tax_rate: parseFloat(result.rows[0].tax_rate),
            tax_amount: parseFloat(result.rows[0].tax_amount),
            total: parseFloat(result.rows[0].total)
        });
    } catch (err) {
        console.error('Update invoice error:', err);
        res.status(500).json({ error: 'Failed to update invoice' });
    }
});

// Delete invoice (only draft)
router.delete('/:id', validateId(), async (req, res) => {
    try {
        const existing = await db.query(
            'SELECT * FROM invoices WHERE id = $1',
            [req.params.id]
        );

        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        if (existing.rows[0].status !== 'draft') {
            return res.status(400).json({ error: 'Can only delete draft invoices' });
        }

        // Unmark time entries
        await db.query(
            'UPDATE time_entries SET invoiced = false, invoice_id = NULL WHERE invoice_id = $1',
            [req.params.id]
        );

        // Delete invoice (items cascade delete)
        await db.query('DELETE FROM invoices WHERE id = $1', [req.params.id]);

        res.json({ success: true });
    } catch (err) {
        console.error('Delete invoice error:', err);
        res.status(500).json({ error: 'Failed to delete invoice' });
    }
});

// Mark invoice as sent
router.post('/:id/send', validateId(), async (req, res) => {
    try {
        const existing = await db.query(
            'SELECT * FROM invoices WHERE id = $1',
            [req.params.id]
        );

        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        if (existing.rows[0].status !== 'draft') {
            return res.status(400).json({ error: 'Invoice has already been sent' });
        }

        const result = await db.query(
            "UPDATE invoices SET status = 'sent' WHERE id = $1 RETURNING *",
            [req.params.id]
        );

        // Broadcast WebSocket event
        events.invoiceUpdated(result.rows[0]);

        res.json({
            ...result.rows[0],
            subtotal: parseFloat(result.rows[0].subtotal),
            tax_rate: parseFloat(result.rows[0].tax_rate),
            tax_amount: parseFloat(result.rows[0].tax_amount),
            total: parseFloat(result.rows[0].total)
        });
    } catch (err) {
        console.error('Send invoice error:', err);
        res.status(500).json({ error: 'Failed to send invoice' });
    }
});

// Mark invoice as paid
router.post('/:id/paid', validateId(), async (req, res) => {
    try {
        const existing = await db.query(
            'SELECT * FROM invoices WHERE id = $1',
            [req.params.id]
        );

        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        if (existing.rows[0].status === 'draft') {
            return res.status(400).json({ error: 'Invoice must be sent before marking as paid' });
        }

        if (existing.rows[0].status === 'paid') {
            return res.status(400).json({ error: 'Invoice is already paid' });
        }

        const result = await db.query(
            "UPDATE invoices SET status = 'paid' WHERE id = $1 RETURNING *",
            [req.params.id]
        );

        // Broadcast WebSocket event
        events.invoiceUpdated(result.rows[0]);

        res.json({
            ...result.rows[0],
            subtotal: parseFloat(result.rows[0].subtotal),
            tax_rate: parseFloat(result.rows[0].tax_rate),
            tax_amount: parseFloat(result.rows[0].tax_amount),
            total: parseFloat(result.rows[0].total)
        });
    } catch (err) {
        console.error('Mark paid error:', err);
        res.status(500).json({ error: 'Failed to mark invoice as paid' });
    }
});

// Get printable invoice view
router.get('/:id/print', validateId(), async (req, res) => {
    try {
        // This returns the same data as GET /:id but could be used
        // to serve a print-specific HTML page
        const result = await db.query(
            `SELECT
                i.*,
                c.name as client_name,
                c.contact_name as client_contact,
                c.email as client_email,
                c.phone as client_phone,
                c.address as client_address
             FROM invoices i
             JOIN clients c ON i.client_id = c.id
             WHERE i.id = $1`,
            [req.params.id]
        );

        if (!result.rows[0]) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        const entries = await db.query(
            `SELECT
                te.date,
                te.duration,
                te.title,
                te.description,
                p.name as project_name,
                COALESCE(p.hourly_rate, c.hourly_rate, 0) as rate,
                te.duration * COALESCE(p.hourly_rate, c.hourly_rate, 0) as amount
             FROM time_entries te
             LEFT JOIN projects p ON te.project_id = p.id
             LEFT JOIN clients c ON te.client_id = c.id
             WHERE te.invoice_id = $1
             ORDER BY te.date, te.created_at`,
            [req.params.id]
        );

        const items = await db.query(
            'SELECT * FROM invoice_items WHERE invoice_id = $1 ORDER BY id',
            [req.params.id]
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
                duration: parseFloat(e.duration),
                rate: parseFloat(e.rate),
                amount: parseFloat(e.amount)
            })),
            items: items.rows.map(i => ({
                ...i,
                quantity: parseFloat(i.quantity),
                rate: parseFloat(i.rate),
                amount: parseFloat(i.amount)
            }))
        });
    } catch (err) {
        console.error('Get printable invoice error:', err);
        res.status(500).json({ error: 'Failed to load invoice' });
    }
});

// Add line item to draft invoice
router.post('/:id/items', validateId(), async (req, res) => {
    try {
        const existing = await db.query(
            'SELECT * FROM invoices WHERE id = $1',
            [req.params.id]
        );

        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        if (existing.rows[0].status !== 'draft') {
            return res.status(400).json({ error: 'Can only add items to draft invoices' });
        }

        const { description, quantity, rate } = req.body;

        if (!description || !quantity || !rate) {
            return res.status(400).json({ error: 'Description, quantity, and rate are required' });
        }

        const amount = parseFloat(quantity) * parseFloat(rate);

        const result = await db.query(
            `INSERT INTO invoice_items (invoice_id, description, quantity, rate, amount)
             VALUES ($1, $2, $3, $4, $5)
             RETURNING *`,
            [req.params.id, description, quantity, rate, amount]
        );

        // Update invoice totals
        const newSubtotal = parseFloat(existing.rows[0].subtotal) + amount;
        const taxAmount = newSubtotal * (parseFloat(existing.rows[0].tax_rate) / 100);
        const total = newSubtotal + taxAmount;

        await db.query(
            'UPDATE invoices SET subtotal = $1, tax_amount = $2, total = $3 WHERE id = $4',
            [newSubtotal, taxAmount, total, req.params.id]
        );

        res.status(201).json({
            ...result.rows[0],
            quantity: parseFloat(result.rows[0].quantity),
            rate: parseFloat(result.rows[0].rate),
            amount: parseFloat(result.rows[0].amount)
        });
    } catch (err) {
        console.error('Add invoice item error:', err);
        res.status(500).json({ error: 'Failed to add item' });
    }
});

// Remove line item from draft invoice
router.delete('/:id/items/:itemId', validateId(), async (req, res) => {
    try {
        const itemId = parseInt(req.params.itemId, 10);
        if (isNaN(itemId)) {
            return res.status(400).json({ error: 'Invalid item ID' });
        }

        const existing = await db.query(
            'SELECT * FROM invoices WHERE id = $1',
            [req.params.id]
        );

        if (!existing.rows[0]) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        if (existing.rows[0].status !== 'draft') {
            return res.status(400).json({ error: 'Can only remove items from draft invoices' });
        }

        const item = await db.query(
            'SELECT * FROM invoice_items WHERE id = $1 AND invoice_id = $2',
            [itemId, req.params.id]
        );

        if (!item.rows[0]) {
            return res.status(404).json({ error: 'Item not found' });
        }

        await db.query('DELETE FROM invoice_items WHERE id = $1', [itemId]);

        // Update invoice totals
        const newSubtotal = parseFloat(existing.rows[0].subtotal) - parseFloat(item.rows[0].amount);
        const taxAmount = newSubtotal * (parseFloat(existing.rows[0].tax_rate) / 100);
        const total = newSubtotal + taxAmount;

        await db.query(
            'UPDATE invoices SET subtotal = $1, tax_amount = $2, total = $3 WHERE id = $4',
            [newSubtotal, taxAmount, total, req.params.id]
        );

        res.json({ success: true });
    } catch (err) {
        console.error('Remove invoice item error:', err);
        res.status(500).json({ error: 'Failed to remove item' });
    }
});

module.exports = router;
