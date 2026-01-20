// Clients Page JavaScript

let currentPage = 1;
let currentSearch = '';
let currentStatus = 'active';
let currentClientId = null;

document.addEventListener('DOMContentLoaded', async () => {
    await loadClients();
    setupEventListeners();
});

async function loadClients() {
    showLoading('clientsGrid');

    try {
        const result = await API.clients.list({
            page: currentPage,
            limit: 12,
            status: currentStatus,
            search: currentSearch
        });

        renderClients(result.data);

        renderPagination('pagination', {
            page: result.pagination.page,
            totalPages: result.pagination.totalPages,
            onPageChange: (newPage) => {
                currentPage = newPage;
                loadClients();
            }
        });

        lucide.createIcons();

    } catch (err) {
        console.error('Failed to load clients:', err);
        document.getElementById('clientsGrid').innerHTML = `
            <div class="alert alert-error">
                <i data-lucide="alert-circle"></i>
                <span>Failed to load clients: ${err.message}</span>
            </div>
        `;
        lucide.createIcons();
    }
}

function renderClients(clients) {
    const container = document.getElementById('clientsGrid');

    if (!clients || clients.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1 / -1;">
                <i data-lucide="users"></i>
                <h3>No clients found</h3>
                <p>Add your first client to get started</p>
            </div>
        `;
        return;
    }

    container.innerHTML = clients.map(client => `
        <div class="card stagger-item" onclick="editClient(${client.id})" style="cursor: pointer;">
            <div class="card-body">
                <div class="flex items-start justify-between mb-3">
                    <div>
                        <h3 class="font-semibold text-gray-900">${escapeHtml(client.name)}</h3>
                        ${client.contact_name ? `<p class="text-sm text-gray-500">${escapeHtml(client.contact_name)}</p>` : ''}
                    </div>
                    ${getStatusBadge(client.status)}
                </div>
                <div class="text-sm text-gray-500 mb-3">
                    <div class="flex items-center gap-2 mb-1">
                        <i data-lucide="mail" style="width: 14px; height: 14px;"></i>
                        ${escapeHtml(client.email)}
                    </div>
                    ${client.phone ? `
                        <div class="flex items-center gap-2">
                            <i data-lucide="phone" style="width: 14px; height: 14px;"></i>
                            ${escapeHtml(client.phone)}
                        </div>
                    ` : ''}
                </div>
                <div class="flex justify-between text-sm">
                    <div>
                        <span class="text-gray-500">Rate:</span>
                        <span class="font-medium">${formatCurrency(client.hourly_rate)}/hr</span>
                    </div>
                    <div>
                        <span class="text-gray-500">Unbilled:</span>
                        <span class="font-medium text-accent">${formatDuration(client.unbilled_hours)}</span>
                    </div>
                </div>
            </div>
        </div>
    `).join('');
}

function setupEventListeners() {
    // Search input with debounce
    const searchInput = document.getElementById('searchInput');
    let searchTimeout;

    searchInput.addEventListener('input', (e) => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => {
            currentSearch = e.target.value;
            currentPage = 1;
            loadClients();
        }, 300);
    });

    // Status filter
    document.getElementById('statusFilter').addEventListener('change', (e) => {
        currentStatus = e.target.value;
        currentPage = 1;
        loadClients();
    });

    // Form submission
    document.getElementById('clientForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        await saveClient();
    });

    // Close modal on backdrop click
    document.getElementById('clientModal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) {
            closeModal();
        }
    });
}

function openClientModal(client = null) {
    const modal = document.getElementById('clientModal');
    const form = document.getElementById('clientForm');
    const title = document.getElementById('modalTitle');
    const deleteBtn = document.getElementById('deleteClientBtn');
    const passwordGroup = document.getElementById('passwordGroup');
    const passwordInput = document.getElementById('clientPassword');

    form.reset();
    document.getElementById('clientId').value = '';

    if (client) {
        title.textContent = 'Edit Client';
        document.getElementById('clientId').value = client.id;
        document.getElementById('clientName').value = client.name;
        document.getElementById('clientContact').value = client.contact_name || '';
        document.getElementById('clientEmail').value = client.email;
        document.getElementById('clientPhone').value = client.phone || '';
        document.getElementById('clientAddress').value = client.address || '';
        document.getElementById('clientRate').value = client.hourly_rate || 0;
        document.getElementById('clientStatus').value = client.status;

        passwordInput.required = false;
        passwordInput.placeholder = 'Leave blank to keep existing';
        deleteBtn.style.display = 'block';
        currentClientId = client.id;
    } else {
        title.textContent = 'Add Client';
        passwordInput.required = true;
        passwordInput.placeholder = 'Minimum 6 characters';
        deleteBtn.style.display = 'none';
        currentClientId = null;
    }

    modal.style.display = 'flex';
    lucide.createIcons();
}

async function editClient(id) {
    try {
        const client = await API.clients.get(id);
        openClientModal(client);
    } catch (err) {
        showToast('Failed to load client: ' + err.message, 'error');
    }
}

async function saveClient() {
    const clientId = document.getElementById('clientId').value;
    const password = document.getElementById('clientPassword').value;

    const data = {
        name: document.getElementById('clientName').value,
        contact_name: document.getElementById('clientContact').value || null,
        email: document.getElementById('clientEmail').value,
        phone: document.getElementById('clientPhone').value || null,
        address: document.getElementById('clientAddress').value || null,
        hourly_rate: parseFloat(document.getElementById('clientRate').value) || 0,
        status: document.getElementById('clientStatus').value
    };

    // Only include password if provided
    if (password) {
        data.password = password;
    }

    try {
        if (clientId) {
            await API.clients.update(clientId, data);
            showToast('Client updated!', 'success');
        } else {
            await API.clients.create(data);
            showToast('Client created!', 'success');
        }

        closeModal();
        loadClients();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteClient() {
    if (!currentClientId) return;

    const confirmed = await confirmAction({
        title: 'Delete Client',
        message: 'Are you sure you want to delete this client? This will also delete all associated projects and time entries.',
        confirmText: 'Delete',
        type: 'danger'
    });

    if (confirmed) {
        try {
            await API.clients.delete(currentClientId);
            showToast('Client deleted', 'success');
            closeModal();
            loadClients();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }
}

function closeModal() {
    document.getElementById('clientModal').style.display = 'none';
    currentClientId = null;
}
