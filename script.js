//Tikwm disini
const API_URL = 'https://www.tikwm.com/api/';

// DOM Elements
const urlInput = document.getElementById('urlInput');
const toggleBtns = document.querySelectorAll('.toggle-btn');
const downloadBtn = document.getElementById('downloadBtn');
const btnText = document.getElementById('btnText');
const spinner = document.getElementById('spinner');
const message = document.getElementById('message');
const resultContainer = document.getElementById('resultContainer');
const videoWrapper = document.getElementById('videoWrapper');
const downloadBtnFile = document.getElementById('downloadBtnFile');
const resetBtn = document.getElementById('resetBtn');

let selectedType = 'video'; // 'video' atau 'audio'
let currentBlobUrl = null;   // untuk object URL

// Toggle
toggleBtns.forEach(btn => {
    btn.addEventListener('click', function() {
        toggleBtns.forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        selectedType = this.dataset.type;
        resetUI();
    });
});

// Download utama (mendapatkan link)
downloadBtn.addEventListener('click', handleDownload);
resetBtn.addEventListener('click', resetUI);
urlInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') downloadBtn.click();
});

// Tombol simpan file
downloadBtnFile.addEventListener('click', function() {
    // Jika sudah ada blob URL, langsung download
    if (currentBlobUrl) {
        const a = document.createElement('a');
        a.href = currentBlobUrl;
        const ext = selectedType === 'video' ? 'mp4' : 'mp3';
        a.download = `TikTok.${ext}`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    } else {
        showMessage('Belum ada file untuk diunduh.', 'error');
    }
});

// Fungsi utama
async function handleDownload() {
    const url = urlInput.value.trim();
    if (!url) {
        showMessage('Masukkan link TikTok terlebih dahulu.', 'error');
        return;
    }
    if (!url.includes('tiktok.com')) {
        showMessage('Link tidak valid. Harus mengandung "tiktok.com".', 'error');
        return;
    }

    setLoading(true);
    hideMessage();

    try {
        // Panggil API TikWM
        const params = new URLSearchParams({
            url: url,
            count: 0,
            hd: 0
        });
        const response = await fetch(`${API_URL}?${params.toString()}`);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const json = await response.json();
        if (json.code !== 0) {
            throw new Error(json.msg || 'Gagal memproses video.');
        }

        const data = json.data;
        const videoUrl = data.play || data.wmplay || data.hdplay;
        const audioUrl = data.music || data.audio;

        if (!videoUrl && !audioUrl) {
            throw new Error('Tidak ditemukan link unduhan.');
        }

        // Pilih sesuai tipe
        let downloadUrl = (selectedType === 'video') ? videoUrl : audioUrl;
        if (!downloadUrl && selectedType === 'audio' && videoUrl) {
            downloadUrl = videoUrl; // fallback
        }
        if (!downloadUrl) {
            throw new Error(`Link ${selectedType} tidak tersedia.`);
        }

        // Tampilkan preview terlebih dahulu
        renderPreview(downloadUrl, selectedType);

        // Sekarang fetch file untuk dijadikan blob
        showMessage('Mengambil file...', 'success');
        const fileResponse = await fetch(downloadUrl);
        if (!fileResponse.ok) {
            throw new Error('Gagal mengambil file untuk diunduh.');
        }
        const blob = await fileResponse.blob();
        // Buat object URL
        if (currentBlobUrl) {
            URL.revokeObjectURL(currentBlobUrl);
        }
        currentBlobUrl = URL.createObjectURL(blob);

        showMessage('File siap diunduh!', 'success');
        resultContainer.classList.remove('hidden');
        setLoading(false);

    } catch (error) {
        console.error('Error:', error);
        showMessage(`Gagal: ${error.message}`, 'error');
        setLoading(false);
    }
}

// Helper: render preview
function renderPreview(url, type) {
    videoWrapper.innerHTML = '';
    if (type === 'video') {
        const video = document.createElement('video');
        video.src = url;
        video.controls = true;
        video.preload = 'metadata';
        videoWrapper.appendChild(video);
    } else {
        const audio = document.createElement('audio');
        audio.src = url;
        audio.controls = true;
        audio.preload = 'metadata';
        videoWrapper.appendChild(audio);
    }
}

// Helper: tampilkan pesan
function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = `message ${type}`;
    message.classList.remove('hidden');
}

function hideMessage() {
    message.classList.add('hidden');
}

// Helper: loading state
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

// Reset UI
function resetUI() {
    videoWrapper.innerHTML = '';
    resultContainer.classList.add('hidden');
    hideMessage();
    // Revoke blob URL
    if (currentBlobUrl) {
        URL.revokeObjectURL(currentBlobUrl);
        currentBlobUrl = null;
    }
    setLoading(false);
    urlInput.focus();
}

// Inisialisasi
resetUI();