'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomBytes, randomUUID, scryptSync, createHash, timingSafeEqual } = require('node:crypto');

const digest = value => createHash('sha256').update(value).digest('hex');
const passwordHash = (password, salt) => scryptSync(password, salt, 64).toString('hex');
const safeEqual = (a, b) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

function installAccounts(app, dataDir, store) {
  app = require('./blindbox-storage').transactionalRoutes(app, store, ['accounts']);
  // Ephemeral hosting must not silently accept accounts that disappear on deploy.
  if (!store && (process.env.RENDER || process.env.NODE_ENV === 'production') && process.env.BLINDBOX_PERSISTENT_STORAGE !== 'true') {
    app.get('/api/blindbox/account', (req, res) => res.set('Cache-Control', 'no-store').json({ user: null, available: false }));
    app.post('/api/blindbox/account/:action', (req, res) => res.status(503).json({ error: '账号服务尚未配置持久化存储，暂不开放注册。游客开盒仍可使用。' }));
    return { addDraw: () => null };
  }
  const file = path.join(dataDir, 'blindbox-accounts.json');
  let data = { version: 1, users: [], sessions: [] };
  if (!store && fs.existsSync(file)) {
    data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.version !== 1 || !Array.isArray(data.users) || !Array.isArray(data.sessions)) throw Error('Invalid blindbox account store; original file preserved.');
  }
  const read = () => store ? store.get('accounts') : data;
  function save(next) {
    if (store) return store.set('accounts', next);
    const temp = file + '.tmp';
    fs.writeFileSync(temp, JSON.stringify(next), { mode: 0o600 });
    fs.renameSync(temp, file);
    data = next;
  }
  function session(req) {
    const token = (req.headers.cookie || '').split(';').map(v => v.trim()).find(v => v.startsWith('f3d_session='))?.slice(12);
    if (!token || !/^[a-f0-9]{64}$/.test(token)) return null;
    const record = read().sessions.find(s => s.hash === digest(token) && s.expires > Date.now());
    return record ? read().users.find(u => u.id === record.userId) || null : null;
  }
  const publicUser = u => u ? { id: u.id, username: u.username, collection: u.collection } : null;
  function setCookie(req, res, token, age = 604800) {
    res.cookie('f3d_session', token, { httpOnly: true, sameSite: 'strict', secure: Boolean(req.secure || process.env.RENDER || process.env.NODE_ENV === 'production'), path: '/', maxAge: age * 1000 });
  }
  function newSession(next, userId) {
    const token = randomBytes(32).toString('hex');
    next.sessions = next.sessions.filter(s => s.expires > Date.now());
    const own = next.sessions.filter(s => s.userId === userId);
    if (own.length >= 5) next.sessions = next.sessions.filter(s => s !== own[0]);
    next.sessions.push({ hash: digest(token), userId, expires: Date.now() + 604800000 });
    return token;
  }
  const limits = new Map();
  function mutation(req, res, next) {
    const origin = req.get('origin');
    if (origin) {
      try { if (new URL(origin).host !== req.get('host')) return res.status(403).json({ error: '请从本站提交操作。' }); }
      catch { return res.status(403).json({ error: 'Invalid origin.' }); }
    }
    if (!req.is('application/json')) return res.status(415).json({ error: 'JSON required.' });
    const now = Date.now();
    for (const [key, entry] of limits) if (entry.until < now) limits.delete(key);
    const entry = limits.get(req.ip) || { count: 0, until: now + 60000 };
    if (entry.count >= 12 || (!limits.has(req.ip) && limits.size >= 5000)) return res.status(429).json({ error: '尝试次数过多，请一分钟后再试。' });
    entry.count++; limits.set(req.ip, entry); next();
  }
  app.get('/api/blindbox/account', (req, res) => res.set('Cache-Control', 'no-store').json({ user: publicUser(session(req)) }));
  app.get('/api/blindbox/account/export', (req,res) => {
    res.set('Cache-Control','no-store');
    const user=session(req);
    if(!user)return res.status(401).json({error:'请登录后管理账号资料。'});
    res.json({version:1,exportedAt:new Date().toISOString(),user:{...publicUser(user),createdAt:user.createdAt}});
  });
  app.post('/api/blindbox/account/:action', mutation, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const action = req.params.action;
    const { username, password, recoveryCode } = req.body || {};
    if (action === 'delete') {
      const user=session(req);
      if(!user)return res.status(401).json({error:'请登录后管理账号资料。'});
      if(typeof password!=='string'||password.length>128||!safeEqual(passwordHash(password,user.salt),user.passwordHash))return res.status(401).json({error:'账号或密码不正确。'});
      save({...read(),users:read().users.filter(u=>u.id!==user.id),sessions:read().sessions.filter(s=>s.userId!==user.id)});
      setCookie(req,res,'',0);return res.json({user:null,deleted:true});
    }
    if (action === 'logout') {
      const token = (req.headers.cookie || '').match(/(?:^|;\s*)f3d_session=([a-f0-9]{64})(?:;|$)/)?.[1];
      if (token) save({ ...read(), sessions: read().sessions.filter(s => s.hash !== digest(token)) });
      setCookie(req, res, '', 0); return res.json({ user: null });
    }
    if (!['register', 'login', 'recover'].includes(action)) return res.status(404).json({ error: 'Unknown action.' });
    if (typeof username !== 'string' || !/^[a-zA-Z0-9_]{3,24}$/.test(username) || typeof password !== 'string' || password.length < 12 || password.length > 128) {
      return res.status(400).json({ error: '用户名需为 3–24 位字母、数字或下划线；密码需为 12–128 位。' });
    }
    const normalized = username.toLowerCase();
    const existing = read().users.find(u => u.username === normalized);
    const next = structuredClone(read());
    if (action === 'register') {
      if (existing) return res.status(409).json({ error: '该用户名不可用。' });
      if (next.users.length >= 10000) return res.status(503).json({ error: '暂时无法创建账号。' });
      const salt = randomBytes(16).toString('hex');
      const code = randomBytes(24).toString('hex');
      const user = { id: randomUUID(), username: normalized, salt, passwordHash: passwordHash(password, salt), recoveryHash: digest(code), collection: {}, createdAt: Date.now() };
      next.users.push(user); const token = newSession(next, user.id); save(next); setCookie(req, res, token);
      return res.status(201).json({ user: publicUser(user), recoveryCode: code });
    }
    if (action === 'recover') {
      if (!existing || typeof recoveryCode !== 'string' || recoveryCode.length > 100 || !safeEqual(digest(recoveryCode.trim()), existing.recoveryHash)) return res.status(401).json({ error: '账号或恢复码不正确。' });
      const user = next.users.find(u => u.id === existing.id), code = randomBytes(24).toString('hex');
      user.salt = randomBytes(16).toString('hex'); user.passwordHash = passwordHash(password, user.salt); user.recoveryHash = digest(code);
      next.sessions = next.sessions.filter(s => s.userId !== user.id);
      const token = newSession(next, user.id); save(next); setCookie(req, res, token);
      return res.json({ user: publicUser(user), recoveryCode: code });
    }
    const check = passwordHash(password, existing?.salt || 'invalid-user-salt');
    if (!existing || !safeEqual(check, existing.passwordHash)) return res.status(401).json({ error: '账号或密码不正确。' });
    const token = newSession(next, existing.id); save(next); setCookie(req, res, token);
    res.json({ user: publicUser(existing) });
  });
  return {
    addDraw(req, characterId) {
      const current = session(req); if (!current) return null;
      const next = structuredClone(read()), user = next.users.find(u => u.id === current.id);
      user.collection[characterId] = (user.collection[characterId] || 0) + 1;
      save(next); return publicUser(user);
    }
  };
}
module.exports = { installAccounts };
