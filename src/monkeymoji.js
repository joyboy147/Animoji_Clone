/**
 * 3D MonkeyMoji renderer using Three.js and GLTF morph targets.
 * Implements ARKit blendshape mapping, ear dynamics, and face-overlay alignment.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

export class MonkeyMojiRenderer {
    constructor(canvas, videoElement) {
        this.canvas = canvas;
        this.video = videoElement;
        this.isLoaded = false;

        // Three.js Core
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
            powerPreference: 'high-performance'
        });
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 1000);
        this.camera.position.set(0, 0, 50);

        // Lights
        this.setupLights();

        // Meshes
        this.avatar = null;
        this.modelRoot = null;
        this.modelSize = new THREE.Vector3(1, 1, 1);
        this.headMesh = null;
        this.leftEye = null;
        this.rightEye = null;
        this.upperTeeth = null;
        this.lowerTeeth = null;
        this.tongue = null;
        this.allMeshes = [];

        // Ear Physics State
        this.prevYaw = 0;
        this.prevRoll = 0;
        this.earVelL = 0;
        this.earPosL = 0;
        this.earVelR = 0;
        this.earPosR = 0;

        // Background / Modes
        this.mode = 'overlay'; // 'overlay', 'greenscreen', 'bluescreen', 'studio', 'transparent'
        this.studioTexture = null;

        // Load studio background texture
        new THREE.TextureLoader().load('/assets/backgrounds/monkeymoji_studio.jpg', (tex) => {
            tex.colorSpace = THREE.SRGBColorSpace;
            this.studioTexture = tex;
        });

        window.addEventListener('resize', () => this.onWindowResize());
    }

    setupLights() {
        this.ambLight = new THREE.AmbientLight(0xfff5ea, 1.25);
        this.scene.add(this.ambLight);

        this.keyLight = new THREE.DirectionalLight(0xffffff, 1.6);
        this.keyLight.position.set(12, 20, 25);
        this.scene.add(this.keyLight);

        this.fillLight = new THREE.DirectionalLight(0xffeedd, 0.85);
        this.fillLight.position.set(-18, -8, 18);
        this.scene.add(this.fillLight);

        this.rimLight = new THREE.DirectionalLight(0xffffff, 0.5);
        this.rimLight.position.set(0, 30, 5);
        this.scene.add(this.rimLight);
    }

    async load() {
        const loader = new GLTFLoader();
        return new Promise((resolve, reject) => {
            loader.load('/assets/monkey/monkeymoji.glb', (gltf) => {
                // Track a clean pivot and center the imported GLB inside it.
                // This keeps model centering separate from face positioning.
                this.modelRoot = gltf.scene;
                const box = new THREE.Box3().setFromObject(this.modelRoot);
                const center = box.getCenter(new THREE.Vector3());
                box.getSize(this.modelSize);
                this.modelRoot.position.sub(center);
                this.avatar = new THREE.Group();
                this.avatar.add(this.modelRoot);
                this.scene.add(this.avatar);

                // Catalog meshes
                this.modelRoot.traverse((child) => {
                    if (child.isMesh) {
                        this.allMeshes.push(child);
                        if (child.name === 'head') this.headMesh = child;
                        else if (child.name === 'L_eye') this.leftEye = child;
                        else if (child.name === 'R_eye') this.rightEye = child;
                        else if (child.name === 'upperTeeth') this.upperTeeth = child;
                        else if (child.name === 'lowerTeeth') this.lowerTeeth = child;
                        else if (child.name === 'tongue') this.tongue = child;

                        // Ensure proper shadow/material properties
                        if (child.material) {
                            child.material.side = THREE.DoubleSide;
                        }
                    }
                });

                // Add dark mouth cavity backing behind teeth to ensure deep shadow inside mouth
                const mouthCavityGeom = new THREE.SphereGeometry(4.3, 16, 16, 0, Math.PI * 2, 0, Math.PI * 0.5);
                const mouthCavityMat = new THREE.MeshBasicMaterial({ color: 0x180808, side: THREE.BackSide });
                const mouthCavity = new THREE.Mesh(mouthCavityGeom, mouthCavityMat);
                mouthCavity.position.set(0, 4.2, 5.8);
                mouthCavity.scale.set(1.0, 0.8, 0.7);
                this.modelRoot.add(mouthCavity);

                this.isLoaded = true;
                console.log('MonkeyMoji 3D model successfully loaded into renderer');
                resolve(this.avatar);
            }, null, (err) => {
                console.error('Failed to load MonkeyMoji model:', err);
                reject(err);
            });
        });
    }

    onWindowResize() {
        const width = this.canvas.clientWidth || window.innerWidth;
        const height = this.canvas.clientHeight || window.innerHeight;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height, false);
    }

    setVideoSource(videoElement) {
        this.video = videoElement;
        if (this.video) {
            this.videoTexture = new THREE.VideoTexture(this.video);
            this.videoTexture.colorSpace = THREE.SRGBColorSpace;
            this.videoTexture.minFilter = THREE.LinearFilter;
            this.videoTexture.magFilter = THREE.LinearFilter;
            if (this.mode === 'overlay') {
                this.scene.background = this.videoTexture;
            }
        }
    }

    setMode(mode) {
        this.mode = mode;
        if (mode === 'overlay') {
            if (!this.videoTexture && this.video) {
                this.videoTexture = new THREE.VideoTexture(this.video);
                this.videoTexture.colorSpace = THREE.SRGBColorSpace;
            }
            this.scene.background = this.videoTexture || null;
        } else if (mode === 'greenscreen') {
            this.scene.background = new THREE.Color(0x00ff00);
        } else if (mode === 'bluescreen') {
            this.scene.background = new THREE.Color(0x0000ff);
        } else if (mode === 'studio') {
            this.scene.background = this.studioTexture || new THREE.Color(0xebd9d4);
        } else {
            // transparent
            this.scene.background = null;
        }
    }

    updateTracking(data, settings) {
        if (!this.isLoaded || !this.avatar) return;

        if (!data || !data.detected) {
            // Keep current pose or smoothly center
            return;
        }

        const { position, rotation, faceWidth, faceHeight, blendshapes } = data;
        const {
            headScale = 1.25,
            neckOffsetY = 0.0,
            neckOffsetX = 0.0,
            depthOffsetZ = 0.0,
            mouthMultiplier = 1.4,
            smileMultiplier = 1.3,
            eyeBlinkMultiplier = 1.1,
            browMultiplier = 1.2,
            earPhysics = true,
            rotMultiplier = 1.0
        } = settings;

        // 1. Position and Rotation
        if (this.mode === 'overlay') {
            // Face Overlay Mode: Map video coordinates to 3D world space.
            const targetZ = depthOffsetZ;
            const cameraDistance = Math.max(1, this.camera.position.z - targetZ);
            const vHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * cameraDistance;
            const vWidth = vHeight * this.camera.aspect;

            // MediaPipe: (0,0) top-left, (1,1) bottom-right
            // Three.js: (0,0) center, Y goes up, X goes right
            // The video texture is not mirrored, so use its native X direction.
            const targetX = (position.x - 0.5) * vWidth + neckOffsetX;
            const targetY = -(position.y - 0.5) * vHeight + neckOffsetY;
            // Normalize against the GLB's native dimensions. Without this
            // division, the model's large authored size fills the screen.
            const desiredModelWidth = faceWidth * vWidth * headScale * 1.12;
            const baseScale = desiredModelWidth / Math.max(0.001, this.modelSize.x);

            this.avatar.position.set(targetX, targetY, targetZ);
            this.avatar.scale.set(baseScale, baseScale, baseScale);

            // Rotation
            this.avatar.rotation.x = -rotation.pitch * rotMultiplier;
            this.avatar.rotation.y = -rotation.yaw * rotMultiplier;
            this.avatar.rotation.z = -rotation.roll * rotMultiplier;
        } else {
            // Avatar Center Mode (Chroma, Studio, Transparent)
            this.avatar.position.set(0, 0 + neckOffsetY * 0.5, 0);
            const cameraDistance = Math.max(1, this.camera.position.z - depthOffsetZ);
            const visibleHeight = 2 * Math.tan(THREE.MathUtils.degToRad(this.camera.fov * 0.5)) * cameraDistance;
            const standardScale = (visibleHeight * 0.62 / Math.max(0.001, this.modelSize.y)) * headScale;
            this.avatar.scale.set(standardScale, standardScale, standardScale);

            // Responsive rotation with slight damping
            this.avatar.rotation.x = -rotation.pitch * 0.9 * rotMultiplier;
            this.avatar.rotation.y = -rotation.yaw * 0.9 * rotMultiplier;
            this.avatar.rotation.z = -rotation.roll * 0.9 * rotMultiplier;
        }

        // 2. Apply Blendshapes
        this.applyBlendshapes(blendshapes, {
            mouthMultiplier,
            smileMultiplier,
            eyeBlinkMultiplier,
            browMultiplier
        });

        // 3. Ear Spring Physics
        if (earPhysics) {
            this.updateEarPhysics(rotation.yaw, rotation.roll);
        }
    }

    applyBlendshapes(bs, multipliers) {
        if (!bs) return;

        const setInfluence = (mesh, targetName, value) => {
            if (mesh && mesh.morphTargetDictionary && mesh.morphTargetDictionary[targetName] !== undefined) {
                const idx = mesh.morphTargetDictionary[targetName];
                mesh.morphTargetInfluences[idx] = Math.max(0, Math.min(1, value));
            }
        };

        // --- MOUTH & JAW ---
        // Speech produces fairly small MediaPipe scores. Remove the closed-mouth
        // noise floor and expand the useful range for visible lip sync.
        const jawOpenVal = Math.max(0, (bs.jawOpen || 0) - 0.015) * 2.35 * multipliers.mouthMultiplier;
        setInfluence(this.headMesh, 'jawOpen', jawOpenVal);
        setInfluence(this.lowerTeeth, 'jawOpen', jawOpenVal);
        setInfluence(this.tongue, 'jawOpen', jawOpenVal);

        const jawLeftVal = (bs.jawLeft || 0);
        setInfluence(this.headMesh, 'jawLeft', jawLeftVal);
        setInfluence(this.lowerTeeth, 'jawLeft', jawLeftVal);

        const jawRightVal = (bs.jawRight || 0);
        setInfluence(this.headMesh, 'jawRight', jawRightVal);
        setInfluence(this.lowerTeeth, 'jawRight', jawRightVal);

        const mouthCloseVal = (bs.mouthClose || 0) * 1.15;
        setInfluence(this.headMesh, 'mouthClose', mouthCloseVal);

        const mouthPuckerVal = (bs.mouthPucker || 0) * 1.55;
        setInfluence(this.headMesh, 'mouthPucker', mouthPuckerVal);

        const mouthFunnelVal = (bs.mouthFunnel || 0) * 1.55;
        setInfluence(this.headMesh, 'mouthFunnel', mouthFunnelVal);

        // Remaining ARKit mouth channels are important for consonants and
        // asymmetric speech; previously they were ignored.
        const mouthMap = [
            ['mouthRollLower', 'mouthRollLower'],
            ['mouthRollUpper', 'mouthRollUpper'],
            ['mouthShrugLower', 'mouthShrugLower'],
            ['mouthShrugUpper', 'mouthShrugUpper'],
            ['mouthLowerDownLeft', 'mouthLowerDown_L'],
            ['mouthLowerDownRight', 'mouthLowerDown_R'],
            ['mouthUpperUpLeft', 'mouthUpperUp_L'],
            ['mouthUpperUpRight', 'mouthUpperUp_R'],
            ['mouthPressLeft', 'mouthPress_L'],
            ['mouthPressRight', 'mouthPress_R'],
            ['mouthLeft', 'mouthLeft'],
            ['mouthRight', 'mouthRight'],
            ['jawForward', 'jawForward']
        ];
        for (const [source, target] of mouthMap) {
            setInfluence(this.headMesh, target, (bs[source] || 0) * multipliers.mouthMultiplier);
        }

        // The monkey rig contains sculpted combination shapes. Driving these
        // prevents the lips collapsing when jaw and vowel shapes occur together.
        setInfluence(this.headMesh, 'jawOpen__mouthFunnel', Math.min(jawOpenVal, mouthFunnelVal));
        setInfluence(this.headMesh, 'jawOpen__mouthPucker', Math.min(jawOpenVal, mouthPuckerVal));
        setInfluence(this.headMesh, 'mouthFunnel__mouthPucker', Math.min(mouthFunnelVal, mouthPuckerVal));
        setInfluence(this.headMesh, 'jawOpen__mouthClose__mouthFunnel', Math.min(jawOpenVal, mouthCloseVal, mouthFunnelVal));
        setInfluence(this.headMesh, 'jawOpen__mouthClose__mouthPucker', Math.min(jawOpenVal, mouthCloseVal, mouthPuckerVal));

        // --- SMILE & FROWN ---
        const smileL = (bs.mouthSmileLeft || 0) * multipliers.smileMultiplier;
        const smileR = (bs.mouthSmileRight || 0) * multipliers.smileMultiplier;
        setInfluence(this.headMesh, 'mouthSmile_L', smileL);
        setInfluence(this.headMesh, 'mouthSmile_R', smileR);

        const frownL = (bs.mouthFrownLeft || 0) * 1.2;
        const frownR = (bs.mouthFrownRight || 0) * 1.2;
        setInfluence(this.headMesh, 'mouthFrown_L', frownL);
        setInfluence(this.headMesh, 'mouthFrown_R', frownR);

        const dimpleL = (bs.mouthDimpleLeft || 0);
        const dimpleR = (bs.mouthDimpleRight || 0);
        setInfluence(this.headMesh, 'mouthDimple_L', dimpleL);
        setInfluence(this.headMesh, 'mouthDimple_R', dimpleR);

        const stretchL = (bs.mouthStretchLeft || 0);
        const stretchR = (bs.mouthStretchRight || 0);
        setInfluence(this.headMesh, 'mouthStretch_L', stretchL);
        setInfluence(this.headMesh, 'mouthStretch_R', stretchR);

        // --- CHEEKS & NOSE ---
        const cheekPuff = (bs.cheekPuff || 0);
        setInfluence(this.headMesh, 'cheekPuff', cheekPuff);

        const cheekSquintL = (bs.cheekSquintLeft || 0);
        const cheekSquintR = (bs.cheekSquintRight || 0);
        setInfluence(this.headMesh, 'cheekSquint_L', cheekSquintL);
        setInfluence(this.headMesh, 'cheekSquint_R', cheekSquintR);

        const noseSneerL = (bs.noseSneerLeft || 0);
        const noseSneerR = (bs.noseSneerRight || 0);
        setInfluence(this.headMesh, 'noseSneer_L', noseSneerL);
        setInfluence(this.headMesh, 'noseSneer_R', noseSneerR);

        // --- EYES & BLINKS ---
        const blinkL = (bs.eyeBlinkLeft || 0) * multipliers.eyeBlinkMultiplier;
        const blinkR = (bs.eyeBlinkRight || 0) * multipliers.eyeBlinkMultiplier;
        setInfluence(this.leftEye, 'eyeBlink_L', blinkL);
        setInfluence(this.rightEye, 'eyeBlink_R', blinkR);
        setInfluence(this.headMesh, 'EyeBlink_L_0_5', blinkL * 0.7);
        setInfluence(this.headMesh, 'EyeBlink_R_0_5', blinkR * 0.7);

        // Eye Gaze
        setInfluence(this.leftEye, 'eyeLookUp_L', bs.eyeLookUpLeft || 0);
        setInfluence(this.rightEye, 'eyeLookUp_R', bs.eyeLookUpRight || 0);
        setInfluence(this.leftEye, 'eyeLookDown_L', bs.eyeLookDownLeft || 0);
        setInfluence(this.rightEye, 'eyeLookDown_R', bs.eyeLookDownRight || 0);
        setInfluence(this.leftEye, 'eyeLookIn_L', bs.eyeLookInLeft || 0);
        setInfluence(this.rightEye, 'eyeLookIn_R', bs.eyeLookInRight || 0);
        setInfluence(this.leftEye, 'eyeLookOut_L', bs.eyeLookOutLeft || 0);
        setInfluence(this.rightEye, 'eyeLookOut_R', bs.eyeLookOutRight || 0);

        // --- EYEBROWS ---
        const browDownL = (bs.browDownLeft || 0) * multipliers.browMultiplier;
        const browDownR = (bs.browDownRight || 0) * multipliers.browMultiplier;
        setInfluence(this.headMesh, 'browDown_L', browDownL);
        setInfluence(this.headMesh, 'browDown_R', browDownR);

        const browInnerUp = (bs.browInnerUp || 0) * multipliers.browMultiplier;
        setInfluence(this.headMesh, 'browInnerUp', browInnerUp);

        const browOuterUpL = (bs.browOuterUpLeft || 0) * multipliers.browMultiplier;
        const browOuterUpR = (bs.browOuterUpRight || 0) * multipliers.browMultiplier;
        setInfluence(this.headMesh, 'browOuterUp_L', browOuterUpL);
        setInfluence(this.headMesh, 'browOuterUp_R', browOuterUpR);

        // --- TONGUE ---
        const tongueOutVal = (bs.tongueOut || 0) * 1.5;
        setInfluence(this.tongue, 'tongueOut', tongueOutVal);
    }

    updateEarPhysics(currentYaw, currentRoll) {
        const deltaYaw = currentYaw - this.prevYaw;
        const deltaRoll = currentRoll - this.prevRoll;
        this.prevYaw = currentYaw;
        this.prevRoll = currentRoll;

        // Damped harmonic spring physics: a = -k*x - c*v + force
        const k = 0.28;  // spring stiffness
        const c = 0.12;  // damping
        const forceL = (-deltaYaw * 2.5 - deltaRoll * 1.8);
        const forceR = (deltaYaw * 2.5 - deltaRoll * 1.8);

        this.earVelL += -k * this.earPosL - c * this.earVelL + forceL;
        this.earPosL += this.earVelL;
        this.earPosL = Math.max(-1, Math.min(1, this.earPosL));

        this.earVelR += -k * this.earPosR - c * this.earVelR + forceR;
        this.earPosR += this.earVelR;
        this.earPosR = Math.max(-1, Math.min(1, this.earPosR));

        if (this.headMesh && this.headMesh.morphTargetDictionary) {
            const dict = this.headMesh.morphTargetDictionary;
            const inf = this.headMesh.morphTargetInfluences;

            // Left ear morphs
            if (this.earPosL > 0 && dict['L_ear_DYN_rightward'] !== undefined) {
                inf[dict['L_ear_DYN_rightward']] = this.earPosL;
            } else if (this.earPosL < 0 && dict['L_ear_DYN_leftward'] !== undefined) {
                inf[dict['L_ear_DYN_leftward']] = -this.earPosL;
            }

            // Right ear morphs
            if (this.earPosR > 0 && dict['R_ear_DYN_rightward'] !== undefined) {
                inf[dict['R_ear_DYN_rightward']] = this.earPosR;
            } else if (this.earPosR < 0 && dict['R_ear_DYN_leftward'] !== undefined) {
                inf[dict['R_ear_DYN_leftward']] = -this.earPosR;
            }
        }
    }

    render() {
        this.renderer.render(this.scene, this.camera);
    }
}
