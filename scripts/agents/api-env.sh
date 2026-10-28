#!/usr/bin/env bash
# Run a command with the local-development API settings from
# apps/api/fastapi/AGENTS.md (Testing), so tests, lint and type checks work in a
# fresh worktree that has no gitignored .env.local.
#
#   scripts/agents/api-env.sh uv run --frozen --package fast-back pytest tests/hr -q
#
# Values already in the environment win. These are placeholders for the local
# stack, never real credentials, and this script never writes an env file.
# On the Windows Subsystem for Linux host, explicitly set POSTGRES_SERVER=localhost
# and REDIS_URL=redis://localhost:6379/0; the defaults target agent containers.
set -euo pipefail

if [ "$#" -eq 0 ]; then
  echo "usage: scripts/agents/api-env.sh <command> [args...]" >&2
  exit 2
fi

# A disposable test database from scripts/agents/test-db.sh is used while it runs
# and nothing in the environment names a database. Tests then run on 127.0.0.1
# against RAM-backed Postgres (faster: about 20% on the full suite, and
# independent of how host.docker.internal resolves). Anything else listening on
# that port is used the same way, so keep it free. Set TEST_DB_AUTO=0 to opt out.
if [ "${TEST_DB_AUTO:-1}" = 1 ] && [ -z "${POSTGRES_SERVER:-}" ] && [ -z "${POSTGRES_PORT:-}" ] \
  && (exec 3<>"/dev/tcp/127.0.0.1/${TEST_DB_PORT:-5433}") 2>/dev/null; then
  POSTGRES_SERVER=127.0.0.1
  POSTGRES_PORT="${TEST_DB_PORT:-5433}"
  echo "api-env: using the disposable test database on 127.0.0.1:$POSTGRES_PORT (TEST_DB_AUTO=0 to opt out)" >&2
  : "${WXPRODUCTS_DATABASE_URL:=postgresql://wxproducts:changethis@127.0.0.1:$POSTGRES_PORT/wxproducts}"
  : "${REDIS_URL:=redis://127.0.0.1:6379/0}"
fi

: "${PROJECT_NAME:=Barrels Grenada}"
: "${FIRST_SUPERUSER:=admin@example.com}"
: "${FIRST_SUPERUSER_PASSWORD:=changethis}"
: "${POSTGRES_SERVER:=host.docker.internal}"
: "${POSTGRES_PORT:=5432}"
: "${POSTGRES_USER:=app}"
: "${POSTGRES_PASSWORD:=changethis}"
: "${REDIS_URL:=redis://host.docker.internal:6379/0}"
: "${WXPRODUCTS_DATABASE_URL:=postgresql://wxproducts:changethis@host.docker.internal:5432/wxproducts}"
export PROJECT_NAME FIRST_SUPERUSER FIRST_SUPERUSER_PASSWORD POSTGRES_SERVER \
  POSTGRES_PORT POSTGRES_USER POSTGRES_PASSWORD REDIS_URL WXPRODUCTS_DATABASE_URL

# Probe through the same uv flags/interpreter before pytest begins. Other API
# commands retain the wrapper's existing environment-only behavior.
args=("$@")
if [[ "${args[0]##*/}" == uv && "${args[1]:-}" == run ]]; then
  test_command=-1
  probe_interpreter=python
  for ((i=2; i<${#args[@]}; i++)); do
    case "${args[i]}" in
      --) ((i+=1)); break ;;
      --package|--python|--directory|--project|--with|--with-editable|--with-requirements|--group|--no-group|--extra|--no-extra|--index|--default-index|--index-url|--extra-index-url|--find-links|--resolution|--prerelease|--fork-strategy|--config-file|--env-file|--cache-dir|--link-mode|--exclude-newer|--refresh-package|--upgrade-package|--python-platform|--python-version|--color|--trusted-host|-p|-r)
        ((i+=1)) ;;
      -*) ;;
      *) break ;;
    esac
  done
  api_runner="${args[i]:-}"
  if [[ "${api_runner##*/}" == pytest ]] ||
    { [[ "$api_runner" =~ (^|/)python([0-9]+(\.[0-9]+)*)?$ ]] &&
      [[ "${args[i+1]:-}" == -m && "${args[i+2]:-}" == pytest ]]; }; then
    test_command=$i
    [[ "${api_runner##*/}" == pytest ]] || probe_interpreter="$api_runner"
  fi
  if ((test_command >= 0)); then
    workspace_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
    environment="${UV_PROJECT_ENVIRONMENT:-$workspace_root/.venv}"
    [[ "$environment" == /* ]] || environment="$workspace_root/$environment"
    environment=$(realpath -m -- "$environment")
    case "$environment" in
      "$workspace_root"/*) ;;
      *) echo "API environment resolves outside the current worktree: $environment" >&2; exit 1 ;;
    esac
    export UV_PROJECT_ENVIRONMENT="$environment"
    # -c preserves the API working directory on sys.path, like pytest; executing
    # the checker file directly would replace it with scripts/agents.
    "${args[@]:0:test_command}" "$probe_interpreter" -c \
      'import runpy, sys; path = sys.argv.pop(1); runpy.run_path(path, run_name="__main__")' \
      "$workspace_root/scripts/agents/check-api-imports.py" "$workspace_root"
  fi
fi

exec "$@"
