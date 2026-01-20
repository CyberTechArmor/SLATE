// Client Portal Entries Page JavaScript

let currentPage = 1;
let currentFilters = {};
let projects = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadClientInfo();
    await loadFilters();
    await loadEntries();
    setupEventListeners();
});

async function loadClientInfo() {
    try {
        const response = await API.auth.me();

        if (response.client) {
            const initials = response.client.name.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
            document.getElementById('clientAvatar').textContent = initials;
            document.getElementById('clientName').textContent = response.client.name;
        }
    } catch (err) {
        console.error('Failed to load client info:', err);
    }
}

async function loadFilters() {
    try {
        projects = await API.clientPortal.projects();

        const projectFilter = document.getElementById('filterProject');

        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            projectFilter.appendChild(option);
        });

    } catch (err) {
        console.error('Failed to load projects:', err);
    }
}

async function loadEntries() {
    showLoading('entriesList');

    try {
        const params = {
            page: currentPage,
            limit: 20,
            ...currentFilters
        };

        // Remove empty params
        Object.keys(params).forEach(key => {
            if (params[key] === '' || params[key] === undefined) {
                delete params[key];
            }
        });

        const result = await API.clientPortal.entries(params);

        renderEntries(result.data);

        // Update summary
        const totalHours = result.data.reduce((sum, e) => sum + e.duration, 0);
        document.getElementById('totalEntries').textContent = result.pagination.total;
        document.getElementById('totalHours').textContent = formatDuration(totalHours);

        // Render pagination
        renderPagination('pagination', {
            page: result.pagination.page,
            totalPages: result.pagination.totalPages,
            onPageChange: (newPage) => {
                currentPage = newPage;
                loadEntries();
            }
        });

        lucide.createIcons();

    } catch (err) {
        console.error('Failed to load entries:', err);
        document.getElementById('entriesList').innerHTML = `
            <div class="alert alert-error">
                <i data-lucide="alert-circle"></i>
                <span>Failed to load entries: ${err.message}</span>
            </div>
        `;
        lucide.createIcons();
    }
}

function renderEntries(entries) {
    const container = document.getElementById('entriesList');

    if (!entries || entries.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="clock"></i>
                <h3>No time entries</h3>
                <p>Time entries will appear here once work begins</p>
            </div>
        `;
        return;
    }

    container.innerHTML = entries.map(entry => `
        <div class="entry-item stagger-item" data-id="${entry.id}">
            <div class="entry-header" onclick="toggleEntry(${entry.id})">
                <span class="entry-date">${formatDateShort(entry.date)}</span>
                <span class="entry-duration">${formatDuration(entry.duration)}</span>
                <span class="entry-title">${escapeHtml(entry.title)}</span>
                <div class="entry-icons">
                    ${entry.resource_count > 0 ? '<i data-lucide="link"></i>' : ''}
                    ${entry.invoiced ? '<i data-lucide="check-circle" class="text-success"></i>' : ''}
                </div>
                <i data-lucide="chevron-down" class="entry-expand-icon"></i>
            </div>
            <div class="entry-meta">
                ${entry.project_name ? `<span>${entry.project_name}</span>` : '<span>General Work</span>'}
                ${entry.invoiced ? '<span class="badge badge-green">Invoiced</span>' : '<span class="badge badge-yellow">Pending</span>'}
            </div>
            <div class="entry-details">
                ${entry.description ? `<div class="entry-description">${escapeHtml(entry.description)}</div>` : ''}
                <div class="entry-actions">
                    <button class="btn btn-secondary btn-sm" onclick="viewEntryDetails(${entry.id})">
                        <i data-lucide="eye"></i>
                        View Details
                    </button>
                </div>
            </div>
        </div>
    `).join('');
}

function toggleEntry(id) {
    const item = document.querySelector(`.entry-item[data-id="${id}"]`);
    if (item) {
        item.classList.toggle('expanded');
    }
}

async function viewEntryDetails(id) {
    try {
        const entry = await API.clientPortal.getEntry(id);

        const modal = document.getElementById('entryModal');
        const details = document.getElementById('entryDetails');

        document.getElementById('modalTitle').textContent = formatDate(entry.date);

        details.innerHTML = `
            <div class="mb-4">
                <div class="text-sm text-gray-500">Duration</div>
                <div class="text-2xl font-bold text-accent">${formatDuration(entry.duration)}</div>
            </div>

            <div class="mb-4">
                <div class="text-sm text-gray-500">Title</div>
                <div class="font-medium">${escapeHtml(entry.title)}</div>
            </div>

            ${entry.project_name ? `
                <div class="mb-4">
                    <div class="text-sm text-gray-500">Project</div>
                    <div>${escapeHtml(entry.project_name)}</div>
                </div>
            ` : ''}

            ${entry.description ? `
                <div class="mb-4">
                    <div class="text-sm text-gray-500">Description</div>
                    <div class="text-gray-700">${escapeHtml(entry.description)}</div>
                </div>
            ` : ''}

            ${entry.resources && entry.resources.length > 0 ? `
                <div class="mb-4">
                    <div class="text-sm text-gray-500 mb-2">Resources</div>
                    ${entry.resources.map(resource => `
                        <a href="${escapeHtml(resource.url)}" target="_blank" class="resource-item">
                            <i data-lucide="${resource.type === 'link' ? 'link' : 'file'}"></i>
                            ${escapeHtml(resource.name)}
                        </a>
                    `).join('')}
                </div>
            ` : ''}

            <div class="flex justify-between items-center pt-4 border-t">
                <span class="text-sm text-gray-500">Status</span>
                ${entry.invoiced ?
                    '<span class="badge badge-green">Invoiced</span>' :
                    '<span class="badge badge-yellow">Pending Invoice</span>'
                }
            </div>
        `;

        modal.style.display = 'flex';
        lucide.createIcons();

    } catch (err) {
        showToast('Failed to load entry details: ' + err.message, 'error');
    }
}

function closeModal() {
    document.getElementById('entryModal').style.display = 'none';
}

function setupEventListeners() {
    document.getElementById('entryModal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) {
            closeModal();
        }
    });
}

function applyFilters() {
    currentFilters = {
        project: document.getElementById('filterProject').value,
        date_from: document.getElementById('filterDateFrom').value,
        date_to: document.getElementById('filterDateTo').value
    };

    currentPage = 1;
    loadEntries();
}

function clearFilters() {
    document.getElementById('filterProject').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';

    currentFilters = {};
    currentPage = 1;
    loadEntries();
}

async function exportCSV() {
    try {
        const params = new URLSearchParams();

        if (currentFilters.project) params.set('project', currentFilters.project);
        if (currentFilters.date_from) params.set('date_from', currentFilters.date_from);
        if (currentFilters.date_to) params.set('date_to', currentFilters.date_to);

        window.location.href = `/api/client/time-entries/export?${params.toString()}`;

    } catch (err) {
        showToast('Failed to export: ' + err.message, 'error');
    }
}

// WebSocket handlers
ws.on('time_entry:created', () => loadEntries());
ws.on('time_entry:updated', () => loadEntries());
ws.on('time_entry:deleted', () => loadEntries());
