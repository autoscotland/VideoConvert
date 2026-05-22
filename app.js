import { FFmpeg } from './lib/ffmpeg/index.js';
import { toBlobURL, fetchFile } from './lib/util/index.js';

// DOM Elements
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');
const fileInfoContainer = document.getElementById('file-info-container');
const infoName = document.getElementById('info-name');
const infoSize = document.getElementById('info-size');
const infoDuration = document.getElementById('info-duration');
const btnRemove = document.getElementById('btn-remove');
const formatGrid = document.getElementById('format-grid');
const formatButtons = document.querySelectorAll('.format-btn');
const selectResolution = document.getElementById('select-resolution');
const selectQuality = document.getElementById('select-quality');
const btnConvert = document.getElementById('btn-convert');
const progressCard = document.getElementById('progress-card');
const progressStatus = document.getElementById('progress-status');
const progressPercentage = document.getElementById('progress-percentage');
const progressBarFill = document.getElementById('progress-bar-fill');
const consoleToggle = document.getElementById('console-toggle');
const consoleWrapper = document.getElementById('console-wrapper');
const consoleBody = document.getElementById('console-body');
const completedCard = document.getElementById('completed-card');
const previewVideo = document.getElementById('preview-video');
const previewFallback = document.getElementById('preview-fallback');
const btnDownload = document.getElementById('btn-download');

// App State Variables
let selectedFile = null;
let targetFormat = 'mp4';
let ffmpegInstance = null;
let isFFmpegLoaded = false;

// Format extensions & MIME mapping
const FORMAT_CONFIGS = {
    mp4: { ext: 'mp4', mime: 'video/mp4', canPlay: true },
    mov: { ext: 'mov', mime: 'video/quicktime', canPlay: true },
    avi: { ext: 'avi', mime: 'video/x-msvideo', canPlay: false },
    mkv: { ext: 'mkv', mime: 'video/x-matroska', canPlay: false }
};

// -------------------------------------------------------------
// 1. File Upload & Drag-and-Drop Handling
// -------------------------------------------------------------

// Drag and drop events
['dragenter', 'dragover'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    }, false);
});

['dragleave', 'drop'].forEach(eventName => {
    dropzone.addEventListener(eventName, (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
    }, false);
});

dropzone.addEventListener('drop', (e) => {
    const dt = e.dataTransfer;
    const files = dt.files;
    if (files.length > 0) {
        handleFileSelect(files[0]);
    }
});

dropzone.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
        handleFileSelect(e.target.files[0]);
    }
});

// Format conversion options selection
formatGrid.addEventListener('click', (e) => {
    const btn = e.target.closest('.format-btn');
    if (!btn) return;
    
    formatButtons.forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    targetFormat = btn.dataset.format;
});

// Handle the selected file
function handleFileSelect(file) {
    if (!file.type.startsWith('video/')) {
        alert('請選擇有效的影片檔案！');
        return;
    }
    
    selectedFile = file;
    
    // Fill file metadata
    infoName.textContent = file.name;
    infoSize.textContent = `大小: ${(file.size / (1024 * 1024)).toFixed(2)} MB`;
    
    // Parse duration using standard HTML5 video element
    infoDuration.textContent = '長度: 讀取中...';
    const videoUrl = URL.createObjectURL(file);
    const tempVideo = document.createElement('video');
    tempVideo.preload = 'metadata';
    tempVideo.src = videoUrl;
    
    tempVideo.onloadedmetadata = () => {
        URL.revokeObjectURL(videoUrl);
        const secs = Math.round(tempVideo.duration);
        const mins = Math.floor(secs / 60);
        const remainingSecs = secs % 60;
        infoDuration.textContent = `長度: ${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')} (${tempVideo.videoWidth}x${tempVideo.videoHeight})`;
    };

    tempVideo.onerror = () => {
        URL.revokeObjectURL(videoUrl);
        infoDuration.textContent = '長度: 未知格式';
    };

    // UI Updates
    dropzone.style.display = 'none';
    fileInfoContainer.style.display = 'block';
    completedCard.style.display = 'none';
}

// Remove selected file
btnRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    selectedFile = null;
    fileInput.value = '';
    
    dropzone.style.display = 'flex';
    fileInfoContainer.style.display = 'none';
    completedCard.style.display = 'none';
    progressCard.style.display = 'none';
});

// Toggle console log visibility
consoleToggle.addEventListener('click', () => {
    consoleToggle.classList.toggle('active');
    consoleWrapper.classList.toggle('show');
});

// Append to custom log console
function appendLog(message) {
    consoleBody.innerText += message + '\n';
    consoleBody.scrollTop = consoleBody.scrollHeight;
}

// -------------------------------------------------------------
// 2. FFmpeg Loader & Runner
// -------------------------------------------------------------

