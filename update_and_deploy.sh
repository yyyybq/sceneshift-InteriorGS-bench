#!/bin/bash
# =============================================================
# SceneShift Bench Website — Update & Deploy Script
# Usage:  ./update_and_deploy.sh [commit message]
# =============================================================
set -e

WEBSITE_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$WEBSITE_DIR"

# Default commit message
MSG="${1:-Update website $(date '+%Y-%m-%d %H:%M')}"

echo "=== SceneShift Bench: Update & Deploy ==="
echo "Directory: $WEBSITE_DIR"

# Check for changes
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo "No changes to deploy."
    exit 0
fi

# Show what changed
echo ""
echo "--- Changes ---"
git status --short
echo ""

# Stage, commit, push
git add -A
git commit -m "$MSG"
git push origin main

echo ""
echo "=== Pushed to GitHub. Pages will auto-deploy in ~1 min ==="
echo "URL: https://yyyybq.github.io/sceneshift-InteriorGS-bench/"
