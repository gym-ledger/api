#!/bin/sh
set -e

# The compiled scripts (dist/), not `npm run …`: the image has no dev
# dependencies, so no tsx.
node dist/scripts/run-migrations.js
node dist/scripts/seed-admin.js
node dist/scripts/seed-exercises.js

exec "$@"
