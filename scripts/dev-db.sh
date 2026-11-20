#!/usr/bin/env bash
# Per-thread dev databases: Neon child branches of production.
#
# The server uses @neondatabase/serverless (a websocket driver), so a local
# Postgres won't work. Each agent thread or developer gets its own copy-on-write
# branch of production instead, and deletes it when done. Production itself is
# never written to: this script only creates, reads and deletes branches named
# dev-*, and refuses anything else.
#
#   scripts/dev-db.sh create <name>   create dev-<name> (or reuse it) and write its env file
#   scripts/dev-db.sh env <name>      print the path of dev-<name>'s env file (rewrites it if missing)
#   scripts/dev-db.sh delete <name>   delete dev-<name> and its env file
#   scripts/dev-db.sh list            list the project's branches
#
# Name the branch after your thread code or handle, e.g. VIRT-2 -> dev-virt-2.
# The connection string goes into a 0600 env file, never to stdout, so it stays
# out of logs. Load it with:  source "$(scripts/dev-db.sh env <name>)"
#
# Needs NEON_API_KEY, curl and jq. NEON_PROJECT_ID and NEON_PARENT_BRANCH_ID
# default to the Virtus project and its production branch.
set -euo pipefail

: "${NEON_API_KEY:?NEON_API_KEY must be set}"
PROJECT="${NEON_PROJECT_ID:-patient-bonus-29715643}"
PARENT="${NEON_PARENT_BRANCH_ID:-br-royal-fire-akeum9qg}"
DATABASE=neondb
ROLE=neondb_owner
API="https://console.neon.tech/api/v2/projects/$PROJECT"
ENV_DIR="${XDG_STATE_HOME:-$HOME/.local/state}/virtus-dev-db"

neon() {
  local method=$1 path=$2; shift 2
  curl -fsS -X "$method" -H "Authorization: Bearer $NEON_API_KEY" -H "Content-Type: application/json" "$API$path" "$@"
}

branch_name() {
  local label
  label=$(printf '%s' "${1:?usage: $0 <command> <name>}" | tr '[:upper:]' '[:lower:]' | tr -c 'a-z0-9-' '-')
  printf 'dev-%s' "${label#dev-}"
}

branch_id() {
  neon GET /branches | jq -r --arg n "$1" '.branches[] | select(.name == $n) | .id'
}

wait_ready() {
  for _ in $(seq 60); do
    [ "$(neon GET "/branches/$1" | jq -r .branch.current_state)" = ready ] && return
    sleep 2
  done
  echo "Branch $1 is not ready after 2 minutes" >&2
  exit 1
}

write_env() {
  local name=$1 id=$2 uri file="$ENV_DIR/$1.env"
  uri=$(neon GET "/connection_uri?branch_id=$id&database_name=$DATABASE&role_name=$ROLE&pooled=false" | jq -r .uri)
  mkdir -p "$ENV_DIR"
  (umask 077 && printf "export DIRECT_DATABASE_URL='%s'\nexport VIRTUS_DEV_BRANCH='%s'\n" "$uri" "$name" > "$file")
  printf '%s\n' "$file"
}

cmd=${1:-}
case "$cmd" in
  create)
    name=$(branch_name "${2:-}")
    id=$(branch_id "$name")
    if [ -n "$id" ]; then
      echo "Reusing $name ($id)" >&2
    else
      id=$(neon POST /branches -d "$(jq -n --arg n "$name" --arg p "$PARENT" \
        '{branch: {name: $n, parent_id: $p}, endpoints: [{type: "read_write"}]}')" | jq -r .branch.id)
      echo "Created $name ($id) from production" >&2
    fi
    wait_ready "$id"
    file=$(write_env "$name" "$id")
    echo "Load it with:  source $file" >&2
    echo "Delete it with: $0 delete ${2}" >&2
    ;;
  env)
    name=$(branch_name "${2:-}")
    file="$ENV_DIR/$name.env"
    if [ ! -f "$file" ]; then
      id=$(branch_id "$name")
      [ -n "$id" ] || { echo "No branch $name; run: $0 create ${2}" >&2; exit 1; }
      write_env "$name" "$id" > /dev/null
    fi
    printf '%s\n' "$file"
    ;;
  delete)
    name=$(branch_name "${2:-}")
    id=$(branch_id "$name")
    [ "$id" != "$PARENT" ] || { echo "Refusing to delete the parent branch" >&2; exit 1; }
    if [ -n "$id" ]; then
      neon DELETE "/branches/$id" > /dev/null
      echo "Deleted $name ($id)" >&2
    else
      echo "No branch $name" >&2
    fi
    rm -f "$ENV_DIR/$name.env"
    ;;
  list)
    neon GET /branches | jq -r '.branches[] | [.name, .id, .current_state, .created_at] | @tsv'
    ;;
  *)
    sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'
    exit 1
    ;;
esac
