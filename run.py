#!/usr/bin/env python3
import os
import sys
import subprocess

PROJECT_DIR = os.path.dirname(os.path.abspath(__file__))
VENV_PYTHON = os.path.join(PROJECT_DIR, ".venv", "bin", "python")

if os.path.exists(VENV_PYTHON):
    python_bin = VENV_PYTHON
else:
    python_bin = sys.executable

app_script = os.path.join(PROJECT_DIR, "app.py")
os.execv(python_bin, [python_bin, app_script] + sys.argv[1:])
