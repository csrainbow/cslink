// ======== State Management ========
const state = {
    currentPage: 1,
    currentLinks: [],
    selectedURL: null
};

// ======== DOM Elements ========
const shortenForm = document.getElementById('shorten-form');
const urlInput = document.getElementById('url-input');
const customCodeInput = document.getElementById('custom-code');
const expiresSelect = document.getElementById('expires');
const shortenResult = document.getElementById('shorten-result');
const shortUrlInput = document.getElementById('short-url');
const originalUrlText = document.getElementById('original-url');
const copyBtn = document.getElementById('copy-btn');
const openLinkBtn = document.getElementById('open-link');
const viewAnalyticsBtn = document.getElementById('view-analytics');
const viewQRBtn = document.getElementById('view-qr');
const closeResultBtn = document.getElementById('close-result');
const linksTbody = document.getElementById('links-tbody');
const linksEmpty = document.getElementById('links-empty');
const pagination = document.getElementById('pagination');
const searchInput = document.getElementById('search-input');
const analyticsUrlSelect = document.getElementById('analytics-url-select');
const analyticsContent = document.getElementById('analytics-content');

// ======== Auth Helper ========
async function authFetch(url, options) {
    const res = await fetch(url, options);
    if (res.status === 401) {
        window.location.href = '/login';
        throw new Error('Sesi berakhir, silakan masuk kembali.');
    }
    return res;
}

// ======== Navigation ========
document.querySelectorAll('.nav-link').forEach(link => {
    link.addEventListener('click', function(e) {
        const section = this.dataset.section;
        if (!section) return;
        e.preventDefault();
        navigateTo(section);
    });
});

function navigateTo(section) {
    document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.add('hidden'));
    
    if (section === 'home') {
        document.getElementById('home').classList.remove('hidden');
        document.querySelector('[data-section="home"]').classList.add('active');
    } else {
        document.getElementById(section).classList.remove('hidden');
        document.querySelector(`[data-section="${section}"]`).classList.add('active');
        
        if (section === 'links') {
            loadLinks();
        }
        if (section === 'analytics') {
            loadAnalyticsSelect();
        }
    }
    
    window.scrollTo({ top: 0, behavior: 'smooth' });
}

// ======== Toast Notifications ========
function showToast(message, type = 'success') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

// ======== Shorten URL ========
shortenForm.addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const url = urlInput.value.trim();
    if (!url) {
        showToast('Silakan masukkan URL', 'error');
        return;
    }
    
    const submitBtn = this.querySelector('.btn-shorten');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<span class="loading"></span> Memproses...';
    submitBtn.disabled = true;
    
    try {
        const response = await authFetch('/api/shorten', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                url,
                customCode: customCodeInput.value || undefined,
                expiresIn: expiresSelect.value || undefined
            })
        });
        
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Gagal memperpendek URL');
        }
        
        displayResult(data);
    } catch (error) {
        showToast(error.message || 'Terjadi kesalahan. Coba lagi.', 'error');
    } finally {
        submitBtn.innerHTML = originalText;
        submitBtn.disabled = false;
    }
});

function displayResult(data) {
    shortUrlInput.value = data.short_url;
    originalUrlText.textContent = data.original_url;
    
    state.selectedURL = data;
    
    shortUrlInput.dataset.code = data.short_code;
    viewAnalyticsBtn.dataset.code = data.short_code;
    viewQRBtn.dataset.code = data.short_code;
    
    shortenResult.classList.remove('hidden');
}

// ======== Copy URL ========
copyBtn.addEventListener('click', async function() {
    try {
        await navigator.clipboard.writeText(shortUrlInput.value);
        showToast('Link berhasil disalin!');
    } catch (err) {
        shortUrlInput.select();
        document.execCommand('copy');
        showToast('Link berhasil disalin!');
    }
});

openLinkBtn.addEventListener('click', function() {
    window.open(shortUrlInput.value, '_blank');
});

viewAnalyticsBtn.addEventListener('click', function() {
    const code = this.dataset.code;
    if (code) {
        showAnalytics(code);
    } else {
        showToast('Link belum dibuat', 'error');
    }
});

viewQRBtn.addEventListener('click', function() {
    const code = this.dataset.code;
    if (code) {
        showQR(code);
    } else {
        showToast('Link belum dibuat', 'error');
    }
});

