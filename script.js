// ============================================================
// Downloader TikTok + Instagram
// - TikTok   : API TikWM (CORS enabled, langsung dari browser)
// - Instagram: Cloudflare Worker proxy (IG gak support CORS)
// ============================================================

const TIKWM_API = 'https://www.tikwm.com/api/';

// >>> GANTI baris di bawah dengan URL Worker lo setelah deploy <<<
// Contoh: 'https://ig-proxy.nama-akun.workers.dev/'
const IG_WORKER_URL = '/api/ig';
// --- DOM ---
const urlInput        = document.getElementById('urlInput');
const urlLabel        = document.getElementById('urlLabel');
const platformTabs    = document.querySelectorAll('.platform-tab');
const toggleBtns      = document.querySelectorAll('.toggle-btn');
const downloadBtn     = document.getElementById('downloadBtn');
const btnText         = document.getElementById('btnText');
const spinner         = document.getElementById('spinner');
const message         = document.getElementById('message');
const resultContainer = document.getElementById('resultContainer');
const videoWrapper    = document.getElementById('videoWrapper');
const downloadBtnFile = document.getElementById('downloadBtnFile');
const resetBtn        = document.getElementById('resetBtn');

let platform       = 'tiktok';   // 'tiktok' | 'instagram'
let selectedType   = 'video';    // 'video' | 'audio'
let currentBlobUrl = null;

// ============================================================
// PLATFORM TABS
// ============================================================
platformTabs.forEach(tab => {
    tab.addEventListener('click', () => {
        platformTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        platform = tab.dataset.platform;
        if (platform === 'tiktok') {
            urlLabel.textContent = 'Link TikTok';
            urlInput.placeholder = 'https://www.tiktok.com/@username/video/123456789';
        } else {
            urlLabel.textContent = 'Link Instagram (Reels / Post)';
            urlInput.placeholder = 'https://www.instagram.com/reel/ABC123...';
        }
        resetUI();
    });
});

// ============================================================
// TYPE TOGGLE (Video / Audio)
// ============================================================
toggleBtns.forEach(btn => {
    btn.addEventListener('click', function () {
        toggleBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        selectedType = this.dataset.type;
        resetUI();
    });
});

// ============================================================
// EVENT BINDING
// ============================================================
downloadBtn.addEventListener('click', handleDownload);
resetBtn.addEventListener('click', resetUI);
urlInput.addEventListener('keydown', e => { if (e.key === 'Enter') downloadBtn.click(); });

downloadBtnFile.addEventListener('click', () => {
    if (!currentBlobUrl) {
        showMessage('Belum ada file untuk diunduh.', 'error');
        return;
    }
    const a = document.createElement('a');
    a.href = currentBlobUrl;
    const ext = selectedType === 'video' ? 'mp4' : 'mp3';
    a.download = `${platform === 'tiktok' ? 'TikTok' : 'Instagram'}_${Date.now()}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
});

// ============================================================
// MAIN HANDLER
// ============================================================
async function handleDownload() {
    const url = urlInput.value.trim();
    if (!url) return showMessage('Masukkan link terlebih dahulu.', 'error');

    if (platform === 'tiktok') {
        if (!url.includes('tiktok.com')) return showMessage('Link TikTok tidak valid.', 'error');
        return handleTikTok(url);
    } else {
        if (!url.includes('instagram.com')) return showMessage('Link Instagram tidak valid.', 'error');
        return handleInstagram(url);
    }
}

// ============================================================
// TIKTOK — API TikWM
// ============================================================
async function handleTikTok(url) {
    setLoading(true);
    hideMessage();
    try {
        const params = new URLSearchParams({ url, count: 0, hd: 0 });
        const res = await fetch(`${TIKWM_API}?${params.toString()}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (json.code !== 0) throw new Error(json.msg || 'Gagal memproses video.');

        const data = json.data;
        const videoUrl = data.play || data.wmplay || data.hdplay;
        const audioUrl = data.music || data.audio;

        let downloadUrl = selectedType === 'video' ? videoUrl : audioUrl;
        if (!downloadUrl && selectedType === 'audio' && videoUrl) downloadUrl = videoUrl;
        if (!downloadUrl) throw new Error(`Link ${selectedType} tidak tersedia.`);

        renderPreview(downloadUrl, selectedType);
        showMessage('Mengambil file...', 'success');

        const fileRes = await fetch(downloadUrl);
        if (!fileRes.ok) throw new Error('Gagal mengambil file.');
        const blob = await fileRes.blob();

        if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = URL.createObjectURL(blob);

        showMessage('File siap diunduh!', 'success');
        resultContainer.classList.remove('hidden');
    } catch (e) {
        console.error(e);
        showMessage(`Gagal: ${e.message}`, 'error');
    } finally {
        setLoading(false);
    }
}

