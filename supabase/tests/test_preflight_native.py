"""Focused native inventory regression; opt in with PG_BINDIR (no hosted access)."""
import importlib.util
import os
from pathlib import Path
import socket
import subprocess
import tempfile
import unittest

SCRIPT = Path(__file__).resolve().parents[2] / 'scripts/db/preflight.py'
spec = importlib.util.spec_from_file_location('preflight_native', SCRIPT)
preflight = importlib.util.module_from_spec(spec)
spec.loader.exec_module(preflight)


@unittest.skipUnless(os.environ.get('PG_BINDIR'), 'Set PG_BINDIR for native PostgreSQL inventory testing')
class NativeInventory(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='resumora-preflight-native-')
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.binary = Path(os.environ['PG_BINDIR'])
        self.env = {k: v for k, v in os.environ.items()
                    if not k.startswith(('PG', 'SUPABASE_')) and k != 'DATABASE_URL'}
        if os.environ.get('PG_LIBDIR'):
            self.env['LD_LIBRARY_PATH'] = os.environ['PG_LIBDIR']
        self.run_command(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                          '-days', '1', '-keyout', str(self.root / 'server.key'),
                          '-out', str(self.root / 'server.crt'), '-subj', '/CN=localhost',
                          '-addext', 'subjectAltName=IP:127.0.0.1'])
        (self.root / 'server.key').chmod(0o600)
        args = [str(self.binary / 'initdb'), '-D', str(self.root / 'data'),
                '-U', 'synthetic_owner', '-A', 'trust', '--locale=C', '--encoding=UTF8']
        if os.environ.get('PG_SHAREDIR'):
            args += ['-L', os.environ['PG_SHAREDIR']]
        self.run_command(args)
        with socket.socket() as sock:
            sock.bind(('127.0.0.1', 0))
            port = sock.getsockname()[1]
        with (self.root / 'data/postgresql.conf').open('a') as config:
            config.write(f"\nlisten_addresses='127.0.0.1'\nport={port}\n"
                         f"unix_socket_directories=''\nssl=on\n"
                         f"ssl_cert_file='{self.root}/server.crt'\n"
                         f"ssl_key_file='{self.root}/server.key'\n")
        self.run_command([str(self.binary / 'pg_ctl'), '-D', str(self.root / 'data'),
                          '-l', str(self.root / 'postgres.log'), '-w', 'start'])
        self.addCleanup(self.run_command, [str(self.binary / 'pg_ctl'), '-D',
                        str(self.root / 'data'), '-m', 'immediate', '-w', 'stop'])
        self.env.update(PGHOST='127.0.0.1', PGPORT=str(port), PGUSER='synthetic_owner',
                        PGDATABASE='postgres', PGSSLMODE='verify-full',
                        PGSSLROOTCERT=str(self.root / 'server.crt'), PGSSLCERT='', PGSSLKEY='',
                        PGPASSFILE=str(self.root / 'absent-passfile'), PGCONNECT_TIMEOUT='5',
                        PGOPTIONS='-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=3000')

    def run_command(self, args, **kwargs):
        return subprocess.run(args, env=self.env, check=True, capture_output=True,
                              text=True, timeout=40, **kwargs)

    def test_inventory_reads_database_locales_with_verified_tls(self):
        self.run_command(['openssl', 'req', '-x509', '-newkey', 'rsa:2048', '-nodes',
                          '-days', '1', '-keyout', str(self.root / 'untrusted.key'),
                          '-out', str(self.root / 'untrusted.crt'), '-subj', '/CN=untrusted'])
        for settings in [{'PGSSLROOTCERT': str(self.root / 'untrusted.crt')},
                         {'PGHOST': 'wrong.example.invalid', 'PGHOSTADDR': '127.0.0.1'}]:
            with self.subTest(settings=settings):
                with self.assertRaisesRegex(RuntimeError, 'connection details suppressed'):
                    preflight.inventory(self.binary / 'psql', self.env | settings)
        result = preflight.inventory(self.binary / 'psql', self.env)
        server = result['server']
        # initdb's explicit C locale is an independent expectation, not mocked SQL output.
        self.assertEqual(server['database'], 'postgres')
        self.assertEqual(server['collation'], 'C')
        self.assertEqual(server['ctype'], 'C')
        self.assertEqual(server['readOnly'], 'on')
        self.assertIs(server['backendTLS'], True)
        self.assertEqual(result['clientTLS'], {'mode': 'verify-full', 'certificateAndHostnameVerified': True})
        self.assertFalse(result['can_apply'])
        self.assertEqual(result['tables'], [])
        self.assertEqual(result['migration_history'], [])


if __name__ == '__main__':
    unittest.main()
