#!/usr/bin/env python3
"""Read-only inventory of the one approved development target. Never applies SQL.

Uses the ignored owner-only .env.db.local and official CLI link metadata. No
credential argument, browser access, auth-store scraping or third-party module.
Inventory alone never authorizes apply: purpose, drift and recovery need review.
"""
from __future__ import annotations
import argparse
from datetime import datetime, timezone
import hashlib
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
from urllib.parse import urlsplit, unquote

ROOT = Path(__file__).resolve().parents[2]
TARGET = 'aquvhqbkvrtzhbmezkci'


def require_private(path, *, directory=False):
    """Check exact setup paths before reading values; never repair permissions."""
    info = path.lstat()
    correct_type = stat.S_ISDIR(info.st_mode) if directory else stat.S_ISREG(info.st_mode)
    expected_mode = 0o700 if directory else 0o600
    if not correct_type or info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) != expected_mode:
        raise ValueError('Setup paths must be current-owner private directories/files, never symlinks.')


def credentials():
    path = ROOT / '.env.db.local'
    metadata = ROOT / 'supabase/.temp'
    reference = metadata / 'project-ref'
    pooler_file = metadata / 'pooler-url'
    require_private(path)
    require_private(metadata, directory=True)
    require_private(reference)
    require_private(pooler_file)
    lines = path.read_text().splitlines()
    if len(lines) != 1 or not lines[0].startswith('SUPABASE_DB_PASSWORD='):
        raise ValueError('Credential file has an unsupported format; do not source or evaluate it.')
    words = shlex.split(lines[0].split('=', 1)[1])
    if len(words) != 1 or not words[0]:
        raise ValueError('Credential value is absent or malformed.')
    if reference.read_text().strip() != TARGET:
        raise ValueError('Linked project differs from the approved target.')
    # Official CLI link writes this metadata. Never print it: a URI may contain credentials.
    url = urlsplit(pooler_file.read_text().strip())
    direct = url.hostname == f'db.{TARGET}.supabase.co' and unquote(url.username or '') == 'postgres'
    pooler = (re.fullmatch(r'[a-z0-9-]+\.pooler\.supabase\.com', url.hostname or '') is not None
              and unquote(url.username or '') == 'postgres.' + TARGET)
    if url.scheme not in {'postgres', 'postgresql'} or url.password is not None or url.query or url.fragment or not (direct or pooler) or url.path != '/postgres' or url.port not in {None, 5432}:
        raise ValueError('Link metadata is not a supported exact-target direct/session connection.')
    ca = Path('/etc/ssl/certs/ca-certificates.crt')
    if not ca.is_file():
        raise ValueError('System TLS CA bundle is unavailable; do not downgrade TLS verification.')
    env = {k: v for k, v in os.environ.items()
           if not k.startswith(('PG', 'SUPABASE_')) and k != 'DATABASE_URL'}
    env.update(PGHOST=url.hostname, PGPORT='5432', PGDATABASE='postgres',
               PGUSER=unquote(url.username), PGPASSWORD=words[0], PGSSLMODE='verify-full',
               PGSSLROOTCERT=str(ca), PGCONNECT_TIMEOUT='10',
               PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000',
               PGAPPNAME='resumora-approved-read-only-preflight')
    return env


def quote_identifier(value):
    return '"' + value.replace('"', '""') + '"'