closeResultBtn.addEventListener('click', function() {
    shortenResult.classList.add('hidden');
    urlInput.value = '';
    customCodeInput.value = '';
    expiresSelect.value = '';
});

// ======== Load Stats ========
async function loadStats() {
    try {
        const response = await authFetch('/api/stats');
        const data = await response.json();
        
        document.getElementById('stat-urls').textContent = data.total_urls || 0;
        document.getElementById('stat-clicks').textContent = data.total_clicks || 0;
        document.getElementById('stat-today').textContent = data.today_clicks || 0;
        document.getElementById('stat-active').textContent = data.active_urls || 0;
    } catch (error) {
        console.error('Failed to load stats:', error);
    }
}

// ======== Links Management ========
async function loadLinks(page = 1, search = '') {
    try {
        let url = `/api/urls?page=${page}&limit=10`;
        if (search) {
            url += `&search=${encodeURIComponent(search)}`;
        }
        
        const response = await authFetch(url);
        const data = await response.json();
        
        state.currentPage = data.pagination.page;
        renderLinks(data.urls);
        renderPagination(data.pagination);
    } catch (error) {
        console.error('Failed to load links:', error);
        showToast('Gagal memuat data link', 'error');
    }
}

function renderLinks(urls) {
    if (urls.length === 0) {
        linksTbody.innerHTML = '';
        linksEmpty.classList.remove('hidden');
        pagination.innerHTML = '';
        return;
    }
    
    linksEmpty.classList.add('hidden');
    
    linksTbody.innerHTML = urls.map(url => `
        <tr>
            <td class="url-cell">
                <span class="url-original" title="${escapeHtml(url.original_url)}">${escapeHtml(url.original_url)}</span>
                <span class="url-title">${escapeHtml(url.title || url.short_code)}</span>
            </td>
            <td>
                <span class="short-code-cell">/${escapeHtml(url.short_code)}</span>
            </td>
            <td>
                <span class="click-count">${url.click_count || 0}</span>
            </td>
            <td class="created-date">
                ${formatDate(url.created_at)}
            </td>
            <td>
                <span class="badge ${url.is_active ? 'badge-active' : 'badge-inactive'}">
                    ${url.is_active ? 'Aktif' : 'Nonaktif'}
                </span>
            </td>
            <td>
                <div class="action-buttons">
                    <button class="action-btn" title="Analitik" onclick="showAnalytics('${url.short_code}')"><i class="fas fa-chart-line"></i></button>
                    <button class="action-btn" title="QR Code" onclick="showQR('${url.short_code}')"><i class="fas fa-qrcode"></i></button>
                    <button class="action-btn" title="Toggle" onclick="toggleURL('${url.short_code}')"><i class="fas fa-power-off"></i></button>
                    <button class="action-btn danger" title="Hapus" onclick="deleteURL('${url.short_code}')"><i class="fas fa-trash-alt"></i></button>
                </div>
            </td>
        </tr>
    `).join('');
}

function renderPagination(paginationData) {
    if (paginationData.pages <= 1) {
        pagination.innerHTML = '';
        return;
    }
    
    let html = '';
    
    if (paginationData.page > 1) {
        html += `<button class="page-btn" onclick="changePage(${paginationData.page - 1})"><i class="fas fa-chevron-left"></i></button>`;
    }
    
    for (let i = 1; i <= paginationData.pages; i++) {
        if (i === paginationData.page || 
            (i === 1) || 
            (i === paginationData.pages) || 
            (Math.abs(i - paginationData.page) <= 2)) {
            html += `<button class="page-btn ${i === paginationData.page ? 'active' : ''}" onclick="changePage(${i})">${i}</button>`;
        } else if (i === paginationData.page - 2 || i === paginationData.page + 2) {
            html += '<span class="page-btn">...</span>';
        }
    }
    
    if (paginationData.page < paginationData.pages) {
        html += `<button class="page-btn" onclick="changePage(${paginationData.page + 1})"><i class="fas fa-chevron-right"></i></button>`;
    }
    
    pagination.innerHTML = html;
}

function changePage(page) {
    state.currentPage = page;
    loadLinks(page, searchInput.value);
}

// Search
let searchTimeout;
searchInput.addEventListener('input', function() {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        loadLinks(1, this.value);
    }, 500);
});

