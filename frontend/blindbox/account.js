import {tr,choose} from './i18n.js';
export function setupAccount(api, onUser) {
  const $ = id => document.getElementById(id);
  let current = null, revision = 0;
  const controls=document.createElement('div');controls.className='data-controls';
  const exportButton=document.createElement('button');exportButton.id='export-account';exportButton.type='button';exportButton.textContent=choose('导出账号资料','Export account data');
  const deleteForm=document.createElement('form');deleteForm.id='delete-account-form';
  const warning=document.createElement('p');warning.textContent=choose('删除账号会清除收藏并退出所有设备，但不会撤回匿名礼物。请先撤回礼物。','Deleting your account removes collections and signs out all devices. Revoke anonymous gifts first; deletion does not revoke them.');
  const label=document.createElement('label');label.htmlFor='delete-password';label.textContent=choose('输入当前密码确认删除','Current password to confirm deletion');
  const password=document.createElement('input');password.id='delete-password';password.type='password';password.autocomplete='current-password';password.required=true;password.maxLength=128;
  const deleteButton=document.createElement('button');deleteButton.type='submit';deleteButton.textContent=choose('永久删除账号','Permanently delete account');
  const details=document.createElement('details');const summary=document.createElement('summary');summary.textContent=choose('删除账号','Delete account');details.append(summary);
  deleteForm.append(warning,label,password,deleteButton);details.append(deleteForm);controls.append(exportButton,details);$('account-profile').append(controls);
  exportButton.onclick=async()=>{
    exportButton.disabled=true;
    try{const data=await api('/api/blindbox/account/export');const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const link=document.createElement('a');link.href=url;link.download='fantasy3d-account.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),30000);}
    catch(error){$('account-message').textContent=error.message;}
    finally{exportButton.disabled=false;}
  };
  deleteForm.onsubmit=async event=>{
    event.preventDefault();
    if(!confirm(choose('永久删除账号及收藏？此操作不能撤销。','Permanently delete this account and collection? This cannot be undone.')))return;
    deleteButton.disabled=true;
    try{await api('/api/blindbox/account/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({password:password.value})});apply(null);$('recovery-code').value='';$('recovery-result').hidden=true;$('account-message').textContent=choose('账号已删除，所有登录已失效。','Account deleted. All sessions have been invalidated.');}
    catch(error){$('account-message').textContent=error.message;}
    finally{password.value='';deleteButton.disabled=false;}
  };
  function apply(user) {
    revision++;
    current = user;
    $('account-button').textContent = user ? user.username : tr('登录 / 注册');
    $('account-profile').hidden = !user;
    $('account-form').hidden = Boolean(user);
    $('account-name').textContent = user ? user.username : '';
    onUser(user);
  }
  $('account-button').onclick = () => $('account-dialog').showModal();
  $('account-close').onclick = () => $('account-dialog').close();
  $('account-mode').onchange = () => {
    $('recovery-field').hidden = $('account-mode').value !== 'recover';
    $('account-password').autocomplete = $('account-mode').value === 'login' ? 'current-password' : 'new-password';
    $('account-message').textContent = '';
  };
  $('account-form').onsubmit = async event => {
    event.preventDefault(); $('account-submit').disabled = true;
    $('account-message').textContent = tr('正在处理…');
    try {
      const data = await api('/api/blindbox/account/' + $('account-mode').value, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: $('account-username').value.trim(), password: $('account-password').value, recoveryCode: $('account-recovery').value.trim() })
      });
      $('account-password').value = ''; $('account-recovery').value = '';
      apply(data.user);
      $('recovery-result').hidden = !data.recoveryCode;
      $('recovery-code').value = data.recoveryCode || '';
      $('account-message').textContent = data.recoveryCode ? tr('恢复码仅本次显示，请妥善保管。') : tr('已登录，收藏已同步。');
    } catch (error) { $('account-message').textContent = error.message; }
    finally { $('account-submit').disabled = false; }
  };
  $('recovery-copy').onclick = async () => {
    try { await navigator.clipboard.writeText($('recovery-code').value); $('account-message').textContent = tr('恢复码已复制，请保存在安全位置。'); }
    catch { $('recovery-code').select(); $('account-message').textContent = tr('请复制选中的恢复码。'); }
  };
  $('account-dialog').addEventListener('close', () => { $('recovery-code').value = ''; $('recovery-result').hidden = true;password.value=''; });
  $('logout').onclick = async () => {
    try { await api('/api/blindbox/account/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });apply(null);$('account-message').textContent=tr('已退出登录。'); }
    catch (error) { $('account-message').textContent=error.message; }
  };
  window.addEventListener('focus', () => { if (current) refresh(); });
  async function refresh() {
    const started = revision;
    try {
      const data = await api('/api/blindbox/account');
      if (started === revision) apply(data.user);
      if (data.available === false) { $('account-submit').disabled = true; $('account-message').textContent = tr('服务器尚未启用持久化账号存储，暂不开放注册。'); }
    }
    catch { $('account-message').textContent = tr('暂时无法同步收藏，请稍后重试。'); }
  }
  refresh();
  return { apply };
}
