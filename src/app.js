/**
 * Main Application Orchestrator for MonkeyMoji.
 * Integrates face tracking, rendering, recording, UI controls, and offline video processing.
 */
import { FaceTracker } from './tracker.js';
import { MonkeyMojiRenderer } from './monkeymoji.js';
import { VideoRecorder } from './recorder.js';

class MonkeyMojiApp {
    constructor() {
        // DOM Elements
        this.video = document.getElementById('webcam-video');
        this.canvas = document.getElementById('webgl-canvas');
        this.statusText = document.getElementById('status-text');
        this.fpsBadge = document.getElementById('fps-badge');
        this.faceBadge = document.getElementById('face-badge');
        this.recordBtn = document.getElementById('record-btn');
        this.recordIcon = document.getElementById('record-icon');
        this.recordText = document.getElementById('record-text');
        this.recordTimer = document.getElementById('record-timer');
        this.snapshotBtn = document.getElementById('snapshot-btn');
        this.videoUploadInput = document.getElementById('video-upload');

        // Diagnostic meters
        this.diagMouth = document.getElementById('meter-mouth');
        this.diagSmile = document.getElementById('meter-smile');
        this.diagEyes = document.getElementById('meter-eyes');
        this.diagPitch = document.getElementById('val-pitch');
        this.diagYaw = document.getElementById('val-yaw');
        this.diagRoll = document.getElementById('val-roll');

        // Modules
        this.tracker = new FaceTracker();
        this.renderer = new MonkeyMojiRenderer(this.canvas, this.video);
        this.recorder = new VideoRecorder(this.canvas);

        // State Settings
        this.settings = {
            mode: 'overlay', // overlay, studio, greenscreen, transparent
            headScale: 1.28,
            neckOffsetY: 0.8,
            neckOffsetX: 0.0,
            depthOffsetZ: 0.0,
            mouthMultiplier: 1.5,
            smileMultiplier: 1.4,
            eyeBlinkMultiplier: 1.2,
            browMultiplier: 1.3,
            rotMultiplier: 1.0,
            earPhysics: true,
            resolution: '1080p'
        };

        this.currentStream = null;
        this.audioContext = null;
        this.audioMeterElement = document.getElementById('audio-level-fill');
        this.isFileMode = false;

        this.init();
    }

    async init() {
        this.setStatus('Initializing MonkeyMoji Rig & Neural Models...', 'loading');
        this.bindEvents();

        try {
            // Load 3D model
            await this.renderer.load();

            // Initialize MediaPipe tracker
            await this.tracker.init(this.video);

            this.renderer.setMode(this.settings.mode);

            // Request permission first so device names and identifiers are available.
            await this.startCamera();
            await this.populateMediaDevices();

            this.setStatus('Ready • Face Tracking Active', 'ready');
            this.startRenderLoop();
        } catch (err) {
            console.error('Initialization error:', err);
            this.setStatus('Error: ' + (err.message || err), 'error');
        }
    }

    setStatus(text, type = 'info') {
        if (!this.statusText) return;
        this.statusText.innerText = text;
        this.statusText.className = `status-pill ${type}`;
    }

    async populateMediaDevices() {
        const cameraSelect = document.getElementById('camera-select');
        const micSelect = document.getElementById('mic-select');
        if (!cameraSelect || !micSelect) return;

        try {
            const devices = await navigator.mediaDevices.enumerateDevices();
            cameraSelect.innerHTML = '';
            micSelect.innerHTML = '';

            let camIndex = 1;
            let micIndex = 1;
            for (const d of devices) {
                if (d.kind === 'videoinput') {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.text = d.label || `Camera ${camIndex++}`;
                    cameraSelect.appendChild(opt);
                } else if (d.kind === 'audioinput') {
                    const opt = document.createElement('option');
                    opt.value = d.deviceId;
                    opt.text = d.label || `Microphone ${micIndex++}`;
                    micSelect.appendChild(opt);
                }
            }
        } catch (e) {
            console.warn('Could not enumerate media devices:', e);
        }
    }

