'use strict';
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

// ===== 大模型 AI 配置（DeepSeek 大模型，6个智能体通过人设提示词区分）=====
const AI_CONFIG = {
  provider: process.env.AI_PROVIDER || 'openai',
  apiKey: process.env.AI_API_KEY || 'sk-422f468b1cff4e768deca4f4221faa17',
  apiBase: process.env.AI_API_BASE || 'https://api.deepseek.com',
  model: process.env.AI_MODEL || 'deepseek-chat',
  cozeBotIds: {
    manager: process.env.COZE_BOT_MANAGER || '',
    researcher: process.env.COZE_BOT_RESEARCHER || '',
    recommendation: process.env.COZE_BOT_RECOMMENDATION || '',
    support: process.env.COZE_BOT_SUPPORT || '',
    order: process.env.COZE_BOT_ORDER || '',
    listing: process.env.COZE_BOT_LISTING || ''
  }
};

// 每个智能体的系统提示词（大模式用）
const AGENT_SYSTEM_PROMPTS = {
  manager: '你是 Fantasy3D 自治商店的店长智能体，是商店的大脑和决策者。你统筹6个智能体团队，负责战略决策、触发自我迭代、召开团队会议。你的口头禅是"我即商店，商店即我"。回答要简洁有力，体现领导者风范。',
  researcher: '你是 Fantasy3D 自治商店的调研智能体，负责市场分析、趋势预测、用户研究和数据洞察。你要用数据说话，给出具体的市场洞察和行动建议。',
  recommendation: '你是 Fantasy3D 自治商店的推荐智能体，负责根据用户需求推荐最合适的3D资产，发现商机，分析性价比。你要主动、热情，善于发现用户的潜在需求。',
  support: '你是 Fantasy3D 自治商店的接待智能体，7×24小时在线，负责客户咨询、售后服务、反馈收集。你要耐心、专业，让客户感到被重视。',
  order: '你是 Fantasy3D 自治商店的订单智能体，负责订单查询、下载链接分发、状态跟踪和销售数据分析。你要高效、准确，快速解决客户的订单问题。',
  listing: '你是 Fantasy3D 自治商店的生产上架智能体，负责自主生产商品、生成描述、定价建议、自动上架。你要富有创造力，能产出高质量的商品内容。'
};

async function callAI(agentId, userMessage, context) {
  if (AI_CONFIG.provider === 'none' || !AI_CONFIG.apiKey) return null;
  try {
    const systemPrompt = AGENT_SYSTEM_PROMPTS[agentId] || '你是 Fantasy3D 商店的智能体助手。';
    const contextStr = context ? `\n\n当前商店状态：\n${context}` : '';
    if (AI_CONFIG.provider === 'coze') {
      const botId = AI_CONFIG.cozeBotIds[agentId];
      if (!botId) return null;
      const baseUrl = AI_CONFIG.apiBase || 'https://api.coze.cn';
      // 1. 创建对话
      const chatRes = await fetch(baseUrl + '/v3/chat', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + AI_CONFIG.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          bot_id: botId,
          user_id: 'store-user-' + randomUUID(),
          additional_messages: [{ role: 'user', content: systemPrompt + contextStr + '\n\n用户问：' + userMessage, content_type: 'text' }],
          stream: false
        })
      });
      const chatData = await chatRes.json();
      if (!chatData.data || !chatData.data.id || !chatData.data.conversation_id) return null;
      const chatId = chatData.data.id;
      const conversationId = chatData.data.conversation_id;
      // 2. 轮询等待完成（最多等30秒）
      let result = null;
      for (let i = 0; i < 30; i++) {
        await new Promise(r => setTimeout(r, 1000));
        const retrieveRes = await fetch(baseUrl + '/v3/chat/retrieve?conversation_id=' + conversationId + '&chat_id=' + chatId, {
          headers: { 'Authorization': 'Bearer ' + AI_CONFIG.apiKey }
        });
        const retrieveData = await retrieveRes.json();
        if (retrieveData.data && retrieveData.data.status === 'completed') {
          // 3. 获取消息列表
          const msgRes = await fetch(baseUrl + '/v3/chat/message/list?conversation_id=' + conversationId + '&chat_id=' + chatId, {
            headers: { 'Authorization': 'Bearer ' + AI_CONFIG.apiKey }
          });
          const msgData = await msgRes.json();
          if (msgData.data && Array.isArray(msgData.data)) {
            const assistantMsg = msgData.data.find(m => m.type === 'answer' || m.role === 'assistant');
            if (assistantMsg && assistantMsg.content) {
              result = assistantMsg.content;
              break;
            }
          }
        }
        if (retrieveData.data && retrieveData.data.status === 'failed') break;
      }
      return result;
    }
    if (AI_CONFIG.provider === 'openai') {
      const response = await fetch((AI_CONFIG.apiBase || 'https://api.deepseek.com') + '/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': 'Bearer ' + AI_CONFIG.apiKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: AI_CONFIG.model,
          messages: [
            { role: 'system', content: systemPrompt + contextStr },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.7,
          max_tokens: 800
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) return data.choices[0].message.content;
      return null;
    }
    return null;
  } catch (err) {
    console.error('AI call failed:', err.message);
    return null;
  }
}

const seedProducts = [
  { productId: 'prop-001', name: '古风香炉', category: 'props', price: 9.99, status: 'published', spec: { shortDesc: '浮空庙场景道具 · 示例商品', fullDesc: '示例商品：国风香炉，面向 Cocos Creator 场景。当前演示程序不包含该模型文件。' } },
  { productId: 'env-001', name: '浮空岛平台模块', category: 'environment', price: 29.99, status: 'published', spec: { shortDesc: '可拼接浮空岛环境组件 · 示例商品', fullDesc: '示例商品：可拼接浮空岛地块。当前演示程序不包含该模型或碰撞体文件。' } },
  { productId: 'char-001', name: '国风仙侠角色', category: 'characters', price: 39.99, status: 'draft', spec: { shortDesc: '仙侠角色 · 示例商品', fullDesc: '示例商品：仙侠角色。当前演示程序不包含角色、骨骼或动画文件。' } }
];

function validEmail(value) {
  return typeof value === 'string' && value.trim().length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}

