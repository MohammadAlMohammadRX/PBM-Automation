/* eslint-disable no-console */
/**
 * Asks for the new test-account password (typing is hidden) and writes it to
 * ADMIN_PASSWORD and NON_ADMIN_PASSWORD in .env. Nothing is printed except the
 * length, so the password never appears on screen or in a log.
 *
 *   node scripts/set-test-password.js
 */
const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, '..', '.env');
const KEYS = ['ADMIN_PASSWORD', 'NON_ADMIN_PASSWORD'];

process.stdout.write('New password for the test accounts (typing is hidden), then Enter: ');
const stdin = process.stdin;
stdin.setRawMode(true);
stdin.resume();
stdin.setEncoding('utf8');
let value = '';
stdin.on('data', (chunk) => {
  for (const ch of chunk) {
    if (ch === '\u0003') { console.log('\nCancelled - .env not changed.'); process.exit(1); }
    if (ch === '\r' || ch === '\n') {
      stdin.setRawMode(false);
      stdin.pause();
      console.log('');
      if (!value) { console.log('Empty - .env not changed.'); process.exit(1); }
      let text = fs.readFileSync(FILE, 'utf8');
      for (const key of KEYS) {
        const re = new RegExp(`^${key}=.*$`, 'm');
        if (!re.test(text)) { console.log(`${key} not found in .env - not changed.`); process.exit(1); }
        text = text.replace(re, () => `${key}=${value}`);
      }
      fs.writeFileSync(FILE, text, 'utf8');
      console.log(`Saved: ${KEYS.join(' and ')} updated in .env (${value.length} characters). You can close this tab.`);
      process.exit(0);
    }
    if (ch === '\u0008' || ch === '\u007f') { value = value.slice(0, -1); continue; }
    value += ch;
  }
});
