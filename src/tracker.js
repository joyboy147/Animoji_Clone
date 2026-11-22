/**
 * Real-time MediaPipe FaceLandmarker with Blendshape Tracking & Motion Filtering.
 */
import { FaceLandmarker, FilesetResolver } from '/node_modules/@mediapipe/tasks-vision/vision_bundle.mjs';

// Exponential Moving Average filter with adaptive alpha for smooth tracking
export class AdaptiveEMAFilter {
    constructor(alpha = 0.5) {
        this.alpha = alpha;
        this.value = null;
    }

    filter(val, customAlpha = null) {
        const a = customAlpha !== null ? customAlpha : this.alpha;
        if (this.value === null) {
            this.value = val;
            return val;
        }
        if (typeof val === 'number') {
            this.value = this.value + a * (val - this.value);
            return this.value;
        }
        if (Array.isArray(val)) {
            for (let i = 0; i < val.length; i++) {
                this.value[i] = this.value[i] + a * (val[i] - this.value[i]);
            }
            return this.value;
        }
        return val;
    }

    reset() {
        this.value = null;
    }
}

export class FaceTracker {
    constructor() {
        this.landmarker = null;
        this.video = null;
        this.isRunning = false;
        this.onResults = null;
        this.lastVideoTime = -1;
        this.loopGeneration = 0;

        // Smoothers for pose
        this.posFilter = new AdaptiveEMAFilter(0.45);
        this.rotFilter = new AdaptiveEMAFilter(0.45);
        this.blendshapeFilters = {};

        // Metrics
        this.fps = 0;
        this.frameCount = 0;
        this.lastFpsUpdate = performance.now();
    }

