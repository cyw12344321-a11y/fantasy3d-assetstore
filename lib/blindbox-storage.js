'use strict';
const { AsyncLocalStorage } = require('node:async_hooks');
const { randomBytes } = require('node:crypto');

const defaults = { accounts: { version: 1, users: [], sessions: [] }, receipts: {} };
const schema = `CREATE TABLE IF NOT EXISTS fantasy3d_gift_state (
  name text PRIMARY KEY, value jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now())`;

class PostgresStorage {
  constructor(pool) {
    this.pool = pool;
    this.context = new AsyncLocalStorage();
    this.initializing = null;
    this.key = null;
  }
  async ready() {
    if (!this.initializing) {
      this.initializing = this.initialize().catch(error => {
        this.initializing = null;
        throw error;
      });
    }
    await this.initializing;
    await this.pool.query('SELECT 1');
  }
  async initialize() {
    await this.pool.query(schema);
    const initial = { ...defaults, signingKey: randomBytes(32).toString('hex') };
    for (const [name, value] of Object.entries(initial)) {
      await this.pool.query('INSERT INTO fantasy3d_gift_state(name,value) VALUES($1,$2::jsonb) ON CONFLICT(name) DO NOTHING', [name, JSON.stringify(value)]);
    }
    const result = await this.pool.query('SELECT value FROM fantasy3d_gift_state WHERE name=$1', ['signingKey']);
    const key = result.rows[0]?.value;
    if (typeof key !== 'string' || !/^[a-f0-9]{64}$/.test(key)) throw Error('Invalid persistent signing key');
    this.key = Buffer.from(key, 'hex');
  }
  get(name) {
    const state = this.context.getStore();
    if (!state || !state.values.has(name)) throw Error('Storage access outside transaction');
    return state.values.get(name);
  }
  set(name, value) {
    this.get(name);
    this.context.getStore().values.set(name, value);
    this.context.getStore().dirty.add(name);
  }
  async transaction(names, fn) {
    await this.ready();
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query("SET LOCAL statement_timeout = '10s'");
      const state = { values: new Map(), dirty: new Set() };
      // A fixed lock order prevents deadlocks; row locks prevent lost updates across instances.
      for (const name of [...new Set(names)].sort()) {
        const result = await client.query('SELECT value FROM fantasy3d_gift_state WHERE name=$1 FOR UPDATE', [name]);
        if (!result.rows.length) throw Error('Missing storage row');
        state.values.set(name, result.rows[0].value);
      }
      const result = await this.context.run(state, fn);
      for (const name of state.dirty) {
        await client.query('UPDATE fantasy3d_gift_state SET value=$2::jsonb, updated_at=now() WHERE name=$1', [name, JSON.stringify(state.values.get(name))]);
      }
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
  close() { return this.pool.end(); }
  async importSnapshot(snapshot) {
    if (this.initializing) throw Error('Import before starting the application');
    if (snapshot.accounts?.version !== 1 || !Array.isArray(snapshot.accounts.users) ||
        !Array.isArray(snapshot.accounts.sessions) || !snapshot.receipts ||
        Array.isArray(snapshot.receipts) || typeof snapshot.receipts !== 'object' ||
        typeof snapshot.signingKey !== 'string' || !/^[a-f0-9]{64}$/.test(snapshot.signingKey)) {
      throw Error('Invalid snapshot; no data imported');
    }
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      await client.query("SET LOCAL lock_timeout = '5s'");
      await client.query(schema);
      await client.query('LOCK TABLE fantasy3d_gift_state IN ACCESS EXCLUSIVE MODE');
      const result = await client.query('SELECT count(*) AS count FROM fantasy3d_gift_state');
      if (Number(result.rows[0].count)) throw Error('Destination is not empty; refusing overwrite');
      for (const name of ['accounts', 'receipts', 'signingKey']) {
        await client.query('INSERT INTO fantasy3d_gift_state(name,value) VALUES($1,$2::jsonb)', [name, JSON.stringify(snapshot[name])]);
      }
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally { client.release(); }
  }
}

function createPostgresStorage(connectionString) {
  let url;
  try { url = new URL(connectionString); } catch { throw Error('Invalid database connection URL'); }
  if (!['postgres:', 'postgresql:'].includes(url.protocol)) throw Error('PostgreSQL URL required');
  // pg URL SSL options can override the TLS object; enforce certificate verification here.
  for (const name of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(name);
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: url.href, ssl: { rejectUnauthorized: true },
    max: 3, connectionTimeoutMillis: 15000, idleTimeoutMillis: 10000,
    query_timeout: 15000, allowExitOnIdle: true });
  pool.on('error', () => console.error('Gift database connection interrupted.'));
  return new PostgresStorage(pool);
}

function transactionalRoutes(app, store, names) {
  if (!store) return app;
  const routes = {};
  for (const method of ['get', 'post']) routes[method] = (path, ...handlers) => {
    const handler = handlers.pop();
    app[method](path, ...handlers, async (req, res) => {
      const json = res.json;
      let body, sent = false;
      // These controllers only return JSON. Hold it until COMMIT, including cookies.
      res.json = value => { body = value; sent = true; return res; };
      try {
        await store.transaction(names, () => handler(req, res));
        if (!sent) throw Error('Missing JSON response');
        res.json = json;
        res.json(body);
      } catch {
        res.json = json;
        res.removeHeader('Set-Cookie');
        res.status(503).set('Cache-Control', 'no-store').json({ error: '存储暂时不可用，请稍后重试。' });
      }
    });
    return routes;
  };
  return routes;
}

module.exports = { PostgresStorage, createPostgresStorage, transactionalRoutes };