// ======== URL Actions ========
async function toggleURL(code) {
    try {
        const response = await authFetch(`/api/url/${code}/toggle`, { method: 'PATCH' });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Gagal toggle status');
        }
        
        showToast(`Link ${data.is_active ? 'diaktifkan' : 'dinonaktifkan'}`);
        loadLinks(state.currentPage, searchInput.value);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

async function deleteURL(code) {
    if (!confirm('Yakin ingin menghapus link ini?')) return;
    
    try {
        const response = await authFetch(`/api/url/${code}`, { method: 'DELETE' });
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Gagal menghapus link');
        }
        
        showToast('Link berhasil dihapus');
        loadLinks(state.currentPage, searchInput.value);
    } catch (error) {
        showToast(error.message, 'error');
    }
}

// ======== Analytics ========
async function loadAnalyticsSelect() {
    try {
        const response = await authFetch('/api/urls?limit=100');
        const data = await response.json();
        
        analyticsUrlSelect.innerHTML = '<option value="">Pilih link untuk dianalisis...</option>';
        
        data.urls.forEach(url => {
            const option = document.createElement('option');
            option.value = url.short_code;
            option.textContent = `/${url.short_code} — ${truncate(url.original_url, 30)}`;
            analyticsUrlSelect.appendChild(option);
        });
        
        analyticsContent.innerHTML = '';
    } catch (error) {
        console.error('Failed to load analytics select:', error);
    }
}

analyticsUrlSelect.addEventListener('change', function() {
    const code = this.value;
    if (!code) {
        analyticsContent.innerHTML = '';
        return;
    }
    showAnalytics(code);
});

function showAnalytics(code) {
    navigateTo('analytics');
    
    // Ensure the dropdown is populated before selecting (async)
    const selectOptions = Array.from(analyticsUrlSelect.options).map(o => o.value);
    if (!selectOptions.includes(code)) {
        loadAnalyticsSelect().then(() => {
            analyticsUrlSelect.value = code;
        });
    } else {
        analyticsUrlSelect.value = code;
    }
    fetchAnalytics(code);
}

async function fetchAnalytics(code) {
    analyticsContent.innerHTML = '<div class="loading-container"><span class="loading"></span> Memuat analitik...</div>';
    
    try {
        const response = await authFetch(`/api/analytics/${code}`);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Gagal memuat analitik');
        }
        
        renderAnalytics(data);
    } catch (error) {
        analyticsContent.innerHTML = `<p class="error-message">${error.message}</p>`;
    }
}

