import os
import json
import time
import asyncio
import subprocess
from typing import Set
from fastapi import FastAPI, Request, HTTPException, Header, Query, File, UploadFile
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="TV SHOP Portal Manager")

# SSE active listeners list
listeners: Set[asyncio.Queue] = set()

def log_message(message: str):
    print(message)
    for q in list(listeners):
        q.put_nowait(message)

# Helper to get paths and local secret keys
def get_paths():
    manager_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(manager_dir, "manager_config.json")
    
    repo_path = ".."
    admin_pin = "0000"
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                repo_path = data.get("repoPath", "..")
                admin_pin = str(data.get("adminPin", "0000"))
        except Exception as e:
            print(f"Error reading manager_config.json: {e}")
            
    abs_repo_path = os.path.abspath(os.path.join(manager_dir, repo_path))
    portal_config_path = os.path.join(abs_repo_path, "config.json")
    
    return abs_repo_path, portal_config_path, admin_pin

# Validate secret header helper
def verify_admin_pin(x_admin_pin: str = Header(None)):
    _, _, admin_pin = get_paths()
    if not x_admin_pin or x_admin_pin != admin_pin:
        raise HTTPException(status_code=401, detail="Unauthorized: Invalid admin PIN")

# SSE streaming event generator
async def event_generator(request: Request):
    q = asyncio.Queue()
    listeners.add(q)
    log_message("SSE: Client connected")
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                msg = await asyncio.wait_for(q.get(), timeout=1.0)
                yield f"data: {msg}\n\n"
            except asyncio.TimeoutError:
                yield ": ping\n\n"
    finally:
        listeners.remove(q)
        print("SSE: Client disconnected")

@app.get("/")
def redirect_to_index():
    return HTMLResponse(content=open(os.path.join(os.path.dirname(__file__), "web", "index.html"), "r", encoding="utf-8").read())

# Verify client PIN
@app.post("/api/verify")
def verify_pin(payload: dict):
    _, _, admin_pin = get_paths()
    client_pin = payload.get("pin", "")
    if client_pin == admin_pin:
        return {"status": "authorized"}
    raise HTTPException(status_code=401, detail="Invalid PIN")

@app.get("/api/config")
def get_config(x_admin_pin: str = Header(None)):
    verify_admin_pin(x_admin_pin)
    
    _, config_path, _ = get_paths()
    log_message(f"Loading configuration from {config_path}")
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail="config.json not found")
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            data = json.load(f)
            data.pop("adminPin", None)
            return data
    except Exception as e:
        log_message(f"Error loading config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/config")
def save_config(payload: dict, x_admin_pin: str = Header(None)):
    verify_admin_pin(x_admin_pin)
    
    _, config_path, _ = get_paths()
    log_message(f"Saving configuration updates to {config_path}")
    try:
        payload.pop("adminPin", None)
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        log_message("Config file successfully written to disk locally.")
        return {"status": "success"}
    except Exception as e:
        log_message(f"Error saving config: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

# New Endpoint: Handle file upload
@app.post("/api/upload")
async def upload_image(file: UploadFile = File(...), x_admin_pin: str = Header(None)):
    verify_admin_pin(x_admin_pin)
    
    repo_path, _, _ = get_paths()
    img_dir = os.path.join(repo_path, "img")
    os.makedirs(img_dir, exist_ok=True)
    
    # Determine extension
    ext = ".png"
    if file.filename:
        _, file_ext = os.path.splitext(file.filename)
        if file_ext.lower() in [".png", ".jpg", ".jpeg", ".svg", ".webp", ".gif"]:
            ext = file_ext.lower()
            
    filename = f"upload_{int(time.time() * 1000)}{ext}"
    dest_path = os.path.join(img_dir, filename)
    
    try:
        content = await file.read()
        with open(dest_path, "wb") as f:
            f.write(content)
        log_message(f"Successfully uploaded and saved image to {dest_path}")
        return {"path": f"img/{filename}"}
    except Exception as e:
        log_message(f"Error saving uploaded image: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/git/deploy")
async def deploy_to_git(x_admin_pin: str = Header(None)):
    verify_admin_pin(x_admin_pin)
    
    repo_path, _, _ = get_paths()
    log_message(f"Initiating Git deployment in {repo_path}")
    
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, perform_git_deploy, repo_path)
    
    if not success:
        raise HTTPException(status_code=500, detail="Git deployment failed. Check SSE logs.")
    return {"status": "success"}

def perform_git_deploy(repo_path: str) -> bool:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"
    
    def run_cmd(args) -> bool:
        log_message(f"Executing: {' '.join(args)}")
        try:
            res = subprocess.run(
                args,
                cwd=repo_path,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                text=True,
                env=env,
                timeout=30
            )
            if res.stdout:
                for line in res.stdout.splitlines():
                    log_message(f"  [git] {line}")
            if res.stderr:
                for line in res.stderr.splitlines():
                    log_message(f"  [git-err] {line}")
            if res.returncode != 0:
                return False
            return True
        except Exception as ex:
            log_message(f"  Exception: {str(ex)}")
            return False

    log_message("--- GIT DEPLOY START ---")
    
    # Stage both config and uploaded images folder
    if not run_cmd(["git", "add", "config.json", "img/"]):
        return False
        
    status_res = subprocess.run(
        ["git", "status", "--porcelain", "config.json", "img/"],
        cwd=repo_path,
        stdout=subprocess.PIPE,
        text=True
    )
    if not status_res.stdout.strip():
        log_message("No modifications detected in config.json or img/. Nothing to commit.")
    else:
        if not run_cmd(["git", "commit", "-m", "Update portal config and images via manager application"]):
            return False
            
    log_message("Fetching and rebasing remote changes...")
    run_cmd(["git", "pull", "--rebase", "origin", "main"])
    
    log_message("Pushing changes to GitHub repository...")
    if not run_cmd(["git", "push", "origin", "main"]):
        return False
        
    log_message("--- GIT DEPLOY COMPLETED SUCCESSFULLY ---")
    return True

@app.get("/api/logs")
def stream_logs(request: Request, pin: str = Query(None)):
    _, _, admin_pin = get_paths()
    if not pin or pin != admin_pin:
        raise HTTPException(status_code=401, detail="Unauthorized")
    return StreamingResponse(event_generator(request), media_type="text/event-stream")

# Mount web assets static directory
web_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
if os.path.exists(web_dir):
    app.mount("/static", StaticFiles(directory=web_dir), name="static")

if __name__ == "__main__":
    import uvicorn
    log_message("Starting TV SHOP Portal Manager dev server...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
