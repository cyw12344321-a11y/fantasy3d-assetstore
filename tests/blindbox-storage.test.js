'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { PGlite } = require('@electric-sql/pglite');
const { PostgresStorage, createPostgresStorage } = require('../lib/blindbox-storage');
const { installBlindbox } = require('../lib/blindbox');

// PGlite executes real PostgreSQL SQL, but has one connection. This is not a
// remote pg/TLS or multi-connection lock test; those remain deployment gates.
class TestPool {
  constructor(dir) { this.db = new PGlite(dir); this.tail = Promise.resolve(); }
  async connect() {
    const previous = this.tail;
    let release;
    this.tail = new Promise(resolve => { release = resolve; });
    await previous;
    return { query: (sql, params) => {
      if (this.failCommit && sql === 'COMMIT') { this.failCommit = false; throw Error('test commit failure'); }
      return this.db.query(sql, params);
    }, release };
  }
  async query(sql, params) {
    if (this.offline) throw Error('test secret must not leak');
    const client = await this.connect();
    try { return await client.query(sql, params); } finally { client.release(); }
  }
  end() { return this.db.close(); }
}

async function serve(store, dir) {
  const app = express(); app.use(express.json());
  installBlindbox(app, dir, { store });
  const server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  return { base: 'http://127.0.0.1:' + server.address().port,
    close: () => new Promise(resolve => server.close(resolve)) };
}
async function request(base, route, body, headers = {}) {
  const response = await fetch(base + '/api/blindbox/' + route, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : JSON.stringify(body)
  });
  return { status: response.status, body: await response.json(), cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

test('PostgreSQL preserves accounts, keys, collection and revocation across restart, and rolls back failed commits', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'gift-pg-'));
  let pool = new TestPool(path.join(dir, 'db'));
  let store = new PostgresStorage(pool), server;
  const password = 'test-password-long-enough';
  try {
    server = await serve(store, dir);
    let base = server.base;
    const reg = await request(base, 'account/register', { username: 'pg_user', password });
    assert.equal(reg.status, 201); assert.ok(reg.cookie);
    const headers = { Cookie: reg.cookie };
    const draws = await Promise.all(Array.from({ length: 4 }, () => request(base, 'draw', { name: 'Friend', pool: 'bless', locale: 'zh-Hant' }, headers)));
    assert.ok(draws.every(r => r.status === 200));
    const account = await request(base, 'account', undefined, headers);
    assert.equal(Object.values(account.body.user.collection).reduce((a, b) => a + b, 0), 4);
    const gift = draws[0].body, live = draws[1].body;
    const owner = { Authorization: 'Bearer ' + gift.ownerToken };
    assert.equal((await request(base, 'gifts/' + gift.token + '/react', { reaction: 'thanks' })).status, 200);
    assert.equal((await request(base, 'gifts/' + gift.token, undefined, owner)).body.thanks, 1);
    assert.equal((await request(base, 'gifts/' + gift.token + '/revoke', {}, owner)).status, 200);
    pool.failCommit = true;
    const failed = await request(base, 'account/register', { username: 'rollback_user', password });
    assert.equal(failed.status, 503); assert.equal(failed.cookie, undefined);
    const rolledBack = await store.transaction(['accounts'], () => store.get('accounts').users.some(u => u.username === 'rollback_user'));
    assert.equal(rolledBack, false);
    const oldKey = store.key.toString('hex');
    await server.close(); server = null; await store.close();
    pool = new TestPool(path.join(dir, 'db')); store = new PostgresStorage(pool);
    server = await serve(store, dir); base = server.base;
    assert.equal((await request(base, 'account', undefined, headers)).body.user.username, 'pg_user');
    assert.equal(store.key.toString('hex'), oldKey);
    assert.equal((await request(base, 'reveal/' + gift.token)).status, 410);
    assert.equal((await request(base, 'reveal/' + live.token)).status, 200);
    assert.equal((await request(base, 'gifts/' + gift.token, undefined, owner)).body.revoked, true);
    assert.equal((await request(base, 'gifts/' + gift.token + '/react', { reaction: 'smile' })).status, 410);
    assert.equal(fs.existsSync(path.join(dir, 'blindbox-signing-key')), false);
    assert.equal(fs.existsSync(path.join(dir, 'blindbox-accounts.json')), false);
    pool.offline = true;
    const unavailable = await request(base, 'draw', { name: 'Friend', pool: 'bless' });
    assert.equal(unavailable.status, 503); assert.doesNotMatch(JSON.stringify(unavailable.body), /secret/);
    assert.equal((await request(base, 'config')).body.sharingEnabled, false);
    pool.offline = false;
    assert.equal((await request(base, 'account/delete', { password }, headers)).status, 200);
    assert.equal((await request(base, 'account', undefined, headers)).body.user, null);
  } finally {
    if (server) await server.close();
    await store.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('production database readiness enables sharing without the persistent-disk flag', async () => {
  const prior = { ...process.env };
  const pool = new TestPool(), store = new PostgresStorage(pool);
  let server;
  try {
    process.env.NODE_ENV = 'production';
    process.env.BLINDBOX_PUBLIC_ORIGIN = 'https://fantasy3d-assetstores.onrender.com';
    delete process.env.BLINDBOX_PERSISTENT_STORAGE;
    server = await serve(store, os.tmpdir());
    assert.equal((await request(server.base, 'config')).body.sharingEnabled, true);
    assert.equal((await request(server.base, 'draw', { name: 'Test', pool: 'bless' })).status, 200);
    pool.offline = true;
    assert.equal((await request(server.base, 'config')).body.sharingEnabled, false);
    assert.equal((await request(server.base, 'account')).status, 503);
  } finally {
    for (const key of ['NODE_ENV', 'BLINDBOX_PUBLIC_ORIGIN', 'BLINDBOX_PERSISTENT_STORAGE']) {
      if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key];
    }
    if (server) await server.close();
    await store.close();
  }
});

test('legacy import preserves the original key and refuses to overwrite an initialized database', async () => {
  const store = new PostgresStorage(new TestPool());
  const snapshot = { accounts: { version: 1, users: [], sessions: [] },
    receipts: { original: { revoked: true, createdAt: Date.now(), votes: {} } },
    signingKey: 'ab'.repeat(32) };
  try {
    await store.importSnapshot(snapshot);
    await assert.rejects(store.importSnapshot(snapshot), /not empty/);
    await store.ready();
    assert.equal(store.key.toString('hex'), snapshot.signingKey);
    assert.equal(await store.transaction(['receipts'], () => store.get('receipts').original.revoked), true);
  } finally { await store.close(); }
});

test('database transport verifies TLS and does not expose malformed credentials', async () => {
  assert.throws(() => createPostgresStorage('private-credential'), error => !error.message.includes('private-credential'));
  const store = createPostgresStorage('postgres://user:password@localhost/db?sslmode=no-verify');
  try {
    assert.deepEqual(store.pool.options.ssl, { rejectUnauthorized: true });
    assert.equal(new URL(store.pool.options.connectionString).searchParams.has('sslmode'), false);
    assert.equal(store.pool.options.max, 3);
  } finally { await store.close(); }
});
