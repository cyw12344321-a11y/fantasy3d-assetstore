'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomBytes, timingSafeEqual } = require('node:crypto');
const hash = text => createHash('sha256').update(text).digest('hex');
const occasions = ['everyday', 'birthday', 'cheer', 'sorry'];
const relationships = ['friend', 'partner', 'colleague', 'family'];
const languagePack=require('../frontend/blindbox/locale-pack.json');
const messageRows=new Map(languagePack.messages.map(row=>[row[0],row]));
const translate=(text,locale)=>messageRows.get(text)?.[languagePack.languages.indexOf(locale)]||text;

function giftDetails(body) {
  const sender = body.sender === undefined ? '' : body.sender;
  const occasion = body.occasion || 'everyday', relationship = body.relationship || 'friend';
  const locale=body.locale===undefined?'zh':body.locale,note=body.note===undefined?'':body.note;
  if(!['zh',...languagePack.languages].includes(locale)||typeof note!=='string'||[...note.trim()].length>60||/[<>\x00-\x1f]/.test(note))throw Error('请填写有效的昵称、关系和送礼场景。');
  if (typeof sender !== 'string' || [...sender.trim()].length > 24 || /[<>\x00-\x1f]/.test(sender) || !occasions.includes(occasion) || !relationships.includes(relationship)) throw Error('请填写有效的昵称、关系和送礼场景。');
  return { sender: sender.trim(), occasion, relationship, locale, note:note.trim() };
}
function giftStory(result, character) {
  const { name, sender, occasion = 'everyday', relationship = 'friend' } = result;
  if(result.locale&&result.locale!=='zh'){
    const t=text=>translate(text,result.locale);
    const from=sender||t({friend:'your friend',partner:'someone who cares about you',colleague:'your teammate',family:'your family'}[relationship]);
    const playful=character.pool==='prank';
    const beats={everyday:playful?['Your daily smile delivery is here.','No signature needed. A little grin will do.']:['Not every day has to be a great day.','But someone is thinking of you today.'],birthday:playful?['Birthday inspection: cake is optional. Making a wish is not.','Today, you get to be the main character.']:['Blow out the candles. Hold on to the wish.','Here’s to more of the things that make you happy.'],cheer:playful?['Your worries have been sent on a five-minute break.','Take a breath. We can tackle the next bit together.']:['You don’t have to figure it all out today.','One small step is still a step forward.'],sorry:['This time, I’m here with a sincere apology.','No pressure to forgive. Just a wish to make things right.']};
    const ending={friend:'Let’s catch up soon. There’s more laughter to share.',partner:'A little surprise for someone who means a lot.',colleague:'Here’s to fewer late nights and more good news.',family:'However busy life gets, you’re on my mind.'}[relationship];
    const intro=t('{name}, a little message from {from}.').replace(/\{(name|from)\}/g,(_,key)=>({name,from})[key]);
    return [intro,...beats[occasion].map(t),result.note||t(ending)];
  }
  const from = sender || ({ friend: '你的朋友', partner: '那个在乎你的人', colleague: '你的同事', family: '你的家人' }[relationship]);
  const intro = `${name}，${from}托我给你捎句话。`;
  const playful = character.pool === 'prank';
  const lines = {
    everyday: playful ? ['已检测到你今天的快乐余额不足。', '现在补发一份！笑一下，就算签收。'] : ['今天不一定事事顺利。', '但有人惦记你，这件事是真的。'],
    birthday: playful ? ['生日突击检查！蛋糕可以分，愿望不许少。', '今天你最大，快乐由我们承包。'] : ['把蜡烛吹灭，把心愿留下。', '新的一岁，愿你被喜欢的事包围。'],
    cheer: playful ? ['烦恼暂停营业，休息五分钟不扣分。', '你先喘口气，下一关我们一起闯。'] : ['不必一下子把所有事情做好。', '慢慢来，你已经走了很远。'],
    sorry: ['这次不是来闹的，是来认真说对不起。', '不催你原谅，只想把这份心意送到。']
  };
  const ending = { friend: '有空碰个面，快乐当面续上。', partner: '小小的惊喜，留给特别的你。', colleague: '愿今天少点加班，多点好消息。', family: '忙归忙，记得好好吃饭。' }[relationship];
  return [intro, ...lines[occasion], result.note||ending];
}

