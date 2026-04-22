#!/bin/sh
set -e

echo "Generating Prisma client..."
npx prisma generate

echo "Running database migrations..."
npx prisma migrate deploy

echo "Starting application..."
if [ -f "dist/main.js" ]; then
    exec node dist/main
elif [ -f "dist/src/main.js" ]; then
    exec node dist/src/main
else
    echo "Error: Cannot find main.js in dist/ or dist/src/"
    ls -laR dist/
    exit 1
fi
