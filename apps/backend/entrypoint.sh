#!/bin/sh
set -e

echo "Running database migrations..."
bun run migrate

echo "Starting backend..."
exec bun run start