    async init(videoElement) {
        this.video = videoElement;
        const fileset = await FilesetResolver.forVisionTasks('/node_modules/@mediapipe/tasks-vision/wasm');
        
        try {
            this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: '/models/face_landmarker.task',
                    delegate: 'GPU'
                },
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: 'VIDEO',
                numFaces: 1
            });
            console.log('FaceLandmarker initialized with GPU delegate');
        } catch (e) {
            console.warn('Falling back to CPU delegate for FaceLandmarker', e);
            this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
                baseOptions: {
                    modelAssetPath: '/models/face_landmarker.task',
                    delegate: 'CPU'
                },
                outputFaceBlendshapes: true,
                outputFacialTransformationMatrixes: true,
                runningMode: 'VIDEO',
                numFaces: 1
            });
        }
    }

    async startCamera(deviceId = null, resolution = '1080p', microphoneId = null) {
        this.stop();
        const constraints = {
            audio: microphoneId ? { deviceId: { exact: microphoneId } } : true,
            video: {
                width: resolution === '1080p' ? { ideal: 1920 } : (resolution === '720p' ? { ideal: 1280 } : { ideal: 640 }),
                height: resolution === '1080p' ? { ideal: 1080 } : (resolution === '720p' ? { ideal: 720 } : { ideal: 480 }),
                frameRate: { ideal: 60, min: 30 }
            }
        };

        if (deviceId) {
            constraints.video.deviceId = { exact: deviceId };
        }

        const stream = await navigator.mediaDevices.getUserMedia(constraints);
        this.video.srcObject = stream;
        await new Promise((resolve) => {
            this.video.onloadedmetadata = () => {
                this.video.play();
                resolve();
            };
        });
        this.isRunning = true;
        this.lastVideoTime = -1;
        const generation = ++this.loopGeneration;
        this.loop(generation);
        return stream;
    }

    stop() {
        this.isRunning = false;
        this.loopGeneration++;
        if (this.video && this.video.srcObject) {
            this.video.srcObject.getTracks().forEach(t => t.stop());
            this.video.srcObject = null;
        }
    }

    loop(generation = this.loopGeneration) {
        if (!this.isRunning || generation !== this.loopGeneration) return;

        if (this.video && this.video.readyState >= 2) {
            const now = performance.now();
            if (this.video.currentTime !== this.lastVideoTime) {
                this.lastVideoTime = this.video.currentTime;

                const results = this.landmarker.detectForVideo(this.video, now);
                this.processResults(results, now);

                // FPS Counter
                this.frameCount++;
                if (now - this.lastFpsUpdate >= 500) {
                    this.fps = Math.round((this.frameCount * 1000) / (now - this.lastFpsUpdate));
                    this.frameCount = 0;
                    this.lastFpsUpdate = now;
                }
            }
        }

        requestAnimationFrame(() => this.loop(generation));
    }

    processResults(results, timestamp) {
        if (!results || !results.faceLandmarks || results.faceLandmarks.length === 0) {
            if (this.onResults) {
                this.onResults({
                    detected: false,
                    fps: this.fps
                });
            }
            return;
        }

        const landmarks = results.faceLandmarks[0];
        const rawBlendshapes = results.faceBlendshapes && results.faceBlendshapes[0] 
            ? results.faceBlendshapes[0].categories 
            : [];
        const matrix = results.facialTransformationMatrixes && results.facialTransformationMatrixes[0]
            ? results.facialTransformationMatrixes[0].data
            : null;

        // Smooth blendshapes
        const blendshapes = {};
        for (const cat of rawBlendshapes) {
            if (!this.blendshapeFilters[cat.categoryName]) {
                this.blendshapeFilters[cat.categoryName] = new AdaptiveEMAFilter(0.65);
            }
            blendshapes[cat.categoryName] = this.blendshapeFilters[cat.categoryName].filter(cat.score);
        }

        // Calculate head pose and bounding box
        // Landmark 1: Nose tip, 168: Forehead, 152: Chin, 234: Left ear, 454: Right ear
        const nose = landmarks[1];
        const forehead = landmarks[168];
        const chin = landmarks[152];
        const leftEar = landmarks[234];
        const rightEar = landmarks[454];

        // Use the complete face oval for placement. Ear distance alone becomes
        // very small in profile and made the avatar shrink and slide away.
        let minX = 1, minY = 1, maxX = 0, maxY = 0, zSum = 0;
        for (const point of landmarks) {
            minX = Math.min(minX, point.x);
            minY = Math.min(minY, point.y);
            maxX = Math.max(maxX, point.x);
            maxY = Math.max(maxY, point.y);
            zSum += point.z;
        }
        const bboxWidth = maxX - minX;
        const faceHeight = maxY - minY;
        const videoAspectCorrection = (this.video?.videoHeight || 1) / (this.video?.videoWidth || 1);
        const heightAsNormalizedWidth = faceHeight * videoAspectCorrection;
        const faceWidth = Math.max(bboxWidth, heightAsNormalizedWidth * 0.9);
        const faceCenter = {
            x: (minX + maxX) * 0.5,
            y: (minY + maxY) * 0.5,
            z: zSum / landmarks.length
        };

        // Approximate 3D Euler angles from landmarks if matrix is not directly available
        let rotation = { pitch: 0, yaw: 0, roll: 0 };
        if (matrix) {
            // Extract Euler angles from 4x4 column-major matrix
            // m00 m10 m20 m30
            // m01 m11 m21 m31
            // m02 m12 m22 m32
            // m03 m13 m23 m33
            const m = matrix;
            const pitch = Math.asin(-Math.max(-1, Math.min(1, m[6])));
            let yaw, roll;
            if (Math.abs(m[6]) < 0.99999) {
                yaw = Math.atan2(m[2], m[10]);
                roll = Math.atan2(m[4], m[5]);
            } else {
                yaw = Math.atan2(-m[8], m[0]);
                roll = 0;
            }
            rotation = {
                pitch: pitch,
                yaw: yaw,
                roll: roll
            };
        } else {
            // Landmark-based fallback rotation
            const yaw = Math.atan2(nose.x - faceCenter.x, faceWidth * 0.5);
            const pitch = Math.atan2(nose.y - faceCenter.y, faceHeight * 0.5);
            const roll = Math.atan2(rightEar.y - leftEar.y, rightEar.x - leftEar.x);
            rotation = { pitch, yaw, roll };
        }

        const smoothedPos = this.posFilter.filter([faceCenter.x, faceCenter.y, faceCenter.z]);
        const smoothedRot = this.rotFilter.filter([rotation.pitch, rotation.yaw, rotation.roll]);

        if (this.onResults) {
            this.onResults({
                detected: true,
                fps: this.fps,
                rawMatrix: matrix,
                landmarks,
                blendshapes,
                position: { x: smoothedPos[0], y: smoothedPos[1], z: smoothedPos[2] },
                rotation: { pitch: smoothedRot[0], yaw: smoothedRot[1], roll: smoothedRot[2] },
                faceWidth,
                faceHeight
            });
        }
    }
}
