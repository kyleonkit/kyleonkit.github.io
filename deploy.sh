#!/usr/bin/env bash
# Publish the site to kyleonkit/kyleonkit.github.io.
#   ./deploy.sh "commit message"
# Stamps a new ?v= on style.css / links.js / app.js in index.html so browsers
# fetch fresh copies instead of serving GitHub Pages' 10-minute cache.
set -e
cd "$(dirname "$0")"
MSG="${1:-Update links}"
V=$(date +%Y%m%d%H%M%S)
sed -i -E "s#(style.css|links.js|app.js|assets/[a-z-]+.png)\?v=[0-9]+#\1?v=$V#g" index.html links.js

export GH_TOKEN=$(gh auth token --user kyleonkit)
git add -A
git -c user.name=kyleonkit -c user.email=kyleonkit@users.noreply.github.com \
  commit -qm "$MSG

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
git -c credential.helper= \
    -c "credential.helper=!f() { echo username=kyleonkit; echo password=$GH_TOKEN; }; f" \
    push -q origin main

echo "Pushed v=$V — waiting for GitHub Pages..."
for i in $(seq 1 36); do
  sleep 10
  if curl -s "https://kyleonkit.github.io/?$RANDOM" | grep -q "v=$V"; then
    echo "Live: https://kyleonkit.github.io"; exit 0
  fi
done
echo "Timed out waiting for Pages build" >&2; exit 1
