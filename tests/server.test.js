'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const { startServer } = require('../server');

const testRoot = path.join(__dirname, '..', '.test-data');
fs.mkdirSync(testRoot, { recursive: true });
function newDataDir() { return fs.mkdtempSync(path.join(testRoot, 'store-')); }
// Avoid reusing a client socket across an intentional server shutdown/restart.
const nativeFetch = globalThis.fetch;
function fetch(url, options = {}) { return nativeFetch(url, { ...options, headers: { Connection: 'close', ...options.headers } }); }
async function json(service, route, body) {
  const response = await fetch(service.url + route, body === undefined ? {} : {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
  });
  return { status: response.status, data: await response.json() };
}

test('unverified example assets remain hidden and cannot be sold', async t => {
  const dataDir = newDataDir();
  let service = await startServer({ dataDir });
  t.after(async () => { if (service) await service.close(); });
  assert.equal(service.server.address().address, '127.0.0.1');
  const info = await json(service, '/api/app-info');
  assert.equal(typeof info.data.paymentConnected, 'boolean');
  assert.equal(info.data.mode, 'live_storefront');
  const products = (await json(service, '/api/store/products')).data.products;
  assert.ok(products.every(product => product.status === 'published' && product.source !== 'example'));
  assert.equal((await json(service, '/api/store/product/char-001')).status, 404);
  assert.equal((await json(service, '/api/order/create', { productId: 'char-001', email: 'qa@example.com' })).status, 400);
  assert.equal((await json(service, '/api/order/create', { productId: 'prop-001', email: 'invalid' })).status, 400);
  assert.equal((await json(service, '/api/admin/product/status', { productId: 'char-001', status: 'paid' })).status, 400);
  const publish = await json(service, '/api/admin/product/status', { productId: 'char-001', status: 'published' });
  assert.ok([400, 404].includes(publish.status));
  const tasks = await json(service, '/api/store/tasks');
  assert.equal(tasks.status, 200);
  assert.deepEqual(tasks.data.tasks, []);
});

test('cross-origin, rebinding and malformed requests cannot modify the local store', async t => {
  const service = await startServer({ dataDir: newDataDir() });
  t.after(() => service.close());
  const rebindingStatus = await new Promise((resolve, reject) => {
    http.get(service.url + '/api/admin/products', { headers: { Host: 'external.example:4000' } }, response => { response.resume(); resolve(response.statusCode); }).on('error', reject);
  });
  assert.equal(rebindingStatus, 403);
  let r = await fetch(service.url + '/api/admin/product/status', {
    method: 'POST', headers: { Origin: 'https://external.example', 'Content-Type': 'application/json' },
    body: JSON.stringify({ productId: 'prop-001', status: 'draft' })
  });
  assert.equal(r.status, 403);
  assert.equal((await json(service, '/api/store/product/prop-001')).status, 404);
  r = await fetch(service.url + '/api/order/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
  assert.equal(r.status, 400);
  assert.equal((await json(service, '/api/orders/list')).status, 400);
  assert.equal((await json(service, '/api/orders/list?email=qa%40example.com')).status, 400);
  assert.deepEqual((await json(service, '/api/orders/list?email=qa%40example.com&orderId=unknown')).data.orders, []);
  assert.equal((await fetch(service.url + '/server.js')).status, 404);
  assert.equal((await fetch(service.url + '/store.json')).status, 404);
});

test('public workshop runtime assets remain readable without opening protected routes', async t => {
  const service = await startServer({ dataDir: newDataDir() });
  t.after(() => service.close());
  const externalHost = { Host: 'fantasy3d-assetstores.onrender.com' };
  const assetStatus = await new Promise((resolve, reject) => {
    http.get(service.url + '/workshop-runtime/runtime-manifest.json', { headers: externalHost }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  const protectedStatus = await new Promise((resolve, reject) => {
    http.get(service.url + '/api/admin/products', { headers: externalHost }, response => {
      response.resume();
      resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(assetStatus, 200);
  assert.equal(protectedStatus, 403);
  for (const route of ['/index.html', '/office.html', '/api/store/products']) {
    const response = await fetch(service.url + route, { headers: externalHost });
    assert.equal(response.status, 200, route);
    const content = await response.text();
    if (route === '/office.html') assert.match(content, /\/workshop-runtime\/workshop\.js/);
  }
  for (const route of ['/api/admin/product/status', '/api/store/pricing/auto']) {
    const status = await new Promise((resolve, reject) => {
      const request = http.request(service.url + route, { method: 'POST', headers: externalHost }, response => {
        response.resume();
        resolve(response.statusCode);
      });
      request.on('error', reject);
      request.end();
    });
    assert.equal(status, 403, route);
  }
});

test('corrupt local data causes an explicit startup error and is preserved', async () => {
  const dataDir = newDataDir();
  const dataFile = path.join(dataDir, 'store.json');
  fs.writeFileSync(dataFile, '{broken');
  await assert.rejects(startServer({ dataDir }));
  assert.equal(fs.readFileSync(dataFile, 'utf8'), '{broken');
});
