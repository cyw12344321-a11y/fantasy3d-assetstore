'use strict';

function publicOrigin(value) {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    const host = url.hostname.toLowerCase();
    // Public release uses a named domain, not an IP or a local-network hostname.
    if (!host.includes('.') || !/^[a-z0-9.-]+$/.test(host) || /^[\d.]+$/.test(host) || /(?:^|\.)(localhost|local|internal|test|invalid|example)$/.test(host)) return null;
    return url.origin;
  } catch { return null; }
}

function releaseConfig(env = { BLINDBOX_SUPPORT_EMAIL: '715341216@qq.com', ...process.env }) {
  const production = Boolean(env.RENDER || env.NODE_ENV === 'production');
  const origin = publicOrigin(env.BLINDBOX_PUBLIC_ORIGIN);
  const persistent = env.BLINDBOX_PERSISTENT_STORAGE === 'true';
  const support = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(env.BLINDBOX_SUPPORT_EMAIL || '') ? env.BLINDBOX_SUPPORT_EMAIL : null;
  return { production, publicOrigin: origin, persistent, support,
    operator: (env.BLINDBOX_OPERATOR_NAME || '').trim().slice(0,160) || null,
    sharingEnabled: production && persistent && Boolean(origin), paymentEnabled: false };
}

const escapeHtml = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function installRelease(app) {
  const config = releaseConfig();
  app.get('/api/blindbox/config', (req,res) => res.set('Cache-Control','no-store').json({
    sharingEnabled: config.sharingEnabled, publicOrigin: config.publicOrigin,
    paymentEnabled: false, supportEmail: config.support, operatorName: config.operator
  }));
  app.get('/gift-info', (req,res) => {
    const zh = req.query.lang === 'zh', t = (cn,en) => zh ? cn : en;
    const sections = [
      [t('免费预览与服务范围','Free preview and service scope'),t('目前不收款、不提供付费抽奖或订阅。角色是插画动态效果，不是独立骨骼动画模型。网站不承诺关系改善、财运或抽中有现金价值的奖品。','No payments, paid draws or subscriptions are enabled. Characters use animated illustrations, not independently rigged 3D models. No relationship, financial or prize-value outcomes are promised.')],
      [t('礼物隐私','Gift privacy'),t('昵称和留言编码在分享链接中，签名用于防篡改，不是加密。任何拿到链接的人都可读取内容；不要填写秘密、联系方式或敏感信息。链接也可能出现在浏览器记录和托管平台访问日志中。礼物 30 天后失效；发送者可在原浏览器撤回，但无法删除别人已经保存的副本。','Names and messages are encoded in the link. A signature prevents tampering; it is not encryption. Anyone with the link can read its content. Do not include secrets, contact details or sensitive information. Links may appear in browser history and hosting access logs. Gifts expire after 30 days. Senders can revoke access from the original browser, but cannot erase copies others have saved.')],
      [t('账号与数据管理','Accounts and data controls'),t('账号保存用户名、加盐密码哈希、恢复码哈希及角色收藏，登录会话最长 7 天。登录后可导出自己的账号资料，或输入密码永久删除账号并退出所有设备。礼物不关联账号，删除账号不会撤回匿名礼物，请先在“我送出的惊喜”中撤回。','Accounts store usernames, salted password hashes, recovery-code hashes and character collections. Sessions last up to seven days. Sign in to export your account data or confirm your password to delete the account and invalidate all sessions. Anonymous gifts are not linked to accounts: revoke them in Gifts I sent before deleting an account.')],
      [t('设备记录、备份与分析','Device records, backups and analytics'),t('游客收藏、语言偏好和发送控制记录仅保存在当前浏览器，清除浏览器网站数据会失去这些记录。本站未启用广告像素或第三方分析。删除账号会立即移除在线账号数据；历史备份如存在，仍需经营者按保留规则处理。公开运营前必须确定备份保留期限。','Guest collections, language preferences and sent-gift controls stay in this browser; clearing site data removes them. No advertising pixels or third-party analytics are enabled. Account deletion removes the live account immediately; historical backups, if any, require operator handling under a retention policy. Backup retention must be finalized before public operations.')],
      [t('内容与使用边界','Content and use'),t('请只使用有权使用的名字与内容，不用于冒充、骚扰、仇恨或欺诈。收礼人不需要注册、回应或回送。付费商品、价格和退款条款尚未发布，不能据此页面进行付费交易。','Use only names and content you have permission to use. Do not impersonate, harass, promote hate or defraud. Recipients do not need to sign up, react or return a gift. Paid products, prices and refund terms have not been published; this page does not authorize a paid transaction.')]
    ];
    const contact=config.support ? '<a href="mailto:'+escapeHtml(config.support)+'">'+escapeHtml(config.support)+'</a>' : escapeHtml(t('客服信息尚未配置，暂不开放正式营业。','Support is not configured. The service is not ready for commercial launch.'));
    res.set({'Cache-Control':'no-store','X-Robots-Tag':'noindex, nofollow'}).type('html').send('<!doctype html><html lang="'+(zh?'zh':'en')+'"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Fantasy3D · '+t('隐私与服务说明','Privacy and service information')+'</title><link rel="stylesheet" href="/blindbox/info.css"></head><body><main><a href="/?lang='+(zh?'zh':'en')+'">← Fantasy3D</a><nav><a href="?lang=zh">简体中文</a> · <a href="?lang=en">English</a></nav><h1>'+t('隐私与服务说明','Privacy and service information')+'</h1><p>'+t('预览版说明，并非已完成全球合规审查的商业条款。','Preview information, not globally reviewed commercial terms.')+'</p>'+sections.map(([title,body])=>'<section><h2>'+escapeHtml(title)+'</h2><p>'+escapeHtml(body)+'</p></section>').join('')+'<section><h2>'+t('经营者与联系','Operator and contact')+'</h2><p>'+escapeHtml(config.operator||t('经营者信息尚未配置','Operator details are not configured'))+'</p><p>'+contact+'</p></section></main></body></html>');
  });
  return config;
}
module.exports = { releaseConfig, publicOrigin, installRelease };
