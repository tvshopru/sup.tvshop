# Project Rules & Workflows

1. **MANDATORY AUTOMATIC GIT PULL BEFORE ANY WORK**:
   - Before editing, writing, or inspecting any project files or making changes to the codebase, ALWAYS FIRST execute `git pull origin main` (or `git pull --rebase origin main`) in powershell.
   - This guarantees that any changes, new articles, or edits made via the Online Cloud Studio (`admin.html`) or directly on GitHub are immediately downloaded to the local workspace before any local edits happen.

2. **REMIND USER TO REFRESH / PULL**:
   - Whenever making any edits or changes to the project files via chat, ALWAYS remind the user to run `git pull` locally (or refresh their manager panel `tvshop_manager` / hard reload `Ctrl + F5`), so local and remote versions remain perfectly synchronized.