    async startCamera(deviceId = null, microphoneId = null) {
        try {
            this.isFileMode = false;
            this.currentStream = await this.tracker.startCamera(deviceId, this.settings.resolution, microphoneId);
            this.renderer.setVideoSource(this.video);
            this.recorder.setAudioStream(this.currentStream);
            this.setupAudioMeter(this.currentStream);
            this.onWindowResize();
        } catch (err) {
            console.error('Failed to start camera:', err);
            this.setStatus('Camera permission denied or camera not found.', 'error');
        }
    }

    setupAudioMeter(stream) {
        try {
            if (!this.audioMeterElement) return;
            const audioTracks = stream.getAudioTracks();
            if (audioTracks.length === 0) return;

            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            this.audioContext = new AudioCtx();
            const source = this.audioContext.createMediaStreamSource(stream);
            const analyser = this.audioContext.createAnalyser();
            analyser.fftSize = 64;
            source.connect(analyser);

            const dataArray = new Uint8Array(analyser.frequencyBinCount);
            const updateMeter = () => {
                if (!this.audioContext) return;
                analyser.getByteFrequencyData(dataArray);
                let sum = 0;
                for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                const avg = sum / dataArray.length;
                const percent = Math.min(100, Math.round((avg / 128) * 100));
                this.audioMeterElement.style.width = `${percent}%`;
                requestAnimationFrame(updateMeter);
            };
            updateMeter();
        } catch (e) {
            console.warn('Audio meter init error:', e);
        }
    }

    startRenderLoop() {
        this.tracker.onResults = (data) => {
            // Update UI badges
            if (this.fpsBadge) this.fpsBadge.innerText = `${data.fps || 0} FPS`;
            if (this.faceBadge) {
                if (data.detected) {
                    this.faceBadge.innerText = '● Face Tracked';
                    this.faceBadge.className = 'badge active';
                } else {
                    this.faceBadge.innerText = '○ Searching Face';
                    this.faceBadge.className = 'badge searching';
                }
            }

            // Update diagnostics
            if (data.detected) {
                const bs = data.blendshapes || {};
                if (this.diagMouth) this.diagMouth.style.width = `${Math.min(100, (bs.jawOpen || 0) * 100)}%`;
                if (this.diagSmile) this.diagSmile.style.width = `${Math.min(100, Math.max(bs.mouthSmileLeft || 0, bs.mouthSmileRight || 0) * 100)}%`;
                if (this.diagEyes) this.diagEyes.style.width = `${Math.min(100, Math.max(bs.eyeBlinkLeft || 0, bs.eyeBlinkRight || 0) * 100)}%`;

                const deg = (rad) => Math.round(rad * (180 / Math.PI));
                if (this.diagPitch) this.diagPitch.innerText = `${deg(data.rotation.pitch)}°`;
                if (this.diagYaw) this.diagYaw.innerText = `${deg(data.rotation.yaw)}°`;
                if (this.diagRoll) this.diagRoll.innerText = `${deg(data.rotation.roll)}°`;
            }

            // Update 3D avatar pose and blendshapes
            this.renderer.updateTracking(data, this.settings);
        };

        const renderFrame = () => {
            this.renderer.render();
            requestAnimationFrame(renderFrame);
        };
        renderFrame();
    }

