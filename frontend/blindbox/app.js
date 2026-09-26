import * as T from '/workshop-runtime/vendor/three.module.js';
import { giftModel } from './models.js';
import { setupAccount } from './account.js';
import { recordStage, supportedRecordingType } from './recording.js';
import { setupGifting } from './gifting.js';
import { setupArtCard, artAssets, setArtAnimation } from './art-card.js';
import {locale,choose,format,tr,characterName,setupLanguage,localizeStatic} from './i18n.js';

const $ = id => document.getElementById(id);
if(location.pathname.startsWith('/r/'))document.body.classList.add('receiving');
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clock = new T.Clock(), portraits = new Map();
let renderer, scene, camera, gift, accounts;
let catalog = [], result = null, user = null, guest = {}, busy = false;
let openedAt = 0, sound = false, rotation = 0, dragX = null, revealing = false;
let recording = null, downloadUrl = null;
let gifting, storyPhase = -1, storyPlaying = false;
let artCard;
try {
  const saved = JSON.parse(localStorage.getItem('fantasy3d-blindbox-v1') || '{}');
  if (saved && typeof saved === 'object' && !Array.isArray(saved)) guest = saved;
} catch {}

function dispose(group) {
  const materials = new Set(), skeletons = new Set();
  group?.traverse(n => { n.geometry?.dispose(); if(n.skeleton)skeletons.add(n.skeleton); if(n.material)materials.add(n.material); });
  materials.forEach(m => m.dispose()); skeletons.forEach(s => s.dispose());
}
function setCharacter(c) {
  artCard?.set(c.id);
  storyPlaying = false;
  revealing = false;
  gift.visible = false;
}
function setup() {
  renderer = new T.WebGLRenderer({ canvas: $('scene'), antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap; renderer.outputColorSpace = T.SRGBColorSpace;
  renderer.toneMapping = T.ACESFilmicToneMapping; renderer.toneMappingExposure = .85;
  scene = new T.Scene(); scene.background = new T.Color('#e6eee8');
  camera = new T.PerspectiveCamera(35, 1, .1, 100); camera.position.set(3.8, 3.1, 6.7); camera.lookAt(0, 1.15, 0);
  scene.add(new T.HemisphereLight('#ffffff', '#789886', 2.5));
  const light = new T.DirectionalLight('#fff0d9', 3.8); light.position.set(3,7,5); light.castShadow = true;
  light.shadow.mapSize.set(1024,1024); scene.add(light);
  const ground = new T.Mesh(new T.PlaneGeometry(100,100), new T.MeshStandardMaterial({color:'#e6eee8',roughness:1}));
  ground.rotation.x=-Math.PI/2; ground.position.y=-.12; ground.receiveShadow=true;scene.add(ground);
  const plinth = new T.Mesh(new T.CylinderGeometry(1.7,1.8,.22,64),new T.MeshStandardMaterial({color:'#c2d6c6',roughness:.7}));
  plinth.receiveShadow=true;scene.add(plinth);gift=giftModel();gift.position.y=.12;scene.add(gift);
  const resize=()=>{const r=$('stage').getBoundingClientRect();renderer.setSize(r.width,r.height,false);camera.aspect=r.width/r.height;camera.position.z=r.width<430?8.4:6.7;camera.updateProjectionMatrix();};
  new ResizeObserver(resize).observe($('stage'));resize();
  artCard=setupArtCard($('stage'));
  artCard.set(location.pathname.startsWith('/r/')?false:'imp');
  $('scene').addEventListener('pointerdown',e=>{if(!recording)dragX=e.clientX;});
  window.addEventListener('pointerup',()=>dragX=null);
  $('scene').addEventListener('pointermove',e=>{if(dragX!==null){rotation+=(e.clientX-dragX)*.012;dragX=e.clientX;}});
  renderer.setAnimationLoop(()=>{
    const delta=Math.min(clock.getDelta(),.05),t=clock.elapsedTime,elapsed=t-openedAt;
    gift.rotation.y=rotation+Math.sin(t*.5)*.08;gift.rotation.z=busy&&!reduced?Math.sin(t*30)*.07:0;
    if(result&&storyPlaying){const phase=Math.min(4,Math.floor(elapsed/3.75));$('story-progress').value=Math.min(15,elapsed);if(phase!==storyPhase){storyPhase=phase;const lines=result.story||[lineFor(result)];$('line').textContent=lines[Math.min(phase,lines.length-1)];if(phase<4)speak();}}
    if(busy){revealing=false;gift.scale.setScalar(1);gift.userData.lid.position.y=1.36;gift.userData.lid.rotation.z=0;}
    renderer.render(scene,camera);artCard.frame();window.__blindboxReady=true;
  });
  $('scene').addEventListener('webglcontextlost',e=>{e.preventDefault();recording?.abort();$('status').textContent=tr('三维显示已中断，请刷新页面重试。');$('draw').disabled=true;});
}
function lineFor(r){return r.story?.[0]||(r.character.pool==='bless'?`${r.name}，今天的好运，已经给你留了一份。`:`${r.name}，你被点名了！今天的快乐由我承包。`);}
function speak(){if(!sound||!result||!('speechSynthesis'in window))return;speechSynthesis.cancel();const u=new SpeechSynthesisUtterance($('line').textContent||lineFor(result));u.lang=(result.locale||locale)==='zh'?'zh-CN':(result.locale||locale);u.rate=1.06;speechSynthesis.speak(u);}
function clearDownload(){if(downloadUrl)URL.revokeObjectURL(downloadUrl);downloadUrl=null;$('video-download').hidden=true;$('video-download').removeAttribute('href');$('record-status').textContent='';}
function show(r,save=false){
  result=r;clearDownload();setCharacter(r.character);artCard.play();
  storyPlaying=true;storyPhase=-1;$('story-progress').value=0;
  gift.scale.setScalar(1);gift.userData.lid.position.y=1.36;gift.userData.lid.rotation.z=0;openedAt=clock.elapsedTime;
  $('result').hidden=false;$('rarity').textContent=tr(r.character.rarity)+' / '+(r.character.pool==='bless'?choose('祝福','Kind'):choose('整蛊','Playful'));
  $('character-name').textContent=characterName(r.character);$('line').textContent=lineFor(r);$('status').textContent=document.body.classList.contains('receiving')?choose('这份心意，专门送给你。','A little thought, just for you.'):choose('预览已就绪，还未发送给朋友。','Your preview is ready. Nothing has been sent yet.');
  $('again').textContent=tr(document.body.classList.contains('receiving')?'回送一个':'再送一份');
  if(save){
    gifting.remember(r);
    if(r.user){accounts.apply(r.user);$('status').textContent=choose('已加入账号收藏，还未发送给朋友。','Saved to your account. Nothing has been sent yet.');}
    else {accounts.apply(null);guest[r.character.id]=(Number(guest[r.character.id])||0)+1;try{localStorage.setItem('fantasy3d-blindbox-v1',JSON.stringify(guest));}catch{$('status').textContent=tr('已开盒；浏览器未允许保存本机收藏。');}renderCards();}
  }
  if(!supportedRecordingType()){$('record').disabled=true;$('record-status').textContent=tr('当前浏览器不支持视频导出。');}
  speak();
}
async function api(url,options){const response=await fetch(url,{...options,signal:AbortSignal.timeout(15000)});const data=await response.json();if(!response.ok)throw Error(tr(data.error)||choose('服务暂不可用','The service is temporarily unavailable.'));return data;}
function portrait(c){
  return artAssets[c.id]?.thumb || '';
}
function renderCards(){
  if(!renderer||!catalog.length||document.body.classList.contains('receiving'))return;
  const collection=user?user.collection:guest,ids=catalog.filter(c=>collection[c.id]>0);
  $('collected').textContent=ids.length+'/12';$('collection-note').textContent=format(`${user?'云端':'本机'}收藏 {count} / 12`,`${user?'Account':'Device'} collection {count} / 12`,{count:ids.length});$('cards').replaceChildren();
  for(const c of catalog){
    const b=document.createElement('button');b.className='character-card'+(collection[c.id]?'':' locked');b.title=choose('预览 ','Preview ')+characterName(c);b.setAttribute('aria-label',b.title);
    if(artAssets[c.id])b.classList.add('illustrated');
    const img=document.createElement('img');img.className='portrait';img.alt=characterName(c);img.width=180;img.height=180;
    img.loading='lazy';img.decoding='async';
    if(!portraits.has(c.id))portraits.set(c.id,portrait(c));img.src=portraits.get(c.id);
    const label=document.createElement('span');label.className='card-info';label.textContent=characterName(c);
    const sub=document.createElement('small');sub.textContent=(c.pool==='bless'?choose('一份祝福','A little kindness'):choose('一点调皮','A little mischief'))+' · '+(collection[c.id]?format('已收集 ×{count}','Collected ×{count}',{count:collection[c.id]}):choose('未收集','Not collected'));label.append(sub);b.append(img,label);
    b.onclick=()=>{if(busy||recording)return;setCharacter(c);gift.visible=false;result=null;$('result').hidden=true;$('status').textContent=characterName(c)+choose(' · 图鉴预览',' · Collection preview');$('stage').scrollIntoView({behavior:reduced?'instant':'smooth',block:'center'});};$('cards').append(b);
  }
}
function lock(locked){for(const id of ['draw','account-button','replay','again','share','record','video-layout','art-animation'])$(id).disabled=locked;}
const wait=ms=>new Promise(r=>setTimeout(r,ms));
$('draw-form').onsubmit=async e=>{
  e.preventDefault();if(busy||recording||!renderer)return;busy=true;lock(true);$('result').hidden=true;result=null;
  artCard.set(false);
  gift.visible=true;$('status').textContent=tr('惊喜正在路上…');
  try{
    const request=api('/api/blindbox/draw',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:$('recipient').value,pool:new FormData(e.target).get('pool'),...gifting.details()})});request.catch(()=>{});
    for(let i=3;i>0;i--){$('countdown').textContent=String(i);await wait(reduced?150:850);}
    const r=await request;$('countdown').textContent='';show(r,true);
  }catch(err){$('countdown').textContent='';$('status').textContent=err.name==='TimeoutError'?tr('连接超时，请重新开盒。'):err.message;}
  finally{busy=false;lock(false);if(!supportedRecordingType())$('record').disabled=true;}
};
$('sound').onclick=()=>{sound=!sound;$('sound').setAttribute('aria-pressed',String(sound));$('sound').title=sound?tr('关闭声音'):tr('开启声音');$('sound').setAttribute('aria-label',$('sound').title);$('sound').textContent=sound?'♫':'♪';if(sound)speak();else if('speechSynthesis'in window)speechSynthesis.cancel();};
$('replay').onclick=()=>{openedAt=clock.elapsedTime;storyPhase=-1;storyPlaying=true;artCard.play();};
$('art-animation').onchange=()=>{setArtAnimation($('art-animation').checked);$('art-card').style.transform='';};
$('again').onclick=()=>{if(gifting.returnGift()){result=null;storyPlaying=false;renderCards();}$('recipient').focus();$('status').textContent=tr('换个名字，再送一份惊喜。');};
$('share').onclick=async()=>{
  if(!result)return;
  let config;try{config=await api('/api/blindbox/config');}catch(error){$('status').textContent=error.message;return;}
  if(!config.sharingEnabled||config.publicOrigin!==location.origin){$('status').textContent=choose('这是预览环境，尚不能发送公网礼物。可以先下载视频。','Public gift sharing is not enabled here. You can download a video instead.');return;}
  const url=config.publicOrigin+'/r/'+result.token+'?lang='+(result.locale||locale);
  try{if(navigator.share)await navigator.share({title:tr('送你一个 Fantasy3D 惊喜'),url});else{await navigator.clipboard.writeText(url);$('status').textContent=tr('分享链接已复制。');}}
  catch(err){if(err.name!=='AbortError'){$('status').textContent=tr('请复制下方链接：');const input=document.createElement('input');input.readOnly=true;input.value=url;input.setAttribute('aria-label',tr('分享链接'));$('status').append(input);input.select();}}
};
$('record').onclick=async()=>{
  if(!result||recording||busy)return;
  const snapshot=result;show(snapshot);recording=new AbortController();lock(true);$('sound').disabled=true;
  $('cancel-record').hidden=false;$('record-progress').hidden=false;$('record-progress').value=0;
  try{
    const output=await recordStage({scene,camera,result:snapshot,duration:15000,signal:recording.signal,portrait:$('video-layout').value==='portrait',onProgress:p=>{$('record-progress').value=p;$('record-status').textContent=format('正在录制 {progress}% · 请保持此页面可见','Recording {progress}% · Keep this tab visible',{progress:Math.round(p*100)});}});
    downloadUrl=URL.createObjectURL(output.blob);const link=$('video-download');link.href=downloadUrl;link.download=`fantasy3d-${snapshot.character.id}-${output.width}x${output.height}.${output.extension}`;link.textContent=choose('下载 ','Download ')+`${output.extension.toUpperCase()} · ${output.width} × ${output.height}`;link.hidden=false;link.click();
    $('record-status').textContent=tr('视频已生成（字幕与音乐，不含浏览器朗读音轨）。');
  }catch(error){$('record-status').textContent=error.message;}
  finally{recording=null;lock(false);$('sound').disabled=false;$('cancel-record').hidden=true;$('record-progress').hidden=true;}
};
$('cancel-record').onclick=()=>recording?.abort();
window.addEventListener('beforeunload',()=>{recording?.abort();if(downloadUrl)URL.revokeObjectURL(downloadUrl);});
try{
  setupLanguage();
  setup();accounts=setupAccount(api,next=>{user=next;renderCards();});gifting=setupGifting(api,r=>show(r));
  localizeStatic();
  const data=await api('/api/blindbox/catalog');catalog=data.characters;renderCards();
  if(location.pathname.startsWith('/r/')){const r=await api('/api/blindbox/reveal/'+encodeURIComponent(location.pathname.slice(3)));gifting.receive(r);document.title=format('送给 {name} 的惊喜 · Fantasy3D','A surprise for {name} · Fantasy3D',{name:r.name});}
}catch(err){$('status').textContent=choose('暂时无法打开盲盒：','Could not open this gift: ')+err.message;const back=document.createElement('a');back.href='/';back.textContent=choose(' 创建自己的惊喜 ↗',' Create your own surprise ↗');$('status').append(back);if(!renderer)$('draw').disabled=true;}
