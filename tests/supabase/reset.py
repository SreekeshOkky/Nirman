"""Rebuild the test database from supabase/migrations/. DESTRUCTIVE.

Drops the public schema, all accounts and all storage, then applies every
migration in order, so a broken migration fails the tests.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import httpx
import psycopg

from . import env

MIGRATIONS = Path(__file__).resolve().parents[2] / "supabase" / "migrations"

# Restores what a new Supabase project grants on the public schema.
CLEAN = """
drop schema if exists public cascade;
create schema public authorization pg_database_owner;
grant usage on schema public to public, postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role postgres in schema public grant all on functions to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on tables to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on sequences to postgres, anon, authenticated, service_role;
alter default privileges for role supabase_admin in schema public grant all on functions to postgres, anon, authenticated, service_role;

do $$
declare policy record;
begin
  for policy in select policyname, tablename from pg_policies where schemaname = 'storage' loop
    execute format('drop policy %I on storage.%I', policy.policyname, policy.tablename);
  end loop;
end $$;

-- Storage blocks direct deletes with triggers; skip them for this cleanup.
set session_replication_role = replica;
delete from storage.objects;
delete from storage.buckets;
set session_replication_role = origin;
delete from auth.users;
"""


def connect(user: str = "postgres") -> psycopg.Connection:
    return psycopg.connect(host=env.DB_HOST, port=env.DB_PORT, user=user, password=env.DB_PASSWORD, dbname="postgres", autocommit=True, connect_timeout=10)


def _wait(path: str, deadline: float) -> None:
    headers = {"apikey": env.SERVICE_KEY, "Authorization": f"Bearer {env.SERVICE_KEY}"}
    while True:
        try:
            if httpx.get(f"{env.URL}{path}", headers=headers, timeout=5).status_code == 200:
                return
        except httpx.HTTPError:
            pass
        if time.monotonic() > deadline:
            raise RuntimeError(f"Test Supabase did not answer at {env.URL}{path}")
        time.sleep(0.5)


def reset() -> None:
    if env.DB_HOST != "factory-supabase-db" and os.environ.get("FACTORY_SUPABASE_ALLOW_RESET") != "1":
        raise RuntimeError(f"Refusing to wipe the database at {env.DB_HOST}. Set FACTORY_SUPABASE_ALLOW_RESET=1 only for a disposable one.")
    deadline = time.monotonic() + 120
    # Auth and storage create their own tables on first start.
    _wait("/auth/v1/health", deadline)
    _wait("/storage/v1/bucket", deadline)
    with connect("supabase_admin") as db:
        db.execute(CLEAN)
    with connect() as db:
        for migration in sorted(MIGRATIONS.glob("*.sql")):
            try:
                with db.transaction():
                    db.execute(migration.read_text())
            except psycopg.Error as exc:
                raise RuntimeError(f"Migration {migration.name} failed: {exc}") from exc
        db.execute("notify pgrst, 'reload schema'")
    _wait("/rest/v1/profiles?limit=1", deadline)
