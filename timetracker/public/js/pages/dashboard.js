// Dashboard Page JavaScript

let clients = [];
let projects = [];

// Initialize dashboard
document.addEventListener('DOMContentLoaded', async () => {
    await loadDashboard();
    setupQuickAddForm();
    setupDurationButtons();
});

async function loadDashboard() {
    try {
        // Load all data in parallel
        const [stats, recent, clientsSummary, clientsData] = await Promise.all([
            API.dashboard.stats(),
            API.dashboard.recent(),
            API.dashboard.clientsSummary(),
            API.clients.list({ status: 'active', limit: 100 })
        ]);

        clients = clientsData.data;

        // Animate stat counters
        animateCounter('statToday', stats.today);
        animateCounter('statWeek', stats.week);
        animateCounter('statMonth', stats.month);
        animateCounter('statUnbilled', stats.unbilled.hours);
        document.getElementById('statUnbilledAmount').textContent = formatCurrency(stats.unbilled.amount);

        // Render last 7 days chart
        renderBarChart('weekChart', stats.last7Days.map(d => ({
            label: d.dayName,
            value: d.hours
        })));

        // Render recent activity
        renderRecentActivity(recent);

        // Render clients summary
        renderClientsSummary(clientsSummary);

        // Populate client dropdowns
        populateClientDropdowns();

        // Re-init Lucide icons
        lucide.createIcons();

    } catch (err) {
        console.error('Failed to load dashboard:', err);
        showToast('Failed to load dashboard', 'error');
    }
}

function renderRecentActivity(entries) {
    const container = document.getElementById('activityList');

    if (!entries || entries.length === 0) {
        container.innerHTML = `
            <div class="empty-state p-6">
                <i data-lucide="clock"></i>
                <h3>No recent activity</h3>
                <p>Start tracking time to see your entries here</p>
            </div>
        `;
        return;
    }

    container.innerHTML = entries.map(entry => `
        <div class="activity-item stagger-item">
            <div class="activity-icon ${entry.billable ? 'blue' : 'green'}">
                <i data-lucide="${entry.billable ? 'clock' : 'clock-off'}"></i>
            </div>
            <div class="activity-content">
                <div class="activity-text">${escapeHtml(entry.title)}</div>
                <div class="activity-meta">
                    <span class="activity-duration">${formatDuration(entry.duration)}</span>
                    <span>${entry.client_name}</span>
                    ${entry.project_name ? `<span>&middot; ${entry.project_name}</span>` : ''}
                </div>
            </div>
            <div class="text-sm text-gray-400">
                ${formatDateShort(entry.date)}
            </div>
        </div>
    `).join('');
}

function renderClientsSummary(clients) {
    const container = document.getElementById('clientsSummary');

    if (!clients || clients.length === 0) {
        container.innerHTML = `
            <div class="p-4 text-center text-gray-500 text-sm">
                No unbilled hours
            </div>
        `;
        return;
    }

    container.innerHTML = clients.map(client => `
        <div class="summary-item">
            <span class="summary-client">${escapeHtml(client.name)}</span>
            <div>
                <span class="summary-hours">${formatDuration(client.unbilled_hours)}</span>
                <span class="summary-amount">${formatCurrency(client.unbilled_amount)}</span>
            </div>
        </div>
    `).join('');
}

function populateClientDropdowns() {
    const selects = ['qaClient', 'entryClient'];

    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;

        // Clear existing options except first
        select.innerHTML = '<option value="">Select client...</option>';

        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            select.appendChild(option);
        });
    });
}

async function loadProjectsForClient(clientId, targetSelectId) {
    const select = document.getElementById(targetSelectId);
    if (!select) return;

    select.innerHTML = '<option value="">No project</option>';

    if (!clientId) return;

    try {
        const projectsData = await API.clients.getProjects(clientId);

        projectsData.forEach(project => {
            if (project.status === 'active') {
                const option = document.createElement('option');
                option.value = project.id;
                option.textContent = project.name;
                select.appendChild(option);
            }
        });
    } catch (err) {
        console.error('Failed to load projects:', err);
    }
}

