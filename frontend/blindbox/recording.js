import { drawArt, artAssets, ensureArt } from './art-card.js';
import {choose,tr,characterName} from './i18n.js';

export function supportedRecordingType() {
  if (!window.MediaRecorder || !HTMLCanvasElement.prototype.captureStream) return null;
  return ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'].find(t => MediaRecorder.isTypeSupported(t)) || null;
}

export async function recordStage({ scene, camera, result, signal, onProgress, portrait = true, duration = 12000 }) {
  const mimeType = supportedRecordingType();
  if (!mimeType) throw Error(tr('当前浏览器不支持录屏，请使用新版 Chrome 或 Edge。'));
  if(artAssets[result.character.id]){try{await ensureArt(result.character.id);}catch{throw Error(tr('角色原画未能加载，请检查网络后重试。'));}}
  if(signal?.aborted)throw Error(tr('录屏已取消。'));
  const width = portrait ? 1080 : 1920, height = portrait ? 1920 : 1080;
  if(!artAssets[result.character.id])throw Error(tr('角色原画未能加载，请检查网络后重试。'));
  const canvas = document.createElement('canvas');canvas.width=width;canvas.height=height;
  const ctx=canvas.getContext('2d');const stream=canvas.captureStream(30);
  const chunks=[];let timer,frame,audio,recorder,settled=false;
  try {
    const Audio = window.AudioContext || window.webkitAudioContext;
    if(Audio){audio=new Audio();await audio.resume();const dest=audio.createMediaStreamDestination();const gain=audio.createGain();gain.gain.value=.08;gain.connect(dest);
      for(let i=0;i<Math.ceil(duration/500);i++){const oscillator=audio.createOscillator(),envelope=audio.createGain(),start=audio.currentTime+i*.5;oscillator.type='sine';oscillator.frequency.value=[523.25,659.25,783.99,659.25,587.33,698.46][i%6];envelope.gain.setValueAtTime(0,start);envelope.gain.linearRampToValueAtTime(.5,start+.015);envelope.gain.exponentialRampToValueAtTime(.001,start+.4);oscillator.connect(envelope);envelope.connect(gain);oscillator.start(start);oscillator.stop(start+.45);}
      dest.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
    }
    recorder=new MediaRecorder(stream,{mimeType,videoBitsPerSecond:8000000,audioBitsPerSecond:128000});
    const started=performance.now();
    function draw(){
      const art=artAssets[result.character.id];
      const isArt=drawArt(ctx,width,height-300,(performance.now()-started)/1000,matchMedia('(prefers-reduced-motion: reduce)').matches,result.character.id,true);
      if(isArt){ctx.fillStyle=art.background;ctx.fillRect(0,height-300,width,300);}
      ctx.fillStyle=isArt?art.ink:'#244e3c';ctx.font='bold 32px sans-serif';ctx.textAlign='left';ctx.fillText('FANTASY3D / SURPRISE CLUB',64,90);ctx.textAlign='center';ctx.font='bold 52px sans-serif';ctx.fillText(characterName(result.character),width/2,height-235);ctx.font='32px sans-serif';
      const elapsed=performance.now()-started;
      const line=result.story?.[Math.min(3,Math.floor(elapsed/3750))]||`${result.name}，今天的快乐由我承包。`;
      const lines=[];let current='';for(const letter of [...line]){if(ctx.measureText(current+letter).width>width-128){lines.push(current);current='';}current+=letter;}if(current)lines.push(current);
      lines.forEach((text,i)=>ctx.fillText(text,width/2,height-165+i*42));
      onProgress(Math.min(1,elapsed/duration));frame=requestAnimationFrame(draw);
    }
    await new Promise((resolve,reject)=>{
      const abort=()=>{if(settled)return;settled=true;if(recorder.state!=='inactive')recorder.stop();reject(Error(tr('录屏已取消。')));};
      const hidden=()=>{if(document.hidden)abort();};
      signal?.addEventListener('abort',abort,{once:true});document.addEventListener('visibilitychange',hidden);
      recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      recorder.onerror=()=>{settled=true;reject(Error(tr('录屏失败，请关闭其他高负载页面后重试。')));};
      recorder.onstop=()=>{document.removeEventListener('visibilitychange',hidden);signal?.removeEventListener('abort',abort);if(!settled){settled=true;resolve();}};
      draw();recorder.start(500);timer=setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},duration);
      if(signal?.aborted)abort();
    });
    const blob=new Blob(chunks,{type:recorder.mimeType || mimeType});
    if(blob.size<1000)throw Error(tr('视频未能生成，请重试。'));
    return {blob,extension:blob.type.includes('mp4')?'mp4':'webm',width,height};
  } finally {clearTimeout(timer);cancelAnimationFrame(frame);if(recorder&&recorder.state!=='inactive')recorder.stop();stream.getTracks().forEach(t=>t.stop());await audio?.close().catch(()=>{});}
}
