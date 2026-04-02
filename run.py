#!/usr/bin/env python3
"""
run.py — APF Dashboard Launcher (React/Vite + FastAPI)
=======================================================
Starts both servers and opens the browser automatically.

Usage:  python3 run.py
        /Users/dhruvrpatel/.local/bin/python3.14 run.py
"""

import os, sys, time, signal, shutil, subprocess, webbrowser
import urllib.request, urllib.error

PORT_API  = 8000
PORT_VITE = 5173
PROJECT   = os.path.dirname(os.path.abspath(__file__))
SERVER    = os.path.join(PROJECT, "server")
CLIENT    = os.path.join(PROJECT, "client")
REQS      = os.path.join(SERVER,  "requirements.txt")
REQUIRED  = ["fastapi", "uvicorn", "numpy", "websockets"]


def banner():
    print("\n  ╔══════════════════════════════════════════════╗")
    print("  ║  ⚙  Interactive APF Navigation Dashboard   ║")
    print("  ║     React/Vite + FastAPI + WebSocket        ║")
    print("  ╚══════════════════════════════════════════════╝\n")


def kill_port(port):
    try:
        r = subprocess.run(["lsof", "-ti", f":{port}"], capture_output=True, text=True)
        pids = r.stdout.strip().split()
        if pids:
            subprocess.run(["kill", "-9"] + pids, capture_output=True)
            time.sleep(0.5)
    except Exception:
        pass


def pkgs_ok():
    for p in REQUIRED:
        try: __import__(p)
        except ImportError: return False
    return True


def install_python_deps():
    print("  Python deps ...", end="", flush=True)
    if pkgs_ok():
        print(" ✓ already installed"); return
    uv = shutil.which("uv") or os.path.expanduser("~/.local/bin/uv")
    methods = []
    if os.path.isfile(uv):
        methods.append([uv, "pip", "install", "-r", REQS, "-q"])
    methods += [
        [sys.executable, "-m", "pip", "install", "-r", REQS, "-q", "--break-system-packages"],
        [sys.executable, "-m", "pip", "install", "-r", REQS, "-q"],
    ]
    for cmd in methods:
        try:
            r = subprocess.run(cmd, capture_output=True, timeout=120)
            if r.returncode == 0:
                print(" ✓"); return
        except Exception:
            continue
    if pkgs_ok():
        print(" ✓ (packages available)"); return
    print("\n  ✗ Could not install Python deps.")
    print(f"  Run manually:  uv pip install -r {REQS}\n"); sys.exit(1)


def install_npm_deps():
    nm = os.path.join(CLIENT, "node_modules")
    if os.path.isdir(nm):
        return
    print("  npm install ...", end="", flush=True)
    r = subprocess.run(["npm", "install"], cwd=CLIENT, capture_output=True)
    print(" ✓" if r.returncode == 0 else " ✗")


def wait_http(url, timeout=20):
    t = time.time()
    while time.time() - t < timeout:
        try:
            urllib.request.urlopen(url, timeout=1); return True
        except: time.sleep(0.3)
    return False


def main():
    banner()

    print(f"  Clearing ports {PORT_API} and {PORT_VITE}...")
    kill_port(PORT_API); kill_port(PORT_VITE)

    install_python_deps()
    install_npm_deps()

    # Start FastAPI server
    print(f"  FastAPI  → http://localhost:{PORT_API}  ...", end="", flush=True)
    api_proc = subprocess.Popen(
        [sys.executable, "-m", "uvicorn", "server:app",
         "--host", "0.0.0.0", "--port", str(PORT_API)],
        cwd=SERVER, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
    )
    if not wait_http(f"http://localhost:{PORT_API}/health", timeout=15):
        print(" FAILED")
        err = api_proc.stderr.read().decode() if api_proc.stderr else ""
        print(f"  Error: {err}\n"); sys.exit(1)
    print(" ✓")

    # Start Vite dev server
    print(f"  Vite     → http://localhost:{PORT_VITE}  ...", end="", flush=True)
    npm = shutil.which("npm") or "npm"
    vite_proc = subprocess.Popen(
        [npm, "run", "dev"],
        cwd=CLIENT, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True,
    )
    # Wait for Vite to print "ready" (reads stdout non-blocking via timeout loop)
    deadline = time.time() + 15
    ready = False
    while time.time() < deadline:
        line = vite_proc.stdout.readline() if vite_proc.stdout else ""
        if "ready" in line.lower() or "localhost" in line.lower():
            ready = True; break
        time.sleep(0.1)
    print(" ✓" if ready else " (starting...)")

    time.sleep(0.5)
    webbrowser.open(f"http://localhost:{PORT_VITE}")

    print(f"\n  ✅ Frontend   →  http://localhost:{PORT_VITE}")
    print(f"  ✅ Backend    →  http://localhost:{PORT_API}")
    print(f"  ✅ API Docs   →  http://localhost:{PORT_API}/docs")
    print("\n  Press Ctrl+C to stop.\n")

    def shutdown(sig, _):
        print("\n  Shutting down...")
        api_proc.terminate(); vite_proc.terminate()
        try: api_proc.wait(3)
        except: api_proc.kill()
        kill_port(PORT_API); kill_port(PORT_VITE)
        print("  Done.\n"); sys.exit(0)

    signal.signal(signal.SIGINT,  shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    api_proc.wait()


if __name__ == "__main__":
    main()