def inventory(psql, env):
    def query(sql):
        result = subprocess.run([str(psql), '-X', '-qAt', '--set', 'ON_ERROR_STOP=1'],
            input='BEGIN READ ONLY;\n' + sql + ';\nCOMMIT;\n', env=env,
            capture_output=True, text=True, timeout=40)
        if result.returncode:
            # Raw libpq/psql diagnostics can contain connection details. Do not relay them.
            raise RuntimeError('Read-only database query failed; connection details suppressed. No apply attempted.')
        return json.loads(result.stdout)

    server = query("""SELECT json_build_object('version',current_setting('server_version'),
      'database',current_database(),'collation',current_setting('lc_collate'),
      'ctype',current_setting('lc_ctype'),'readOnly',current_setting('transaction_read_only'),
      'tls',(SELECT ssl FROM pg_stat_ssl WHERE pid=pg_backend_pid()))""")
    if server['readOnly'] != 'on' or server['tls'] is not True:
        raise RuntimeError('Verified TLS/read-only session assurance is absent. No apply attempted.')
    # Managed schemas are inventoried separately with counts; row contents and function bodies are never emitted.
    tables = query("""SELECT coalesce(json_agg(x ORDER BY x.schema,x.name),'[]') FROM
      (SELECT n.nspname AS schema,c.relname AS name,c.relkind,c.relrowsecurity AS rls,
       c.relforcerowsecurity AS force_rls,
       md5(coalesce((SELECT string_agg(a.attname||':'||format_type(a.atttypid,a.atttypmod)||':'||a.attnotnull::text||':'||coalesce(pg_get_expr(d.adbin,d.adrelid),''),'|' ORDER BY a.attnum)
        FROM pg_attribute a LEFT JOIN pg_attrdef d ON d.adrelid=a.attrelid AND d.adnum=a.attnum
        WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped),'')) AS columns_hash
       FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
       WHERE c.relkind IN ('r','p') AND n.nspname !~ '^pg_' AND n.nspname NOT IN
        ('information_schema','auth','storage','extensions','graphql','graphql_public','realtime',
         'supabase_migrations','supabase_functions','vault','net','cron','_realtime','_analytics')) x""")
    for table in tables:
        relation = quote_identifier(table['schema']) + '.' + quote_identifier(table['name'])
        table['has_rows'] = query('SELECT to_json(EXISTS(SELECT 1 FROM ' + relation + ' LIMIT 1))')
    constraints = query("""SELECT coalesce(json_agg(x ORDER BY x.table_name,x.name),'[]') FROM
      (SELECT c.conrelid::regclass::text AS table_name,c.conname AS name,c.contype AS type,
       c.convalidated AS validated,pg_get_constraintdef(c.oid) AS definition FROM pg_constraint c
       JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname IN ('app','public')) x""")
    policies = query("""SELECT coalesce(json_agg(x ORDER BY x.schemaname,x.tablename,x.policyname),'[]') FROM
      (SELECT schemaname,tablename,policyname,permissive,roles,cmd,
       md5(coalesce(qual,'')||'|'||coalesce(with_check,'')) AS definition_hash
       FROM pg_policies WHERE schemaname IN ('app','public')) x""")
    functions = query("""SELECT coalesce(json_agg(x ORDER BY x.signature),'[]') FROM
      (SELECT p.oid::regprocedure::text AS signature,p.prosecdef AS security_definer,
       p.proacl::text AS acl,md5(pg_get_functiondef(p.oid)) AS definition_hash
       FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
       WHERE n.nspname IN ('app','public') AND p.prokind='f') x""")
    counts = {}
    for relation in ['auth.users', 'storage.buckets', 'storage.objects']:
        if query("SELECT to_json(to_regclass('" + relation + "') IS NOT NULL)"):
            counts[relation] = query('SELECT to_json(count(*)) FROM ' + relation)
    history = []
    if query("SELECT to_json(to_regclass('supabase_migrations.schema_migrations') IS NOT NULL)"):
        history = query("SELECT coalesce(json_agg(x ORDER BY x.version),'[]') FROM (SELECT version,name FROM supabase_migrations.schema_migrations) x")
    result = {'target_ref': TARGET, 'server': server, 'tables': tables, 'constraints': constraints,
              'policies': policies, 'functions': functions, 'managed_counts': counts,
              'migration_history': history}
    result['inventory_sha256'] = hashlib.sha256(json.dumps(result, sort_keys=True).encode()).hexdigest()
    result.update(observed_at=datetime.now(timezone.utc).isoformat(), can_apply=False,
                  review_required=['actual development purpose/identity', 'history and schema drift against stable reviewed head',
                    'unexpected objects or nonempty user/storage data', 'existing backup/restore baseline and object recovery',
                    'named phase, passing local tests, dry-run and synthetic cleanup plan'],
                  assurance='read-only metadata/counts; no row contents, migration statements or function bodies')
    return result


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', type=Path, required=True)
    parser.add_argument('--pg-lib', type=Path)
    parser.add_argument('--receipt', type=Path, required=True)
    args = parser.parse_args()
    try:
        if args.receipt.exists():
            raise ValueError('Refusing to overwrite a prior preflight receipt.')
        env = credentials()
        if args.pg_lib:
            env['LD_LIBRARY_PATH'] = str(args.pg_lib)
        result = inventory(args.pg_bin / 'psql', env)
        # Metadata stays owner-only, outside Git. No stdout schema or connection dump.
        with args.receipt.open('x', opener=lambda path, flags: os.open(path, flags, 0o600)) as output:
            json.dump(result, output, indent=2)
            output.write('\n')
        print('Read-only inventory saved. Apply remains disabled pending purpose/drift/recovery review.')
        return 0
    except (OSError, ValueError, RuntimeError, subprocess.SubprocessError):
        print('Preflight unavailable or rejected. Verify the owner-only access setup and target metadata; no apply attempted.', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())
