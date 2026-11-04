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

    def migrate(self, through=None, before_version=None):
        applied = 0
        for path in sorted((ROOT / 'supabase/migrations').glob('*.sql')):
            if before_version and path.name.split('_')[0] >= before_version:
                continue
            # These forward artifacts retain their owning lane name but depend
            # on later shared schema. Do not preload removal before P7/P8.
            phase = {'20261028050000_p6_templates.sql': 'P3',
                     '20261030030000_p1_remove_base.sql': 'P8',
                     '20261031184256_cv_import_background_processing.sql': 'P8',
                     '20261031194408_pending_cv_import_review.sql': 'P8',
                     '20261101004420_experience_enrichment_metadata.sql': 'P8',
                     '20261103004831_skills_inventory_metadata.sql': 'P8',
                     '20261101110459_reliable_experience_receipts.sql': 'P8'}.get(path.name, path.name.split('_')[1].upper())
            if through is not None and phase > through:
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


def load_suite(name):
    import importlib.util
    spec=importlib.util.spec_from_file_location(name,ROOT/f'supabase/tests/{name}.py')
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    return module

def main():
    modules={'base-only':'base_only','foundation':'behavior','editor-drafts':'editor_drafts',
             'connected':'connected','photos':'photos','photo-metadata':'photo_metadata',
             'imports':'imports','templates':'templates','languages':'document_languages',
             'base-removal':'base_removal','workspaces':'workspaces',
             'pending-import':'pending_import','import-background':'import_background',
             'import-upgrade':'import_upgrade'}
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--pg-bin',default=os.environ.get('PG_BINDIR'))
    parser.add_argument('--pg-share',default=os.environ.get('PG_SHAREDIR'))
    parser.add_argument('--pg-lib',default=os.environ.get('PG_LIBDIR'))
    parser.add_argument('--receipt',type=Path)
    parser.add_argument('--suite',choices=['all',*modules],default='all')
    args=parser.parse_args()
    binary=Path(args.pg_bin) if args.pg_bin else Path(shutil.which('initdb') or '').parent
    if not (binary/'initdb').is_file():parser.error('Supply --pg-bin; see docs/database/runbook.md.')
    receipts=[];success=True
    # Each suite owns its test identities, worker authorization and migration fixtures.
    # No shared singleton secret or tenant from a prior suite can affect another.
    for label,name in modules.items():
        if args.suite not in ('all',label):continue
        db=Database(binary.resolve(),Path(args.pg_share) if args.pg_share else None,Path(args.pg_lib) if args.pg_lib else None)
        started=time.monotonic()
        try:
            db.start();module=load_suite(name)
            if name=='import_upgrade':
                db.migrate(before_version='20261102234859');module.prepare_upgrade(db)
            if name=='base_only' and hasattr(module,'prepare_upgrade'):
                version=next((ROOT/'supabase/migrations').glob('*_remove_job_product.sql')).name.split('_')[0]
                db.migrate(before_version=version);module.prepare_upgrade(db)
            count=db.migrate()
            assert db.migrate()==0
            result=unittest.TextTestRunner(verbosity=2).run(module.suite(db))
            success=success and result.wasSuccessful()
            receipts.append({'suite':label,'migrations':db.sql('SELECT version FROM test_support.migrations ORDER BY version').splitlines(),
                'cases':result.testsRun,'success':result.wasSuccessful(),'seconds':round(time.monotonic()-started,2)})
        finally:db.stop()
    receipt={'success':success,'hosted_access':False,'suites':receipts}
    if args.receipt:args.receipt.write_text(json.dumps(receipt,indent=2)+'\n')
    print(json.dumps(receipt,indent=2))
    return 0 if success else 1

if __name__=='__main__':raise SystemExit(main())
