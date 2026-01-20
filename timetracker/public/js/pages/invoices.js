// Invoices Page JavaScript

let currentPage = 1;
let currentClient = '';
let currentStatus = '';
let currentInvoiceId = null;
let clients = [];
let selectedEntries = [];
let unbilledEntries = [];

document.addEventListener('DOMContentLoaded', async () => {
    await loadFilters();
    await loadInvoices();
    await loadSummary();
    setupEventListeners();
});

async function loadFilters() {
    try {
        const clientsData = await API.clients.list({ status: 'active', limit: 100 });
        clients = clientsData.data;

        const clientFilter = document.getElementById('clientFilter');
        const invoiceClient = document.getElementById('invoiceClient');

        clients.forEach(client => {
            const option = document.createElement('option');
            option.value = client.id;
            option.textContent = client.name;
            clientFilter.appendChild(option.cloneNode(true));
            if (invoiceClient) invoiceClient.appendChild(option);
        });

    } catch (err) {
        console.error('Failed to load clients:', err);
    }
}

async function loadSummary() {
    try {
        const summary = await API.dashboard.invoicesSummary();

        document.getElementById('draftCount').textContent = summary.summary.draft?.count || 0;
        document.getElementById('sentCount').textContent = summary.summary.sent?.count || 0;
        document.getElementById('paidCount').textContent = summary.summary.paid?.count || 0;
        document.getElementById('overdueCount').textContent = summary.summary.overdue?.count || 0;

    } catch (err) {
        console.error('Failed to load summary:', err);
    }
}

