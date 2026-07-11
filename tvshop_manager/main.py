import os
import json
import asyncio
import subprocess
from typing import Set
from fastapi import FastAPI, Request, HTTPException
from fastapi.responses import StreamingResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

app = FastAPI(title="TV SHOP Portal Manager")

# SSE active listeners list
listeners: Set[asyncio.Queue] = set()

def log_message(message: str):
    print(message)
    for q in list(listeners):
        q.put_nowait(message)

# Helper to get paths
def get_paths():
    manager_dir = os.path.dirname(os.path.abspath(__file__))
    config_path = os.path.join(manager_dir, "manager_config.json")
    
    repo_path = ".."
    if os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                data = json.load(f)
                repo_path = data.get("repoPath", "..")
        except Exception as e:
            print(f"Error reading manager_config.json: {e}")
            
    abs_repo_path = os.path.abspath(os.path.join(manager_dir, repo_path))
    portal_config_path = os.path.join(abs_repo_path, "config.json")
    
    return abs_repo_path, portal_config_path

# SSE streaming event generator
async def event_generator(request: Request):
    q = asyncio.Queue()
    listeners.add(q)
    log_message("SSE: Client connected")
    try:
        while True:
            # Check client connection status
            if await request.is_disconnected():
                break
            try:
                # Wait for new log messages with 1s ping timeout
                msg = await asyncio.wait_for(q.get(), timeout=1.0)
                yield f"data: {msg}\n\n"
            except asyncio.TimeoutError:
                # Send keep-alive comment
                yield ": ping\n\n"
    finally:
        listeners.remove(q)
        print("SSE: Client disconnected")

@app.get("/")
def redirect_to_index():
    # Serves the index.html from static files
    return HTMLResponse(content=open(os.path.join(os.path.dirname(__file__), "web", "index.html"), "r", encoding="utf-8").read())

@app.get("/api/config")
def get_config():
    _, config_path = get_paths()
    log_message(f"Loading configuration from {config_path}")
    if not os.path.exists(config_path):
        raise HTTPException(status_code=404, detail="config.json not found in repository path")
    try:
        with open(config_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        log_message(f"Error loading config.json: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error reading config: {str(e)}")

@app.post("/api/config")
def save_config(payload: dict):
    _, config_path = get_paths()
    log_message(f"Saving configuration updates to {config_path}")
    try:
        with open(config_path, "w", encoding="utf-8") as f:
            json.dump(payload, f, indent=2, ensure_ascii=False)
        log_message("Config file successfully written to disk locally.")
        return {"status": "success"}
    except Exception as e:
        log_message(f"Error saving config.json: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error writing config: {str(e)}")

@app.post("/api/git/deploy")
async def deploy_to_git():
    repo_path, _ = get_paths()
    log_message(f"Initiating Git deployment in {repo_path}")
    
    # Run Git actions asynchronously in a threadpool to prevent locking the server
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, perform_git_deploy, repo_path)
    
    if not success:
        raise HTTPException(status_code=500, detail="Git deployment failed. Check SSE logs.")
    return {"status": "success"}

def perform_git_deploy(repo_path: str) -> bool:
    env = os.environ.copy()
    env["GIT_TERMINAL_PROMPT"] = "0"  # Prevent git from prompt blocking
    
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
                log_message(f"  Command failed with code {res.returncode}")
                return False
            return True
        except subprocess.TimeoutExpired:
            log_message("  Command execution timed out after 30 seconds.")
            return False
        except Exception as ex:
            log_message(f"  Exception running command: {str(ex)}")
            return False

    # Git deployment workflow
    log_message("--- GIT DEPLOY START ---")
    if not run_cmd(["git", "add", "config.json"]):
        return False
        
    # Check if there are changes to commit
    status_res = subprocess.run(
        ["git", "status", "--porcelain", "config.json"],
        cwd=repo_path,
        stdout=subprocess.PIPE,
        text=True
    )
    if not status_res.stdout.strip():
        log_message("No modifications detected in config.json. Nothing to commit.")
    else:
        if not run_cmd(["git", "commit", "-m", "Update portal configuration via manager application"]):
            return False
            
    # Pull remote changes first
    log_message("Fetching and rebasing remote changes...")
    run_cmd(["git", "pull", "--rebase", "origin", "main"])
    
    # Push to origin
    log_message("Pushing changes to GitHub repository...")
    if not run_cmd(["git", "push", "origin", "main"]):
        return False
        
    log_message("--- GIT DEPLOY COMPLETED SUCCESSFULLY ---")
    return True

@app.get("/api/logs")
def stream_logs(request: Request):
    return StreamingResponse(event_generator(request), media_type="text/event-stream")

# Mount web assets static directory
web_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "web")
if os.path.exists(web_dir):
    app.mount("/static", StaticFiles(directory=web_dir), name="static")

if __name__ == "__main__":
    import uvicorn
    log_message("Starting TV SHOP Portal Manager dev server...")
    uvicorn.run(app, host="127.0.0.1", port=8000)
