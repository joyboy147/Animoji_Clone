# MonkeyMoji

A desktop face-puppeteering application that replaces a detected face with a 3D monkey and transfers head pose, blinking, eye direction, brows, cheeks, jaw, lip and smile expressions in real time.

## Run the desktop app

```bash
npm install
npm start
```

On Linux, `./start.sh` launches the same desktop application directly.
The Linux launcher disables Chromium's process sandbox because projects on
removable/mounted drives generally cannot provide Electron's root-owned SUID
sandbox helper. MonkeyMoji only loads its bundled local application files.

Allow camera and microphone access when prompted. `app.py` remains available as a browser-based development fallback only.

## Use with OBS Studio

1. Start MonkeyMoji and choose **Transparent** (best for compositing) or **Green Screen**.
2. Click **Open OBS Output**. Keep the main window open; it owns the camera and tracking session.
3. In OBS, add **Window Capture** and select **MonkeyMoji OBS Output**.
4. For green screen, add OBS's **Chroma Key** filter. For transparent capture, enable alpha support in the capture method where the platform offers it.

The OBS window contains only the rendered output, never the controls. Resize it to the stream resolution before capture for the sharpest result.

Keyboard shortcuts: `H` toggles the main-window controls, `M` cycles modes, `Space` records, and `S` saves a snapshot.
