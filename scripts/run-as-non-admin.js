/**
 * Runs a command signed in as the NON-ADMIN account from .env instead of the
 * admin (2026-11-09): copies NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD onto
 * ADMIN_USERNAME / ADMIN_PASSWORD for this run only. Nothing is written or
 * printed. Used while the admin account `careconnect` is held at the
 * two-factor code page and maalmohammad@neorx.co (Organization Administrator,
 * exempt from two-factor) runs the suite.
 *
 *   node scripts/run-as-non-admin.js npx cross-env RUN_LABEL=... npm run test:lookup -- 03,04
 */
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const dotenv = require('dotenv');

const env = { ...process.env, ...dotenv.parse(fs.readFileSync(path.join(__dirname, '..', '.env'))) };
if (!env.NON_ADMIN_USERNAME || !env.NON_ADMIN_PASSWORD) {
  console.error('NON_ADMIN_USERNAME / NON_ADMIN_PASSWORD are not set in .env');
  process.exit(1);
}
env.ADMIN_USERNAME = env.NON_ADMIN_USERNAME;
env.ADMIN_PASSWORD = env.NON_ADMIN_PASSWORD;
const [cmd, ...args] = process.argv.slice(2);
const result = spawnSync(cmd, args, { env, stdio: 'inherit', shell: true });
process.exit(result.status ?? 1);
