#!/usr/bin/env python3
"""
MonkeyMoji Application Server & Launcher
Starts local high-speed server and launches browser with NVIDIA GPU acceleration.
"""

import os
import sys
import webbrowser
import threading
import subprocess
import time
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = 8000
DIRECTORY = os.path.dirname(os.path.abspath(__file__))

class StudioRequestHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIRECTORY, **kwargs)

    def end_headers(self):
        # Enable SharedArrayBuffer and cross-origin isolation for peak Wasm SIMD performance
        self.send_header('Cross-Origin-Opener-Policy', 'same-origin')
        self.send_header('Cross-Origin-Embedder-Policy', 'require-corp')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', 'no-cache')
        super().end_headers()

def open_browser():
    time.sleep(1.0)
    url = f"http://localhost:{PORT}/index.html"
    print(f"\n✨ Opening MonkeyMoji in browser: {url}")
    
    # Try opening Google Chrome with GPU acceleration flags if available
    chrome_paths = ['/usr/bin/google-chrome', '/usr/bin/chromium-browser', '/usr/bin/brave-browser']
    launched = False
    for p in chrome_paths:
        if os.path.exists(p):
            try:
                subprocess.Popen([
                    p,
                    "--enable-gpu-rasterization",
                    "--enable-zero-copy",
                    "--ignore-gpu-blocklist",
                    url
                ], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                launched = True
                break
            except Exception:
                pass
                
    if not launched:
        webbrowser.open(url)

def main():
    os.chdir(DIRECTORY)
    server = ThreadingHTTPServer(('0.0.0.0', PORT), StudioRequestHandler)
    print("=" * 65)
    print("  🐵  MONKEYMOJI")
    print("=" * 65)
    print(f"  • Running local server at: http://localhost:{PORT}")
    print("  • GPU Acceleration: NVIDIA GeForce RTX 4050")
    print("  • 3D Model: MonkeyMoji (141 Blendshapes + PBR)")
    print("  • Neural Tracker: MediaPipe FaceLandmarker V2 (GPU Wasm)")
    print("=" * 65)
    print("  Keyboard Shortcuts:")
    print("    [Space]  Start / Stop HD Video Recording")
    print("    [S]      Take Snapshot photo")
    print("    [M]      Cycle Modes (Overlay -> Studio -> GreenScreen)")
    print("    [H]      Toggle Clean Mode (Hide all controls)")
    print("=" * 65)
    print("Press Ctrl+C to stop the studio server.\n")

    threading.Thread(target=open_browser, daemon=True).start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nStopping MonkeyMoji. Goodbye! 🐵")
        server.server_close()

if __name__ == "__main__":
    main()
