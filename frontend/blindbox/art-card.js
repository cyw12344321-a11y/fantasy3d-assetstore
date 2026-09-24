import {choose,characterName} from './i18n.js';
const names={imp:'捣蛋鬼',goblin:'哥布林',skeleton:'小骷髅',ghost:'幽灵',reaper:'死神',doll:'诅咒娃娃',cat:'幸运猫',star:'福星',fairy:'小仙女',matchmaker:'月老',fortune:'财神',unicorn:'独角兽'};
export const artAssets=Object.fromEntries(Object.entries(names).map(([id,name])=>[id,{src:`/blindbox/art/${id}-couture-v1.webp`,thumb:`/blindbox/art/${id}-couture-v1-thumb.webp`,name,background:id==='imp'?'#131b1a':'#d4d7dd',ink:id==='imp'?'#e4eee7':'#243c34'}]));
const images=new Map();
let animateArt=true;
export function setArtAnimation(value){animateArt=value;}
export async function ensureArt(id){
  if(!artAssets[id])return;
  let image=images.get(id);
  if(!image){image=new Image();image.src=artAssets[id].src;images.set(id,image);}
  try{await image.decode();}catch(error){images.delete(id);throw error;}
}
export function drawArt(ctx,width,height,time=0,reduced=false,id='imp'){
  const artwork=images.get(id),asset=artAssets[id];
  if(!artwork?.complete||!artwork.naturalWidth)return false;
  ctx.save();ctx.fillStyle=asset.background;ctx.fillRect(0,0,width,height);
  const margin=height*.08,scale=Math.min(width*.96/artwork.width,(height-margin*2)/artwork.height);
  const zoom=reduced||!animateArt?1:1+Math.sin(time*.6)*.009;
  const w=artwork.width*scale*zoom,h=artwork.height*scale*zoom;
  ctx.drawImage(artwork,(width-w)/2,(height-h)/2,w,h);ctx.restore();return true;
}
export function setupArtCard(stage){
  const canvas=document.createElement('canvas');canvas.id='art-card';canvas.setAttribute('aria-label','捣蛋鬼原创动态角色卡');canvas.hidden=true;
  stage.insertBefore(canvas,stage.firstChild);const ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active=false,current='imp',start=performance.now();
  stage.addEventListener('pointermove',e=>{if(!active||reduced||!animateArt||e.pointerType==='touch')return;const r=stage.getBoundingClientRect();canvas.style.transform=`perspective(1400px) rotateY(${(e.clientX-r.left-r.width/2)/r.width*4}deg) rotateX(${-(e.clientY-r.top-r.height/2)/r.height*3}deg)`;});
  stage.addEventListener('pointerleave',()=>canvas.style.transform='');
  return {
    set(id){active=Boolean(artAssets[id]);current=id;start=performance.now();canvas.style.transform='';canvas.hidden=!active;stage.dataset.art=id||'';stage.classList.toggle('art-active',active);if(active){canvas.setAttribute('aria-label',characterName({id,name:artAssets[id].name})+choose('原创动态角色卡',' illustrated character card'));ensureArt(id).catch(()=>{});}},
    frame(){if(!active)return;const r=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);const w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}if(!drawArt(ctx,w,h,(performance.now()-start)/1000,reduced,current)){canvas.hidden=true;stage.classList.remove('art-active');}else{canvas.hidden=false;stage.classList.add('art-active');}}
  };
}
