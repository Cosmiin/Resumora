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
                    if not k.startswith(('PG', 'SUPABASE_')) and k != 'DATABASE_URL'}
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
                'resumora_test_owner', '-A', 'trust', '--locale=C.UTF-8', '--encoding=UTF8']
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

    def migrate(self, through='P4'):
        applied = 0
        for path in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
            phase = 'P3' if path.name == '20261028050000_p6_templates.sql' else path.name.split('_')[1].upper()
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


def check_populated_upgrade(db, behavior):
    """Upgrade synthetic data phase by phase, then compare actual schema to fresh."""
    import uuid
    name = 'upgrade_' + uuid.uuid4().hex
    db.sql('CREATE DATABASE ' + name)
    staged = object.__new__(Database)
    staged.__dict__.update(db.__dict__)
    staged.env = dict(db.env, PGDATABASE=name)
    old = behavior.DB
    try:
        staged.sql((ROOT / 'supabase/tests/bootstrap.sql').read_text())
        behavior.DB = staged
        applied = []
        staged.migrate('P0')
        f = behavior.Foundation()
        f.setUp()
        f.call('set_preferences', f"'{behavior.uid()}','en','{{}}'")
        for phase in ['P0', 'P1', 'P2', 'P3', 'P4']:
            staged.migrate(phase)
            expected = int(staged.sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='app'"))
            assert staged.sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r' AND NOT c.relrowsecurity") == '0'
            assert staged.migrate(phase) == 0
            if phase == 'P1':
                w = behavior.Workspace()
                w.__dict__.update(f.__dict__)
                w.cv = behavior.canonical_fixture('minimal.json', w.a)
                w.profile = w.publish(w.cv)
                base_id = w.profile['baseCvVersionId']
                base = staged.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{base_id}'")
            elif phase == 'P2':
                job = w.job()
                cv = w.job_cv(job)
                application = w.application(job, cv)
            elif phase == 'P3':
                result = json.loads(w.call('publish_analysis',
                    f"'{behavior.uid()}','{w.profile['profileVersionId']}','{cv['cvVersionId']}',"
                    f"'{job['jobVersionId']}','[]','[]','2026-10-23','ro'"))
                assert result['candidateFit'] == 0 and result['cvMatch'] == 0
                assert staged.sql(f"SELECT count(*) FROM app.applications WHERE id='{application['applicationId']}'") == '1'
            if phase != 'P0':
                assert staged.sql(f"SELECT canonical_json FROM app.cv_versions WHERE id='{base_id}'") == base
            assert staged.sql(f"SELECT ui_locale FROM app.user_profiles WHERE user_id='{f.a}'") == 'en'
            applied.append({'phase': phase, 'tables': expected, 'reapply_pending': 0})
        # A failed migration transaction must leave neither DDL nor history.
        staged.sql("BEGIN; CREATE TABLE app.failed_probe(id integer); INSERT INTO test_support.migrations VALUES ('failed','x'); SELECT 1/0; COMMIT;", expect_error=True)
        assert staged.sql("SELECT to_regclass('app.failed_probe') IS NULL") == 't'
        assert staged.sql("SELECT count(*) FROM test_support.migrations WHERE version='failed'") == '0'
        def schema(connection):
            result = subprocess.run([db.binary('pg_dump'), '--schema-only', '--schema=app', '--no-owner'],
                                    env=connection.env, capture_output=True, text=True, check=True, timeout=30)
            return '\n'.join(line for line in result.stdout.splitlines()
                             if not line.startswith(('\\restrict ', '\\unrestrict ')))
        assert schema(db) == schema(staged), 'Populated upgrade and fresh schema differ'
        assert staged.sql("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='app' AND NOT c.convalidated") == '0'
        return {'stages': applied, 'fresh_schema_equal': True, 'failed_ddl_rolled_back': True}
    finally:
        behavior.DB = old
        db.sql('DROP DATABASE ' + name)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin', default=os.environ.get('PG_BINDIR'))
    parser.add_argument('--pg-share', default=os.environ.get('PG_SHAREDIR'))
    parser.add_argument('--pg-lib', default=os.environ.get('PG_LIBDIR'))
    parser.add_argument('--receipt', type=Path)
    parser.add_argument('--suite', choices=['all', 'editor-drafts', 'connected', 'photos', 'imports', 'templates'], default='all', help='Focused editor SQL checks or mandatory full suite.')
    args = parser.parse_args()
    binary = Path(args.pg_bin) if args.pg_bin else Path(shutil.which('initdb') or '').parent
    if not (binary / 'initdb').is_file():
        parser.error('PostgreSQL server/client tools are required; supply --pg-bin (see docs/database/runbook.md).')
    db = Database(binary.resolve(), Path(args.pg_share) if args.pg_share else None,
                  Path(args.pg_lib) if args.pg_lib else None)
    started = time.monotonic()
    try:
        db.start()
        if args.suite == 'imports':
            # Exercise import restrictions against a permissive policy on the shared Storage fixture.
            db.sql("CREATE POLICY existing_permissive ON storage.objects FOR ALL TO authenticated,anon USING(true) WITH CHECK(true);")
        count = db.migrate()
        assert db.migrate() == 0, 'Normal reapply must have no pending migrations'
        table_count = int(db.sql("SELECT count(*) FROM information_schema.tables WHERE table_schema='app'"))
        assert db.sql("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='app' AND c.relkind='r' AND NOT c.relrowsecurity") == '0'
        assert db.sql("SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid=c.connamespace WHERE n.nspname='app' AND NOT c.convalidated") == '0'
        tests = ROOT / 'supabase/tests/behavior.py'
        cases = 2
        upgrade = None
        if tests.exists() and args.suite == 'all':
            import importlib.util
            spec = importlib.util.spec_from_file_location('resumora_db_behavior', tests)
            module = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(module)
            suite = module.suite(db)
            result = unittest.TextTestRunner(verbosity=2).run(suite)
            cases += result.testsRun
            if not result.wasSuccessful():
                return 1
            upgrade = check_populated_upgrade(db, module)
            cases += 2
        import importlib.util
        if args.suite not in ('imports', 'templates'):
            draft_spec = importlib.util.spec_from_file_location('editor_drafts', ROOT / 'supabase/tests/editor_drafts.py')
            drafts = importlib.util.module_from_spec(draft_spec)
            draft_spec.loader.exec_module(drafts)
            draft_result = unittest.TextTestRunner(verbosity=2).run(drafts.suite(db))
            cases += draft_result.testsRun
            if not draft_result.wasSuccessful():
                return 1
            connected_spec = importlib.util.spec_from_file_location('connected', ROOT / 'supabase/tests/connected.py')
            connected = importlib.util.module_from_spec(connected_spec)
            connected_spec.loader.exec_module(connected)
            connected_result = unittest.TextTestRunner(verbosity=2).run(connected.suite(db))
            cases += connected_result.testsRun
            if not connected_result.wasSuccessful():
                return 1
        if args.suite in ('all', 'photos'):
            photo_spec = importlib.util.spec_from_file_location('photos', ROOT / 'supabase/tests/photos.py')
            photos = importlib.util.module_from_spec(photo_spec)
            photo_spec.loader.exec_module(photos)
            photo_result = unittest.TextTestRunner(verbosity=2).run(photos.suite(db))
            cases += photo_result.testsRun
            if not photo_result.wasSuccessful():
                return 1
        if args.suite in ('all', 'templates'):
            template_spec = importlib.util.spec_from_file_location('templates', ROOT / 'supabase/tests/templates.py')
            templates = importlib.util.module_from_spec(template_spec)
            template_spec.loader.exec_module(templates)
            template_result = unittest.TextTestRunner(verbosity=2).run(templates.suite(db))
            cases += template_result.testsRun
            if not template_result.wasSuccessful():
                return 1
        if args.suite in ('imports','all'):
            import_spec = importlib.util.spec_from_file_location('cv_imports', ROOT / 'supabase/tests/imports.py')
            imports = importlib.util.module_from_spec(import_spec)
            import_spec.loader.exec_module(imports)
            import_result = unittest.TextTestRunner(verbosity=2).run(imports.suite(db))
            cases += import_result.testsRun
            if not import_result.wasSuccessful():
                return 1
        if args.suite == 'imports':
            # Existing attempt-store behavior is affected; unrelated job capture tests are unchanged.
            spec = importlib.util.spec_from_file_location('connected', ROOT / 'supabase/tests/connected.py')
            connected = importlib.util.module_from_spec(spec)
            spec.loader.exec_module(connected)
            checks = [c for c in connected.suite(db) if c._testMethodName == 'test_operation_replay_secret_and_unknown_attempt']
            prior = unittest.TextTestRunner(verbosity=2).run(unittest.TestSuite(checks))
            cases += prior.testsRun
            if not prior.wasSuccessful():
                return 1
        receipt = {'migrations_applied':count,'normal_reapply_pending':0,
                   'tables':table_count,'cases':cases,'elapsed_seconds':round(time.monotonic()-started,2),
                   'database_version':db.sql('SHOW server_version'),
                   'transport':'private Unix socket; no TCP listener',
                   'auth':'local test roles/auth.uid(); no hosted Auth/API assurance',
                   'hosted_access':False, 'populated_upgrade':upgrade}
        if args.receipt:
            args.receipt.write_text(json.dumps(receipt,indent=2)+'\n')
        print(json.dumps(receipt,indent=2))
        return 0
    finally:
        db.stop()


if __name__ == '__main__':
    sys.exit(main())