function setupQuickAddForm() {
    const form = document.getElementById('quickAddForm');
    const clientSelect = document.getElementById('qaClient');
    const dateInput = document.getElementById('qaDate');

    // Set default date to today
    dateInput.value = getTodayDate();

    // Load projects when client changes
    clientSelect.addEventListener('change', () => {
        loadProjectsForClient(clientSelect.value, 'qaProject');
    });

    // Form submission
    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const data = {
            client_id: parseInt(document.getElementById('qaClient').value, 10),
            project_id: document.getElementById('qaProject').value || null,
            date: document.getElementById('qaDate').value,
            duration: parseFloat(document.getElementById('qaDuration').value),
            title: document.getElementById('qaTitle').value,
            billable: true
        };

        if (data.project_id) {
            data.project_id = parseInt(data.project_id, 10);
        }

        try {
            await API.entries.create(data);
            showToast('Time entry added!', 'success');

            // Reset form
            form.reset();
            dateInput.value = getTodayDate();
            document.getElementById('qaDuration').value = '1.0';
            document.getElementById('qaProject').innerHTML = '<option value="">No project</option>';

            // Reload dashboard
            loadDashboard();
        } catch (err) {
            showToast(err.message, 'error');
        }
    });
}

function setupDurationButtons() {
    const buttons = document.querySelectorAll('.duration-quick-btn');
    const durationInput = document.getElementById('qaDuration');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            // Update active state
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Set duration value
            durationInput.value = btn.dataset.duration;
        });
    });

    // Update buttons when input changes
    durationInput.addEventListener('change', () => {
        buttons.forEach(btn => {
            btn.classList.toggle('active', btn.dataset.duration === durationInput.value);
        });
    });
}

// Modal functions
function openQuickAdd() {
    document.getElementById('entryModal').style.display = 'flex';
    document.getElementById('modalTitle').textContent = 'Add Time Entry';
    document.getElementById('entryId').value = '';
    document.getElementById('entryForm').reset();
    document.getElementById('entryDate').value = getTodayDate();
    document.getElementById('entryBillable').checked = true;

    populateClientDropdowns();
    lucide.createIcons();
}

function closeModal() {
    document.getElementById('entryModal').style.display = 'none';
}

// Entry modal form setup
document.getElementById('entryClient')?.addEventListener('change', function() {
    loadProjectsForClient(this.value, 'entryProject');
});

document.getElementById('entryForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const entryId = document.getElementById('entryId').value;

    const data = {
        client_id: parseInt(document.getElementById('entryClient').value, 10),
        project_id: document.getElementById('entryProject').value || null,
        date: document.getElementById('entryDate').value,
        start_time: document.getElementById('entryStartTime').value || null,
        duration: parseFloat(document.getElementById('entryDuration').value),
        title: document.getElementById('entryTitle').value,
        description: document.getElementById('entryDescription').value || null,
        internal_notes: document.getElementById('entryNotes').value || null,
        billable: document.getElementById('entryBillable').checked
    };

    if (data.project_id) {
        data.project_id = parseInt(data.project_id, 10);
    }

    try {
        if (entryId) {
            await API.entries.update(entryId, data);
            showToast('Entry updated!', 'success');
        } else {
            await API.entries.create(data);
            showToast('Entry created!', 'success');
        }

        closeModal();
        loadDashboard();
    } catch (err) {
        showToast(err.message, 'error');
    }
});

// Close modal when clicking backdrop
document.getElementById('entryModal')?.addEventListener('click', (e) => {
    if (e.target.classList.contains('modal-backdrop')) {
        closeModal();
    }
});

// WebSocket handlers for real-time updates
ws.on('time_entry:created', () => loadDashboard());
ws.on('time_entry:updated', () => loadDashboard());
ws.on('time_entry:deleted', () => loadDashboard());
