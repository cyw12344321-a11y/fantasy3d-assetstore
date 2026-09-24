import {nativeLanguages,resolveLanguage} from './locale-policy.mjs';
import {resourcesReady,translateText,interpolate} from './locale-text.mjs';
const requested=new URLSearchParams(location.search).get('lang');
let saved;try{saved=localStorage.getItem('fantasy3d-language');}catch{}
const availableLanguages=nativeLanguages.filter(item=>resourcesReady||['en','zh'].includes(item.code));
export const languageChoice=resolveLanguage({requested,saved,browser:navigator.languages||[navigator.language],available:availableLanguages.map(item=>item.code)});
export const locale=languageChoice.locale;
export const choose=(zh,en)=>locale==='zh'?zh:translateText(en,locale);
export const format=(zh,en,values)=>interpolate(choose(zh,en),values);
export const characterNames={imp:'Little Mischief',goblin:'Pocket Tinkerer',skeleton:'Bony Buddy',ghost:'Little Wisp',reaper:'Night Keeper',doll:'Patchwork Pal',cat:'Lucky Cat',star:'Wish Star',fairy:'Petal Fairy',matchmaker:'Yue Lao',fortune:'Fortune Keeper',unicorn:'Dream Unicorn'};
export const characterName=c=>locale==='zh'?c.name:translateText(characterNames[c.id]||c.name,locale);
export const translations={
 '持久化存储尚未配置，暂时无法创建礼物。':'Gift creation is unavailable until persistent storage is configured.','请登录后管理账号资料。':'Sign in to manage your data.',
 '可旋转的三维盲盒角色':'Interactive gift display','小剧场播放进度':'Story progress','这个分享链接无效或已失效。':'This gift link is invalid or expired.','三维显示已中断，请刷新页面重试。':'The display was interrupted. Please reload the page.','已开盒；浏览器未允许保存本机收藏。':'Gift created. This browser could not save your collection.','送你一个 Fantasy3D 惊喜':'A Fantasy3D surprise for you','已撤回':'Revoked','尚未查询回应':'Reactions not checked yet','查看回应':'Check reactions','撤回':'Revoke','撤回后，朋友将无法再打开这份惊喜。确定撤回吗？':'Your friend will no longer be able to open this gift. Revoke the link?','回应已送到。':'Your reaction has been sent.','此浏览器无法保存发送记录；请自行保管分享链接。':'This browser could not save your sent-gift controls. Keep the link yourself.',
 '惊喜盲盒':'Surprise gifts','我的图鉴':'My collection','办公区 ↗':'Office ↗','进入 AI 办公区 ↗':'AI office ↗','登录 / 注册':'Log in / Sign up',
 '小小惊喜事务所':'A little thought, delivered.','给那个你想到的人。':'FOR SOMEONE ON YOUR MIND','惊喜礼物':'Surprise gifts',
 '一句没说出口的话，':'For the words you haven’t said.','让它替你送到。':'Let a little character say them.',
 '拆开这份惊喜 ↗':'Open your surprise ↗','送给谁':'Who is it for?','朋友的名字':'Their nickname','盲盒类型':'Gift mood','整蛊 PRANK':'PLAYFUL','祝福 BLESS':'KIND',
 '打开惊喜':'Preview my gift','被你逗笑了':'You made me smile','心意收到了':'That means a lot','重播动画':'Replay','预览好了，发给朋友 ↗':'Share this gift ↗','回送一个':'Send one back','再送一份':'Make another',
 '视频尺寸':'Video format','竖屏 1080 × 1920':'Portrait 1080 × 1920','横屏 1920 × 1080':'Landscape 1920 × 1080','↓ 高清视频':'↓ HD video','取消':'Cancel','下载视频':'Download video','动作':'Motion','跳舞':'Dance','挥手':'Wave','待机':'Idle','轻动态':'Gentle motion',
 '免费体验 · 无需注册':'Free preview · No account needed','抽取概率与分享隐私':'Draw odds & sharing privacy',
 '普通 55% · 稀有 28% · 史诗 13% · 传说 4%。每次独立随机，无付费抽取、保底或现金回售。分享链接含收礼名字，任何持有链接的人都可查看；请使用昵称。游客收藏保存在本机；登录后新抽取的角色保存到账号，游客记录不计入云端收藏。':'Common 55% · Rare 28% · Epic 13% · Legendary 4%. Each free draw is independent. No paid draws, guaranteed wins or cash resale. Anyone with the link can see the recipient nickname; please avoid personal information. Guest collections stay in this browser. New signed-in draws are saved to your account; guest draws are not transferred.',
 '十二种相遇。':'Twelve little personalities.','本机图鉴':'On this device','我送出的惊喜':'Gifts I sent','链接 30 天有效。回执不代表已读；发送记录仅保存在此浏览器。':'Links last 30 days. Reactions are not read receipts. Sent-gift controls are saved only in this browser.',
 'FANTASY3D / 惊喜小剧场':'FANTASY3D / SURPRISE CLUB','免费预览版 · 暂未开放付费':'Free preview · Payments are not enabled',
 '我的账号':'My account','关闭账号窗口':'Close account','账号操作':'Account action','登录':'Log in','注册':'Sign up','恢复账号':'Recover account','用户名':'Username','密码':'Password','3–24 位字母、数字或下划线':'3–24 letters, numbers or underscores','至少 12 位':'At least 12 characters','恢复码':'Recovery code','确认':'Continue','登录后的开盒记录保存在此账号。':'New signed-in draws are saved to this account.','退出登录':'Log out','账号恢复码':'Account recovery code','复制恢复码':'Copy recovery code','忘记密码时凭此码重设密码。不要分享给他人。':'Keep this code to reset a forgotten password. Never share it.',
 '你的昵称（可选）':'Your nickname (optional)','让对方知道是你':'Let them know it’s you','我们的关系':'Our connection','朋友':'Friend','恋人':'Partner','同事':'Colleague','家人':'Family','这次为了':'The occasion','逗你开心':'Just because','生日快乐':'Birthday','给你打气':'Encouragement','认真道歉':'An apology','开启声音':'Sound on','关闭声音':'Sound off','分享链接':'Gift link',
 '正在处理…':'One moment…','恢复码仅本次显示，请妥善保管。':'This recovery code is shown only once. Keep it somewhere safe.','已登录，收藏已同步。':'You’re signed in. Your collection is synced.','恢复码已复制，请保存在安全位置。':'Recovery code copied. Store it safely.','请复制选中的恢复码。':'Copy the selected recovery code.','已退出登录。':'You’re signed out.','服务器尚未启用持久化账号存储，暂不开放注册。':'Accounts are unavailable until persistent storage is configured.','暂时无法同步收藏，请稍后重试。':'Could not sync your collection. Please try again.',
 '当前浏览器不支持视频导出。':'Video export is unavailable in this browser.','惊喜正在路上…':'Getting your surprise ready…','连接超时，请重新开盒。':'The connection timed out. Please try again.','换个名字，再送一份惊喜。':'Make a little surprise for someone else.','分享链接已复制。':'Gift link copied.','请复制下方链接：':'Copy this link:','视频已生成（字幕与音乐，不含浏览器朗读音轨）。':'Video ready, with captions and music. Browser narration is not included.',
 '当前浏览器不支持录屏，请使用新版 Chrome 或 Edge。':'Video recording is not supported. Try a recent Chrome or Edge browser.','角色原画未能加载，请检查网络后重试。':'The artwork did not load. Check your connection and try again.','录屏已取消。':'Recording cancelled.','录屏失败，请关闭其他高负载页面后重试。':'Recording failed. Close other busy tabs and try again.','视频未能生成，请重试。':'Could not create the video. Please try again.',
 '只有发送者可以查看回执。':'Only the sender can view reactions.','只有发送者可以撤回礼物。':'Only the sender can revoke this gift.','礼物已过期。':'This gift has expired.','礼物已失效。':'This gift link is no longer valid.','发送者已撤回这份礼物。':'The sender has revoked this gift.','操作过快，请稍后再试。':'Please wait a moment before trying again.','请选择回应。':'Please choose a reaction.','这份礼物的回执已满。':'This gift has reached its reaction limit.',
 '请填写有效的昵称、关系和送礼场景。':'Please check the nickname, connection and occasion.','请输入 1–24 字的名字，并选择整蛊或祝福。':'Enter a nickname of 1–24 characters and select a mood.','开盒太快了，请稍后再试。':'Please wait before making another gift.','分享链接无效或已被修改。':'This gift link is invalid or has been changed.',
 '请从本站提交操作。':'Please submit this action from this website.','尝试次数过多，请一分钟后再试。':'Too many attempts. Please try again in a minute.','用户名需为 3–24 位字母、数字或下划线；密码需为 12–128 位。':'Use a username of 3–24 letters, numbers or underscores and a password of 12–128 characters.','该用户名不可用。':'That username is unavailable.','暂时无法创建账号。':'Accounts cannot be created right now.','账号或恢复码不正确。':'Incorrect account or recovery code.','账号或密码不正确。':'Incorrect username or password.','账号服务尚未配置持久化存储，暂不开放注册。游客开盒仍可使用。':'Account storage is not ready. You can still make a gift without an account.'
};
export function tr(text){return locale==='zh'?text:translateText(translations[text]||text,locale);}
export function localizeStatic(root=document.body){
 if(locale==='zh')return;
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);let node;
 while((node=walker.nextNode())){if(['SCRIPT','STYLE'].includes(node.parentElement?.tagName))continue;const key=node.textContent.trim(),translated=tr(key);if(translated!==key)node.textContent=node.textContent.replace(key,translated);}
 for(const node of root.querySelectorAll('[placeholder],[aria-label],[title]'))for(const attr of ['placeholder','aria-label','title']){const value=node.getAttribute(attr);if(value)node.setAttribute(attr,tr(value));}
}
export function setupLanguage(){
 document.documentElement.lang=locale;document.documentElement.dir=languageChoice.direction;document.title=choose('Fantasy3D · 惊喜礼物','Fantasy3D · Surprise gifts');
 const select=document.createElement('select');select.id='language';select.setAttribute('aria-label','Language / 语言');for(const {code,label} of availableLanguages){const option=document.createElement('option');option.value=code;option.textContent=label;select.append(option);}document.querySelector('header nav').append(select);select.value=locale;
 select.onchange=()=>{try{localStorage.setItem('fantasy3d-language',select.value);}catch{}const url=new URL(location.href);url.searchParams.set('lang',select.value);location.assign(url);};
 localizeStatic();
 const info=document.createElement('a');info.href='/gift-info?lang='+(locale==='zh'?'zh':'en');info.textContent=choose('隐私与服务说明','Privacy & service (English)');document.querySelector('footer').append(info);
 if(languageChoice.fallback){const notice=document.createElement('p');notice.className='language-notice';notice.setAttribute('role','status');const display=new Intl.DisplayNames([locale],{type:'language'}).of(languageChoice.requested)||languageChoice.requested;notice.textContent=format('{language} 暂未提供译文。当前语言：{current}。','{language} is not available. Current language: {current}.',{language:display,current:availableLanguages.find(item=>item.code===locale).label});document.querySelector('header').after(notice);}
 const local=['localhost','127.0.0.1','[::1]'].includes(location.hostname)||/^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(location.hostname);
 if(local){const notice=document.createElement('p');notice.className='environment-notice';notice.textContent=choose('本地预览 · 尚未开放公网分享或收款。','Local preview · Public sharing and payments are not available.');document.querySelector('header').after(notice);}
}
