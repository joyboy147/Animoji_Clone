/**
 * HD Video & Audio Recorder using Canvas CaptureStream & MediaRecorder.
 */
export class VideoRecorder {
    constructor(canvas, audioStream = null) {
        this.canvas = canvas;
        this.audioStream = audioStream;
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.startTime = 0;
        this.timerInterval = null;
        this.onTimerUpdate = null;
        this.onRecordingComplete = null;
    }

    setAudioStream(audioStream) {
        this.audioStream = audioStream;
    }

    start() {
        if (this.isRecording) return;
        this.recordedChunks = [];

        // 60 FPS Canvas Stream
        const canvasStream = this.canvas.captureStream(60);
        const tracks = [...canvasStream.getVideoTracks()];

        if (this.audioStream) {
            const audioTracks = this.audioStream.getAudioTracks();
            if (audioTracks.length > 0) {
                tracks.push(audioTracks[0]);
            }
        }

        const combinedStream = new MediaStream(tracks);

        // Pick best supported MIME type
        const mimeTypes = [
            'video/webm;codecs=vp9,opus',
            'video/webm;codecs=vp8,opus',
            'video/webm;codecs=h264,opus',
            'video/webm',
            'video/mp4'
        ];

        let selectedMime = 'video/webm';
        for (const mime of mimeTypes) {
            if (MediaRecorder.isTypeSupported(mime)) {
                selectedMime = mime;
                break;
            }
        }

        const options = {
            mimeType: selectedMime,
            videoBitsPerSecond: 8000000 // 8 Mbps crisp quality
        };

        this.mediaRecorder = new MediaRecorder(combinedStream, options);

        this.mediaRecorder.ondataavailable = (event) => {
            if (event.data && event.data.size > 0) {
                this.recordedChunks.push(event.data);
            }
        };

        this.mediaRecorder.onstop = () => {
            clearInterval(this.timerInterval);
            this.isRecording = false;
            const blob = new Blob(this.recordedChunks, { type: selectedMime });
            const url = URL.createObjectURL(blob);
            if (this.onRecordingComplete) {
                this.onRecordingComplete({
                    blob,
                    url,
                    mimeType: selectedMime,
                    durationMs: Date.now() - this.startTime
                });
            }
        };

        this.mediaRecorder.start(250); // Collect data chunks every 250ms
        this.isRecording = true;
        this.startTime = Date.now();

        this.timerInterval = setInterval(() => {
            const elapsed = Date.now() - this.startTime;
            const secs = Math.floor((elapsed / 1000) % 60).toString().padStart(2, '0');
            const mins = Math.floor((elapsed / (1000 * 60)) % 60).toString().padStart(2, '0');
            const hrs = Math.floor(elapsed / (1000 * 60 * 60)).toString().padStart(2, '0');
            const formatted = `${mins}:${secs}`;
            if (this.onTimerUpdate) {
                this.onTimerUpdate(formatted);
            }
        }, 200);
    }

    stop() {
        if (!this.isRecording || !this.mediaRecorder) return;
        this.mediaRecorder.stop();
    }

    takeSnapshot(filename = null) {
        const dataUrl = this.canvas.toDataURL('image/png', 1.0);
        const name = filename || `monkeymoji_${Date.now()}.png`;
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        return dataUrl;
    }

    downloadBlob(blob, filename = null) {
        const ext = blob.type.includes('mp4') ? 'mp4' : 'webm';
        const name = filename || `monkeymoji_video_${Date.now()}.${ext}`;
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    }
}
