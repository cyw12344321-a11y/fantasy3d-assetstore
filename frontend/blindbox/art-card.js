import {choose,characterName} from './i18n.js';
import {artMotion} from './art-motion.mjs';
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
export function drawArt(ctx,width,height,time=0,reduced=false,id='imp',playing=false){
  const artwork=images.get(id),asset=artAssets[id];
  if(!artwork?.complete||!artwork.naturalWidth)return false;
  ctx.save();ctx.fillStyle=asset.background;ctx.fillRect(0,0,width,height);
  const margin=height*.08,scale=Math.min(width*.96/artwork.width,(height-margin*2)/artwork.height);
  const pose=artMotion(time,reduced||!animateArt,playing);
  const w=artwork.width*scale,h=artwork.height*scale;
  ctx.drawImage(artwork,(width-w)/2,(height-h)/2-height*pose.lift,w,h);
  if(pose.heart){
    const {progress,opacity,scale:heartScale}=pose.heart;
    const size=Math.min(w,h)*.075*heartScale;
    ctx.save();ctx.translate(width*.62,height*.58-height*.18*progress);
    ctx.scale(size,size);ctx.globalAlpha=opacity;ctx.fillStyle='#dd5576';
    ctx.beginPath();ctx.moveTo(0,.85);ctx.bezierCurveTo(-1.65,-.15,-.85,-1.25,0,-.55);
    ctx.bezierCurveTo(.85,-1.25,1.65,-.15,0,.85);ctx.fill();ctx.restore();
  }
  ctx.restore();return true;
}
export function setupArtCard(stage){
  const canvas=document.createElement('canvas');canvas.id='art-card';canvas.setAttribute('aria-label','捣蛋鬼原创动态角色卡');canvas.hidden=true;
  stage.insertBefore(canvas,stage.firstChild);const ctx=canvas.getContext('2d');
  const reduced=matchMedia('(prefers-reduced-motion: reduce)').matches;
  let active=false,current='imp',start=performance.now(),playing=false,failed=false,version=0;
  const retry=document.createElement('button');retry.className='art-retry';retry.hidden=true;
  retry.textContent=choose('重新加载角色','Reload character');stage.append(retry);
  const load=()=>{const request=++version;failed=false;retry.hidden=true;ensureArt(current).catch(()=>{if(request===version){failed=true;retry.hidden=false;}});};
  retry.onclick=load;
  return {
    set(id){version++;playing=false;retry.hidden=true;active=Boolean(artAssets[id]);current=id;start=performance.now();canvas.style.transform='';canvas.hidden=!active;stage.dataset.art=id||'';stage.classList.toggle('art-active',active);if(active){canvas.setAttribute('aria-label',characterName({id,name:artAssets[id].name})+choose('原创动态角色卡',' illustrated character card'));load();}},
    play(){start=performance.now();playing=true;},
    frame(){if(!active)return;const r=stage.getBoundingClientRect(),dpr=Math.min(devicePixelRatio,2);const w=Math.round(r.width*dpr),h=Math.round(r.height*dpr);if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;}if(!drawArt(ctx,w,h,(performance.now()-start)/1000,reduced,current,playing)){ctx.fillStyle=artAssets[current].background;ctx.fillRect(0,0,w,h);ctx.fillStyle=artAssets[current].ink;ctx.font=`${16*dpr}px sans-serif`;ctx.textAlign='center';ctx.fillText(failed?choose('角色暂未加载','Character unavailable'):choose('正在加载角色…','Loading character…'),w/2,h/2);}}
  };
}
