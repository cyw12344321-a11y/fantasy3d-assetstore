'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const express = require('express');
const { installBlindbox } = require('../lib/blindbox');

test('accounts isolate and persist collection, protect secrets, recover and revoke sessions', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'blindbox-accounts-'));
  let server, base;
  async function start() {
    const app=express();app.use(express.json());installBlindbox(app,dir);
    server=app.listen(0,'127.0.0.1');await new Promise(r=>server.once('listening',r));base='http://127.0.0.1:'+server.address().port;
  }
  const post=async(route,body,cookie='',origin=base)=>{
    const response=await fetch(base+route,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,Cookie:cookie},body:JSON.stringify(body)});
    return {status:response.status,body:await response.json(),cookie:response.headers.get('set-cookie')};
  };
  const account=cookie=>fetch(base+'/api/blindbox/account',{headers:{Cookie:cookie}}).then(r=>r.json());
  const password='test-only-a-strong-password';
  await start();
  try {
    const route='/api/blindbox/account/';
    const alice=await post(route+'register',{username:'alice',password});
    assert.equal(alice.status,201);assert.match(alice.cookie,/HttpOnly/);assert.match(alice.cookie,/SameSite=Strict/);
    assert.ok(alice.body.recoveryCode);assert.equal(alice.body.user.passwordHash,undefined);
    const cookie=alice.cookie.split(';')[0];
    const bob=await post(route+'register',{username:'bob',password});const bobCookie=bob.cookie.split(';')[0];
    const draw=await post('/api/blindbox/draw',{name:'test',pool:'bless'},cookie);
    assert.equal(draw.body.user.collection[draw.body.characterId],1);
    assert.deepEqual((await account(bobCookie)).user.collection,{});
    assert.equal((await account('')).user,null);
    assert.equal((await post(route+'login',{username:'alice',password:'wrong-but-long-enough'})).status,401);
    assert.equal((await post(route+'logout',{},cookie,'https://evil.example')).status,403);
    const disk=fs.readFileSync(path.join(dir,'blindbox-accounts.json'),'utf8');
    assert.ok(!disk.includes(password));assert.ok(!disk.includes(alice.body.recoveryCode));assert.ok(!disk.includes(cookie.slice(12)));
    await new Promise(r=>server.close(r));await start();
    assert.equal((await account(cookie)).user.collection[draw.body.characterId],1);
    const recovered=await post(route+'recover',{username:'alice',password:password+'-new',recoveryCode:alice.body.recoveryCode});
    assert.equal(recovered.status,200);assert.equal((await account(cookie)).user,null);
    assert.equal((await post(route+'recover',{username:'alice',password,recoveryCode:alice.body.recoveryCode})).status,401);
    const newCookie=recovered.cookie.split(';')[0];
    assert.equal((await account(newCookie)).user.collection[draw.body.characterId],1);
    assert.equal((await post(route+'logout',{},newCookie)).status,200);assert.equal((await account(newCookie)).user,null);
  } finally {await new Promise(r=>server.close(r));fs.rmSync(dir,{recursive:true,force:true});}
});
