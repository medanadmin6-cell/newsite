#!/bin/sh
# Rebuild supabase/setup-all.sql from the migration folder.
{
  echo "-- 3btafric: all migrations concatenated. Idempotent, safe to re-run."
  echo "-- Generated from supabase/migrations/ — do not edit by hand."
  echo
  for f in supabase/migrations/*.sql; do
    echo "-- ============ $(basename "$f") ============"
    cat "$f"; echo
  done
} > supabase/setup-all.sql
