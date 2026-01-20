// Frontend Utility Functions

// Date formatting
function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

function formatDateShort(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
    });
}

function formatDateInput(date) {
    const d = new Date(date);
    return d.toISOString().split('T')[0];
}

function getTodayDate() {
    return formatDateInput(new Date());
}

function getMonthAgo() {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return formatDateInput(date);
}

// Duration formatting
function formatDuration(hours) {
    const rounded = Math.round(hours * 10) / 10;
    return `${rounded} ${rounded === 1 ? 'hr' : 'hrs'}`;
}

function roundToTenth(num) {
    return Math.round(num * 10) / 10;
}

// Currency formatting
function formatCurrency(amount) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Time formatting
function formatTime(timeStr) {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour = h % 12 || 12;
    return `${hour}:${minutes} ${ampm}`;
}

// Relative time
function timeAgo(dateStr) {
    const date = new Date(dateStr);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    const intervals = [
        { label: 'year', seconds: 31536000 },
        { label: 'month', seconds: 2592000 },
        { label: 'day', seconds: 86400 },
        { label: 'hour', seconds: 3600 },
        { label: 'minute', seconds: 60 }
    ];

    for (const interval of intervals) {
        const count = Math.floor(seconds / interval.seconds);
        if (count >= 1) {
            return `${count} ${interval.label}${count > 1 ? 's' : ''} ago`;
        }
    }
    return 'just now';
}

// Status badge HTML
function getStatusBadge(status) {
    const badges = {
        active: '<span class="badge badge-green">Active</span>',
        inactive: '<span class="badge badge-gray">Inactive</span>',
        completed: '<span class="badge badge-blue">Completed</span>',
        on_hold: '<span class="badge badge-yellow">On Hold</span>',
        draft: '<span class="badge badge-gray">Draft</span>',
        sent: '<span class="badge badge-blue">Sent</span>',
        paid: '<span class="badge badge-green">Paid</span>',
        overdue: '<span class="badge badge-red">Overdue</span>'
    };
    return badges[status] || `<span class="badge badge-gray">${status}</span>`;
}

// Create element helper
function createElement(tag, attributes = {}, children = []) {
    const el = document.createElement(tag);

    for (const [key, value] of Object.entries(attributes)) {
        if (key === 'className') {
            el.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign(el.style, value);
        } else if (key.startsWith('on') && typeof value === 'function') {
            el.addEventListener(key.slice(2).toLowerCase(), value);
        } else if (key === 'innerHTML') {
            el.innerHTML = value;
        } else if (key === 'textContent') {
            el.textContent = value;
        } else {
            el.setAttribute(key, value);
        }
    }

    for (const child of children) {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child) {
            el.appendChild(child);
        }
    }

    return el;
}

