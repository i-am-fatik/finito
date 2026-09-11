#!/bin/sh
set -e

exec docker run --rm --name finito-e2e-relay \
	-p "${FINITO_E2E_RELAY_PORT:-7448}:7777" \
	--tmpfs /app/strfry-db \
	--entrypoint sh \
	dockurr/strfry:latest \
	-c 'sed -i "s#plugin = \"/app/write-policy.py\"#plugin = \"\"#" /etc/strfry.conf.default && exec /app/strfry.sh'
