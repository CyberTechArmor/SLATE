// Client Portal Dashboard JavaScript

document.addEventListener('DOMContentLoaded', async () => {
    await loadClientInfo();
    await loadDashboard();
});

async function loadClientInfo() {
    try {
        const response = await API.auth.me();

        if (response.client) {
            const initials = response.client.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            document.getElementById('clientAvatar').textContent = initials;
            document.getElementById('clientName').textContent = response.client.name;
            document.getElementById('welcomeMessage').textContent = `Welcome back, ${response.client.name.split(' ')[0]}`;
        }
    } catch (err) {
        console.error('Failed to load client info:', err);
    }
}

async function loadDashboard() {
    try {
        const [stats, projects, entries] = await Promise.all([
            API.clientPortal.dashboardStats(),
            API.clientPortal.projects(),
            API.clientPortal.entries({ limit: 10 })
        ]);

        // Animate stat counters
        animateCounter('monthHours', stats.month_hours);
        animateCounter('unbilledHours', stats.unbilled_hours);

        // Count active projects
        const activeProjects = projects.filter(p => p.status === 'active').length;
        animateCounter('projectCount', activeProjects);

        // Render project breakdown
        renderProjectBreakdown(stats.hours_by_project);

        // Render recent entries
        renderRecentEntries(entries.data);

        lucide.createIcons();

    } catch (err) {
        console.error('Failed to load dashboard:', err);
        showToast('Failed to load dashboard data', 'error');
    }
}

function renderProjectBreakdown(projects) {
    const container = document.getElementById('projectBreakdown');

    if (!projects || projects.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-500">No hours tracked this month</p>';
        return;
    }

    const maxHours = Math.max(...projects.map(p => p.hours));

    container.innerHTML = projects.map(project => `
        <div class="project-item">
            <span class="project-name">${escapeHtml(project.name)}</span>
            <span class="project-hours">${formatDuration(project.hours)}</span>
            <div class="project-bar">
                <div class="project-bar-fill" style="width: ${(project.hours / maxHours) * 100}%;"></div>
            </div>
        </div>
    `).join('');
}

function renderRecentEntries(entries) {
    const container = document.getElementById('recentEntries');

    if (!entries || entries.length === 0) {
        container.innerHTML = `
            <div class="empty-state p-6">
                <i data-lucide="clock"></i>
                <h3>No recent entries</h3>
                <p>Time entries will appear here</p>
            </div>
        `;
        return;
    }

    container.innerHTML = entries.map(entry => `
        <div class="activity-item stagger-item">
            <div class="activity-icon blue">
                <i data-lucide="clock"></i>
            </div>
            <div class="activity-content">
                <div class="activity-text">${escapeHtml(entry.title)}</div>
                <div class="activity-meta">
                    <span class="activity-duration">${formatDuration(entry.duration)}</span>
                    ${entry.project_name ? `<span>&middot; ${entry.project_name}</span>` : ''}
                </div>
            </div>
            <div class="text-sm text-gray-400">
                ${formatDateShort(entry.date)}
            </div>
        </div>
    `).join('');
}

async function exportCSV() {
    try {
        // Build export URL with current filters
        const params = new URLSearchParams();
        const dateFrom = new Date();
        dateFrom.setMonth(dateFrom.getMonth() - 1);
        params.set('date_from', formatDateInput(dateFrom));
        params.set('date_to', formatDateInput(new Date()));

        // Redirect to CSV download
        window.location.href = `/api/client/time-entries/export?${params.toString()}`;

    } catch (err) {
        showToast('Failed to export: ' + err.message, 'error');
    }
}

// WebSocket handlers
ws.on('time_entry:created', () => loadDashboard());
ws.on('time_entry:updated', () => loadDashboard());
ws.on('time_entry:deleted', () => loadDashboard());
