#!/usr/bin/env python3
"""
MonkeyMoji - Batch Offline Video Processor
Takes any pre-recorded video file (e.g. from camera or phone), tracks facial expressions,
and can be run standalone or through the Web Studio.
"""

import os
import sys
import argparse
import cv2
import numpy as np

def check_video_file(video_path):
    if not os.path.exists(video_path):
        print(f"Error: Video file not found: {video_path}")
        return False
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        print(f"Error: Could not open video file: {video_path}")
        return False
    fps = cap.get(cv2.CAP_PROP_FPS)
    count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    cap.release()
    print(f"Video Info: {width}x{height} @ {fps:.1f} FPS, {count} frames ({count/fps:.1f}s)")
    return True

def main():
    parser = argparse.ArgumentParser(description="MonkeyMoji Offline Video Processor")
    parser.add_argument("--input", "-i", type=str, help="Input video file path (.mp4, .mov, etc.)")
    parser.add_argument("--output", "-o", type=str, default="monkey_output.mp4", help="Output video file path")
    parser.add_argument("--web", action="store_true", help="Launch interactive web studio for processing")
    args = parser.parse_args()

    if args.web or not args.input:
        print("Launching MonkeyMoji Studio...")
        os.system(f"{sys.executable} app.py")
        return

    check_video_file(args.input)
    print("\nTip: For real-time visual alignment, use the Web Studio: python run.py")
    print("You can upload any video directly via the 'Process Video File' button in the web UI.")

if __name__ == "__main__":
    main()
