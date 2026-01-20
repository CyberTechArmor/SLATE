// Simple SVG Charts for TimeTracker

// Bar Chart
function renderBarChart(containerId, data, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const {
        height = 160,
        barColor = 'var(--color-accent)',
        labelKey = 'label',
        valueKey = 'value'
    } = options;

    if (!data || data.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500">No data available</p>';
        return;
    }

    const maxValue = Math.max(...data.map(d => d[valueKey]), 1);

    let html = '<div class="bar-chart" style="height: ' + height + 'px;">';

    data.forEach((item, index) => {
        const percentage = (item[valueKey] / maxValue) * 100;
        const barHeight = Math.max(percentage, 2); // Minimum 2% for visibility

        html += `
            <div class="bar-wrapper">
                <div class="bar chart-bar" style="height: ${barHeight}%; background: ${barColor}; animation-delay: ${index * 0.05}s;">
                    <span class="bar-value">${item[valueKey]}</span>
                </div>
                <span class="bar-label">${item[labelKey]}</span>
            </div>
        `;
    });

    html += '</div>';
    container.innerHTML = html;
}

// Mini Sparkline (for stat cards)
function renderSparkline(containerId, data, options = {}) {
    const container = document.getElementById(containerId);
    if (!container || !data || data.length === 0) return;

    const {
        width = 100,
        height = 30,
        strokeColor = 'var(--color-accent)',
        fillColor = 'rgba(59, 130, 246, 0.1)'
    } = options;

    const maxValue = Math.max(...data, 1);
    const minValue = Math.min(...data, 0);
    const range = maxValue - minValue || 1;

    const points = data.map((value, index) => {
        const x = (index / (data.length - 1)) * width;
        const y = height - ((value - minValue) / range) * height;
        return `${x},${y}`;
    });

    const path = `M ${points.join(' L ')}`;
    const areaPath = `M 0,${height} L ${points.join(' L ')} L ${width},${height} Z`;

    container.innerHTML = `
        <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <path d="${areaPath}" fill="${fillColor}" />
            <path d="${path}" fill="none" stroke="${strokeColor}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
    `;
}

// Horizontal Progress Bar
function renderProgressBar(containerId, value, max, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return;

    const {
        height = 8,
        barColor = 'var(--color-accent)',
        bgColor = 'var(--color-gray-200)',
        showLabel = true
    } = options;

    const percentage = Math.min((value / max) * 100, 100);

    container.innerHTML = `
        <div class="progress-bar" style="height: ${height}px; background: ${bgColor};">
            <div class="progress-bar-fill" style="--progress: ${percentage}%; background: ${barColor};"></div>
        </div>
        ${showLabel ? `<div class="flex justify-between text-xs text-gray-500 mt-1">
            <span>${value}</span>
            <span>${max}</span>
        </div>` : ''}
    `;
}

// Donut Chart (for project breakdown)
function renderDonutChart(containerId, data, options = {}) {
    const container = document.getElementById(containerId);
    if (!container || !data || data.length === 0) return;

    const {
        size = 120,
        thickness = 20,
        colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4']
    } = options;

    const total = data.reduce((sum, d) => sum + d.value, 0);
    if (total === 0) {
        container.innerHTML = '<p class="text-center text-gray-500">No data available</p>';
        return;
    }

    const center = size / 2;
    const radius = (size - thickness) / 2;
    const circumference = 2 * Math.PI * radius;

    let currentAngle = -90; // Start from top
    let paths = '';
    let legend = '<div class="mt-4">';

    data.forEach((item, index) => {
        const percentage = (item.value / total) * 100;
        const arcLength = (percentage / 100) * circumference;
        const color = colors[index % colors.length];

        // Create arc path
        const startAngle = currentAngle;
        const endAngle = currentAngle + (percentage / 100) * 360;

        const startRad = (startAngle * Math.PI) / 180;
        const endRad = (endAngle * Math.PI) / 180;

        const x1 = center + radius * Math.cos(startRad);
        const y1 = center + radius * Math.sin(startRad);
        const x2 = center + radius * Math.cos(endRad);
        const y2 = center + radius * Math.sin(endRad);

        const largeArc = percentage > 50 ? 1 : 0;

        if (percentage > 0) {
            paths += `
                <circle
                    cx="${center}"
                    cy="${center}"
                    r="${radius}"
                    fill="none"
                    stroke="${color}"
                    stroke-width="${thickness}"
                    stroke-dasharray="${arcLength} ${circumference}"
                    stroke-dashoffset="${-currentAngle / 360 * circumference + circumference / 4}"
                    style="transform-origin: center; transform: rotate(${currentAngle + 90}deg);"
                />
            `;
        }

        legend += `
            <div class="flex items-center gap-2 mb-1">
                <span style="width: 12px; height: 12px; background: ${color}; border-radius: 2px;"></span>
                <span class="text-sm flex-1 truncate">${item.label}</span>
                <span class="text-sm font-medium">${percentage.toFixed(0)}%</span>
            </div>
        `;

        currentAngle = endAngle;
    });

    legend += '</div>';

    container.innerHTML = `
        <div class="flex items-center gap-4">
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
                <circle cx="${center}" cy="${center}" r="${radius}" fill="none" stroke="var(--color-gray-100)" stroke-width="${thickness}" />
                ${paths}
                <text x="${center}" y="${center}" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="600" fill="var(--color-gray-900)">
                    ${total}
                </text>
                <text x="${center}" y="${center + 14}" text-anchor="middle" dominant-baseline="central" font-size="10" fill="var(--color-gray-500)">
                    total
                </text>
            </svg>
            ${legend}
        </div>
    `;
}

// Animated counter
function animateCounter(elementId, targetValue, duration = 1000) {
    const element = document.getElementById(elementId);
    if (!element) return;

    const startValue = 0;
    const startTime = performance.now();

    function update(currentTime) {
        const elapsed = currentTime - startTime;
        const progress = Math.min(elapsed / duration, 1);

        // Ease out cubic
        const easeProgress = 1 - Math.pow(1 - progress, 3);
        const currentValue = startValue + (targetValue - startValue) * easeProgress;

        // Format based on value type
        if (Number.isInteger(targetValue)) {
            element.textContent = Math.round(currentValue);
        } else {
            element.textContent = currentValue.toFixed(1);
        }

        if (progress < 1) {
            requestAnimationFrame(update);
        }
    }

    requestAnimationFrame(update);
}
