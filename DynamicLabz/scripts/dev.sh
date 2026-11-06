#!/usr/bin/env bash
# Starts the Dynamic Labz Django server (used by `pnpm dev` and the v0 preview).
set -e
cd "$(dirname "$0")/.."

PYTHON=".venv/bin/python"

if ! "$PYTHON" -c "import django, rest_framework, PIL, whitenoise" >/dev/null 2>&1; then
  if command -v uv >/dev/null 2>&1; then
    [ -d .venv ] || uv venv .venv
    uv pip install --python "$PYTHON" -r requirements.txt
  else
    [ -d .venv ] || python3 -m venv .venv
    "$PYTHON" -m pip install -r requirements.txt
  fi
fi

# The preview renders inside a cross-site iframe, so session/CSRF cookies must be SameSite=None.
export CROSS_SITE_COOKIES="${CROSS_SITE_COOKIES:-1}"

"$PYTHON" manage.py migrate --noinput
"$PYTHON" manage.py seed_demo

exec "$PYTHON" manage.py runserver "0.0.0.0:${PORT:-3000}"
