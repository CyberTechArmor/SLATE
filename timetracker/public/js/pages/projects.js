// Projects Page JavaScript

let currentPage = 1;
let currentClient = '';
let currentStatus = 'active';
let currentProjectId = null;
let clients = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadFilters();
    await loadProjects();
    setupEventListeners();
});

async function loadFilters() {
    try {
        const clientsData = await API.clients.list({ status: 'active', limit: 100 });
        clients = clientsData.data;

        const clientFilter = document.getElementById('clientFilter');
        const projectClient = document.getElementById('projectClient');

        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            clientFilter.appendChild(option.cloneNode(true));
            if (projectClient) projectClient.appendChild(option);
        });

    } catch (err) {
        console.error('Failed to load clients:', err);
    }
}

async function loadProjects() {
    document.getElementById('projectsBody').innerHTML = `
        <tr><td colspan="7" class="loading"><div class="spinner"></div></td></tr>
    `;

    try {
        const params = {
            page: currentPage,
            limit: 20
        };

        if (currentClient) params.client = currentClient;
        if (currentStatus !== 'all') params.status = currentStatus;

        const result = await API.projects.list(params);

        renderProjects(result.data);

        renderPagination('pagination', {
            page: result.pagination.page,
            totalPages: result.pagination.totalPages,
            onPageChange: (newPage) => {
                currentPage = newPage;
                loadProjects();
            }
        });

        lucide.createIcons();

    } catch (err) {
        console.error('Failed to load projects:', err);
        document.getElementById('projectsBody').innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="alert alert-error">
                        <i data-lucide="alert-circle"></i>
                        <span>Failed to load projects: ${err.message}</span>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons();
    }
}

function renderProjects(projects) {
    const tbody = document.getElementById('projectsBody');

    if (!projects || projects.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <i data-lucide="folder"></i>
                        <h3>No projects found</h3>
                        <p>Create your first project to organize time entries</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = projects.map(project => `
        <tr class="stagger-item">
            <td>
                <div class="font-medium">${escapeHtml(project.name)}</div>
                ${project.description ? `<div class="text-xs text-gray-500 truncate" style="max-width: 200px;">${escapeHtml(project.description)}</div>` : ''}
            </td>
            <td>${escapeHtml(project.client_name)}</td>
            <td>${project.hourly_rate ? formatCurrency(project.hourly_rate) : `<span class="text-gray-400">${formatCurrency(project.client_hourly_rate)}</span>`}/hr</td>
            <td>${formatDuration(project.total_hours)}</td>
            <td><span class="text-accent font-medium">${formatDuration(project.unbilled_hours)}</span></td>
            <td>${getStatusBadge(project.status)}</td>
            <td>
                <button class="btn btn-ghost btn-icon btn-sm" onclick="editProject(${project.id})">
                    <i data-lucide="edit-2"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    document.getElementById('clientFilter').addEventListener('change', (e) => {
        currentClient = e.target.value;
        currentPage = 1;
        loadProjects();
    });

    document.getElementById('statusFilter').addEventListener('change', (e) => {
        currentStatus = e.target.value;
        currentPage = 1;
        loadProjects();
    });

    document.getElementById('projectForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveProject();
    });

    document.getElementById('projectModal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) {
            closeModal();
        }
    });
}

function openProjectModal(project = null) {
    const modal = document.getElementById('projectModal');
    const form = document.getElementById('projectForm');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('deleteProjectBtn');
    const clientSelect = document.getElementById('projectClient');

    form.reset();
    document.getElementById('projectId').value = '';

    if (project) {
        title.textContent = 'Edit Project';
        document.getElementById('projectId').value = project.id;
        document.getElementById('projectName').value = project.name;
        document.getElementById('projectDescription').value = project.description || '';
        document.getElementById('projectRate').value = project.hourly_rate || '';
        document.getElementById('projectStatus').value = project.status;

        // Find and select the client
        clientSelect.value = project.client_id;
        clientSelect.disabled = true; // Can't change client after creation

        deleteBtn.style.display = 'block';
        currentProjectId = project.id;
    } else {
        title.textContent = 'Add Project';
        clientSelect.disabled = false;
        deleteBtn.style.display = 'none';
        currentProjectId = null;
    }

    modal.style.display = 'flex';
    lucide.createIcons();
}

async function editProject(id) {
    try {
        const project = await API.projects.get(id);
        openProjectModal(project);
    } catch (err) {
        showToast('Failed to load project: ' + err.message, 'error');
    }
}

async function saveProject() {
    const projectId = document.getElementById('projectId').value;

    const data = {
        name: document.getElementById('projectName').value,
        description: document.getElementById('projectDescription').value || null,
        hourly_rate: document.getElementById('projectRate').value ? parseFloat(document.getElementById('projectRate').value) : null,
        status: document.getElementById('projectStatus').value
    };

    // Only include client_id for new projects
    if (!projectId) {
        data.client_id = parseInt(document.getElementById('projectClient').value, 10);
    }

    try {
        if (projectId) {
            await API.projects.update(projectId, data);
            showToast('Project updated!', 'success');
        } else {
            await API.projects.create(data);
            showToast('Project created!', 'success');
        }

        closeModal();
        loadProjects();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteProject() {
    if (!currentProjectId) return;

    if (confirm('Are you sure you want to delete this project? Time entries will become "loose hours".')) {
        try {
            await API.projects.delete(currentProjectId);
            showToast('Project deleted', 'success');
            closeModal();
            loadProjects();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }
}

function closeModal() {
    document.getElementById('projectModal').style.display = 'none';
    currentProjectId = null;
    document.getElementById('projectClient').disabled = false;
}