async function loadInvoices() {
    document.getElementById('invoicesBody').innerHTML = `
        <tr><td colspan="7" class="loading"><div class="spinner"></div></td></tr>
    `;

    try {
        const params = { page: currentPage, limit: 20 };
        if (currentClient) params.client = currentClient;
        if (currentStatus) params.status = currentStatus;

        const result = await API.invoices.list(params);

        renderInvoices(result.data);

        renderPagination('pagination', {
            page: result.pagination.page,
            totalPages: result.pagination.totalPages,
            onPageChange: (newPage) => {
                currentPage = newPage;
                loadInvoices();
            }
        });

        lucide.createIcons();

    } catch (err) {
        console.error('Failed to load invoices:', err);
        document.getElementById('invoicesBody').innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="alert alert-error">
                        <i data-lucide="alert-circle"></i>
                        <span>Failed to load invoices: ${err.message}</span>
                    </div>
                </td>
            </tr>
        `;
        lucide.createIcons();
    }
}

function renderInvoices(invoices) {
    const tbody = document.getElementById('invoicesBody');

    if (!invoices || invoices.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7">
                    <div class="empty-state">
                        <i data-lucide="file-text"></i>
                        <h3>No invoices found</h3>
                        <p>Create your first invoice from unbilled time entries</p>
                    </div>
                </td>
            </tr>
        `;
        return;
    }

    tbody.innerHTML = invoices.map(invoice => `
        <tr class="stagger-item" style="cursor: pointer;" onclick="viewInvoice(${invoice.id})">
            <td class="font-medium">${escapeHtml(invoice.invoice_number)}</td>
            <td>${escapeHtml(invoice.client_name)}</td>
            <td>${formatDate(invoice.date_issued)}</td>
            <td>${invoice.date_due ? formatDate(invoice.date_due) : '-'}</td>
            <td class="font-semibold">${formatCurrency(invoice.total)}</td>
            <td>${getStatusBadge(invoice.status)}</td>
            <td>
                <button class="btn btn-ghost btn-icon btn-sm" onclick="event.stopPropagation(); viewInvoice(${invoice.id})">
                    <i data-lucide="eye"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function setupEventListeners() {
    document.getElementById('clientFilter').addEventListener('change', (e) => {
        currentClient = e.target.value;
        currentPage = 1;
        loadInvoices();
    });

    document.getElementById('statusFilter').addEventListener('change', (e) => {
        currentStatus = e.target.value;
        currentPage = 1;
        loadInvoices();
    });

    document.getElementById('invoiceTaxRate').addEventListener('change', updateTotals);

    // Modal backdrop clicks
    document.getElementById('createInvoiceModal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) closeCreateModal();
    });

    document.getElementById('viewInvoiceModal').addEventListener('click', (e) => {
        if (e.target.classList.contains('modal-backdrop')) closeViewModal();
    });
}

function openCreateInvoice() {
    const modal = document.getElementById('createInvoiceModal');

    // Reset form
    document.getElementById('invoiceClient').value = '';
    document.getElementById('invoiceDate').value = getTodayDate();
    document.getElementById('invoiceDueDate').value = '';
    document.getElementById('invoiceTaxRate').value = '0';
    document.getElementById('invoiceNotes').value = '';
    document.getElementById('unbilledEntries').innerHTML = '<p class="text-sm text-gray-500">Select a client to see unbilled entries</p>';

    selectedEntries = [];
    unbilledEntries = [];
    updateTotals();

    modal.style.display = 'flex';
    lucide.createIcons();
}

async function loadUnbilledEntries() {
    const clientId = document.getElementById('invoiceClient').value;
    const container = document.getElementById('unbilledEntries');

    if (!clientId) {
        container.innerHTML = '<p class="text-sm text-gray-500">Select a client to see unbilled entries</p>';
        selectedEntries = [];
        unbilledEntries = [];
        updateTotals();
        return;
    }

    container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';

    try {
        const result = await API.entries.list({
            client: clientId,
            invoiced: 'false',
            billable: 'true',
            limit: 100
        });

        unbilledEntries = result.data;
        selectedEntries = [];

        if (unbilledEntries.length === 0) {
            container.innerHTML = '<p class="text-sm text-gray-500">No unbilled entries for this client</p>';
            return;
        }

        container.innerHTML = `
            <div class="flex justify-between items-center mb-3">
                <label class="checkbox-wrapper">
                    <input type="checkbox" id="selectAllEntries" onchange="toggleAllEntries(this.checked)">
                    <span class="checkbox-custom">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                            <polyline points="20 6 9 17 4 12"></polyline>
                        </svg>
                    </span>
                    <span class="checkbox-label">Select All</span>
                </label>
                <span class="text-sm text-gray-500">${unbilledEntries.length} entries</span>
            </div>
            <div style="max-height: 200px; overflow-y: auto;">
                ${unbilledEntries.map(entry => `
                    <div class="flex items-center gap-3 py-2 border-b border-gray-100">
                        <label class="checkbox-wrapper" style="margin: 0;">
                            <input type="checkbox" data-entry-id="${entry.id}" onchange="toggleEntry(${entry.id})">
                            <span class="checkbox-custom">
                                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                                    <polyline points="20 6 9 17 4 12"></polyline>
                                </svg>
                            </span>
                        </label>
                        <div class="flex-1 min-w-0">
                            <div class="text-sm font-medium truncate">${escapeHtml(entry.title)}</div>
                            <div class="text-xs text-gray-500">${formatDateShort(entry.date)} ${entry.project_name ? `- ${entry.project_name}` : ''}</div>
                        </div>
                        <div class="text-right">
                            <div class="text-sm font-medium">${formatDuration(entry.duration)}</div>
                            <div class="text-xs text-gray-500">${formatCurrency(entry.duration * entry.effective_rate)}</div>
                        </div>
                    </div>
                `).join('')}
            </div>
        `;

        lucide.createIcons();
        updateTotals();

    } catch (err) {
        container.innerHTML = `<p class="text-error text-sm">Failed to load entries: ${err.message}</p>`;
    }
}

function toggleEntry(entryId) {
    const index = selectedEntries.indexOf(entryId);
    if (index > -1) {
        selectedEntries.splice(index, 1);
    } else {
        selectedEntries.push(entryId);
    }
    updateTotals();
    updateSelectAllCheckbox();
}

function toggleAllEntries(checked) {
    selectedEntries = checked ? unbilledEntries.map(e => e.id) : [];

    document.querySelectorAll('[data-entry-id]').forEach(checkbox => {
        checkbox.checked = checked;
    });

    updateTotals();
}

function updateSelectAllCheckbox() {
    const selectAll = document.getElementById('selectAllEntries');
    if (selectAll) {
        selectAll.checked = selectedEntries.length === unbilledEntries.length && unbilledEntries.length > 0;
    }
}

function updateTotals() {
    const selected = unbilledEntries.filter(e => selectedEntries.includes(e.id));
    const hours = selected.reduce((sum, e) => sum + e.duration, 0);
    const subtotal = selected.reduce((sum, e) => sum + (e.duration * e.effective_rate), 0);
    const taxRate = parseFloat(document.getElementById('invoiceTaxRate').value) || 0;
    const tax = subtotal * (taxRate / 100);
    const total = subtotal + tax;

    document.getElementById('totalHours').textContent = formatDuration(hours);
    document.getElementById('subtotal').textContent = formatCurrency(subtotal);
    document.getElementById('taxAmount').textContent = formatCurrency(tax);
    document.getElementById('grandTotal').textContent = formatCurrency(total);
}

async function createInvoice() {
    if (selectedEntries.length === 0) {
        showToast('Please select at least one time entry', 'error');
        return;
    }

    const data = {
        client_id: parseInt(document.getElementById('invoiceClient').value, 10),
        date_issued: document.getElementById('invoiceDate').value,
        date_due: document.getElementById('invoiceDueDate').value || null,
        tax_rate: parseFloat(document.getElementById('invoiceTaxRate').value) || 0,
        notes: document.getElementById('invoiceNotes').value || null,
        time_entry_ids: selectedEntries
    };

    try {
        const invoice = await API.invoices.create(data);
        showToast('Invoice created!', 'success');
        closeCreateModal();
        loadInvoices();
        loadSummary();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function viewInvoice(id) {
    currentInvoiceId = id;

    try {
        const invoice = await API.invoices.get(id);
        renderInvoiceView(invoice);

        document.getElementById('viewInvoiceModal').style.display = 'flex';
        lucide.createIcons();

    } catch (err) {
        showToast('Failed to load invoice: ' + err.message, 'error');
    }
}

function renderInvoiceView(invoice) {
    document.getElementById('viewInvoiceTitle').textContent = `Invoice ${invoice.invoice_number}`;

    // Show/hide action buttons based on status
    const markSentBtn = document.getElementById('markSentBtn');
    const markPaidBtn = document.getElementById('markPaidBtn');
    const deleteBtn = document.getElementById('deleteInvoiceBtn');

    markSentBtn.style.display = invoice.status === 'draft' ? 'block' : 'none';
    markPaidBtn.style.display = invoice.status === 'sent' || invoice.status === 'overdue' ? 'block' : 'none';
    deleteBtn.style.display = invoice.status === 'draft' ? 'block' : 'none';

    const content = document.getElementById('invoiceContent');
    content.innerHTML = `
        <div class="flex justify-between items-start mb-6">
            <div>
                <h2 class="text-2xl font-bold mb-2">Invoice</h2>
                <p class="text-gray-500">${invoice.invoice_number}</p>
            </div>
            ${getStatusBadge(invoice.status)}
        </div>

        <div class="grid grid-cols-2 gap-6 mb-6">
            <div>
                <div class="text-xs text-gray-500 uppercase tracking-wide mb-1">Bill To</div>
                <div class="font-semibold">${escapeHtml(invoice.client_name)}</div>
                ${invoice.client_contact ? `<div class="text-sm text-gray-600">${escapeHtml(invoice.client_contact)}</div>` : ''}
                ${invoice.client_email ? `<div class="text-sm text-gray-600">${escapeHtml(invoice.client_email)}</div>` : ''}
                ${invoice.client_address ? `<div class="text-sm text-gray-600">${escapeHtml(invoice.client_address)}</div>` : ''}
            </div>
            <div class="text-right">
                <div class="mb-2">
                    <div class="text-xs text-gray-500 uppercase">Issue Date</div>
                    <div class="font-medium">${formatDate(invoice.date_issued)}</div>
                </div>
                ${invoice.date_due ? `
                    <div>
                        <div class="text-xs text-gray-500 uppercase">Due Date</div>
                        <div class="font-medium">${formatDate(invoice.date_due)}</div>
                    </div>
                ` : ''}
            </div>
        </div>

        <div class="table-container mb-6">
            <table>
                <thead>
                    <tr>
                        <th>Date</th>
                        <th>Description</th>
                        <th>Hours</th>
                        <th>Rate</th>
                        <th class="text-right">Amount</th>
                    </tr>
                </thead>
                <tbody>
                    ${invoice.time_entries.map(entry => `
                        <tr>
                            <td>${formatDateShort(entry.date)}</td>
                            <td>
                                <div class="font-medium">${escapeHtml(entry.title)}</div>
                                ${entry.project_name ? `<div class="text-xs text-gray-500">${entry.project_name}</div>` : ''}
                            </td>
                            <td>${entry.duration}</td>
                            <td>${formatCurrency(entry.rate)}</td>
                            <td class="text-right">${formatCurrency(entry.amount)}</td>
                        </tr>
                    `).join('')}
                    ${invoice.items.map(item => `
                        <tr>
                            <td>-</td>
                            <td>${escapeHtml(item.description)}</td>
                            <td>${item.quantity}</td>
                            <td>${formatCurrency(item.rate)}</td>
                            <td class="text-right">${formatCurrency(item.amount)}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        <div class="flex justify-end">
            <div style="width: 250px;">
                <div class="flex justify-between py-2 border-b">
                    <span class="text-gray-600">Subtotal</span>
                    <span class="font-medium">${formatCurrency(invoice.subtotal)}</span>
                </div>
                ${invoice.tax_rate > 0 ? `
                    <div class="flex justify-between py-2 border-b">
                        <span class="text-gray-600">Tax (${invoice.tax_rate}%)</span>
                        <span>${formatCurrency(invoice.tax_amount)}</span>
                    </div>
                ` : ''}
                <div class="flex justify-between py-3 text-lg font-bold">
                    <span>Total</span>
                    <span>${formatCurrency(invoice.total)}</span>
                </div>
            </div>
        </div>

        ${invoice.notes ? `
            <div class="mt-6 p-4 bg-gray-50 rounded-lg">
                <div class="text-sm font-medium mb-1">Notes</div>
                <div class="text-sm text-gray-600">${escapeHtml(invoice.notes)}</div>
            </div>
        ` : ''}
    `;
}

async function markAsSent() {
    if (!currentInvoiceId) return;

    try {
        await API.invoices.send(currentInvoiceId);
        showToast('Invoice marked as sent', 'success');
        closeViewModal();
        loadInvoices();
        loadSummary();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function markAsPaid() {
    if (!currentInvoiceId) return;

    try {
        await API.invoices.markPaid(currentInvoiceId);
        showToast('Invoice marked as paid', 'success');
        closeViewModal();
        loadInvoices();
        loadSummary();
    } catch (err) {
        showToast(err.message, 'error');
    }
}

async function deleteInvoice() {
    if (!currentInvoiceId) return;

    if (confirm('Are you sure you want to delete this draft invoice? Time entries will become unbilled again.')) {
        try {
            await API.invoices.delete(currentInvoiceId);
            showToast('Invoice deleted', 'success');
            closeViewModal();
            loadInvoices();
            loadSummary();
        } catch (err) {
            showToast(err.message, 'error');
        }
    }
}

function printInvoice() {
    window.print();
}

function closeCreateModal() {
    document.getElementById('createInvoiceModal').style.display = 'none';
}

function closeViewModal() {
    document.getElementById('viewInvoiceModal').style.display = 'none';
    currentInvoiceId = null;
}

// WebSocket handlers
ws.on('invoice:created', () => {
    loadInvoices();
    loadSummary();
});
ws.on('invoice:updated', () => {
    loadInvoices();
    loadSummary();
});
