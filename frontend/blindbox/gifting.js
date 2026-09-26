import {locale,choose,format,tr,characterName} from './i18n.js';
export function setupGifting(api, reveal) {
  const $=id=>document.getElementById(id);
  let incoming=null, sent=[];
  try{const stored=JSON.parse(localStorage.getItem('fantasy3d-sent-v1')||'[]');if(Array.isArray(stored))sent=stored.filter(v=>v&&typeof v.token==='string'&&typeof v.ownerToken==='string').slice(0,12);}catch{}
  const form=$('draw-form');
  const fields=document.createElement('div');fields.className='gift-fields';
  fields.innerHTML='<label for="sender">你的昵称（可选）</label><input id="sender" maxlength="24" placeholder="让对方知道是你" autocomplete="off"><div class="gift-selects"><label>我们的关系<select id="relationship"><option value="friend">朋友</option><option value="partner">恋人</option><option value="colleague">同事</option><option value="family">家人</option></select></label><label>这次为了<select id="occasion"><option value="everyday">逗你开心</option><option value="birthday">生日快乐</option><option value="cheer">给你打气</option><option value="sorry">认真道歉</option></select></label></div>';
  form.insertBefore(fields,form.querySelector('fieldset'));
  const personal=document.createElement('label');personal.className='personal-note';personal.textContent=choose('留一句想说的话（可以不填）','One line in your own words (optional)');const note=document.createElement('textarea');note.id='gift-note';note.maxLength=60;note.rows=2;note.placeholder=choose('昵称和留言会出现在分享链接中，请勿填隐私信息。','Use nicknames. Anyone with the link can see your message.');personal.append(note);form.insertBefore(personal,form.querySelector('fieldset'));
  function save(){try{localStorage.setItem('fantasy3d-sent-v1',JSON.stringify(sent));}catch{$('status').textContent=tr('此浏览器无法保存发送记录；请自行保管分享链接。');}}
  function list(){
    $('outgoing').hidden=!sent.length;$('sent-gifts').replaceChildren();
    for(const gift of sent){const row=document.createElement('div');row.className='sent-gift';const label=document.createElement('span');label.textContent=format('给 {name} · {character}','For {name} · {character}',{name:gift.name,character:gift.characterId?characterName({id:gift.characterId,name:gift.characterName}):gift.characterName});const status=document.createElement('span');status.className='receipt';status.setAttribute('role','status');status.textContent=gift.revoked?tr('已撤回'):tr('尚未查询回应');
      const check=document.createElement('button');check.textContent=tr('查看回应');check.disabled=Boolean(gift.revoked);
      check.onclick=async()=>{check.disabled=true;try{const r=await api('/api/blindbox/gifts/'+encodeURIComponent(gift.token),{headers:{Authorization:'Bearer '+gift.ownerToken}});status.textContent=r.revoked?tr('已撤回'):format('逗笑 {smile} · 收到心意 {thanks}','Smiles {smile} · Thanks {thanks}',{smile:r.smile,thanks:r.thanks});}catch(e){status.textContent=e.message;}finally{check.disabled=Boolean(gift.revoked);}};
      const revoke=document.createElement('button');revoke.textContent=tr('撤回');revoke.disabled=Boolean(gift.revoked);revoke.onclick=async()=>{if(!confirm(tr('撤回后，朋友将无法再打开这份惊喜。确定撤回吗？')))return;revoke.disabled=true;try{await api('/api/blindbox/gifts/'+encodeURIComponent(gift.token)+'/revoke',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+gift.ownerToken},body:'{}'});gift.revoked=true;save();list();}catch(e){status.textContent=e.message;revoke.disabled=false;}};
      row.append(label,status,check,revoke);$('sent-gifts').append(row);
    }
  }
  $('open-gift').onclick=()=>{if(!incoming)return;$('gift-envelope').hidden=true;reveal(incoming);$('gift-reactions').hidden=false;};
  for(const button of document.querySelectorAll('[data-reaction]'))button.onclick=async()=>{
    if(!incoming)return;button.disabled=true;
    try{await api('/api/blindbox/gifts/'+encodeURIComponent(incoming.token)+'/react',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({reaction:button.dataset.reaction})});$('reaction-status').textContent=tr('回应已送到。');}
    catch(e){$('reaction-status').textContent=e.message;}finally{button.disabled=false;}
  };
  list();
  return {
    details:()=>({sender:$('sender').value,relationship:$('relationship').value,occasion:$('occasion').value,locale,note:note.value}),
    remember(r){if(!r.ownerToken)return;sent.unshift({token:r.token,ownerToken:r.ownerToken,name:r.name,characterName:characterName(r.character),characterId:r.character.id});sent=sent.slice(0,12);save();list();},
    receive(r){incoming=r;document.body.classList.add('receiving');form.hidden=true;$('gift-envelope').hidden=false;$('gift-address').textContent=format('{sender}给 {name} 留了一份惊喜。','{sender} left a little surprise for {name}.',{sender:r.sender||choose('有人','Someone'),name:r.name});$('status').textContent=choose('不用注册，也能收下这份心意。','No account needed. This one is for you.');},
    returnGift(){if(!incoming)return false;const r=incoming;incoming=null;document.body.classList.remove('receiving');history.replaceState({},'','/?lang='+locale);form.hidden=false;$('gift-envelope').hidden=true;$('gift-reactions').hidden=true;$('result').hidden=true;$('recipient').value=r.sender||'';$('sender').value=r.name;$('relationship').value=r.relationship||'friend';$('occasion').value='everyday';note.value='';$('recipient').focus();return true;}
  };
}
