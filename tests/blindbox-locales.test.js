'use strict';
const {test}=require('node:test');const assert=require('node:assert/strict');
test('language policy normalizes regions, preserves explicit choices and exposes honest fallbacks',async()=>{
 const {resolveLanguage,normalizeLanguage,languageDirection}=await import('../frontend/blindbox/locale-policy.mjs');
 assert.equal(resolveLanguage({browser:['en-US']}).locale,'en');
 assert.equal(resolveLanguage({browser:['zh-CN']}).locale,'zh');
 assert.equal(resolveLanguage({requested:'en',saved:'zh',browser:['zh-CN']}).locale,'en');
 assert.equal(resolveLanguage({requested:'it-IT',saved:'zh'}).locale,'en');
 assert.equal(resolveLanguage({requested:'it-IT'}).fallback,true);
 for(const code of ['zh-TW','zh-HK','zh-MO','zh-Hant','zh-Hant-TW']){
  assert.equal(resolveLanguage({requested:code}).locale,'zh-Hant');
  assert.equal(resolveLanguage({requested:code}).fallback,false);
 }
 assert.equal(resolveLanguage({requested:'zh-Hans-HK'}).locale,'zh');
 assert.equal(resolveLanguage({requested:'zh-TW',available:['en','zh']}).locale,'en');
 assert.equal(resolveLanguage({requested:'ar',available:['en','ar']}).direction,'rtl');
 assert.equal(resolveLanguage({requested:'ar'}).direction,'ltr');
 for(const code of ['ar-EG','he','fa','ur'])assert.equal(languageDirection(code),'rtl');
 assert.equal(languageDirection('az-Latn'),'ltr');
 assert.equal(normalizeLanguage('../../bad'),null);assert.equal(normalizeLanguage('pt_BR'),'pt-BR');
 for(const code of ['es-ES','fr-FR','de-DE','ja-JP'])assert.equal(resolveLanguage({browser:[code]}).locale,code.split('-')[0]);
});

test('major language resources preserve keys, placeholders and localized server stories',async()=>{
 const pack=require('../frontend/blindbox/locale-pack.json');
 const {giftDetails,giftStory}=require('../lib/blindbox-gifts');
 const {nativeLanguages}=await import('../frontend/blindbox/locale-policy.mjs');
 assert.deepEqual(nativeLanguages.map(x=>x.code).sort(),['zh',...pack.languages].sort());
 const keys=new Set();
 const placeholders=text=>(text.match(/\{\w+\}/g)||[]).sort();
 for(const row of pack.messages){
  assert.equal(row.length,pack.languages.length);assert.equal(keys.has(row[0]),false,row[0]);keys.add(row[0]);
  for(const text of row){assert.ok(text.trim());assert.deepEqual(placeholders(text),placeholders(row[0]),row[0]);}
 }
 for(const locale of pack.languages){
  assert.equal(giftDetails({locale}).locale,locale);
  for(const occasion of ['birthday','cheer','sorry','everyday']){
   const story=giftStory({name:'Anna',sender:'Sam',locale,occasion,relationship:'friend'},{pool:'bless'});
   assert.equal(story.length,4);assert.match(story[0],/Anna/);
   if(locale!=='en')assert.notEqual(story[0],'Anna, a little message from Sam.');
  }
 }
});
