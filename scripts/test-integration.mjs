import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
if (existsSync('.env')) process.loadEnvFile('.env');
const url = new URL(process.env.DATABASE_URL);
const e2e = process.argv.includes('--e2e');
url.searchParams.set('schema', e2e ? 'pricewatch_e2e' : 'pricewatch_test');
const env = {
  ...process.env,
  DATABASE_URL: url.toString(),
  ...(e2e
    ? {
        APP_ORIGIN: 'http://localhost:3100',
        ADMIN_PASSWORD: 'pricewatch-e2e-only-password',
        SESSION_SECRET: 'pricewatch-e2e-only-session-secret-32-chars',
      }
    : {}),
};
const require = createRequire(import.meta.url);
const prisma = join(
  dirname(require.resolve('prisma/package.json')),
  'build',
  'index.js',
);
const commands = [
  e2e
    ? [prisma, 'migrate', 'reset', '--force', '--skip-seed', '--skip-generate']
    : [prisma, 'migrate', 'deploy'],
  ...(e2e
    ? [
        [
          join(dirname(require.resolve('tsx/package.json')), 'dist', 'cli.mjs'),
          'prisma/seed.ts',
        ],
        [
          join(
            dirname(require.resolve('@playwright/test/package.json')),
            'cli.js',
          ),
          'test',
        ],
      ]
    : [
        [
          join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs'),
          'run',
          '--config',
          'vitest.integration.config.ts',
        ],
      ]),
];
for (const command of commands) {
  const result = spawnSync(process.execPath, command, {
    env,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