// ============================================================
// INSTAGRAM — Cloudflare Worker proxy
// ============================================================
function extractIgShortcode(url) {
    const m = url.match(/instagram\.com\/(?:p|reel|reels|tv)\/([A-Za-z0-9_-]+)/);
    return m ? m[1] : null;
}

async function handleInstagram(url) {
    setLoading(true);
    hideMessage();

    const shortcode = extractIgShortcode(url);
    if (!shortcode) {
        setLoading(false);
        return showMessage('URL Instagram tidak valid. Contoh: https://www.instagram.com/reel/ABC123/', 'error');
    }

    if (IG_WORKER_URL.includes('NAMA-AKUN')) {
        setLoading(false);
        return showMessage('Worker URL belum di-set. Deploy worker.js dulu, lalu ganti IG_WORKER_URL di script.js.', 'error');
    }

    try {
        const res = await fetch(`${IG_WORKER_URL}?url=${encodeURIComponent(url)}`);
        if (!res.ok) throw new Error(`Worker HTTP ${res.status}`);
        const json = await res.json();
        if (json.error) throw new Error(json.error);

        const videoUrl = json.video_url;
        const thumbUrl = json.thumbnail;

        if (selectedType === 'video') {
            if (!videoUrl) throw new Error('Ini bukan video (post gambar). Coba Reels atau post video.');
            renderPreview(videoUrl, 'video');
            showMessage('Mengambil video...', 'success');

            const fileRes = await fetch(videoUrl);
            if (!fileRes.ok) throw new Error('Gagal mengambil video.');
            const blob = await fileRes.blob();
            if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = URL.createObjectURL(blob);
        } else {
            if (!videoUrl) throw new Error('Audio hanya tersedia kalau post-nya video.');
            renderPreview(videoUrl, 'audio');
            showMessage('Mengambil audio dari video...', 'success');

            const fileRes = await fetch(videoUrl);
            if (!fileRes.ok) throw new Error('Gagal mengambil video untuk audio.');
            const blob = await fileRes.blob();
            if (currentBlobUrl) URL.revokeObjectURL(currentBlobUrl);
            currentBlobUrl = URL.createObjectURL(blob);
        }

        const meta = document.createElement('div');
        meta.className = 'ig-meta';
        meta.innerHTML = `
            <p><b>@${escapeHtml(json.author || '-')}</b></p>
            <p>${json.caption ? escapeHtml(json.caption.slice(0, 140)) + (json.caption.length > 140 ? '...' : '') : ''}</p>
        `;
        videoWrapper.appendChild(meta);

        resultContainer.classList.remove('hidden');
        if (selectedType === 'video') {
            showMessage('Video siap diunduh!', 'success');
        } else {
            showMessage('Audio (dari video) siap diunduh.', 'success');
        }
    } catch (e) {
        console.error(e);
        showMessage(`Gagal: ${e.message}`, 'error');
    } finally {
        setLoading(false);
    }
}

// ============================================================
// HELPERS
// ============================================================
function renderPreview(url, type) {
    videoWrapper.innerHTML = '';
    if (type === 'video') {
        const v = document.createElement('video');
        v.src = url;
        v.controls = true;
        v.preload = 'metadata';
        v.playsInline = true;
        v.style.width = '100%';
        v.style.borderRadius = '14px';
        videoWrapper.appendChild(v);
    } else {
        const a = document.createElement('audio');
        a.src = url;
        a.controls = true;
        a.preload = 'metadata';
        a.style.width = '100%';
        videoWrapper.appendChild(a);
    }
}

function escapeHtml(s) {
    return String(s ?? '').replace(/[&<>"']/g, c => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
}

function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = `message ${type}`;
    message.classList.remove('hidden');
}
function hideMessage() { message.classList.add('hidden'); }

function setLoading(loading) {
    if (loading) {
        downloadBtn.disabled = true;
        btnText.textContent = 'Memproses...';
        spinner.classList.remove('hidden');
    } else {
        downloadBtn.disabled = false;
        btnText.textContent = 'Unduh Sekarang';
        spinner.classList.add('hidden');
    }
}

function resetUI() {
    videoWrapper.innerHTML = '';
    resultContainer.classList.add('hidden');
    hideMessage();
    if (currentBlobUrl) { URL.revokeObjectURL(currentBlobUrl); currentBlobUrl = null; }
    setLoading(false);
}

resetUI();