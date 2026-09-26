'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const root=path.join(__dirname,'../frontend');
test('art gesture finishes cleanly and respects reduced motion',async()=>{
  const {artMotion}=await import('../frontend/blindbox/art-motion.mjs');
  assert.deepEqual(artMotion(9,true,true),{lift:0,heart:null});
  assert.deepEqual(artMotion(9,false,false),{lift:0,heart:null});
  assert.deepEqual(artMotion(15,false,true),{lift:0,heart:null});
  assert.ok(artMotion(9,false,true).heart.opacity>0);
  assert.ok(artMotion(1,false,true).lift<=.006);
  assert.equal(artMotion(0,false,true).lift,0);
});
test('preview and export use the same portraits without substitute dancing models',()=>{
  const app=fs.readFileSync(path.join(root,'blindbox/app.js'),'utf8');
  const recording=fs.readFileSync(path.join(root,'blindbox/recording.js'),'utf8');
  const art=fs.readFileSync(path.join(root,'blindbox/art-card.js'),'utf8');
  assert.doesNotMatch(app,/characterModel|AnimationMixer|\$\('motion'\)/);
  assert.doesNotMatch(recording,/WebGLRenderer|renderer\.render/);
  assert.match(recording,/result\.character\.id,true/);
  assert.match(art,/artMotion\(time,reduced\|\|!animateArt,playing\)/);
  assert.doesNotMatch(art,/canvas\.hidden=true;stage\.classList\.remove/);
  assert.doesNotMatch(fs.readFileSync(path.join(root,'blindbox.html'),'utf8'),/value="Dance"/);
  for(const id of ['imp','goblin','skeleton','ghost','reaper','doll','cat','star','fairy','matchmaker','fortune','unicorn']){
    assert.ok(fs.existsSync(path.join(root,`blindbox/art/${id}-couture-v1.webp`)));
  }
});