// Show toast notification
function showToast(message, type = 'info') {
    // Remove existing toasts
    document.querySelectorAll('.toast').forEach(t => t.remove());

    const toast = createElement('div', {
        className: `toast alert alert-${type} notification-enter`,
        style: {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: '1000',
            maxWidth: '400px'
        },
        innerHTML: `
            <i data-lucide="${type === 'error' ? 'alert-circle' : type === 'success' ? 'check-circle' : 'info'}"></i>
            <span>${message}</span>
        `
    });

    document.body.appendChild(toast);
    lucide.createIcons();

    setTimeout(() => {
        toast.classList.remove('notification-enter');
        toast.classList.add('notification-exit');
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// Modal component
function showModal({ title, message, confirmText = 'Confirm', cancelText = 'Cancel', type = 'info', onConfirm, onCancel }) {
    // Remove existing modals
    document.querySelectorAll('.modal-overlay').forEach(m => m.remove());

    const iconMap = {
        info: 'info',
        warning: 'alert-triangle',
        error: 'alert-circle',
        success: 'check-circle',
        danger: 'trash-2'
    };

    const modal = createElement('div', {
        className: 'modal-overlay',
        innerHTML: `
            <div class="modal">
                <div class="modal-header">
                    <div class="modal-icon modal-icon-${type}">
                        <i data-lucide="${iconMap[type] || 'info'}"></i>
                    </div>
                    <h3 class="modal-title">${title}</h3>
                </div>
                <div class="modal-body">
                    <p>${message}</p>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary modal-cancel">${cancelText}</button>
                    <button class="btn ${type === 'danger' ? 'btn-danger' : 'btn-primary'} modal-confirm">${confirmText}</button>
                </div>
            </div>
        `
    });

    document.body.appendChild(modal);
    lucide.createIcons();

    // Animate in
    requestAnimationFrame(() => modal.classList.add('open'));

    const closeModal = () => {
        modal.classList.remove('open');
        setTimeout(() => modal.remove(), 200);
    };

    modal.querySelector('.modal-cancel').addEventListener('click', () => {
        closeModal();
        if (onCancel) onCancel();
    });

    modal.querySelector('.modal-confirm').addEventListener('click', () => {
        closeModal();
        if (onConfirm) onConfirm();
    });

    modal.addEventListener('click', (e) => {
        if (e.target === modal) {
            closeModal();
            if (onCancel) onCancel();
        }
    });

    // Handle escape key
    const handleEscape = (e) => {
        if (e.key === 'Escape') {
            closeModal();
            if (onCancel) onCancel();
            document.removeEventListener('keydown', handleEscape);
        }
    };
    document.addEventListener('keydown', handleEscape);
}

// Confirm dialog using modal
function confirmAction({ title, message, confirmText = 'Confirm', type = 'warning' }) {
    return new Promise((resolve) => {
        showModal({
            title,
            message,
            confirmText,
            type,
            onConfirm: () => resolve(true),
            onCancel: () => resolve(false)
        });
    });
}

// Loading state helpers
function showLoading(containerId) {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = '<div class="loading"><div class="spinner"></div></div>';
    }
}

function showEmpty(containerId, message = 'No data found') {
    const container = document.getElementById(containerId);
    if (container) {
        container.innerHTML = `
            <div class="empty-state">
                <i data-lucide="inbox"></i>
                <h3>No entries yet</h3>
                <p>${message}</p>
            </div>
        `;
        lucide.createIcons();
    }
}

// Debounce function
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Pagination helper
function renderPagination(containerId, { page, totalPages, onPageChange }) {
    const container = document.getElementById(containerId);
    if (!container || totalPages <= 1) {
        if (container) container.innerHTML = '';
        return;
    }

    let html = '';

    // Previous button
    html += `<button class="pagination-btn" ${page === 1 ? 'disabled' : ''} data-page="${page - 1}">
        <i data-lucide="chevron-left"></i>
    </button>`;

    // Page numbers
    const maxVisible = 5;
    let start = Math.max(1, page - Math.floor(maxVisible / 2));
    let end = Math.min(totalPages, start + maxVisible - 1);
    start = Math.max(1, end - maxVisible + 1);

    if (start > 1) {
        html += `<button class="pagination-btn" data-page="1">1</button>`;
        if (start > 2) html += `<span class="pagination-btn">...</span>`;
    }

    for (let i = start; i <= end; i++) {
        html += `<button class="pagination-btn ${i === page ? 'active' : ''}" data-page="${i}">${i}</button>`;
    }

    if (end < totalPages) {
        if (end < totalPages - 1) html += `<span class="pagination-btn">...</span>`;
        html += `<button class="pagination-btn" data-page="${totalPages}">${totalPages}</button>`;
    }

    // Next button
    html += `<button class="pagination-btn" ${page === totalPages ? 'disabled' : ''} data-page="${page + 1}">
        <i data-lucide="chevron-right"></i>
    </button>`;

    container.innerHTML = html;
    lucide.createIcons();

    // Add click handlers
    container.querySelectorAll('.pagination-btn[data-page]').forEach(btn => {
        btn.addEventListener('click', () => {
            const newPage = parseInt(btn.dataset.page, 10);
            if (newPage !== page) {
                onPageChange(newPage);
            }
        });
    });
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Truncate text
function truncate(text, length = 100) {
    if (!text || text.length <= length) return text || '';
    return text.substring(0, length) + '...';
}

// Initialize common UI elements
function initCommonUI() {
    // Sidebar toggle
    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');

    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            sidebar.classList.toggle('open');
            if (overlay) overlay.classList.toggle('open');
        });
    }

    if (overlay) {
        overlay.addEventListener('click', () => {
            if (sidebar) sidebar.classList.remove('open');
            overlay.classList.remove('open');
        });
    }

    // User profile logout
    const userProfile = document.getElementById('userProfile');
    if (userProfile) {
        userProfile.addEventListener('click', async () => {
            const confirmed = await confirmAction({
                title: 'Log Out',
                message: 'Are you sure you want to log out?',
                confirmText: 'Log Out',
                type: 'info'
            });
            if (confirmed) {
                try {
                    const isClientPortal = window.location.pathname.startsWith('/client/');
                    await (isClientPortal ? API.auth.clientLogout() : API.auth.logout());
                    window.location.href = isClientPortal ? '/client/login.html' : '/login.html';
                } catch (e) {
                    console.error('Logout error:', e);
                }
            }
        });
    }

    // Initialize Lucide icons
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', initCommonUI);

// Also expose initCommonUI globally for re-initialization
window.initCommonUI = initCommonUI;
