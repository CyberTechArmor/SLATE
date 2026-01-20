const express = require('express');
const router = express.Router();
const db = require('../config/database');
const { requireUser } = require('../middleware/auth');
const {
    getStartOfDay,
    getStartOfWeek,
    getStartOfMonth,
    formatDateInput
} = require('../utils/helpers');

// All routes require user authentication
router.use(requireUser);

// Get dashboard statistics
router.get('/stats', async (req, res) => {
    try {
        const today = formatDateInput(new Date());
        const weekStart = formatDateInput(getStartOfWeek());
        const monthStart = formatDateInput(getStartOfMonth());

        // Get multiple stats in parallel
        const [
            todayHours,
            weekHours,
            monthHours,
            unbilledStats,
            last7Days
        ] = await Promise.all([
            // Today's hours
            db.query(
                `SELECT COALESCE(SUM(duration), 0) as hours
                 FROM time_entries
                 WHERE date = $1 AND billable = true`,
                [today]
            ),

            // This week's hours
            db.query(
                `SELECT COALESCE(SUM(duration), 0) as hours
                 FROM time_entries
                 WHERE date >= $1 AND billable = true`,
                [weekStart]
            ),

            // This month's hours
            db.query(
                `SELECT COALESCE(SUM(duration), 0) as hours
                 FROM time_entries
                 WHERE date >= $1 AND billable = true`,
                [monthStart]
            ),

            // Unbilled hours and amount
            db.query(
                `SELECT
                    COALESCE(SUM(te.duration), 0) as hours,
                    COALESCE(SUM(te.duration * COALESCE(p.hourly_rate, c.hourly_rate, 0)), 0) as amount
                 FROM time_entries te
                 LEFT JOIN projects p ON te.project_id = p.id
                 LEFT JOIN clients c ON te.client_id = c.id
                 WHERE te.invoiced = false AND te.billable = true`
            ),

            // Last 7 days breakdown
            db.query(
                `SELECT
                    date,
                    SUM(duration) as hours
                 FROM time_entries
                 WHERE date >= CURRENT_DATE - INTERVAL '6 days'
                   AND billable = true
                 GROUP BY date
                 ORDER BY date`
            )
        ]);

        // Build last 7 days array with all dates
        const last7DaysData = [];
        for (let i = 6; i >= 0; i--) {
            const date = new Date();
            date.setDate(date.getDate() - i);
            const dateStr = formatDateInput(date);
            const dayData = last7Days.rows.find(r => formatDateInput(r.date) === dateStr);
            last7DaysData.push({
                date: dateStr,
                dayName: date.toLocaleDateString('en-US', { weekday: 'short' }),
                hours: parseFloat(dayData?.hours || 0)
            });
        }

        res.json({
            today: parseFloat(todayHours.rows[0].hours),
            week: parseFloat(weekHours.rows[0].hours),
            month: parseFloat(monthHours.rows[0].hours),
            unbilled: {
                hours: parseFloat(unbilledStats.rows[0].hours),
                amount: parseFloat(unbilledStats.rows[0].amount)
            },
            last7Days: last7DaysData
        });
    } catch (err) {
        console.error('Dashboard stats error:', err);
        res.status(500).json({ error: 'Failed to load dashboard statistics' });
    }
});

// Get recent activity
router.get('/recent', async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

        const result = await db.query(
            `SELECT
                te.id,
                te.date,
                te.duration,
                te.title,
                te.description,
                te.internal_notes,
                te.billable,
                te.invoiced,
                te.created_at,
                c.id as client_id,
                c.name as client_name,
                p.id as project_id,
                p.name as project_name,
                (SELECT COUNT(*) FROM resources WHERE time_entry_id = te.id) as resource_count
             FROM time_entries te
             LEFT JOIN clients c ON te.client_id = c.id
             LEFT JOIN projects p ON te.project_id = p.id
             ORDER BY te.created_at DESC
             LIMIT $1`,
            [limit]
        );

        res.json(result.rows);
    } catch (err) {
        console.error('Recent activity error:', err);
        res.status(500).json({ error: 'Failed to load recent activity' });
    }
});

// Get client breakdown (for dashboard widget)
router.get('/clients-summary', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                c.id,
                c.name,
                COALESCE(SUM(CASE WHEN te.invoiced = false AND te.billable = true THEN te.duration ELSE 0 END), 0) as unbilled_hours,
                COALESCE(SUM(CASE WHEN te.invoiced = false AND te.billable = true
                    THEN te.duration * COALESCE(p.hourly_rate, c.hourly_rate, 0)
                    ELSE 0 END), 0) as unbilled_amount,
                COUNT(DISTINCT te.id) FILTER (WHERE te.invoiced = false AND te.billable = true) as unbilled_entries
             FROM clients c
             LEFT JOIN time_entries te ON c.id = te.client_id
             LEFT JOIN projects p ON te.project_id = p.id
             WHERE c.status = 'active'
             GROUP BY c.id, c.name
             HAVING COALESCE(SUM(CASE WHEN te.invoiced = false AND te.billable = true THEN te.duration ELSE 0 END), 0) > 0
             ORDER BY unbilled_hours DESC
             LIMIT 5`
        );

        res.json(result.rows.map(row => ({
            ...row,
            unbilled_hours: parseFloat(row.unbilled_hours),
            unbilled_amount: parseFloat(row.unbilled_amount)
        })));
    } catch (err) {
        console.error('Clients summary error:', err);
        res.status(500).json({ error: 'Failed to load clients summary' });
    }
});

// Get invoices summary (recent invoices)
router.get('/invoices-summary', async (req, res) => {
    try {
        const result = await db.query(
            `SELECT
                i.id,
                i.invoice_number,
                i.date_issued,
                i.date_due,
                i.total,
                i.status,
                c.name as client_name
             FROM invoices i
             JOIN clients c ON i.client_id = c.id
             ORDER BY i.date_issued DESC
             LIMIT 5`
        );

        // Also get invoice status counts
        const statusCounts = await db.query(
            `SELECT
                status,
                COUNT(*) as count,
                COALESCE(SUM(total), 0) as total_amount
             FROM invoices
             GROUP BY status`
        );

        res.json({
            recent: result.rows.map(row => ({
                ...row,
                total: parseFloat(row.total)
            })),
            summary: statusCounts.rows.reduce((acc, row) => {
                acc[row.status] = {
                    count: parseInt(row.count, 10),
                    amount: parseFloat(row.total_amount)
                };
                return acc;
            }, {})
        });
    } catch (err) {
        console.error('Invoices summary error:', err);
        res.status(500).json({ error: 'Failed to load invoices summary' });
    }
});

module.exports = router;