function renderAnalytics(data) {
    const { url, analytics } = data;

    const totalBrowser = analytics.clicks_by_browser.reduce((sum, b) => sum + b.count, 0) || 1;
    const totalOS = analytics.clicks_by_os.reduce((sum, o) => sum + o.count, 0) || 1;
    const maxDay = Math.max(...analytics.clicks_by_day.map(d => d.count), 1);
    const deviceCount = device => analytics.clicks_by_device.find(d => d.device === device)?.count || 0;

    const dayBars = analytics.clicks_by_day.length
        ? analytics.clicks_by_day.map(d => `
                        <div class="day-bar" style="height: ${(d.count / maxDay) * 100}%" title="${d.date}: ${d.count} klik"></div>
                    `).join('')
        : '<p class="no-data">Belum ada klik</p>';

    const daySummary = analytics.clicks_by_day.length
        ? `<div class="chart-meta">
                    <span>${formatDate(analytics.clicks_by_day[0].date)} &ndash; ${formatDate(analytics.clicks_by_day[analytics.clicks_by_day.length - 1].date)}</span>
                    <span class="chart-total"><strong>${analytics.total_clicks}</strong> klik</span>
                </div>`
        : '';

    const bars = (list, total) => list.length
        ? `<div class="bar-chart">
                    ${list.slice(0, 5).map(item => `
                        <div class="bar-row">
                            <span class="bar-label">${item.browser || item.os}</span>
                            <div class="bar-track">
                                <div class="bar-fill" style="width: ${(item.count / total) * 100}%">
                                    <span class="bar-value">${item.count}</span>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>`
        : '<p class="no-data">Belum ada data</p>';

    const recentRows = analytics.recent_clicks.length
        ? analytics.recent_clicks.slice(0, 10).map(c => `
                    <tr>
                        <td class="recent-main"><i class="fas fa-globe recent-icon"></i>${c.browser} <span class="recent-sep">/</span> ${c.os}</td>
                        <td><span class="device-chip ${c.device}">${c.device}</span></td>
                        <td class="recent-ip">${c.ip_address || '&ndash;'}</td>
                        <td class="recent-date">${formatDate(c.clicked_at)}</td>
                    </tr>`).join('')
        : '<tr><td colspan="4" class="empty-row">Belum ada klik</td></tr>';

    const content = `
        <div class="analytics-overview">
            <div class="stat-block main">
                <span class="stat-num">${analytics.total_clicks}</span>
                <span class="stat-lbl">Total Klik</span>
            </div>
            <div class="stat-block">
                <span class="stat-num">${deviceCount('mobile')}</span>
                <span class="stat-lbl"><i class="fas fa-mobile-alt"></i> Mobile</span>
            </div>
            <div class="stat-block">
                <span class="stat-num">${deviceCount('desktop')}</span>
                <span class="stat-lbl"><i class="fas fa-desktop"></i> Desktop</span>
            </div>
            <div class="stat-block">
                <span class="stat-num">${deviceCount('tablet')}</span>
                <span class="stat-lbl"><i class="fas fa-tablet-alt"></i> Tablet</span>
            </div>
        </div>

        <div class="chart-card">
            <h3><i class="fas fa-chart-bar"></i> Grafik Klik per Hari</h3>
            <div class="day-chart">${dayBars}</div>
            ${daySummary}
        </div>

        <div class="breakdown-grid">
            <div class="analytics-card">
                <h3><i class="fas fa-globe"></i> Browser</h3>
                ${bars(analytics.clicks_by_browser, totalBrowser)}
            </div>
            <div class="analytics-card">
                <h3><i class="fab fa-windows"></i> Sistem Operasi</h3>
                ${bars(analytics.clicks_by_os, totalOS)}
            </div>
        </div>

        <div class="links-table-wrapper recent-table">
            <table class="links-table">
                <thead>
                    <tr>
                        <th>Klik Terbaru</th>
                        <th>Device</th>
                        <th>IP</th>
                        <th>Waktu</th>
                    </tr>
                </thead>
                <tbody>${recentRows}</tbody>
            </table>
        </div>
    `;

    analyticsContent.innerHTML = content;
}

// ======== QR Code ========
const qrSettings = {
    size: 300,
    format: 'png',
    dark: '#1a1a2e',
    light: '#ffffff'
};

function loadQRSettings() {
    try {
        const saved = JSON.parse(localStorage.getItem('linkly-qr-settings'));
        if (saved) {
            Object.assign(qrSettings, saved);
        }
    } catch (e) {}
}

function saveQRSettings() {
    localStorage.setItem('linkly-qr-settings', JSON.stringify(qrSettings));
}

let currentQRCache = null;

function buildQRQuery(code) {
    const params = new URLSearchParams();
    params.set('size', qrSettings.size);
    params.set('format', qrSettings.format);
    params.set('dark', qrSettings.dark);
    params.set('light', qrSettings.light);
    return `/api/qr/${code}?${params.toString()}`;
}

function renderQRInto(container, data) {
    container.innerHTML = '';
    if (data.format === 'svg') {
        const svgContainer = document.createElement('div');
        svgContainer.className = 'qr-svg';
        svgContainer.innerHTML = data.svg;
        container.appendChild(svgContainer);
    } else {
        const img = document.createElement('img');
        img.src = data.qr;
        img.alt = 'QR Code';
        img.className = 'qr-img';
        container.appendChild(img);
    }
}

function getQRDownloadData(data) {
    if (data.format === 'svg') {
        const blob = new Blob([data.svg], { type: 'image/svg+xml' });
        return { url: URL.createObjectURL(blob), filename: `qr-${Date.now()}.svg` };
    }
    return { url: data.qr, filename: `qr-${Date.now()}.png` };
}

async function showQR(code) {
    try {
        const response = await authFetch(buildQRQuery(code));
        const data = await response.json();
        if (data.error || !response.ok) {
            showToast(data.error || 'Gagal membuat QR code', 'error');
            return;
        }

        currentQRCache = data;
        const container = document.getElementById('qr-container');
        renderQRInto(container, data);
        document.getElementById('qr-url').textContent = data.url;
        document.getElementById('qr-modal').classList.remove('hidden');
    } catch (error) {
        showToast('Gagal membuat QR code', 'error');
    }
}

function closeQRModal() {
    document.getElementById('qr-modal').classList.add('hidden');
}

document.getElementById('download-qr').addEventListener('click', function() {
    if (!currentQRCache) return;
    const { url, filename } = getQRDownloadData(currentQRCache);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    if (currentQRCache.format === 'svg') {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
});

// Close modal on outside click
document.getElementById('qr-modal').addEventListener('click', function(e) {
    if (e.target === this) {
        closeQRModal();
    }
});

// ======== Utility Functions ========
function formatDate(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString.replace(' ', 'T'));
    return date.toLocaleDateString('id-ID', { 
        day: 'numeric', 
        month: 'short', 
        year: 'numeric' 
    });
}

function formatDateWithTime(dateString) {
    if (!dateString) return '-';
    const date = new Date(dateString.replace(' ', 'T'));
    return date.toLocaleString('id-ID', { 
        day: 'numeric', 
        month: 'short', 
        hour: '2-digit', 
        minute: '2-digit' 
    });
}

function truncate(str, length) {
    if (!str) return '';
    return str.length > length ? str.substring(0, length) + '...' : str;
}

function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// ======== Analytics link buttons ========
// Make these functions globally accessible
window.showAnalytics = showAnalytics;
window.showQR = showQR;
window.changePage = changePage;
window.toggleURL = toggleURL;
window.deleteURL = deleteURL;
window.closeQRModal = closeQRModal;

// ======== Settings ========
function initSettings() {
    const sizeInput = document.getElementById('qr-size');
    const sizeValue = document.getElementById('qr-size-value');
    const formatSegments = document.querySelectorAll('#qr-format .segment');
    const darkColor = document.getElementById('qr-dark');
    const darkHex = document.getElementById('qr-dark-hex');
    const lightColor = document.getElementById('qr-light');
    const lightHex = document.getElementById('qr-light-hex');
    const previewHint = document.getElementById('preview-hint');
    const previewInfo = document.getElementById('preview-info');
    const previewImg = document.getElementById('preview-qr-img');

    // Apply saved settings to form controls
    function applyForm() {
        sizeInput.value = qrSettings.size;
        sizeValue.textContent = `${qrSettings.size} px`;
        formatSegments.forEach(seg => {
            seg.classList.toggle('active', seg.dataset.format === qrSettings.format);
        });
        darkColor.value = qrSettings.dark;
        darkHex.value = qrSettings.dark.toUpperCase();
        lightColor.value = qrSettings.light;
        lightHex.value = qrSettings.light.toUpperCase();
    }

    function isValidHex(v) {
        return /^#?[0-9a-fA-F]{6}$/.test(v);
    }

    function normalizeHex(v) {
        if (!/^#/.test(v)) v = '#' + v;
        return v.toLowerCase();
    }

    // Size slider
    sizeInput.addEventListener('input', function() {
        qrSettings.size = parseInt(this.value) || 300;
        sizeValue.textContent = `${qrSettings.size} px`;
        syncForm();
    });

    // Format segments
    formatSegments.forEach(seg => {
        seg.addEventListener('click', function() {
            formatSegments.forEach(s => s.classList.remove('active'));
            this.classList.add('active');
            qrSettings.format = this.dataset.format;
            syncForm();
        });
    });

    // Color inputs (picker)
    darkColor.addEventListener('input', function() {
        darkHex.value = this.value.toUpperCase();
        qrSettings.dark = this.value.toLowerCase();
    });
    lightColor.addEventListener('input', function() {
        lightHex.value = this.value.toUpperCase();
        qrSettings.light = this.value.toLowerCase();
    });

    // Color hex text inputs
    darkHex.addEventListener('change', function() {
        if (isValidHex(this.value)) {
            qrSettings.dark = normalizeHex(this.value);
            darkColor.value = qrSettings.dark;
            this.value = qrSettings.dark.toUpperCase();
        } else {
            this.value = qrSettings.dark.toUpperCase();
            showToast('Format warna tidak valid (contoh: #1a1a2e)', 'error');
        }
    });
    lightHex.addEventListener('change', function() {
        if (isValidHex(this.value)) {
            qrSettings.light = normalizeHex(this.value);
            lightColor.value = qrSettings.light;
            this.value = qrSettings.light.toUpperCase();
        } else {
            this.value = qrSettings.light.toUpperCase();
            showToast('Format warna tidak valid (contoh: #ffffff)', 'error');
        }
    });

    // Live preview of a sample QR (uses first available URL if any)
    async function updatePreview() {
        let sampleCode = null;
        try {
            const resp = await authFetch('/api/urls?limit=1');
            const data = await resp.json();
            if (data.urls && data.urls.length) {
                sampleCode = data.urls[0].short_code;
            }
        } catch (e) {}

        if (!sampleCode) {
            previewHint.classList.remove('hidden');
            previewInfo.textContent = '';
            previewImg.style.display = 'none';
            return;
        }

        previewHint.classList.add('hidden');
        try {
            const resp = await authFetch(buildQRQuery(sampleCode));
            const data = await resp.json();
            let box = document.getElementById('qr-preview');
            let svgBox = box.querySelector('.qr-svg');
            if (data.format === 'svg') {
                previewImg.style.display = 'none';
                if (!svgBox) {
                    svgBox = document.createElement('div');
                    svgBox.className = 'qr-svg';
                    box.insertBefore(svgBox, previewHint);
                }
                svgBox.innerHTML = data.svg;
            } else {
                previewImg.style.display = 'block';
                if (svgBox) svgBox.remove();
                previewImg.style.maxWidth = '240px';
                previewImg.style.margin = '0 auto';
                previewImg.src = data.qr;
                previewImg.style.background = qrSettings.light;
            }
            const formatLabel = data.format.toUpperCase();
            previewInfo.textContent = `${formatLabel} • ${qrSettings.size}px • ${qrSettings.dark} / ${qrSettings.light}`;
        } catch (e) {}
    }

    function syncForm() {
        saveQRSettings();
        updatePreview();
    }

    // Reset button
    document.getElementById('reset-qr-settings').addEventListener('click', function() {
        Object.assign(qrSettings, { size: 300, format: 'png', dark: '#1a1a2e', light: '#ffffff' });
        localStorage.removeItem('linkly-qr-settings');
        applyForm();
        syncForm();
        showToast('Pengaturan QR direset ke default');
    });

    // Save button
    document.getElementById('save-settings').addEventListener('click', function() {
        saveQRSettings();
        showToast('Pengaturan QR berhasil disimpan');
    });

    // Preview download button
    document.getElementById('preview-download').addEventListener('click', function() {
        let sampleCode = null;
        // need a sample; reuse last known or fetch
        authFetch('/api/urls?limit=1').then(r => r.json()).then(data => {
            if (data.urls && data.urls.length) {
                sampleCode = data.urls[0].short_code;
                return authFetch(buildQRQuery(sampleCode));
            }
            throw new Error('no url');
        }).then(r => r.json()).then(data => {
            const { url, filename } = getQRDownloadData(data);
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            if (data.format === 'svg') setTimeout(() => URL.revokeObjectURL(url), 1000);
        }).catch(() => showToast('Buat link dulu untuk mencoba QR', 'error'));
    });

    // Init
    loadQRSettings();
    applyForm();
    updatePreview();
}

// ======== Session / Akun ========
document.getElementById('logout-btn').addEventListener('click', async function(e) {
    e.preventDefault();
    try {
        await fetch('/api/logout', { method: 'POST' });
    } catch (err) {}
    window.location.href = '/login';
});

async function loadUser() {
    try {
        const response = await authFetch('/api/auth/me');
        const data = await response.json();
        const el = document.getElementById('nav-username');
        if (el) el.textContent = data.username || '';
    } catch (err) {}
}

document.getElementById('change-password-btn').addEventListener('click', async function() {
    const current = document.getElementById('pw-current').value;
    const password = document.getElementById('pw-new').value;
    const confirm = document.getElementById('pw-confirm').value;

    if (!current) { showToast('Masukkan password saat ini', 'error'); return; }
    if (password.length < 6) { showToast('Password baru minimal 6 karakter', 'error'); return; }
    if (password !== confirm) { showToast('Ulangi password baru tidak sama', 'error'); return; }

    const original = this.innerHTML;
    this.disabled = true;
    this.innerHTML = '<span class="loading"></span> Memproses...';

    try {
        const response = await authFetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ current, password })
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Gagal mengganti password');

        document.getElementById('pw-current').value = '';
        document.getElementById('pw-new').value = '';
        document.getElementById('pw-confirm').value = '';
        showToast('Kata sandi berhasil diganti');
    } catch (error) {
        showToast(error.message, 'error');
    } finally {
        this.disabled = false;
        this.innerHTML = original;
    }
});

// ======== Initialize ========
document.addEventListener('DOMContentLoaded', function() {
    loadStats();
    loadQRSettings();
    initSettings();
    loadUser();
});
