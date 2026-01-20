// Smooth page transitions to prevent flashing
// This approach uses View Transitions API where supported, with CSS fallback

const Navigation = {
    init() {
        // Prefetch links on hover for faster navigation
        this.setupPrefetch();

        // Add transition class before navigation
        this.setupTransitions();
    },

    setupPrefetch() {
        // Prefetch pages when hovering over nav links
        document.querySelectorAll('.nav-item').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || !href.startsWith('/user/')) return;

            let prefetched = false;
            link.addEventListener('mouseenter', () => {
                if (prefetched) return;
                prefetched = true;

                const prefetch = document.createElement('link');
                prefetch.rel = 'prefetch';
                prefetch.href = href;
                document.head.appendChild(prefetch);
            });
        });
    },

    setupTransitions() {
        // Add smooth transitions when clicking nav links
        document.querySelectorAll('.nav-item').forEach(link => {
            const href = link.getAttribute('href');
            if (!href || !href.startsWith('/user/')) return;

            link.addEventListener('click', (e) => {
                // Don't intercept if same page
                if (href === window.location.pathname) {
                    e.preventDefault();
                    return;
                }

                // Use View Transitions API if available
                if (document.startViewTransition) {
                    e.preventDefault();
                    document.startViewTransition(() => {
                        window.location.href = href;
                    });
                } else {
                    // Fallback: add exit animation class
                    const mainContent = document.querySelector('.main-content');
                    if (mainContent) {
                        e.preventDefault();
                        mainContent.classList.add('page-exit');
                        setTimeout(() => {
                            window.location.href = href;
                        }, 100);
                    }
                }
            });
        });
    }
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
    Navigation.init();
});

// Add enter animation when page loads
window.addEventListener('pageshow', () => {
    const mainContent = document.querySelector('.main-content');
    if (mainContent) {
        mainContent.classList.add('page-enter');
        setTimeout(() => {
            mainContent.classList.remove('page-enter');
        }, 300);
    }
});
