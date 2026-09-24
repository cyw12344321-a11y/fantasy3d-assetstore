'use strict';
const { timingSafeEqual } = require('node:crypto');

function isPrivilegedRequest(req) {
  const route = req.path.toLowerCase().replace(/\/+$/, '');
  if (route === '/api/admin' || route.startsWith('/api/admin/')) return true;
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return false;
  return route.startsWith('/api/store/') || route === '/api/ai/config' || /^\/api\/agents\/[^/]+\/clear$/.test(route);
}

function isAuthorizedOperator(req, env = process.env) {
  const token = env.ADMIN_API_TOKEN || '';
  const supplied = req.headers.authorization || '';
  if (token) {
    const expected = Buffer.from('Bearer ' + token);
    const actual = Buffer.from(supplied);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  }
  // Desktop access requires a loopback connection and host, never a proxy header.
  const loopback = ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress);
  const localHost = /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(req.headers.host || '');
  const proxied = Object.keys(req.headers).some(key => key === 'forwarded' || key.startsWith('x-forwarded-'));
  return !env.RENDER && env.NODE_ENV !== 'production' && loopback && localHost && !proxied;
}

function validCaptureAmount(capture, price, currency) {
  const amount = capture && capture.amount;
  if (!amount || typeof amount.value !== 'string' || !/^\d+\.\d{2}$/.test(amount.value)) return false;
  const paid = Number(amount.value);
  const expected = Number(price);
  return amount.currency_code === currency && Number.isFinite(paid) && Number.isFinite(expected) &&
    expected > 0 && Math.round(paid * 100) === Math.round(expected * 100);
}

module.exports = { isPrivilegedRequest, isAuthorizedOperator, validCaptureAmount };
