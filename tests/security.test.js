'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPrivilegedRequest, isAuthorizedOperator, validCaptureAmount } = require('../lib/security');
const request = (headers = {}, remoteAddress = '127.0.0.1') => ({ headers: { host: 'localhost:3000', ...headers }, socket: { remoteAddress } });

test('operator access rejects remote hosts, spoofed localhost and forwarded traffic', () => {
  assert.equal(isAuthorizedOperator(request(), {}), true);
  assert.equal(isAuthorizedOperator(request({ host: 'store.example' }), {}), false);
  assert.equal(isAuthorizedOperator(request({}, '203.0.113.5'), {}), false);
  assert.equal(isAuthorizedOperator(request({ 'x-forwarded-for': '127.0.0.1' }), {}), false);
  assert.equal(isAuthorizedOperator(request(), { RENDER: 'true' }), false);
  assert.equal(isAuthorizedOperator(request(), { NODE_ENV: 'production' }), false);
});

test('configured operator token is required even on localhost', () => {
  const env = { ADMIN_API_TOKEN: 'test-only-token', RENDER: 'true' };
  assert.equal(isAuthorizedOperator(request(), env), false);
  assert.equal(isAuthorizedOperator(request({ authorization: 'Bearer wrong' }), env), false);
  assert.equal(isAuthorizedOperator(request({ authorization: 'Bearer test-only-token' }), env), true);
});

test('operator route protection preserves storefront and workshop job access', () => {
  for (const [method, path] of [['GET', '/api/admin/products'], ['POST', '/API/ADMIN/product/status/'], ['POST', '/api/store/pricing/auto'], ['POST', '/api/agents/manager/clear']]) {
    assert.equal(isPrivilegedRequest({ method, path }), true);
  }
  for (const [method, path] of [['GET', '/api/store/products'], ['POST', '/api/order/create'], ['POST', '/api/order/capture'], ['POST', '/api/workshop/jobs']]) {
    assert.equal(isPrivilegedRequest({ method, path }), false);
  }
});

test('capture must match the exact order amount and currency', () => {
  assert.equal(validCaptureAmount({ amount: { value: '1.00', currency_code: 'USD' } }, 1, 'USD'), true);
  for (const amount of [undefined, {}, { value: 'NaN', currency_code: 'USD' }, { value: '0.99', currency_code: 'USD' }, { value: '1.00', currency_code: 'EUR' }, { value: '2.00', currency_code: 'USD' }]) {
    assert.equal(validCaptureAmount({ amount }, 1, 'USD'), false);
  }
});