function installGiftReceipts(app, dataDir, sign, decode) {
  const file = path.join(dataDir, 'blindbox-gift-receipts.json');
  let records = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : {};
  if (!records || Array.isArray(records) || typeof records !== 'object') throw Error('Invalid gift receipts; original preserved.');
  const limits = new Map();
  const ownerKey = token => sign('gift-owner:' + token);
  const revoked = token => Boolean(records[hash(token)]?.revoked);
  function update(key, record) {
    const cutoff=Date.now()-31*86400000;
    const next=Object.fromEntries(Object.entries(records).filter(([,v])=>v.createdAt>cutoff));
    if (!next[key] && Object.keys(next).length>=5000) throw Error('礼物回执暂满，请稍后再试。');
    next[key]=record;fs.writeFileSync(file+'.tmp',JSON.stringify(next),{mode:0o600});fs.renameSync(file+'.tmp',file);records=next;
  }
  function owner(req, token) {
    const provided=Buffer.from((req.get('authorization')||'').replace(/^Bearer /,'')),expected=Buffer.from(ownerKey(token));
    return provided.length===expected.length && timingSafeEqual(provided,expected);
  }
  app.get('/api/blindbox/gifts/:token', (req,res)=>{
    const token=req.params.token;
    if(!owner(req,token))return res.status(403).json({error:'只有发送者可以查看回执。'});
    try { decode(token); } catch { return res.status(404).json({error:'礼物已过期。'}); }
    const record=records[hash(token)];const votes=Object.values(record?.votes||{});
    res.set('Cache-Control','no-store').json({smile:votes.filter(v=>v==='smile').length,thanks:votes.filter(v=>v==='thanks').length,revoked:Boolean(record?.revoked)});
  });
  app.post('/api/blindbox/gifts/:token/:action',(req,res)=>{
    const token=req.params.token;
    if(!req.is('application/json'))return res.status(415).json({error:'JSON required.'});
    try { if(req.get('origin') && new URL(req.get('origin')).host!==req.get('host'))return res.status(403).json({error:'Origin rejected.'}); } catch { return res.status(403).json({error:'Origin rejected.'}); }
    let result;try { result=decode(token); } catch { return res.status(404).json({error:'礼物已失效。'}); }
    const now=Date.now();for(const [ip,r] of limits)if(r.until<now)limits.delete(ip);
    const rate=limits.get(req.ip)||{count:0,until:now+60000};
    if(rate.count>=20||(!limits.has(req.ip)&&limits.size>=5000))return res.status(429).json({error:'操作过快，请稍后再试。'});
    rate.count++;limits.set(req.ip,rate);
    const key=hash(token),record=structuredClone(records[key]||{createdAt:result.createdAt,votes:{}});
    if(req.params.action==='revoke'){
      if(!owner(req,token))return res.status(403).json({error:'只有发送者可以撤回礼物。'});
      record.revoked=true;record.votes={};update(key,record);return res.json({revoked:true});
    }
    if(req.params.action!=='react')return res.status(404).json({error:'Unknown action.'});
    if(record.revoked)return res.status(410).json({error:'发送者已撤回这份礼物。'});
    const reaction=req.body?.reaction;if(!['smile','thanks'].includes(reaction))return res.status(400).json({error:'请选择回应。'});
    let visitor=(req.headers.cookie||'').match(/(?:^|;\s*)f3d_gift=([a-f0-9]{48})(?:;|$)/)?.[1];
    if(!visitor){visitor=randomBytes(24).toString('hex');res.cookie('f3d_gift',visitor,{httpOnly:true,sameSite:'strict',secure:Boolean(req.secure||process.env.RENDER||process.env.NODE_ENV==='production'),maxAge:30*86400000,path:'/'});}
    const visitorKey=hash(visitor);if(!record.votes[visitorKey]&&Object.keys(record.votes).length>=100)return res.status(429).json({error:'这份礼物的回执已满。'});
    record.votes[visitorKey]=reaction;update(key,record);res.json({received:true,reaction});
  });
  return {ownerKey,revoked};
}
module.exports={giftDetails,giftStory,installGiftReceipts};