    bindEvents() {
        // Mode Switcher Tabs
        document.querySelectorAll('.mode-tab').forEach(tab => {
            tab.addEventListener('click', (e) => {
                document.querySelectorAll('.mode-tab').forEach(t => t.classList.remove('active'));
                const btn = e.currentTarget;
                btn.classList.add('active');
                const mode = btn.dataset.mode;
                this.settings.mode = mode;
                this.renderer.setMode(mode);
            });
        });

        // Sliders
        const bindSlider = (id, prop, transform = parseFloat) => {
            const slider = document.getElementById(id);
            const valLabel = document.getElementById(`${id}-val`);
            if (!slider) return;
            slider.addEventListener('input', (e) => {
                const val = transform(e.target.value);
                this.settings[prop] = val;
                if (valLabel) valLabel.innerText = val.toFixed(2);
            });
        };

        bindSlider('slider-head-scale', 'headScale');
        bindSlider('slider-neck-y', 'neckOffsetY');
        bindSlider('slider-neck-x', 'neckOffsetX');
        bindSlider('slider-depth-z', 'depthOffsetZ');
        bindSlider('slider-mouth-sens', 'mouthMultiplier');
        bindSlider('slider-smile-sens', 'smileMultiplier');
        bindSlider('slider-eye-sens', 'eyeBlinkMultiplier');
        bindSlider('slider-brow-sens', 'browMultiplier');
        bindSlider('slider-rot-sens', 'rotMultiplier');

        // Checkbox options
        const earBox = document.getElementById('check-ear-physics');
        if (earBox) {
            earBox.addEventListener('change', (e) => {
                this.settings.earPhysics = e.target.checked;
            });
        }

        // Camera select
        const camSelect = document.getElementById('camera-select');
        const micSelect = document.getElementById('mic-select');
        if (camSelect) {
            camSelect.addEventListener('change', (e) => {
                this.startCamera(e.target.value, micSelect ? micSelect.value : null);
            });
        }

        if (micSelect) {
            micSelect.addEventListener('change', (e) => {
                this.startCamera(camSelect ? camSelect.value : null, e.target.value);
            });
        }

        // Resolution select
        const resSelect = document.getElementById('res-select');
        if (resSelect) {
            resSelect.addEventListener('change', (e) => {
                this.settings.resolution = e.target.value;
                this.startCamera(
                    camSelect ? camSelect.value : null,
                    micSelect ? micSelect.value : null
                );
            });
        }

        // Video Recording
        if (this.recordBtn) {
            this.recordBtn.addEventListener('click', () => this.toggleRecording());
        }

        this.recorder.onTimerUpdate = (formatted) => {
            if (this.recordTimer) this.recordTimer.innerText = formatted;
        };

        this.recorder.onRecordingComplete = (res) => {
            this.showDownloadModal(res);
        };

        // Snapshot
        if (this.snapshotBtn) {
            this.snapshotBtn.addEventListener('click', () => {
                this.recorder.takeSnapshot();
                this.flashScreen();
            });
        }

        // Video File Upload / Processing
        if (this.videoUploadInput) {
            this.videoUploadInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) this.loadVideoFile(file);
            });
        }

        // Toggle HUD Visibility button
        const toggleHudBtn = document.getElementById('toggle-hud-btn');
        if (toggleHudBtn) {
            toggleHudBtn.addEventListener('click', () => {
                document.body.classList.toggle('clean-mode');
            });
        }

        const obsOutputBtn = document.getElementById('obs-output-btn');
        if (obsOutputBtn) {
            obsOutputBtn.addEventListener('click', () => {
                const output = window.open('/obs-output.html', 'monkeymoji-obs-output', 'popup,width=1280,height=720');
                if (!output) this.setStatus('Allow pop-ups to open the OBS output window.', 'error');
            });
        }

        // Reset Sliders
        const resetBtn = document.getElementById('reset-sliders-btn');
        if (resetBtn) {
            resetBtn.addEventListener('click', () => this.resetDefaults());
        }

        // Global Keyboard Shortcuts
        window.addEventListener('keydown', (e) => {
            if (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT') return;
            if (e.code === 'Space') {
                e.preventDefault();
                this.toggleRecording();
            } else if (e.code === 'KeyS') {
                this.recorder.takeSnapshot();
                this.flashScreen();
            } else if (e.code === 'KeyH') {
                document.body.classList.toggle('clean-mode');
            } else if (e.code === 'KeyM') {
                this.cycleMode();
            }
        });

        window.addEventListener('resize', () => this.onWindowResize());
    }

    onWindowResize() {
        if (this.renderer) {
            this.renderer.onWindowResize();
        }
    }

    toggleRecording() {
        if (!this.recorder.isRecording) {
            this.recorder.start();
            this.recordBtn.classList.add('recording');
            this.recordText.innerText = 'Stop Recording';
            this.recordTimer.style.display = 'inline-block';
        } else {
            this.recorder.stop();
            this.recordBtn.classList.remove('recording');
            this.recordText.innerText = 'Start Recording';
            this.recordTimer.style.display = 'none';
        }
    }

    cycleMode() {
        const modes = ['overlay', 'studio', 'greenscreen', 'transparent'];
        const nextIdx = (modes.indexOf(this.settings.mode) + 1) % modes.length;
        const nextMode = modes[nextIdx];
        this.settings.mode = nextMode;
        this.renderer.setMode(nextMode);

        document.querySelectorAll('.mode-tab').forEach(t => {
            t.classList.toggle('active', t.dataset.mode === nextMode);
        });
    }

    flashScreen() {
        const flash = document.createElement('div');
        flash.className = 'camera-flash';
        document.body.appendChild(flash);
        setTimeout(() => document.body.removeChild(flash), 300);
    }

    resetDefaults() {
        this.settings.headScale = 1.28;
        this.settings.neckOffsetY = 0.8;
        this.settings.neckOffsetX = 0.0;
        this.settings.mouthMultiplier = 1.5;
        this.settings.smileMultiplier = 1.4;
        this.settings.eyeBlinkMultiplier = 1.2;
        this.settings.browMultiplier = 1.3;
        this.settings.rotMultiplier = 1.0;

        const updateElem = (id, val) => {
            const el = document.getElementById(id);
            const valLabel = document.getElementById(`${id}-val`);
            if (el) el.value = val;
            if (valLabel) valLabel.innerText = Number(val).toFixed(2);
        };

        updateElem('slider-head-scale', 1.28);
        updateElem('slider-neck-y', 0.8);
        updateElem('slider-neck-x', 0.0);
        updateElem('slider-mouth-sens', 1.5);
        updateElem('slider-smile-sens', 1.4);
        updateElem('slider-eye-sens', 1.2);
        updateElem('slider-brow-sens', 1.3);
        updateElem('slider-rot-sens', 1.0);
    }

    async loadVideoFile(file) {
        this.tracker.stop();
        this.isFileMode = true;
        const url = URL.createObjectURL(file);
        this.video.srcObject = null;
        this.video.src = url;
        this.video.loop = true;
        this.video.muted = false;
        await this.video.play();

        this.renderer.setVideoSource(this.video);
        this.tracker.video = this.video;
        this.tracker.isRunning = true;
        const generation = ++this.tracker.loopGeneration;
        this.tracker.loop(generation);
        this.setStatus(`Processing video: ${file.name}`, 'ready');
    }

    showDownloadModal(recordResult) {
        const modal = document.getElementById('recording-modal');
        const videoPlayer = document.getElementById('modal-video-preview');
        const downloadBtn = document.getElementById('modal-download-btn');
        const closeBtn = document.getElementById('modal-close-btn');

        if (!modal || !videoPlayer || !downloadBtn) {
            // Direct download fallback
            this.recorder.downloadBlob(recordResult.blob);
            return;
        }

        videoPlayer.src = recordResult.url;
        modal.classList.add('visible');

        downloadBtn.onclick = () => {
            this.recorder.downloadBlob(recordResult.blob);
        };

        closeBtn.onclick = () => {
            modal.classList.remove('visible');
            videoPlayer.pause();
        };
    }
}

// Bootstrap on page load
window.addEventListener('DOMContentLoaded', () => {
    window._app = new MonkeyMojiApp();
});
