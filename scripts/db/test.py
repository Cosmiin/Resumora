#!/usr/bin/env python3
"""Run real SQL/RLS/concurrency tests in an isolated, disposable native PG cluster.

No hosted URL or credentials are accepted. Supabase Auth is a test double only.
Dependencies: Python 3 stdlib and PostgreSQL 16+ server/client binaries.
"""
from __future__ import annotations
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import time
import unittest

ROOT = Path(__file__).resolve().parents[2]


class Database:
    def __init__(self, binary_dir: Path, share_dir: Path | None, library_dir: Path | None):
        self.binary_dir = binary_dir
        self.share_dir = share_dir
        self.library_dir = library_dir
        self.temp = Path(tempfile.mkdtemp(prefix='resumora-db-'))
        self.data = self.temp / 'data'
        self.socket = self.temp / 'socket'
        self.socket.mkdir(mode=0o700)
        # Do not inherit any hosted database credentials or connection defaults.
        self.env = {k: v for k, v in os.environ.items()
                    if not k.startswith('PG') and k not in {'DATABASE_URL', 'SUPABASE_DB_URL'}}
        if library_dir:
            self.env['LD_LIBRARY_PATH'] = str(library_dir)
        self.env.update(PGHOST=str(self.socket), PGPORT='55439',
                        PGUSER='resumora_test_owner', PGDATABASE='postgres',
                        PGAPPNAME='resumora-local-synthetic-tests')
        self.running = False

    def binary(self, name):
        return str(self.binary_dir / name)

    def start(self):
        args = [self.binary('initdb'), '-D', str(self.data), '-U',
                'resumora_test_owner', '-A', 'trust', '--no-locale', '--encoding=UTF8']
        if self.share_dir:
            args += ['-L', str(self.share_dir)]
        subprocess.run(args, env=self.env, check=True, capture_output=True, text=True)
        options = f"-k {self.socket} -p 55439 -c listen_addresses='' -c fsync=off"
        if self.library_dir:
            extension_dir = self.binary_dir.parent / 'lib'
            options += f' -c dynamic_library_path={extension_dir}'
        subprocess.run([self.binary('pg_ctl'), '-D', str(self.data), '-l',
                        str(self.temp / 'postgres.log'), '-o', options, '-w', 'start'],
                       env=self.env, check=True, capture_output=True, text=True)
        self.running = True
        self.sql((ROOT / 'supabase/tests/bootstrap.sql').read_text())

    def stop(self):
        if self.running:
            subprocess.run([self.binary('pg_ctl'), '-D', str(self.data),
                            '-m', 'immediate', '-w', 'stop'], env=self.env,
                           capture_output=True, text=True, check=True)
            self.running = False
        shutil.rmtree(self.temp)

    def command(self):
        return [self.binary('psql'), '-X', '-qAt', '--set', 'ON_ERROR_STOP=1']

    def sql(self, query, *, user=None, role=None, expect_error=False):
        prefix = ''
        if role:
            assert role in {'authenticated', 'anon'}
            prefix += f'SET ROLE {role};\n'
        if user is not None:
            # Test fixtures pass UUIDs, not arbitrary SQL or production identities.
            import uuid
            prefix += "SELECT set_config('request.jwt.claim.sub', '" + str(uuid.UUID(user)) + "', false);\n"
        result = subprocess.run(self.command(), input=prefix+query, env=self.env,
                                capture_output=True, text=True, timeout=30)
        if expect_error:
            if result.returncode == 0:
                raise AssertionError('Expected database rejection, command succeeded')
            return result.stderr
        if result.returncode:
            raise AssertionError(result.stderr[-4000:])
        lines = result.stdout.strip().splitlines()
        if user is not None and lines and lines[0] == user:
            lines = lines[1:]
        return '\n'.join(lines)

    def migrate(self, through='P3'):
        applied = 0
        for path in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
            phase = path.name.split('_')[1].upper()
            if phase > through:
                continue
            version = path.name.split('_')[0]
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            old = self.sql(f"SELECT sha256 FROM test_support.migrations WHERE version='{version}'")
            if old:
                if old != digest:
                    raise AssertionError('An applied migration changed: '+path.name)
                continue
            self.sql('BEGIN;\n'+path.read_text()+f"\nINSERT INTO test_support.migrations VALUES ('{version}','{digest}');\nCOMMIT;")
            applied += 1
        return applied


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', default=os.environ.get('PG_BINDIR'))
    parser.add_argument('--pg-share', default=os.environ.get('PG_SHAREDIR'))
    parser.add_argument('--pg-lib', default=os.environ.get('PG_LIBDIR'))
    parser.add_argument('--receipt', type=Path)
    args = parser.parse_args()
    binary = Path(args.pg_bin) if args.pg_bin else Path(shutil.which('initdb') or '').parent
    if not (binary / 'initdb').is_file():
        parser.error('PostgreSQL server/client tools are required; supply --pg-bin (see docs/database/runbook.md).')
    db = Database(binary.resolve(), Path(args.pg_share) if args.pg_share else None,
                  Path(args.pg_lib) if args.pg_lib else None)
    started = time.monotonic()
    try:
        db.start()
        count = db.migrate()
        assert db.migrate() == 0, 'Normal reapply must have no pending migrations'
        assert db.sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='app'") == '43'
        assert db.sql("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='app' AND NOT c.convalidated") == '0'
        tests = ROOT / 'supabase/tests/behavior.py'
        cases = 2
        if tests.exists():
            import importlib.util
            spec = importlib.util.spec_from_file_location('resumora_db_behavior', tests)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            suite = module.suite(db)
            result = unittest.TextTestRunner(verbosity=2).run(suite)
            cases += result.testsRun
            if not result.wasSuccessful():
                return 1
        receipt = {'migrations_applied':count,'normal_reapply_pending':0,
                   'tables':43,'cases':cases,'elapsed_seconds':round(time.monotonic()-started,2),
                   'database_version':db.sql('SHOW server_version'),
                   'transport':'private Unix socket; no TCP listener',
                   'auth':'local test roles/auth.uid(); no hosted Auth/API assurance',
                   'hosted_access':False}
        if args.receipt:
            args.receipt.write_text(json.dumps(receipt,indent=2)+'\n')
        print(json.dumps(receipt,indent=2))
        return 0
    finally:
        db.stop()


if __name__ == '__main__':
    sys.exit(main())
