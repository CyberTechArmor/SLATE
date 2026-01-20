// Time Entries Page JavaScript

let currentPage = 1;
let currentFilters = {};
let clients = [];
let currentEntryId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadFilters();
    await loadEntries();
    setupEventListeners();
});

async function loadFilters() {
    try {
        const [clientsData, projectsData] = await Promise.all([
            API.clients.list({ status: 'active', limit: 100 }),
            API.projects.list({ status: 'active', limit: 100 })
        ]);

        clients = clientsData.data;

        // Populate client filter
        const clientFilter = document.getElementById('filterClient');
        const entryClient = document.getElementById('entryClient');

        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            clientFilter.appendChild(option.cloneNode(true));
            if (entryClient) entryClient.appendChild(option);
        });

        // Populate project filter
        const projectFilter = document.getElementById('filterProject');
        projectFilter.innerHTML = '<option value="">All Projects</option><option value="none">Loose Hours (No Project)</option>';

        projectsData.data.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = `${project.name} (${project.client_name})`;
            projectFilter.appendChild(option);
        });

    } catch (err) {
        console.error('Failed to load filters:', err);
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

        const result = await API.entries.list(params);

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
                <p>Add your first time entry to get started</p>
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
                <span>${entry.client_name}</span>
                ${entry.project_name ? `<span>&middot; ${entry.project_name}</span>` : '<span>&middot; Loose Hours</span>'}
                ${!entry.billable ? '<span class="badge badge-gray">Non-billable</span>' : ''}
            </div>
            <div class="entry-details">
                ${entry.description ? `<div class="entry-description">${escapeHtml(entry.description)}</div>` : ''}
                ${entry.internal_notes ? `
                    <div class="entry-internal-notes">
                        <div class="entry-internal-notes-label">Internal Notes</div>
                        <div class="entry-internal-notes-text">${escapeHtml(entry.internal_notes)}</div>
                    </div>
                ` : ''}
                <div class="entry-actions">
                    <button class="btn btn-secondary btn-sm" onclick="editEntry(${entry.id})">
                        <i data-lucide="edit-2"></i>
                        Edit
                    </button>
                    ${!entry.invoiced ? `
                        <button class="btn btn-danger btn-sm" onclick="confirmDeleteEntry(${entry.id})">
                            <i data-lucide="trash-2"></i>
                            Delete
                        </button>
                    ` : ''}
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

function setupEventListeners() {
    // Client filter change - update project filter
    document.getElementById('filterClient').addEventListener('change', function() {
        const projectFilter = document.getElementById('filterProject');
        const selectedClient = this.value;

        // Reset to show all if no client selected
        if (!selectedClient) {
            applyFilters();
            return;
        }
    });

    // Entry client change - load projects
    document.getElementById('entryClient')?.addEventListener('change', async function() {
        const projectSelect = document.getElementById('entryProject');
        projectSelect.innerHTML = '<option value="">No project</option>';

        if (!this.value) return;

        try {
            const projects = await API.clients.getProjects(this.value);
            projects.forEach(project => {
                if (project.status === 'active') {
                    const option = document.createElement('option');
                    option.value = project.id;
                    option.textContent = project.name;
                    projectSelect.appendChild(option);
                }
            });
        } catch (err) {
            console.error('Failed to load projects:', err);
        }
    });

    // Form submission
    document.getElementById('entryForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveEntry();
    });

    // Close modal on backdrop click
    document.getElementById('entryModal')?.addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) {
            closeModal();
        }
    });
}

function applyFilters() {
    currentFilters = {
        client: document.getElementById('filterClient').value,
        project: document.getElementById('filterProject').value === 'none' ? 'null' : document.getElementById('filterProject').value,
        date_from: document.getElementById('filterDateFrom').value,
        date_to: document.getElementById('filterDateTo').value,
        invoiced: document.getElementById('filterInvoiced').value
    };

    currentPage = 1;
    loadEntries();
}

function clearFilters() {
    document.getElementById('filterClient').value = '';
    document.getElementById('filterProject').value = '';
    document.getElementById('filterDateFrom').value = '';
    document.getElementById('filterDateTo').value = '';
    document.getElementById('filterInvoiced').value = '';

    currentFilters = {};
    currentPage = 1;
    loadEntries();
}

function openEntryModal(entry = null) {
    const modal = document.getElementById('entryModal');
    const form = document.getElementById('entryForm');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('deleteEntryBtn');

    form.reset();
    document.getElementById('entryId').value = '';
    document.getElementById('entryDate').value = getTodayDate();
    document.getElementById('entryBillable').checked = true;
    document.getElementById('entryProject').innerHTML = '<option value="">No project</option>';

    if (entry) {
        title.textContent = 'Edit Time Entry';
        document.getElementById('entryId').value = entry.id;
        document.getElementById('entryClient').value = entry.client_id;
        document.getElementById('entryDate').value = formatDateInput(entry.date);
        document.getElementById('entryStartTime').value = entry.start_time || '';
        document.getElementById('entryDuration').value = entry.duration;
        document.getElementById('entryTitle').value = entry.title;
        document.getElementById('entryDescription').value = entry.description || '';
        document.getElementById('entryNotes').value = entry.internal_notes || '';
        document.getElementById('entryBillable').checked = entry.billable;

        deleteBtn.style.display = entry.invoiced ? 'none' : 'block';
        currentEntryId = entry.id;

        // Load projects for this client
        loadProjectsForEntry(entry.client_id, entry.project_id);
    } else {
        title.textContent = 'Add Time Entry';
        deleteBtn.style.display = 'none';
        currentEntryId = null;
    }

    modal.style.display = 'flex';
    lucide.createIcons();
}

async function loadProjectsForEntry(clientId, selectedProjectId) {
    const projectSelect = document.getElementById('entryProject');
    projectSelect.innerHTML = '<option value="">No project</option>';

    if (!clientId) return;

    try {
        const projects = await API.clients.getProjects(clientId);
        projects.forEach(project => {
            const option = document.createElement('option');
            option.value = project.id;
            option.textContent = project.name;
            if (project.id === selectedProjectId) {
                option.selected = true;
            }
            projectSelect.appendChild(option);
        });
    } catch (err) {
        console.error('Failed to load projects:', err);
    }
}

async function editEntry(id) {
    try {
        const entry = await API.entries.get(id);
        openEntryModal(entry);
    } catch (err) {
        showToast('Failed to load entry: ' + err.message, 'error');
    }
}

async function saveEntry() {
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
        loadEntries();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

function confirmDeleteEntry(id) {
    if (confirm('Are you sure you want to delete this time entry?')) {
        deleteEntryById(id);
    }
}

async function deleteEntryById(id) {
    try {
        await API.entries.delete(id);
        showToast('Entry deleted', 'success');
        loadEntries();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteEntry() {
    if (!currentEntryId) return;

    if (confirm('Are you sure you want to delete this time entry?')) {
        await deleteEntryById(currentEntryId);
        closeModal();
    }
}

function closeModal() {
    document.getElementById('entryModal').style.display = 'none';
    currentEntryId = null;
}

// WebSocket handlers
ws.on('time_entry:created', () => loadEntries());
ws.on('time_entry:updated', () => loadEntries());
ws.on('time_entry:deleted', () => loadEntries());
