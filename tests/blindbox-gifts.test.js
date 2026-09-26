'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const express=require('express');
const {installBlindbox}=require('../lib/blindbox');const {giftStory,giftDetails}=require('../lib/blindbox-gifts');
test('personalized gift receipts are private, idempotent, revocable and persistent',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gift-test-'));let server,base;
 async function start(){const app=express();app.use(express.json());installBlindbox(app,dir);server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;}
 const post=async(p,body,headers={})=>{const r=await fetch(base+p,{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};};
 await start();try{
  const draw=await post('/api/blindbox/draw',{name:'小明',pool:'bless',sender:'小红',occasion:'birthday',relationship:'friend'});assert.equal(draw.status,200);assert.match(draw.data.story.join(''),/小红|生日|蜡烛/);
  const g=draw.data,p='/api/blindbox/gifts/'+g.token,auth={Authorization:'Bearer '+g.ownerToken};
  assert.equal((await fetch(base+p)).status,403);
  const r=await post(p+'/react',{reaction:'thanks'});assert.equal(r.status,200);
  await post(p+'/react',{reaction:'thanks'},{Cookie:r.cookie});
  let receipt=await(await fetch(base+p,{headers:auth})).json();assert.equal(receipt.thanks,1);
  await post(p+'/react',{reaction:'smile'},{Cookie:r.cookie});receipt=await(await fetch(base+p,{headers:auth})).json();assert.equal(receipt.thanks,0);assert.equal(receipt.smile,1);
  const reveal=await(await fetch(base+'/api/blindbox/reveal/'+g.token)).json();assert.equal(reveal.ownerToken,undefined);assert.equal(reveal.user,undefined);assert.deepEqual(reveal.story,g.story);
  assert.equal((await post(p+'/revoke',{})).status,403);assert.equal((await post(p+'/revoke',{},auth)).status,200);
  assert.equal((await fetch(base+'/api/blindbox/reveal/'+g.token)).status,410);
  assert.equal((await post(p+'/react',{reaction:'thanks'})).status,410);
  await new Promise(r=>server.close(r));await start();assert.equal((await fetch(base+'/api/blindbox/reveal/'+g.token)).status,410);
  assert.equal((await post('/api/blindbox/draw',{name:'test',pool:'prank',occasion:'invalid'})).status,400);
  const a=giftStory({name:'a',occasion:'sorry',relationship:'colleague'},{pool:'prank'}).join('');assert.match(a,/对不起/);assert.doesNotMatch(a,/诅咒/);
  const english=await post('/api/blindbox/draw',{name:'Anna',sender:'Sam',pool:'bless',locale:'en',occasion:'birthday',note:'You make ordinary days special.'});assert.equal(english.status,200);assert.match(english.data.story[0],/Sam/);assert.equal(english.data.story[3],'You make ordinary days special.');
  const publicEnglish=await(await fetch(base+'/api/blindbox/reveal/'+english.data.token)).json();assert.equal(publicEnglish.locale,'en');assert.deepEqual(publicEnglish.story,english.data.story);
  const traditional=await post('/api/blindbox/draw',{name:'小明',sender:'小芳',pool:'bless',locale:'zh-Hant',occasion:'birthday',note:'生日快乐，原文不转换。'});
  assert.equal(traditional.status,200);assert.match(traditional.data.story[0],/託我/);assert.match(traditional.data.story[1],/蠟燭/);
  assert.equal(traditional.data.story[3],'生日快乐，原文不转换。');
  const publicTraditional=await(await fetch(base+'/api/blindbox/reveal/'+traditional.data.token)).json();
  assert.equal(publicTraditional.locale,'zh-Hant');assert.deepEqual(publicTraditional.story,traditional.data.story);
  for(const bad of [{locale:'unsupported'},{note:'x'.repeat(61)},{note:'<script>'},{note:123}])assert.throws(()=>giftDetails(bad));
  assert.equal(giftDetails({}).locale,'zh');
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
