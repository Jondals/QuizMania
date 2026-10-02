#!/usr/bin/env bash
# check.sh
# Run this to run every check before a release (see scripts/check.mjs):
# type checking, unit tests, the database schema against an in-memory
# Postgres, the production build, and a browser smoke test with Supabase
# fully mocked (it never touches the real database or creates accounts).
set -e
cd "$(dirname "$0")"
pnpm run check