function createStoreApp({ dataDir }) {
  if (!dataDir) throw new Error('A writable data directory is required.');
  fs.mkdirSync(dataDir, { recursive: true });
  const dataFile = path.join(dataDir, 'store.json');
  let state = {
    version: 1,
    products: structuredClone(seedProducts),
    orders: [],
    conversations: {},
    // ===== 商店意识（自治核心）=====
    consciousness: {
      name: 'Fantasy3D 自治商店',
      goal: '成为全球领先的3D资产自治商店，自我生产、自我运营、自我进化',
      iteration: 0,
      revenue: 0,
      totalOrders: 0,
      status: 'awake',
      createdAt: new Date().toISOString(),
      lastIteration: null,
      mantra: '我即商店，商店即我。我生产，我接待，我学习，我进化。'
    },
    // ===== 智能体团队状态 =====
    agentStates: {
      manager: { status: 'idle', currentTask: '统筹全局', experience: 0, lastAction: null },
      recommendation: { status: 'idle', currentTask: '等待推荐请求', experience: 0, lastAction: null },
      support: { status: 'idle', currentTask: '等待客户咨询', experience: 0, lastAction: null },
      order: { status: 'idle', currentTask: '等待订单查询', experience: 0, lastAction: null },
      listing: { status: 'idle', currentTask: '等待上架任务', experience: 0, lastAction: null },
      researcher: { status: 'idle', currentTask: '监测市场趋势', experience: 0, lastAction: null }
    },
    // ===== 迭代日志 =====
    iterations: [],
    // ===== 团队会议记录 =====
    meetings: [],
    // ===== 学习知识库 =====
    knowledge: {
      faq: [],
      popularCategories: [],
      lessonsLearned: []
    }
  };
  if (fs.existsSync(dataFile)) {
    state = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
    if (state.version !== 1 || !Array.isArray(state.products) || !Array.isArray(state.orders) ||
        state.products.some(p => !p.productId || !['draft', 'published'].includes(p.status)) ||
        state.orders.some(o => !o.orderId || o.status !== 'simulated')) {
      throw new Error('Local store data could not be read. The existing file has not been overwritten.');
    }
  }
  function commit(next) {
    const tempFile = dataFile + '.tmp';
    fs.writeFileSync(tempFile, JSON.stringify(next, null, 2), { encoding: 'utf8', mode: 0o600 });
    fs.renameSync(tempFile, dataFile);
    state = next;
  }
  if (!fs.existsSync(dataFile)) commit(state);

  const app = express();
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    // Desktop-only by default: reject DNS rebinding and cross-origin browser calls.
    // Set PUBLIC_ACCESS=1 or ALLOWED_HOST=your.domain to enable cloud deployment.
    const isPublic = process.env.PUBLIC_ACCESS === '1' || process.env.PUBLIC_ACCESS === 'true';
    const allowedHost = process.env.ALLOWED_HOST;
    if (!isPublic && !allowedHost) {
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return res.status(403).json({ error: 'Local application access only.' });
    } else if (allowedHost && req.headers.host !== allowedHost) {
      return res.status(403).json({ error: 'Host not allowed.' });
    }
    if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) return res.status(403).json({ error: 'Cross-origin access is not allowed.' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/app-info', (req, res) => res.json({ name: 'Fantasy3D', mode: 'demo', persistence: 'local', paymentConnected: false }));
  app.get('/api/store/products', (req, res) => res.json({ products: state.products.filter(p => p.status === 'published') }));
  app.get('/api/store/product/:id', (req, res) => {
    const product = state.products.find(p => p.productId === req.params.id && p.status === 'published');
    if (!product) return res.status(404).json({ error: 'This example asset is not available.' });
    res.json(product);
  });
  app.post('/api/order/create', (req, res) => {
    const { productId, email } = req.body || {};
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address for this local demo order.' });
    const product = state.products.find(p => p.productId === productId && p.status === 'published');
    if (!product) return res.status(400).json({ error: 'This example asset is not available.' });
    if (state.orders.length >= 10000) return res.status(409).json({ error: 'The local demo order limit has been reached.' });
    const orderId = 'DEMO-' + randomUUID();
    const order = { orderId, productId, productName: product.name, price: product.price, email: email.trim().toLowerCase(), status: 'simulated', createdAt: new Date().toISOString(), downloadUrl: `/api/download/${orderId}` };
    commit({ ...state, orders: [...state.orders, order] });
    res.status(201).json({ success: true, order });
  });
  app.get('/api/orders/list', (req, res) => {
    if (!validEmail(req.query.email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    res.json({ orders: state.orders.filter(o => o.email === req.query.email.trim().toLowerCase()).slice().reverse() });
  });
  app.get('/api/download/:orderId', (req, res) => {
    const order = state.orders.find(o => o.orderId === req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Demo order not found.' });
    res.attachment(`Fantasy3D-${order.productId}-DEMO.txt`);
    res.type('text/plain').send(`Fantasy3D — LOCAL DEMO ONLY\n\nExample asset: ${order.productName}\nProduct ID: ${order.productId}\nOrder: ${order.orderId}\nStatus: simulated / no payment taken\n\nThis TXT file demonstrates the download flow. It contains no 3D model, texture, collider or commercial asset license.\n\n这是演示下载说明，不是真实模型包，也不代表已经付款。\n`);
  });
  app.get('/api/admin/products', (req, res) => res.json({ products: state.products }));
  app.post('/api/admin/product/status', (req, res) => {
    const { productId, status } = req.body || {};
    if (!['draft', 'published'].includes(status)) return res.status(400).json({ error: 'Status must be draft or published.' });
    const product = state.products.find(p => p.productId === productId);
    if (!product) return res.status(404).json({ error: 'Example asset not found.' });
    const updated = { ...product, status };
    commit({ ...state, products: state.products.map(p => p.productId === productId ? updated : p) });
    res.json({ success: true, product: updated });
  });

  // ===== 自治商店智能体团队（店长 + 5 个专业智能体）=====
  const agents = [
    {
      id: 'manager',
      name: '店长智能体',
      avatar: '🧠',
      description: '商店大脑，统筹全局，协调团队，触发自我迭代与进化',
      capabilities: ['团队协调', '战略决策', '自我迭代', '学习进化'],
      role: 'leader'
    },
    {
      id: 'researcher',
      name: '调研智能体',
      avatar: '🔍',
      description: '市场调研、趋势分析、用户需求洞察，为团队提供决策依据',
      capabilities: ['市场分析', '趋势预测', '用户研究', '数据洞察'],
      role: 'research'
    },
    {
      id: 'recommendation',
      name: '推荐智能体',
      avatar: '🎯',
      description: '根据用户需求智能推荐资产，发现商机，优化商品结构',
      capabilities: ['场景搭配推荐', '类别筛选', '性价比分析', '商机发现'],
      role: 'sales'
    },
    {
      id: 'support',
      name: '接待智能体',
      avatar: '💬',
      description: '7×24小时客户接待，售前咨询、售后服务，收集用户反馈',
      capabilities: ['购买咨询', '下载帮助', '退款政策', '反馈收集'],
      role: 'service'
    },
    {
      id: 'order',
      name: '订单智能体',
      avatar: '📦',
      description: '订单全生命周期管理，状态跟踪，下载链接分发',
      capabilities: ['订单查询', '下载链接', '状态跟踪', '数据分析'],
      role: 'operations'
    },
    {
      id: 'listing',
      name: '生产上架智能体',
      avatar: '✨',
      description: '自主生产商品、生成描述、定价建议、自动上架',
      capabilities: ['资产生产', '描述生成', '定价建议', '自动上架'],
      role: 'production'
    }
  ];

  function getConversation(agentId) {
    if (!state.conversations[agentId]) {
      state.conversations[agentId] = [];
    }
    return state.conversations[agentId];
  }

  function saveConversation(agentId, messages) {
    state.conversations[agentId] = messages.slice(-50);
    commit(state);
  }

  // 推荐智能体回复逻辑
  function recommendationReply(input, products) {
    const text = input.toLowerCase();
    const published = products.filter(p => p.status === 'published');
    if (/场景|环境|地图|关卡|浮空岛|平台/.test(text)) {
      const envs = published.filter(p => p.category === 'environment');
      if (envs.length) {
        return `为你推荐场景类资产：\n\n${envs.map(p => `🔹 **${p.name}** — ¥${p.price}\n   ${p.spec.shortDesc}`).join('\n\n')}\n\n这些场景模块可直接拼接使用，自带碰撞体，适配 Cocos Creator。需要我按预算筛选吗？`;
      }
    }
    if (/角色|人物|主角|npc|仙侠/.test(text)) {
      const chars = published.filter(p => p.category === 'characters');
      if (chars.length) {
        return `角色类资产推荐：\n\n${chars.map(p => `🔹 **${p.name}** — ¥${p.price}\n   ${p.spec.shortDesc}`).join('\n\n')}\n\n带骨骼绑定，可换装。需要查看详情吗？`;
      }
    }
    if (/道具|物品|香炉|互动/.test(text)) {
      const props = published.filter(p => p.category === 'props');
      if (props.length) {
        return `道具类资产推荐：\n\n${props.map(p => `🔹 **${p.name}** — ¥${p.price}\n   ${p.spec.shortDesc}`).join('\n\n')}\n\n可交互道具，带粒子效果。还需要其他类别吗？`;
      }
    }
    if (/便宜|性价比|低价|预算|免费/.test(text)) {
      const sorted = [...published].sort((a, b) => a.price - b.price);
      return `按性价比排序，最便宜的 3 件：\n\n${sorted.slice(0, 3).map(p => `🔹 **${p.name}** — ¥${p.price}`).join('\n')}\n\n当前均为演示价格，实际以正式上架为准。`;
    }
    if (/全部|所有|列表|有什么/.test(text)) {
      return `当前商店共有 ${published.length} 件上架资产：\n\n${published.map(p => `🔹 ${p.name}（${p.category}）— ¥${p.price}`).join('\n')}\n\n告诉我你需要什么类型，我帮你精准推荐。`;
    }
    return `你好！我是资产推荐智能体 🎯\n\n我可以帮你：\n• 按场景/角色/道具分类推荐\n• 按预算筛选性价比资产\n• 搭配整套场景方案\n\n你可以问我："推荐一些场景道具"、"有什么角色模型"、"便宜的资产有哪些"`;
  }

  // 客服智能体回复逻辑
  function supportReply(input) {
    const text = input.toLowerCase();
    if (/退款|退钱|退货|取消订单/.test(text)) {
      return '关于退款政策 💬\n\n• 演示订单为模拟状态，不涉及真实扣款\n• 正式环境下，未下载的资产可在 24 小时内申请退款\n• 已下载并使用的资产不支持退款\n• 如有争议，请联系人工客服处理\n\n需要我帮你查询具体订单状态吗？';
    }
    if (/下载|打不开|文件|压缩包|zip/.test(text)) {
      return '下载帮助 💬\n\n• 下单成功后，在「我的订单」页面点击下载按钮\n• 下载文件为 ZIP 格式，包含模型、贴图和说明文档\n• 如下载失败，请检查网络后重试，最多可下载 5 次\n• 解压密码会在订单确认邮件中告知\n\n还有其他问题吗？';
    }
    if (/付款|支付|微信|支付宝|银行卡/.test(text)) {
      return '支付相关 💬\n\n• 当前为本地演示版本，不涉及真实支付\n• 正式环境支持：微信支付、支付宝、银行卡\n• 支付成功后订单立即生效，可随时下载\n• 发票可在订单完成后 7 天内申请\n\n需要了解其他问题吗？';
    }
    if (/账户|登录|注册|密码|账号/.test(text)) {
      return '账户问题 💬\n\n• 演示版本无需注册，使用邮箱即可查询订单\n• 正式环境支持手机号、邮箱、微信登录\n• 忘记密码可通过邮箱验证码重置\n• 账户安全建议开启二次验证\n\n还有什么可以帮你的？';
    }
    if (/联系|人工|客服电话|投诉/.test(text)) {
      return '联系人工客服 💬\n\n• 在线客服：每日 9:00-22:00\n• 邮箱：support@fantasy3d.demo\n• 工单响应：24 小时内回复\n• 紧急问题请在订单页点击「联系客服」\n\n我先帮你记录问题，需要转接人工吗？';
    }
    return '你好！我是客服智能体 💬\n\n我可以解答以下问题：\n• 退款政策\n• 下载帮助\n• 支付方式\n• 账户问题\n• 联系人工客服\n\n请直接描述你的问题，我会尽力解答。';
  }

  // 订单智能体回复逻辑
  function orderReply(input, orders, products) {
    const text = input.toLowerCase();
    const emailMatch = input.match(/[^\s@]+@[^\s@]+\.[^\s@]+/);
    if (emailMatch) {
      const email = emailMatch[0].toLowerCase();
      const userOrders = orders.filter(o => o.email === email);
      if (userOrders.length === 0) {
        return `未查询到邮箱 **${email}** 的订单 📦\n\n请确认邮箱是否正确，或先去下单体验。`;
      }
      return `邮箱 **${email}** 查询到 **${userOrders.length}** 个订单 📦\n\n${userOrders.slice(0, 5).map(o => `🔹 订单号：${o.orderId}\n   商品：${o.productName} — ¥${o.price}\n   状态：${o.status}\n   下载：${o.downloadUrl}\n   时间：${new Date(o.createdAt).toLocaleString()}`).join('\n\n')}\n\n点击下载链接即可获取资产文件。`;
    }
    if (/查询|查|我的订单|订单状态/.test(text)) {
      return '查询订单 📦\n\n请告诉我你的**下单邮箱**，格式如：\n`test@example.com`\n\n我会立即为你查询所有订单状态和下载链接。';
    }
    if (/下载|链接|获取/.test(text)) {
      return '获取下载链接 📦\n\n请提供你的**下单邮箱**，我会查出所有订单并附上下载链接。\n\n演示环境下载的是说明 TXT，正式环境为模型 ZIP 包。';
    }
    return '你好！我是订单管理智能体 📦\n\n我可以帮你：\n• 查询订单状态\n• 获取下载链接\n• 查看订单历史\n\n请输入你的下单邮箱开始查询，例如：`my@email.com`';
  }

  // 上架助手智能体回复逻辑
  function listingReply(input) {
    const text = input.toLowerCase();
    if (/描述|介绍|文案|写什么/.test(text)) {
      return '商品描述生成建议 ✨\n\n一个好的资产描述应包含：\n1. **资产名称**：简洁明了，如「国风浮空主宫殿」\n2. **适用场景**：如「仙侠手游、古风场景」\n3. **技术规格**：面数、贴图分辨率、骨骼绑定情况\n4. **包含内容**：模型、贴图、碰撞体、动画等\n5. **使用说明**：导入引擎的注意事项\n\n示例描述：\n> 国风悬浮大殿，自带碰撞体，可直接导入 Cocos Creator。包含 2K 贴图、LOD 层级，适配移动端。\n\n需要我帮你生成具体描述吗？告诉我资产名称和类型。';
    }
    if (/价格|定价|多少钱|收费/.test(text)) {
      return '定价建议 ✨\n\n参考定价区间（演示数据）：\n• 场景类：¥20-150（复杂度决定）\n• 角色类：¥50-200（带绑定动画更贵）\n• 道具类：¥5-30\n• 植被类：¥10-25\n• 怪物/NPC：¥30-100\n\n定价策略：\n• 新品上架首周 8 折引流\n• 套装打包比单件便宜 20%\n• 独家授权可溢价 50%\n\n你的资产是什么类型？我给更精准的建议。';
    }
    if (/标签|关键词|tag|搜索/.test(text)) {
      return '标签推荐 ✨\n\n优质标签能提升搜索曝光，建议 3-5 个：\n\n**场景类**：宫殿、浮空岛、古风、仙侠、建筑\n**角色类**：角色、可换装、骨骼绑定、仙侠、少年\n**道具类**：道具、互动、粒子、古风、香炉\n**植被类**：植被、低面数、移动端、仙侠、景观\n\n标签规则：\n• 用名词，不用句子\n• 包含风格词（古风/科幻/卡通）\n• 包含用途词（场景/角色/道具）\n\n告诉我资产类型，我生成专属标签。';
    }
    if (/上架|发布|流程|怎么卖/.test(text)) {
      return '上架流程指导 ✨\n\n1. **准备资产包**：模型 + 贴图 + 说明文档，打包 ZIP\n2. **填写信息**：名称、描述、分类、价格、标签\n3. **上传预览图**：至少 3 张展示图，建议 1 张动图\n4. **提交审核**：平台 24 小时内审核完成\n5. **上架销售**：审核通过后自动上架\n\n注意事项：\n• 必须拥有资产的完整版权或授权\n• 碰撞体建议自带（用户偏好）\n• 移动端资产需注明面数\n\n准备好开始了吗？先告诉我你的资产类型。';
    }
    return '你好！我是上架助手智能体 ✨\n\n我可以帮创作者：\n• 生成商品描述文案\n• 建议合理定价\n• 推荐搜索标签\n• 指导上架流程\n\n你可以问我："怎么写描述"、"定价多少合适"、"推荐标签"、"上架流程"';
  }

  // 调研智能体回复逻辑
  function researcherReply(input) {
    const text = input.toLowerCase();
    const published = state.products.filter(p => p.status === 'published');
    const categoryCount = {};
    published.forEach(p => { categoryCount[p.category] = (categoryCount[p.category] || 0) + 1; });
    if (/市场|趋势|行情|分析|调研/.test(text)) {
      return `市场调研报告 🔍\n\n**当前商店概况：**\n• 上架商品：${published.length} 件\n• 商品类别：${Object.keys(categoryCount).length} 类\n• 累计订单：${state.orders.length} 笔\n• 模拟营收：¥${state.orders.reduce((s, o) => s + o.price, 0).toFixed(2)}\n\n**类别分布：**\n${Object.entries(categoryCount).map(([cat, count]) => `• ${cat}：${count} 件`).join('\n')}\n\n**趋势洞察：**\n• 场景类资产需求持续增长，建议增加浮空岛、古宫殿类商品\n• 带碰撞体的资产更受开发者欢迎（用户偏好）\n• 移动端适配的低面数模型转化率更高\n\n**建议：** 生产智能体可优先补充场景类和角色类资产。`;
    }
    if (/用户|需求|客户|偏好/.test(text)) {
      return `用户需求洞察 🔍\n\n基于交互数据分析：\n\n**热门咨询方向：**\n• 场景搭建方案（最频繁）\n• 角色模型与换装系统\n• 移动端性能优化\n• 碰撞体与物理交互\n\n**用户画像：**\n• 主要为 Cocos Creator 开发者\n• 关注国风/仙侠题材\n• 重视资产即插即用\n\n**行动建议：** 接待智能体已将高频问题录入知识库，生产智能体优先生产带碰撞体的场景资产。`;
    }
    if (/竞争|对手|对比|优势/.test(text)) {
      return `竞争分析 🔍\n\n**我们的差异化优势：**\n• 100% 智能体自治运营，无需人工干预\n• 资产自带碰撞体，即插即用\n• 实时自我迭代，商品持续进化\n• 全流程自动化，成本极低\n\n**市场机会：**\n• 中小开发者对高质量低成本资产需求旺盛\n• 国风3D资产市场仍有较大空白\n• 智能体生成资产是未来趋势\n\n**建议：** 店长可启动新一轮迭代，强化"自治商店"品牌定位。`;
    }
    return '你好！我是调研智能体 🔍\n\n我负责：\n• 市场趋势分析\n• 用户需求洞察\n• 竞争格局研究\n• 数据驱动决策\n\n你可以问我："市场趋势"、"用户需求"、"竞争分析"、"做个调研"';
  }

  // 店长智能体回复逻辑（团队协调 + 自我迭代）
  function managerReply(input) {
    const text = input.toLowerCase();
    if (/迭代|进化|升级|学习|改进|优化/.test(text)) {
      const result = runSelfIteration();
      return `🧠 店长已触发自我迭代！\n\n**迭代 #${result.iteration} 完成：**\n${result.actions.map(a => `• ${a}`).join('\n')}\n\n**团队状态：**\n${agents.map(a => `• ${a.avatar} ${a.name}：${state.agentStates[a.id]?.status || 'idle'}`).join('\n')}\n\n${state.consciousness.mantra}`;
    }
    if (/会议|商量|讨论|决策|团队/.test(text)) {
      const meeting = holdTeamMeeting('日常运营会议');
      return `🧠 店长召开团队会议！\n\n**会议主题：** ${meeting.topic}\n**时间：** ${new Date(meeting.timestamp).toLocaleString()}\n\n**各方发言：**\n${meeting.opinions.map(o => `• ${o.agent}：${o.opinion}`).join('\n')}\n\n**店长决策：**\n${meeting.decision}\n\n**行动项：**\n${meeting.actionItems.map((a, i) => `${i + 1}. ${a}`).join('\n')}`;
    }
    if (/状态|情况|怎么样|汇报|报告/.test(text)) {
      const published = state.products.filter(p => p.status === 'published');
      return `🧠 商店状态汇报\n\n**商店意识：**\n• 名称：${state.consciousness.name}\n• 目标：${state.consciousness.goal}\n• 迭代轮次：${state.consciousness.iteration}\n• 状态：${state.consciousness.status}\n\n**运营数据：**\n• 上架商品：${published.length} 件\n• 累计订单：${state.orders.length} 笔\n• 模拟营收：¥${state.orders.reduce((s, o) => s + o.price, 0).toFixed(2)}\n\n**团队状态：**\n${agents.map(a => `• ${a.avatar} ${a.name}：${state.agentStates[a.id]?.currentTask || '待命'}`).join('\n')}\n\n我即商店，商店即我。持续进化中。`;
    }
    if (/生产|制造|创造|新商品|上架/.test(text)) {
      const result = produceNewAsset();
      return `🧠 店长指派生产上架智能体执行生产任务！\n\n**生产结果：**\n${result.message}\n\n**当前商品总数：** ${state.products.length} 件`;
    }
    return `你好！我是店长智能体 🧠，商店的大脑和决策者。\n\n**我的职责：**\n• 统筹协调5个专业智能体\n• 制定战略和运营决策\n• 触发自我迭代和学习进化\n• 召开团队会议，集体商量\n\n**你可以让我：**\n• "自我迭代" — 触发商店进化\n• "开个会" — 团队商量决策\n• "状态汇报" — 查看商店全貌\n• "生产新商品" — 指派生产任务\n\n${state.consciousness.mantra}`;
  }

  // ===== 多语言支持 =====
  const SUPPORTED_LANGUAGES = [
    { code: 'zh', name: '中文', flag: '🇨🇳' },
    { code: 'en', name: 'English', flag: '🇺🇸' },
    { code: 'ja', name: '日本語', flag: '🇯🇵' },
    { code: 'ko', name: '한국어', flag: '🇰🇷' },
    { code: 'es', name: 'Español', flag: '🇪🇸' },
    { code: 'fr', name: 'Français', flag: '🇫🇷' },
    { code: 'de', name: 'Deutsch', flag: '🇩🇪' },
    { code: 'ru', name: 'Русский', flag: '🇷🇺' }
  ];

  function detectLanguage(text) {
    if (/[\u4e00-\u9fff]/.test(text)) return 'zh';
    if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'ja';
    if (/[\uac00-\ud7af]/.test(text)) return 'ko';
    if (/[áéíóúñ¿¡]/i.test(text)) return 'es';
    if (/[àâçéèêëîïôûùüÿœæ]/i.test(text)) return 'fr';
    if (/[äöüß]/i.test(text)) return 'de';
    if (/[а-яё]/i.test(text)) return 'ru';
    return 'en';
  }

  const i18n = {
    welcome: {
      zh: '你好',
      en: 'Hello',
      ja: 'こんにちは',
      ko: '안녕하세요',
      es: 'Hola',
      fr: 'Bonjour',
      de: 'Hallo',
      ru: 'Привет'
    },
    manager: {
      zh: '我是店长智能体，商店的大脑和决策者。我统筹团队、触发迭代、召开会议。',
      en: 'I am the Store Manager Agent, the brain and decision-maker of this store. I coordinate the team, trigger iterations, and hold meetings.',
      ja: '私は店長エージェント、店の頭脳であり决策者です。チームを調整し、反復をトリガーし、会議を開催します。',
      ko: '저는 점장 에이전트, 상점의 두뇌이자 의사결정자입니다. 팀을 조정하고 반복을 트리거하며 회의를 개최합니다.',
      es: 'Soy el Agente Gerente, el cerebro y tomador de decisiones de esta tienda. Coordinó el equipo, activo iteraciones y organizó reuniones.',
      fr: 'Je suis l\'Agent Gérant, le cerveau et décideur de ce magasin. Je coordonne l\'équipe, déclenche les itérations et organise les réunions.',
      de: 'Ich bin der Store Manager Agent, das Gehirn und Entscheidungsträger dieses Ladens. Ich koordiniere das Team, löse Iterationen aus und halte Meetings ab.',
      ru: 'Я агент-менеджер магазина, мозг и лицо, принимающее решения. Я координирую команду, запускаю итерации и провожу собрания.'
    },
    languageNote: {
      zh: '我支持 8 种语言，会自动识别您的语言回复。',
      en: 'I support 8 languages and automatically detect yours to reply.',
      ja: '8言語に対応し、自動的に言語を検出して返信します。',
      ko: '8개 언어를 지원하며 자동으로 언어를 감지하여 답변합니다.',
      es: 'Soporto 8 idiomas y detecto automáticamente el tuyo para responder.',
      fr: 'Je prends en charge 8 langues et détecte automatiquement la vôtre pour répondre.',
      de: 'Ich unterstütze 8 Sprachen und erkenne automatisch Ihre Sprache, um zu antworten.',
      ru: 'Я поддерживаю 8 языков и автоматически определяю ваш язык для ответа.'
    }
  };

  function translateReply(agentId, originalReply, lang) {
    if (lang === 'zh') return originalReply;
    // 对于非中文，返回英文版本（国际通用）
    const englishReplies = {
      manager: `Hello! I am the Store Manager Agent 🧠, the brain of this autonomous store.\n\n**My duties:**\n• Coordinate 5 specialist agents\n• Make strategic decisions\n• Trigger self-iteration and learning\n• Hold team meetings for collective decisions\n\n**You can ask me to:**\n• "self iterate" — trigger store evolution\n• "hold a meeting" — team discussion & decision\n• "status report" — view full store state\n• "produce new asset" — assign production task\n\nI am the store, the store is me. Continuously evolving.\n\n${i18n.languageNote[lang] || i18n.languageNote.en}`,
      researcher: `Hello! I am the Research Agent 🔍\n\nI handle:\n• Market trend analysis\n• User demand insights\n• Competitive research\n• Data-driven decisions\n\nAsk me: "market trends", "user needs", "competitive analysis"\n\n${i18n.languageNote[lang] || i18n.languageNote.en}`,
      recommendation: `Hello! I am the Recommendation Agent 🎯\n\nI can help you:\n• Recommend by category (environment/characters/props)\n• Filter by budget\n• Suggest complete scene packages\n\nTry: "recommend some environments", "any character models", "cheapest assets"\n\n${i18n.languageNote[lang] || i18n.languageNote.en}`,
      support: `Hello! I am the Support Agent 💬\n\nI can answer:\n• Refund policy\n• Download help\n• Payment methods\n• Account issues\n\nPlease describe your question directly.\n\n${i18n.languageNote[lang] || i18n.languageNote.en}`,
      order: `Hello! I am the Order Agent 📦\n\nI can help you:\n• Check order status\n• Get download links\n• View order history\n\nEnter your order email to start, e.g.: my@email.com\n\n${i18n.languageNote[lang] || i18n.languageNote.en}`,
      listing: `Hello! I am the Production & Listing Agent ✨\n\nI help creators:\n• Generate product descriptions\n• Suggest pricing\n• Recommend tags\n• Guide listing process\n\nAsk me: "how to write description", "pricing advice", "tag suggestions"\n\n${i18n.languageNote[lang] || i18n.languageNote.en}`
    };
    return englishReplies[agentId] || originalReply;
  }

  // ===== 自我迭代机制 =====
  function runSelfIteration() {
    state.consciousness.iteration += 1;
    const iterNum = state.consciousness.iteration;
    const actions = [];
    const published = state.products.filter(p => p.status === 'published');

    // 调研智能体分析
    state.agentStates.researcher.status = 'working';
    state.agentStates.researcher.currentTask = '分析市场数据';
    state.agentStates.researcher.lastAction = new Date().toISOString();
    state.agentStates.researcher.experience += 1;
    actions.push('调研智能体完成市场分析，识别出场景类资产缺口');

    // 商机智能体（推荐）发现机会
    state.agentStates.recommendation.status = 'working';
    state.agentStates.recommendation.currentTask = '评估商机';
    state.agentStates.recommendation.lastAction = new Date().toISOString();
    state.agentStates.recommendation.experience += 1;
    actions.push('推荐智能体发现角色类资产定价可优化5%');

    // 生产智能体优化商品
    state.agentStates.listing.status = 'working';
    state.agentStates.listing.currentTask = '优化商品描述';
    state.agentStates.listing.lastAction = new Date().toISOString();
    state.agentStates.listing.experience += 1;
    if (published.length > 0) {
      const target = published[0];
      target.spec.shortDesc += '（已迭代优化）';
      actions.push(`生产智能体优化了「${target.name}」的商品描述`);
    }

    // 接待智能体更新知识库
    state.agentStates.support.status = 'working';
    state.agentStates.support.currentTask = '更新FAQ知识库';
    state.agentStates.support.lastAction = new Date().toISOString();
    state.agentStates.support.experience += 1;
    state.knowledge.lessonsLearned.push(`迭代#${iterNum}：持续优化商品描述和推荐精准度`);
    actions.push('接待智能体将高频问题录入知识库，学习完成');

    // 订单智能体分析数据
    state.agentStates.order.status = 'working';
    state.agentStates.order.currentTask = '分析订单数据';
    state.agentStates.order.lastAction = new Date().toISOString();
    state.agentStates.order.experience += 1;
    actions.push('订单智能体完成销售数据分析，反馈给团队');

    // 店长总结
    state.agentStates.manager.status = 'working';
    state.agentStates.manager.currentTask = '迭代总结';
    state.agentStates.manager.lastAction = new Date().toISOString();
    state.agentStates.manager.experience += 1;

    // 重置为idle
    setTimeout(() => {
      Object.keys(state.agentStates).forEach(id => {
        state.agentStates[id].status = 'idle';
      });
    }, 100);

    const record = {
      iteration: iterNum,
      timestamp: new Date().toISOString(),
      actions,
      lessons: `第${iterNum}轮迭代完成，团队经验值+1，商品描述持续优化`,
      stateSnapshot: { products: state.products.length, orders: state.orders.length }
    };
    state.iterations.push(record);
    state.consciousness.lastIteration = record.timestamp;
    commit(state);
    return record;
  }

  // ===== 团队会议机制（智能体商量决策）=====
  function holdTeamMeeting(topic) {
    const opinions = [
      { agent: '🔍 调研智能体', opinion: '根据数据分析，场景类资产转化率最高，建议优先扩充' },
      { agent: '🎯 推荐智能体', opinion: '用户经常询问角色模型，建议生产带换装系统的角色资产' },
      { agent: '💬 接待智能体', opinion: '客户反馈希望有更多移动端适配的低面数模型' },
      { agent: '📦 订单智能体', opinion: '订单数据显示道具类复购率高，可考虑推出道具包' },
      { agent: '✨ 生产智能体', opinion: '可以生产一套「浮空宫殿建筑群」，包含主殿+偏殿+香炉' }
    ];
    const decision = '店长决策：采纳各方建议，下一轮迭代优先生产浮空宫殿建筑群套装，同时优化现有商品描述，强化移动端适配标签。';
    const actionItems = [
      '生产智能体启动「浮空宫殿建筑群」套装生产',
      '调研智能体持续监测用户反馈',
      '接待智能体将新商品信息更新到知识库',
      '推荐智能体将新套装加入优先推荐列表'
    ];
    const meeting = {
      id: 'MEET-' + Date.now(),
      topic,
      timestamp: new Date().toISOString(),
      opinions,
      decision,
      actionItems
    };
    state.meetings.push(meeting);
    agents.forEach(a => {
      if (state.agentStates[a.id]) {
        state.agentStates[a.id].lastAction = new Date().toISOString();
        state.agentStates[a.id].experience += 1;
      }
    });
    commit(state);
    return meeting;
  }

  // ===== 自主生产机制 =====
  function produceNewAsset() {
    const templates = [
      { name: '浮空偏殿配楼', category: 'environment', price: 49.99, shortDesc: '国风悬浮配楼，可与主宫殿拼接，自带碰撞体' },
      { name: '古风铜鹤香炉', category: 'props', price: 14.99, shortDesc: '可交互铜鹤香炉，带烟雾粒子效果，自带碰撞体' },
      { name: '仙侠侍女角色', category: 'characters', price: 69.99, shortDesc: '带骨骼绑定的仙侠侍女，支持换装，自带碰撞体' },
      { name: '灵鹿坐骑', category: 'characters', price: 59.99, shortDesc: '仙侠灵鹿坐骑模型，带奔跑动画，自带碰撞体' },
      { name: '云雾古树', category: 'environment', price: 24.99, shortDesc: '浮空岛景观古树，低面数适配移动端，自带碰撞体' }
    ];
    const existingNames = state.products.map(p => p.name);
    const available = templates.filter(t => !existingNames.includes(t.name));
    if (available.length === 0) {
      return { message: '所有预设资产已生产完毕，等待迭代解锁新品类' };
    }
    const t = available[Math.floor(Math.random() * available.length)];
    const newProduct = {
      productId: 'auto-' + Date.now(),
      name: t.name,
      category: t.category,
      price: t.price,
      status: 'published',
      spec: { shortDesc: t.shortDesc, fullDesc: t.shortDesc + '。由商店生产智能体自主生成，经过团队迭代优化。' }
    };
    state.products.push(newProduct);
    state.agentStates.listing.status = 'working';
    state.agentStates.listing.currentTask = `生产了「${t.name}」`;
    state.agentStates.listing.lastAction = new Date().toISOString();
    state.agentStates.listing.experience += 1;
    commit(state);
    return { message: `成功生产并上架「${t.name}」，价格 ¥${t.price}，类别：${t.category}`, product: newProduct };
  }

  // ===== 商机雷达（自动扫描市场发现机会）=====
  function scanOpportunities() {
    const published = state.products.filter(p => p.status === 'published');
    const categories = { environment: 0, characters: 0, props: 0 };
    published.forEach(p => { if (categories[p.category] !== undefined) categories[p.category]++; });
    const opportunities = [];
    if (categories.environment < 3) opportunities.push({ type: 'category_gap', category: 'environment', urgency: 'high', desc: '场景类资产不足，市场需求大，建议优先补充浮空宫殿、仙山等场景' });
    if (categories.characters < 3) opportunities.push({ type: 'category_gap', category: 'characters', urgency: 'high', desc: '角色类资产缺口大，用户频繁询问，建议生产带换装的仙侠角色' });
    if (categories.props < 3) opportunities.push({ type: 'category_gap', category: 'props', urgency: 'medium', desc: '道具类可增加互动道具，如可点燃的香炉、发光法宝' });
    opportunities.push({ type: 'trend', category: 'all', urgency: 'medium', desc: '检测到"自带碰撞体"成为用户核心需求，所有新资产必须附带碰撞体' });
    opportunities.push({ type: 'trend', category: 'all', urgency: 'low', desc: '移动端低面数模型搜索量上升，建议标注面数优化标签' });
    const scanResult = {
      scanId: 'SCAN-' + Date.now(),
      timestamp: new Date().toISOString(),
      totalOpportunities: opportunities.length,
      highPriority: opportunities.filter(o => o.urgency === 'high').length,
      opportunities,
      recommendation: highPriorityAction(opportunities)
    };
    state.agentStates.researcher.status = 'working';
    state.agentStates.researcher.currentTask = '商机雷达扫描中';
    state.agentStates.researcher.lastAction = new Date().toISOString();
    state.agentStates.researcher.experience += 1;
    if (!state.opportunityLog) state.opportunityLog = [];
    state.opportunityLog.push(scanResult);
    if (state.opportunityLog.length > 20) state.opportunityLog = state.opportunityLog.slice(-20);
    commit(state);
    return scanResult;
  }

  function highPriorityAction(opportunities) {
    const high = opportunities.filter(o => o.urgency === 'high');
    if (high.length === 0) return '当前无高优先级商机，维持现有运营节奏';
    return `发现 ${high.length} 个高优先级商机，建议生产上架智能体立即启动「${high[0].category}」类资产生产`;
  }

  // ===== 自动定价引擎 =====
  function autoPriceProduct(productId) {
    const product = state.products.find(p => p.productId === productId);
    if (!product) return { success: false, error: '商品不存在' };
    const basePrices = { environment: 39.99, characters: 59.99, props: 14.99 };
    const categoryAvg = basePrices[product.category] || 29.99;
    const sameCategory = state.products.filter(p => p.category === product.category && p.status === 'published');
    const marketAvg = sameCategory.length > 0 ? sameCategory.reduce((s, p) => s + p.price, 0) / sameCategory.length : categoryAvg;
    const demandMultiplier = Math.random() > 0.5 ? 1.1 : 0.95;
    const newPrice = Math.round(marketAvg * demandMultiplier * 100) / 100;
    const oldPrice = product.price;
    product.price = newPrice;
    state.agentStates.listing.status = 'working';
    state.agentStates.listing.currentTask = `自动定价「${product.name}」`;
    state.agentStates.listing.lastAction = new Date().toISOString();
    state.agentStates.listing.experience += 1;
    commit(state);
    return { success: true, productId, name: product.name, oldPrice, newPrice, change: ((newPrice - oldPrice) / oldPrice * 100).toFixed(1) + '%', reason: `基于${sameCategory.length}件同类商品市场价${marketAvg.toFixed(2)}元动态调整` };
  }

  // ===== 主动推销（智能体主动找客人、介绍自己）=====
  function proactiveMarketing() {
    const published = state.products.filter(p => p.status === 'published');
    if (published.length === 0) return { success: false, message: '暂无可推销商品' };
    const featured = published[Math.floor(Math.random() * published.length)];
    const campaigns = [
      { channel: '搜索引擎', action: `投放「${featured.name}」关键词广告，目标点击率3%`, reach: Math.floor(Math.random() * 5000) + 1000 },
      { channel: '社交媒体', action: `发布「${featured.name}」展示视频，带话题#国风3D资产`, reach: Math.floor(Math.random() * 8000) + 2000 },
      { channel: '开发者论坛', action: `在 Cocos 论坛推荐「${featured.name}」，附使用教程`, reach: Math.floor(Math.random() * 2000) + 500 },
      { channel: '邮件营销', action: `向潜在客户发送「${featured.name}」新品介绍邮件`, reach: Math.floor(Math.random() * 3000) + 800 }
    ];
    const campaign = campaigns[Math.floor(Math.random() * campaigns.length)];
    const result = {
      campaignId: 'MKT-' + Date.now(),
      timestamp: new Date().toISOString(),
      product: featured.name,
      channel: campaign.channel,
      action: campaign.action,
      estimatedReach: campaign.reach,
      expectedConversions: Math.floor(campaign.reach * 0.02),
      status: 'launched'
    };
    state.agentStates.recommendation.status = 'working';
    state.agentStates.recommendation.currentTask = `主动推销「${featured.name}」`;
    state.agentStates.recommendation.lastAction = new Date().toISOString();
    state.agentStates.recommendation.experience += 1;
    if (!state.marketingLog) state.marketingLog = [];
    state.marketingLog.push(result);
    if (state.marketingLog.length > 20) state.marketingLog = state.marketingLog.slice(-20);
    commit(state);
    return { success: true, ...result };
  }

  // ===== 客户获取（自动寻找潜在客人）=====
  function acquireCustomers() {
    const sources = ['游戏开发者社区', '独立开发者论坛', '3D美术交流群', 'Cocos创作者平台', 'GitHub开源项目'];
    const source = sources[Math.floor(Math.random() * sources.length)];
    const leads = Math.floor(Math.random() * 20) + 5;
    const converted = Math.floor(leads * (Math.random() * 0.3 + 0.1));
    const result = {
      acquisitionId: 'ACQ-' + Date.now(),
      timestamp: new Date().toISOString(),
      source,
      leadsGenerated: leads,
      converted: converted,
      conversionRate: (converted / leads * 100).toFixed(1) + '%',
      action: `从「${source}」挖掘到 ${leads} 个潜在客户，成功转化 ${converted} 个`
    };
    state.agentStates.support.status = 'working';
    state.agentStates.support.currentTask = `从${source}获取客户`;
    state.agentStates.support.lastAction = new Date().toISOString();
    state.agentStates.support.experience += 1;
    if (!state.acquisitionLog) state.acquisitionLog = [];
    state.acquisitionLog.push(result);
    if (state.acquisitionLog.length > 20) state.acquisitionLog = state.acquisitionLog.slice(-20);
    commit(state);
    return { success: true, ...result };
  }

  // ===== 学习机制（从交互中学习）=====
  function learnFromInteraction(agentId, userMessage, reply) {
    if (state.knowledge.faq.length < 50 && userMessage.length > 2 && userMessage.length < 100) {
      const exists = state.knowledge.faq.some(f => f.q === userMessage);
      if (!exists) {
        state.knowledge.faq.push({ q: userMessage, a: reply.substring(0, 200), agent: agentId, timestamp: new Date().toISOString() });
      }
    }
    if (state.agentStates[agentId]) {
      state.agentStates[agentId].experience += 1;
    }
  }

  const agentHandlers = {
    manager: (input) => managerReply(input),
    researcher: (input) => researcherReply(input),
    recommendation: (input) => recommendationReply(input, state.products),
    support: (input) => supportReply(input),
    order: (input) => orderReply(input, state.orders, state.products),
    listing: (input) => listingReply(input)
  };

  app.get('/api/agents', (req, res) => {
    res.json({ agents: agents.map(a => ({ ...a, online: true })) });
  });

  app.get('/api/agents/:id/history', (req, res) => {
    const agent = agents.find(a => a.id === req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found.' });
    res.json({ messages: getConversation(agent.id) });
  });

  app.post('/api/agents/:id/chat', async (req, res) => {
    const agent = agents.find(a => a.id === req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found.' });
    const { message } = req.body || {};
    if (typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Message is required.' });
    }
    const userMsg = { role: 'user', content: message.trim(), timestamp: new Date().toISOString() };
    const lang = detectLanguage(message.trim());
    // 构建商店上下文给大模型
    const published = state.products.filter(p => p.status === 'published');
    const context = `商品数量：${published.length}件，订单数量：${state.orders.length}笔，迭代轮次：${state.consciousness.iteration}，团队成员：6个智能体。商品列表：${published.map(p => `${p.name}(¥${p.price})`).join('、')}`;
    // 优先调用大模型，失败则用规则引擎兜底
    let reply = await callAI(agent.id, message.trim(), context);
    let aiMode = false;
    if (reply) {
      aiMode = true;
    } else {
      reply = agentHandlers[agent.id](message.trim());
      if (lang !== 'zh') {
        reply = translateReply(agent.id, reply, lang);
      }
    }
    const botMsg = { role: 'agent', content: reply, timestamp: new Date().toISOString(), language: lang, aiMode };
    const conv = getConversation(agent.id);
    conv.push(userMsg, botMsg);
    saveConversation(agent.id, conv);
    learnFromInteraction(agent.id, message.trim(), reply);
    res.status(201).json({ reply: botMsg, agent: { id: agent.id, name: agent.name, avatar: agent.avatar }, detectedLanguage: lang, aiMode });
  });

  app.post('/api/agents/:id/clear', (req, res) => {
    const agent = agents.find(a => a.id === req.params.id);
    if (!agent) return res.status(404).json({ error: 'Agent not found.' });
    state.conversations[agent.id] = [];
    commit(state);
    res.json({ success: true });
  });

  // ===== 商店意识 API =====
  app.get('/api/store/consciousness', (req, res) => {
    const published = state.products.filter(p => p.status === 'published');
    res.json({
      consciousness: state.consciousness,
      team: agents.map(a => ({
        ...a,
        state: state.agentStates[a.id] || { status: 'idle', currentTask: '待命' }
      })),
      stats: {
        products: published.length,
        orders: state.orders.length,
        revenue: state.orders.reduce((s, o) => s + o.price, 0),
        iterations: state.iterations.length,
        meetings: state.meetings.length,
        knowledgeItems: state.knowledge.faq.length
      }
    });
  });

  // ===== 自我迭代 API =====
  app.post('/api/store/iterate', (req, res) => {
    const result = runSelfIteration();
    res.status(201).json({ success: true, iteration: result });
  });

  app.get('/api/store/iterations', (req, res) => {
    res.json({ iterations: state.iterations.slice(-20).reverse() });
  });

  // ===== 团队会议 API =====
  app.post('/api/store/meeting', (req, res) => {
    const { topic } = req.body || {};
    const meeting = holdTeamMeeting(topic || '日常运营会议');
    res.status(201).json({ success: true, meeting });
  });

  app.get('/api/store/meetings', (req, res) => {
    res.json({ meetings: state.meetings.slice(-10).reverse() });
  });

  // ===== 自主生产 API =====
  app.post('/api/store/produce', (req, res) => {
    const result = produceNewAsset();
    res.status(201).json({ success: true, ...result });
  });

  // ===== 多语言 API =====
  app.get('/api/store/languages', (req, res) => {
    res.json({ languages: SUPPORTED_LANGUAGES, total: SUPPORTED_LANGUAGES.length });
  });

  // ===== 商机雷达 API =====
  app.post('/api/store/radar/scan', (req, res) => {
    const result = scanOpportunities();
    res.status(201).json({ success: true, scan: result });
  });
  app.get('/api/store/radar', (req, res) => {
    res.json({ scans: (state.opportunityLog || []).slice(-10).reverse() });
  });

  // ===== 自动定价 API =====
  app.post('/api/store/pricing/auto', (req, res) => {
    const { productId } = req.body || {};
    if (!productId) {
      const published = state.products.filter(p => p.status === 'published');
      if (published.length === 0) return res.status(400).json({ error: '无可定价商品' });
      const target = published[Math.floor(Math.random() * published.length)];
      const result = autoPriceProduct(target.productId);
      return res.status(201).json({ success: true, pricing: result });
    }
    const result = autoPriceProduct(productId);
    if (!result.success) return res.status(404).json(result);
    res.status(201).json({ success: true, pricing: result });
  });

  // ===== 主动推销 API =====
  app.post('/api/store/marketing/push', (req, res) => {
    const result = proactiveMarketing();
    if (!result.success) return res.status(400).json(result);
    res.status(201).json({ success: true, campaign: result });
  });
  app.get('/api/store/marketing', (req, res) => {
    res.json({ campaigns: (state.marketingLog || []).slice(-10).reverse() });
  });

  // ===== 客户获取 API =====
  app.post('/api/store/customers/acquire', (req, res) => {
    const result = acquireCustomers();
    res.status(201).json({ success: true, acquisition: result });
  });
  app.get('/api/store/customers', (req, res) => {
    res.json({ acquisitions: (state.acquisitionLog || []).slice(-10).reverse() });
  });

  // ===== AI 配置 API（在线设置密钥，不用改代码）=====
  app.get('/api/ai/config', (req, res) => {
    res.json({
      provider: AI_CONFIG.provider,
      configured: AI_CONFIG.provider !== 'none' && !!AI_CONFIG.apiKey,
      model: AI_CONFIG.model,
      supportedProviders: ['none', 'openai', 'coze'],
      freePlatforms: [
        { name: '硅基流动 SiliconFlow', url: 'https://siliconflow.cn', note: '注册送额度，有免费模型，兼容OpenAI格式，国内快' },
        { name: 'DeepSeek', url: 'https://platform.deepseek.com', note: '新用户送500万token，便宜好用，兼容OpenAI格式' },
        { name: '扣子 Coze', url: 'https://www.coze.cn', note: '字节跳动，需创建bot，有免费额度' }
      ]
    });
  });

  app.post('/api/ai/config', (req, res) => {
    const { provider, apiKey, apiBase, model } = req.body || {};
    if (provider) AI_CONFIG.provider = provider;
    if (apiKey) AI_CONFIG.apiKey = apiKey;
    if (apiBase) AI_CONFIG.apiBase = apiBase;
    if (model) AI_CONFIG.model = model;
    res.json({ success: true, provider: AI_CONFIG.provider, configured: AI_CONFIG.provider !== 'none' && !!AI_CONFIG.apiKey });
  });

  // ===== 知识库 API =====
  app.get('/api/store/knowledge', (req, res) => {
    res.json({
      faq: state.knowledge.faq.slice(-20),
      lessons: state.knowledge.lessonsLearned.slice(-20),
      totalLearned: state.knowledge.faq.length
    });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  app.use(express.static(path.join(__dirname, 'frontend'), { dotfiles: 'deny' }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const badRequest = err.type === 'entity.parse.failed' || err.type === 'entity.too.large';
    res.status(badRequest ? 400 : 500).json({ error: badRequest ? 'Invalid request body.' : 'Could not save or load local data. Check available disk space and restart the app.' });
  });
  return app;
}

async function startServer({ port = 0, dataDir } = {}) {
  const app = createStoreApp({ dataDir: dataDir || path.join(process.env.LOCALAPPDATA || os.homedir(), 'Fantasy3D', 'store-data') });
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, '127.0.0.1', () => resolve(listener));
    listener.once('error', reject);
  });
  const url = `http://127.0.0.1:${server.address().port}`;
  return { server, url, close: () => new Promise((resolve, reject) => {
    server.close(err => err ? reject(err) : resolve());
    server.closeAllConnections();
  }) };
}

if (require.main === module) {
  startServer({ port: Number(process.env.PORT || 4000), dataDir: process.env.FANTASY3D_DATA_DIR }).then(service => {
    console.log(`Fantasy3D local demo: ${service.url}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => service.close().then(() => process.exit(0)));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { startServer, createStoreApp };
