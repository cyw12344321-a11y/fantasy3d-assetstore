'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createPostgresStorage } = require('../lib/blindbox-storage');

async function main() {
  const source = process.argv[2];
  if (!source || !process.env.BLINDBOX_DATABASE_URL) {
    throw Error('Provide the source directory and BLINDBOX_DATABASE_URL environment variable');
  }
  const read = (name, fallback) => {
    const file = path.join(source, name);
    return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
  };
  const snapshot = {
    accounts: read('blindbox-accounts.json', { version: 1, users: [], sessions: [] }),
    receipts: read('blindbox-gift-receipts.json', {}),
    signingKey: fs.readFileSync(path.join(source, 'blindbox-signing-key')).toString('hex')
  };
  const store = createPostgresStorage(process.env.BLINDBOX_DATABASE_URL);
  try {
    await store.importSnapshot(snapshot);
    console.log('Imported accounts, receipts and original signing key. Source files unchanged.');
  } finally { await store.close(); }
}
main().catch(() => {
  console.error('Import failed. Check the source files, connection, and that the destination is empty. No credentials are logged.');
  process.exitCode = 1;
});
