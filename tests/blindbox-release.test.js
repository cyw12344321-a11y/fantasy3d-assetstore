'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {releaseConfig,publicOrigin}=require('../lib/blindbox-release');
const {backup,verify,restore}=require('../lib/blindbox-backup');
const express=require('express');
const {installBlindbox}=require('../lib/blindbox');
test('account export is private; deletion requires password and invalidates sessions without touching anonymous gifts',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gift-data-controls-'));
 const app=express();app.use(express.json());installBlindbox(app,dir);
 const server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
 const base='http://127.0.0.1:'+server.address().port;
 const post=async(route,body,cookie='',origin=base)=>fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(body)});
 try{
  const password='only-for-a-test-password';
  const registered=await post('/api/blindbox/account/register',{username:'delete_test',password});
  const cookie=registered.headers.get('set-cookie').split(';')[0];
  const user=await registered.json();
  const drawn=await(await post('/api/blindbox/draw',{name:'Anna',pool:'bless'},cookie)).json();
  assert.equal((await fetch(base+'/api/blindbox/account/export')).status,401);
  const data=await(await fetch(base+'/api/blindbox/account/export',{headers:{Cookie:cookie}})).json();
  assert.equal(data.user.username,'delete_test');assert.equal(data.user.collection[drawn.characterId],1);
  for(const secret of ['passwordHash','recoveryHash','salt','sessions'])assert.equal(JSON.stringify(data).includes(secret),false);
  assert.equal((await post('/api/blindbox/account/delete',{password:'wrong'},cookie)).status,401);
  assert.equal((await post('/api/blindbox/account/delete',{password},cookie,'https://evil.com')).status,403);
  assert.equal((await post('/api/blindbox/account/delete',{password},cookie)).status,200);
  assert.equal((await fetch(base+'/api/blindbox/account/export',{headers:{Cookie:cookie}})).status,401);
  assert.equal((await post('/api/blindbox/account/recover',{username:'delete_test',password,recoveryCode:user.recoveryCode})).status,401);
  assert.equal((await fetch(base+'/api/blindbox/reveal/'+drawn.token)).status,200);
  const giftPage=await fetch(base+'/r/'+drawn.token);
  assert.match(giftPage.headers.get('x-robots-tag'),/noindex/);assert.equal(giftPage.headers.get('cache-control'),'no-store');
  const info=await fetch(base+'/gift-info?lang=en');assert.match(await info.text(),/mailto:715341216@qq.com/);
  const disk=JSON.parse(fs.readFileSync(path.join(dir,'blindbox-accounts.json'),'utf8'));assert.equal(disk.users.length,0);assert.equal(disk.sessions.length,0);
 }finally{await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
test('public gift sharing requires production, durable storage and a configured HTTPS domain',()=>{
 assert.equal(releaseConfig({}).sharingEnabled,false);
 assert.equal(releaseConfig({NODE_ENV:'production',BLINDBOX_PUBLIC_ORIGIN:'https://gifts.company.com'}).sharingEnabled,false);
 const config=releaseConfig({NODE_ENV:'production',BLINDBOX_PUBLIC_ORIGIN:'https://gifts.company.com',BLINDBOX_PERSISTENT_STORAGE:'true'});
 assert.equal(config.sharingEnabled,true);assert.equal(config.paymentEnabled,false);
 for(const origin of ['http://store.com','https://localhost','https://127.0.0.1','https://192.168.0.2','https://user:secret@store.com','https://store.com/path','https://store.com/?a=1','https://store.local'])assert.equal(publicOrigin(origin),null);
});
test('production without durable storage refuses new gifts instead of creating fragile links',async()=>{
 const previous={NODE_ENV:process.env.NODE_ENV,BLINDBOX_PERSISTENT_STORAGE:process.env.BLINDBOX_PERSISTENT_STORAGE};
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'gift-release-guard-'));let server;
 try{
  process.env.NODE_ENV='production';delete process.env.BLINDBOX_PERSISTENT_STORAGE;
  const app=express();app.use(express.json());installBlindbox(app,dir);
  server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));
  const base='http://127.0.0.1:'+server.address().port;
  const response=await fetch(base+'/api/blindbox/draw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Anna',pool:'bless'})});
  assert.equal(response.status,503);
  assert.equal((await(await fetch(base+'/api/blindbox/config')).json()).sharingEnabled,false);
 }finally{
  for(const [name,value]of Object.entries(previous))if(value===undefined)delete process.env[name];else process.env[name]=value;
  if(server)await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});
 }
});
test('encrypted backup verifies, restores into new directories and rejects wrong keys or overwrite',()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'gift-backup-'));
 try{
  const source=path.join(root,'source');fs.mkdirSync(source);
  fs.writeFileSync(path.join(source,'blindbox-signing-key'),Buffer.alloc(32,7));
  fs.writeFileSync(path.join(source,'blindbox-accounts.json'),JSON.stringify({version:1,users:[],sessions:[]}));
  fs.writeFileSync(path.join(source,'blindbox-gift-receipts.json'),'{}');
  const password='test-only-encryption-password',archive=backup(source,password);
  assert.equal(archive.includes('users'),false);assert.equal(Object.keys(verify(archive,password).files).length,3);
  assert.throws(()=>verify(archive,'incorrect-long-password'));
  const target=path.join(root,'restored');restore(archive,password,target);
  for(const file of fs.readdirSync(source))assert.deepEqual(fs.readFileSync(path.join(source,file)),fs.readFileSync(path.join(target,file)));
  assert.throws(()=>restore(archive,password,target));
  assert.throws(()=>backup(source,'short'));
  const corrupt=JSON.parse(archive);corrupt.tag=Buffer.alloc(16).toString('base64');assert.throws(()=>verify(JSON.stringify(corrupt),password));
 }finally{fs.rmSync(root,{recursive:true,force:true});}
});
