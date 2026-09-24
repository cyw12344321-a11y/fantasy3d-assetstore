'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { installBlindbox, characters } = require('../lib/blindbox');

test('blindbox catalog, validated draws, tamper-proof shares and rate limits', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blindbox-'));
  const app = express();app.use(express.json());installBlindbox(app, dir);
  const server = app.listen(0, '127.0.0.1');await new Promise(r => server.once('listening', r));
  const base = 'http://127.0.0.1:' + server.address().port;
  const draw = body => fetch(base + '/api/blindbox/draw', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    assert.equal(characters.length, 12);
    const catalog = await (await fetch(base + '/api/blindbox/catalog')).json();
    assert.equal(catalog.paymentEnabled, false);
    assert.equal(catalog.assetType, 'illustrated-2.5d');
    for (const body of [{}, { name: '<script>', pool: 'prank' }, { name: 'a', pool: 'paid' }, { name: 'a'.repeat(25), pool: 'prank' }]) assert.equal((await draw(body)).status, 400);
    for (const pool of ['prank', 'bless']) {
      const r = await (await draw({ name: '小明', pool })).json();assert.equal(r.character.pool, pool);
      const shared = await (await fetch(base + '/api/blindbox/reveal/' + r.token)).json();const { user, ownerToken, ...publicResult } = r;assert.deepEqual(shared, publicResult);
      assert.equal((await fetch(base + '/api/blindbox/reveal/' + r.token + 'a')).status, 404);
      assert.equal((await fetch(base + '/r/' + r.token)).status, 200);
    }
    for(let i=0;i<18;i++)assert.equal((await draw({name:'Test',pool:'prank'})).status,200);
    assert.equal((await draw({name:'Test',pool:'prank'})).status,429);
    const key=fs.readFileSync(path.join(dir,'blindbox-signing-key'));
    installBlindbox(express(),dir);assert.deepEqual(fs.readFileSync(path.join(dir,'blindbox-signing-key')),key);
  } finally { await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true}); }
});
