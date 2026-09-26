#!/usr/bin/env bash
# ONE-TIME SETUP - run once, save the printed IDs into .env
set -euo pipefail
cd "$(dirname "$0")"

if [ -f .env ]; then
  echo ".env already exists - delete it first if you want to recreate the agent/environment." >&2
  exit 1
fi

echo "Creating agent..."
AGENT_ID=$(ant beta:agents create < polsia-lead-scout.agent.yaml --transform id -r)
echo "  AGENT_ID=$AGENT_ID"

echo "Creating environment..."
ENV_ID=$(ant beta:environments create < polsia-lead-scout.environment.yaml --transform id -r)
echo "  ENV_ID=$ENV_ID"

cat > .env <<EOF
POLSIA_AGENT_ID=$AGENT_ID
POLSIA_ENV_ID=$ENV_ID
EOF

echo
echo "Saved to .env. Run a session with: npm start"
echo
echo "To update the agent later after editing polsia-lead-scout.agent.yaml:"
echo "  ant beta:agents update --agent-id $AGENT_ID --version <current-version> < polsia-lead-scout.agent.yaml"