async function initFFmpeg() {
    if (isFFmpegLoaded) return ffmpegInstance;

    progressStatus.innerHTML = `
        <svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 4V2M12 22V20M2 12H4M20 12H22M6.34315 6.34315L7.75736 7.75736M16.2426 16.2426L17.6569 17.6569M6.34315 17.6569L7.75736 16.2426M16.2426 7.75736L17.6569 6.34315" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        <span>載入轉檔核心組件 (FFmpeg)...</span>
    `;
    progressPercentage.textContent = '0%';
    progressBarFill.style.width = '0%';
    appendLog('Loading local FFmpeg core...');

    // Since files are local and same-origin, we don't need classWorkerURL.
    // The FFmpeg class will resolve worker.js relatively from import.meta.url correctly.
    ffmpegInstance = new FFmpeg();

    // Listen to log events
    ffmpegInstance.on('log', ({ message }) => {
        appendLog(message);
    });

    // Listen to progress events
    ffmpegInstance.on('progress', ({ progress }) => {
        const percentage = Math.min(Math.round(progress * 100), 100);
        progressPercentage.textContent = `${percentage}%`;
        progressBarFill.style.width = `${percentage}%`;
        progressStatus.innerHTML = `
            <svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4V2M12 22V20M2 12H4M20 12H22M6.34315 6.34315L7.75736 7.75736M16.2426 16.2426L17.6569 17.6569M6.34315 17.6569L7.75736 16.2426M16.2426 7.75736L17.6569 6.34315" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span>影音轉檔中...</span>
        `;
    });

    // Load assets locally using toBlobURL
    await ffmpegInstance.load({
        coreURL: await toBlobURL('./lib/core/ffmpeg-core.js', 'text/javascript'),
        wasmURL: await toBlobURL('./lib/core/ffmpeg-core.wasm', 'application/wasm')
    });

    isFFmpegLoaded = true;
    appendLog('FFmpeg Core loaded successfully from local files!');
    return ffmpegInstance;
}

// Start conversion trigger
btnConvert.addEventListener('click', async () => {
    if (!selectedFile) return;

    // Reset UI
    progressCard.style.display = 'block';
    completedCard.style.display = 'none';
    consoleBody.innerText = '';
    btnConvert.disabled = true;

    try {
        const ffmpeg = await initFFmpeg();

        // 1. Write file to MEMFS
        const inputName = `input_${Date.now()}`;
        const outputConfig = FORMAT_CONFIGS[targetFormat];
        const outputName = `output_${Date.now()}.${outputConfig.ext}`;

        progressStatus.innerHTML = `
            <svg class="spin" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M12 4V2M12 22V20M2 12H4M20 12H22M6.34315 6.34315L7.75736 7.75736M16.2426 16.2426L17.6569 17.6569M6.34315 17.6569L7.75736 16.2426M16.2426 7.75736L17.6569 6.34315" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
            </svg>
            <span>讀取影片檔案...</span>
        `;
        appendLog(`Writing uploaded file "${selectedFile.name}" to virtual memory...`);
        await ffmpeg.writeFile(inputName, await fetchFile(selectedFile));

        // 2. Build FFmpeg command arguments
        // ffmpeg -i input.mp4 [parameters] output.avi
        const args = ['-i', inputName];

        const resolution = selectResolution.value;
        const quality = selectQuality.value;

        // Resolution argument
        if (resolution !== 'copy') {
            // scale=-2:height maintains aspect ratio while ensuring dimensions are divisible by 2 (required by H264)
            args.push('-vf', `scale=-2:${resolution}`);
        }

        // Output specific codecs & quality settings
        if (targetFormat === 'avi') {
            // AVI Classic Codecs (mpeg4 video, mp3 audio)
            args.push('-c:v', 'mpeg4');
            
            if (quality === 'high') {
                args.push('-qscale:v', '3'); // Lower is better quality (3-31 range)
            } else if (quality === 'low') {
                args.push('-qscale:v', '12');
            } else {
                args.push('-qscale:v', '6');
            }
            args.push('-c:a', 'libmp3lame', '-qscale:a', '4');
        } else {
            // MP4 / MOV / MKV use modern H.264 + AAC
            args.push('-c:v', 'libx264', '-preset', 'ultrafast');
            
            // CRF (Constant Rate Factor) quality setting (0-51 range, lower is better)
            if (quality === 'high') {
                args.push('-crf', '18');
            } else if (quality === 'low') {
                args.push('-crf', '28');
            } else {
                args.push('-crf', '23'); // Standard default
            }
            args.push('-c:a', 'aac', '-b:a', '128k');
        }

        args.push(outputName);

        appendLog(`Executing FFmpeg command: ffmpeg ${args.join(' ')}`);
        
        // 3. Run transcode
        await ffmpeg.exec(args);

        // 4. Read result
        appendLog('Reading output from virtual memory...');
        const data = await ffmpeg.readFile(outputName);

        // 5. Generate output Blob
        const outputBlob = new Blob([data.buffer], { type: outputConfig.mime });
        const outputUrl = URL.createObjectURL(outputBlob);

        // Configure download button
        const baseName = selectedFile.name.substring(0, selectedFile.name.lastIndexOf('.'));
        btnDownload.href = outputUrl;
        btnDownload.download = `${baseName}_converted.${outputConfig.ext}`;

        // Configure preview or fallback
        if (outputConfig.canPlay) {
            previewVideo.src = outputUrl;
            previewVideo.style.display = 'block';
            previewFallback.style.display = 'none';
        } else {
            previewVideo.src = '';
            previewVideo.style.display = 'none';
            previewFallback.style.display = 'flex';
        }

        // Show Completed Card
        completedCard.style.display = 'block';
        
        // Cleanup virtual FS files
        await ffmpeg.deleteFile(inputName);
        await ffmpeg.deleteFile(outputName);
        appendLog('Virtual memory files cleaned up.');

        progressStatus.innerHTML = `
            <svg style="color: var(--success);" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M20 6L9 17L4 12" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>轉檔完成！</span>
        `;

    } catch (error) {
        console.error(error);
        appendLog(`ERROR during conversion: ${error.message}`);
        progressStatus.innerHTML = `
            <svg style="color: var(--danger);" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <span>轉檔發生錯誤，請查看詳細日誌</span>
        `;
    } finally {
        btnConvert.disabled = false;
    }
});
