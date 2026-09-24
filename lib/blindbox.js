'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomInt, randomBytes, createHmac, timingSafeEqual } = require('node:crypto');
const { giftDetails, giftStory, installGiftReceipts } = require('./blindbox-gifts');

const characters = [
  ['imp', '捣蛋鬼', 'prank', 'Common', '#72e4a0'],
  ['goblin', '哥布林', 'prank', 'Common', '#b9df57'],
  ['skeleton', '小骷髅', 'prank', 'Rare', '#ece7dc'],
  ['ghost', '幽灵', 'prank', 'Rare', '#bde9ee'],
  ['reaper', '死神', 'prank', 'Epic', '#766c93'],
  ['doll', '诅咒娃娃', 'prank', 'Legendary', '#f38e9f'],
  ['cat', '幸运猫', 'bless', 'Common', '#fff1c9'],
  ['star', '福星', 'bless', 'Common', '#ffe167'],
  ['fairy', '小仙女', 'bless', 'Rare', '#f7a5cc'],
  ['matchmaker', '月老', 'bless', 'Rare', '#ef7979'],
  ['fortune', '财神', 'bless', 'Epic', '#ffd26c'],
  ['unicorn', '独角兽', 'bless', 'Legendary', '#c4b8f3'],
].map(([id, name, pool, rarity, color]) => ({ id, name, pool, rarity, color }));

function installBlindbox(app, dataDir) {
  const release = require('./blindbox-release').installRelease(app);
  const accounts = require('./blindbox-accounts').installAccounts(app, dataDir);
  const keyPath = path.join(dataDir, 'blindbox-signing-key');
  try { fs.writeFileSync(keyPath, randomBytes(32), { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  const key = process.env.BLINDBOX_SIGNING_KEY || fs.readFileSync(keyPath);
  const sign = data => createHmac('sha256', key).update(data).digest('base64url');
  function decode(token) {
    if(typeof token!=='string'||token.length>1600)throw Error('Invalid token');
    const [payload, signature, extra]=token.split('.');
    const expected=Buffer.from(sign(payload||'')),actual=Buffer.from(signature||'');
    if(extra||actual.length!==expected.length||!timingSafeEqual(actual,expected))throw Error('signature');
    const result=JSON.parse(Buffer.from(payload,'base64url').toString());
    if(!characters.some(c=>c.id===result.characterId)||!Number.isFinite(result.createdAt)||Date.now()-result.createdAt>30*86400000)throw Error('expired');
    return result;
  }
  const gifts=installGiftReceipts(app,dataDir,sign,decode);
  const limits = new Map();
  app.get('/api/blindbox/catalog', (req, res) => res.json({ characters, paymentEnabled: false, assetType: 'illustrated-2.5d', odds: { Common: 55, Rare: 28, Epic: 13, Legendary: 4 } }));
  app.post('/api/blindbox/draw', (req, res) => {
    if (release.production && !release.persistent) return res.status(503).json({error:'持久化存储尚未配置，暂时无法创建礼物。'});
    const { name, pool } = req.body || {};
    let details;try{details=giftDetails(req.body||{});}catch(error){return res.status(400).json({error:error.message});}
    if (typeof name !== 'string' || !name.trim() || [...name.trim()].length > 24 || /[<>\x00-\x1f]/.test(name) || !['prank', 'bless'].includes(pool)) {
      return res.status(400).json({ error: '请输入 1–24 字的名字，并选择整蛊或祝福。' });
    }
    const now = Date.now();
    for (const [ip, value] of limits) if (value.until < now) limits.delete(ip);
    const ip = req.ip;
    const rec = limits.get(ip) || { count: 0, until: now + 60000 };
    if (rec.count >= 20 || (!limits.has(ip) && limits.size >= 10000)) return res.status(429).json({ error: '开盒太快了，请稍后再试。' });
    rec.count++; limits.set(ip, rec);
    const roll = randomInt(100);
    const rarity = roll < 55 ? 'Common' : roll < 83 ? 'Rare' : roll < 96 ? 'Epic' : 'Legendary';
    const options = characters.filter(c => c.pool === pool && c.rarity === rarity);
    const character = options[randomInt(options.length)];
    const result = { name: name.trim(), characterId: character.id, seed: randomInt(1000000), createdAt: now, ...details };
    const payload = Buffer.from(JSON.stringify(result)).toString('base64url');
    const token = payload + '.' + sign(payload);
    const user = accounts.addDraw(req, character.id);
    res.set('Cache-Control', 'no-store').json({ ...result, token, character, user, story:giftStory(result,character), ownerToken:gifts.ownerKey(token) });
  });
  app.get('/api/blindbox/reveal/:token', (req, res) => {
    try {
      const token = req.params.token;
      const result = decode(token);
      if(gifts.revoked(token))return res.status(410).json({error:'发送者已撤回这份礼物。'});
      const character = characters.find(c => c.id === result.characterId);
      if (!character) throw new Error('character');
      res.set('Cache-Control', 'no-store').json({ ...result, character, token, story:giftStory(result,character) });
    } catch { res.status(404).json({ error: '这个分享链接无效或已失效。' }); }
  });
  app.get('/r/:token', (req, res) => res.set({'Referrer-Policy':'no-referrer','Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow, noarchive'}).sendFile(path.join(__dirname, '../frontend/blindbox.html')));
}
module.exports = { installBlindbox, characters };
