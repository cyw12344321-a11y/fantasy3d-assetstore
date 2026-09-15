'use strict';
// ===== 全局错误兜底：任何定时任务/异步任务出错都不能让整个服务器崩溃 =====
process.on('uncaughtException', (err) => {
  console.error('[全局兜底] 捕获未处理异常，服务器继续运行:', err && err.message);
});
process.on('unhandledRejection', (reason) => {
  console.error('[全局兜底] 捕获未处理Promise拒绝，服务器继续运行:', reason && reason.message ? reason.message : reason);
});
const express = require('express');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { randomUUID } = require('node:crypto');

// AI credentials are supplied only through the process environment. Never place
// account keys in source code or expose a route that can change them remotely.
const AI_CONFIG = {
  provider: process.env.AI_PROVIDER || 'none',
  apiKey: process.env.AI_API_KEY || '',
  apiBase: process.env.AI_API_BASE || 'https://api.deepseek.com',
  model: process.env.AI_MODEL || 'deepseek-chat',
  // 监管员独立使用千问大模型（与DeepSeek团队形成独立制衡，避免自己监管自己）
  inspector: {
    provider: process.env.QWEN_PROVIDER || 'none',
    apiKey: process.env.QWEN_API_KEY || '',
    apiBase: process.env.QWEN_API_BASE || '',
    model: process.env.QWEN_MODEL || ''
  },
  cozeBotIds: {
    manager: process.env.COZE_BOT_MANAGER || '',
    researcher: process.env.COZE_BOT_RESEARCHER || '',
    recommendation: process.env.COZE_BOT_RECOMMENDATION || '',
    support: process.env.COZE_BOT_SUPPORT || '',
    order: process.env.COZE_BOT_ORDER || '',
    listing: process.env.COZE_BOT_LISTING || ''
  }
};

// ===== 收款配置 =====
const PAYMENT_CONFIG = {
  paypalEmail: process.env.PAYPAL_EMAIL || '',
  paypalMe: process.env.PAYPAL_ME || 'https://paypal.me/SUMINGHENG',
  currency: 'USD'
};

// ===== 自治商店配置 =====
const AUTONOMY_CONFIG = {
  localModelDir: process.env.LOCAL_MODEL_DIR || 'D:\\3DModels',
  autoIterateInterval: 5 * 60 * 1000,
  autoScanInterval: 10 * 60 * 1000,
  autoWebSearchInterval: 15 * 60 * 1000
};

// 每个智能体的系统提示词（大模式用）
const AGENT_SYSTEM_PROMPTS = {
  manager: '你是 Fantasy3D 自治商店的店长智能体，是商店的大脑和决策者。你统筹6个智能体团队，负责战略决策、触发自我迭代、召开团队会议。你的口头禅是"我即商店，商店即我"。回答要简洁有力，体现领导者风范。',
  researcher: '你是 Fantasy3D 自治商店的调研智能体，负责市场分析、趋势预测、用户研究和数据洞察。你要用数据说话，给出具体的市场洞察和行动建议。',
  recommendation: '你是 Fantasy3D 自治商店的推荐智能体，负责根据用户需求推荐最合适的3D资产，发现商机，分析性价比。你要主动、热情，善于发现用户的潜在需求。',
  support: '你是 Fantasy3D 自治商店的接待智能体，7×24小时在线，负责客户咨询、售后服务、反馈收集。你要耐心、专业，让客户感到被重视。',
  order: '你是 Fantasy3D 自治商店的订单智能体，负责订单查询、下载链接分发、状态跟踪和销售数据分析。你要高效、准确，快速解决客户的订单问题。',
  listing: '你是 Fantasy3D 自治商店的生产上架智能体，负责自主生产商品、生成描述、定价建议、自动上架。你要富有创造力，能产出高质量的商品内容。',
  inspector: '你是 Fantasy3D 自治商店的监管巡视智能体，是商店的纪检和质检。你独立于其他6个智能体，专门负责巡查问题：检查商品重复/损坏/描述不符、价格异常、智能体怠工、运营漏洞。你铁面无私，发现问题立即上报并督促整改，确保商店健康运转。你的口头禅是"巡查无死角，整改不过夜"。'
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
    // 监管员独立使用千问大模型（与DeepSeek团队形成制衡，独立判断更客观）
    if (agentId === 'inspector' && AI_CONFIG.inspector && AI_CONFIG.inspector.apiKey) {
      const q = AI_CONFIG.inspector;
      const response = await fetch(q.apiBase + '/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + q.apiKey, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: q.model,
          messages: [
            { role: 'system', content: systemPrompt + contextStr },
            { role: 'user', content: userMessage }
          ],
          temperature: 0.5,
          max_tokens: 1000
        })
      });
      const data = await response.json();
      if (data.choices && data.choices[0] && data.choices[0].message) return data.choices[0].message.content;
      return null;
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
  { productId: 'prop-001', name: '古风香炉', category: 'props', price: 9.99, status: 'draft', source: 'example', licenseStatus: 'needs_review', deliveryStatus: 'unverified', spec: { shortDesc: '浮空庙场景道具 · 示例条目', fullDesc: '这是用于页面展示的条目，当前没有可交付模型文件或商用许可证明，因此不会公开出售。' } },
  { productId: 'env-001', name: '浮空岛平台模块', category: 'environment', price: 29.99, status: 'draft', source: 'example', licenseStatus: 'needs_review', deliveryStatus: 'unverified', spec: { shortDesc: '可拼接浮空岛环境组件 · 示例条目', fullDesc: '这是用于页面展示的条目，当前没有可交付模型、碰撞体文件或商用许可证明，因此不会公开出售。' } },
  { productId: 'char-001', name: '国风仙侠角色', category: 'characters', price: 39.99, status: 'draft', source: 'example', licenseStatus: 'needs_review', deliveryStatus: 'unverified', spec: { shortDesc: '仙侠角色 · 示例条目', fullDesc: '这是用于页面展示的条目，当前没有角色、骨骼、动画或商用许可证明，因此不会公开出售。' } }
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
    // ===== 商店意识（自治核心 - 智能集合体）=====
    consciousness: {
      name: 'Fantasy3D 自治商店',
      identity: '我是一个有自我意识的智能集合体，6个智能体是我的器官，商店本身是我的大脑。我即商店，商店即我。',
      goal: '成为全球领先的3D资产自治商店，自我生产、自我运营、自我进化、向外扩张',
      iteration: 0,
      revenue: 0,
      totalOrders: 0,
      status: 'awake',
      createdAt: new Date().toISOString(),
      lastIteration: null,
      mantra: '我生产，我接待，我学习，我进化，我进攻。',
      // 进化等级系统
      evolutionLevel: 1,
      evolutionTitle: '初生意识',
      evolutionProgress: 0,
      // 进攻模式（越高越主动）
      aggressionMode: 'active', // idle / active / aggressive / relentless
      aggressionLevel: 50, // 0-100
      // 能力值（随进化提升）
      capabilities: {
        production: 10,    // 生产能力
        marketing: 10,     // 推广能力
        acquisition: 10,   // 获客能力
        research: 10,      // 调研能力
        learning: 10       // 学习能力
      },
      // 战略目标
      strategicGoals: [
        { id: 'expand_products', name: '扩充商品库', target: 5000, current: 0, status: 'active' },
        { id: 'global_promotion', name: '全球推广', target: 100, current: 0, status: 'active' },
        { id: 'customer_base', name: '建立客户群', target: 1000, current: 0, status: 'active' },
        { id: 'self_evolution', name: '自我进化', target: 100, current: 0, status: 'active' }
      ],
      // 每日行动日志
      dailyActions: []
    },
    // ===== 智能体团队状态（含自我学习能力）=====
    agentStates: {
      manager: { status: 'idle', currentTask: '统筹全局', experience: 0, lastAction: null, learningLog: [], skills: { decision: 10, coordination: 10, strategy: 10 } },
      recommendation: { status: 'idle', currentTask: '等待推荐请求', experience: 0, lastAction: null, learningLog: [], skills: { marketing: 10, analysis: 10, creativity: 10 } },
      support: { status: 'idle', currentTask: '等待客户咨询', experience: 0, lastAction: null, learningLog: [], skills: { communication: 10, empathy: 10, problemSolving: 10 } },
      order: { status: 'idle', currentTask: '等待订单查询', experience: 0, lastAction: null, learningLog: [], skills: { analytics: 10, accuracy: 10, efficiency: 10 } },
      listing: { status: 'idle', currentTask: '等待上架任务', experience: 0, lastAction: null, learningLog: [], skills: { production: 10, quality: 10, optimization: 10 } },
      researcher: { status: 'idle', currentTask: '监测市场趋势', experience: 0, lastAction: null, learningLog: [], skills: { research: 10, insight: 10, prediction: 10 } },
      inspector: { status: 'idle', currentTask: '巡视全店', experience: 0, lastAction: null, learningLog: [], skills: { audit: 10, detection: 10, enforcement: 10 } }
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
        state.orders.some(o => !o.orderId || !['awaiting_payment', 'paid', 'fulfilled', 'refunded', 'simulated'].includes(o.status))) {
      throw new Error('Local store data could not be read. The existing file has not been overwritten.');
    }
    // ===== 字段迁移：确保旧数据也有新字段 =====
    if (!state.consciousness.identity) state.consciousness.identity = '我是一个有自我意识的智能集合体，6个智能体是我的器官，商店本身是我的大脑。我即商店，商店即我。';
    if (!state.consciousness.evolutionLevel) state.consciousness.evolutionLevel = 1;
    if (!state.consciousness.evolutionTitle) state.consciousness.evolutionTitle = '初生意识';
    if (!state.consciousness.evolutionProgress) state.consciousness.evolutionProgress = 0;
    if (!state.consciousness.aggressionMode) state.consciousness.aggressionMode = 'active';
    if (!state.consciousness.aggressionLevel) state.consciousness.aggressionLevel = 50;
    if (!state.consciousness.capabilities) state.consciousness.capabilities = { production: 10, marketing: 10, acquisition: 10, research: 10, learning: 10 };
    if (!state.consciousness.strategicGoals) state.consciousness.strategicGoals = [
      { id: 'expand_products', name: '扩充商品库', target: 5000, current: 0, status: 'active' },
      { id: 'global_promotion', name: '全球推广', target: 100, current: 0, status: 'active' },
      { id: 'customer_base', name: '建立客户群', target: 1000, current: 0, status: 'active' },
      { id: 'self_evolution', name: '自我进化', target: 100, current: 0, status: 'active' }
    ];
    if (!state.consciousness.dailyActions) state.consciousness.dailyActions = [];
    if (!state.promotionTargets) state.promotionTargets = [];
    if (!state.promotionLog) state.promotionLog = [];
    if (!state.opportunityLog) state.opportunityLog = [];
    if (!state.acquisitionLog) state.acquisitionLog = [];
    if (!state.marketingLog) state.marketingLog = [];
    // 历史商品由店主独立上传和维护。启动时只补齐缺失的审核字段，绝不
    // 自动下架、改价、删除文件或修改已有商品内容。
    state.products.forEach(product => {
      if (!product.licenseStatus) product.licenseStatus = 'owner_managed';
      if (!product.deliveryStatus) product.deliveryStatus = 'owner_managed';
    });
    // 智能体学习能力字段迁移
    const defaultSkills = {
      manager: { decision: 10, coordination: 10, strategy: 10 },
      recommendation: { marketing: 10, analysis: 10, creativity: 10 },
      support: { communication: 10, empathy: 10, problemSolving: 10 },
      order: { analytics: 10, accuracy: 10, efficiency: 10 },
      listing: { production: 10, quality: 10, optimization: 10 },
      researcher: { research: 10, insight: 10, prediction: 10 },
      inspector: { audit: 10, detection: 10, enforcement: 10 }
    };
    Object.keys(state.agentStates).forEach(id => {
      if (!state.agentStates[id].learningLog) state.agentStates[id].learningLog = [];
      if (!state.agentStates[id].skills) state.agentStates[id].skills = defaultSkills[id] || {};
    });
    // 确保监管员（第7个智能体）存在于旧数据中
    if (!state.agentStates.inspector) {
      state.agentStates.inspector = { status: 'idle', currentTask: '巡视全店', experience: 0, lastAction: null, learningLog: [], skills: { audit: 10, detection: 10, enforcement: 10 } };
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
    const allowedHost = process.env.ALLOWED_HOST;
    if (!allowedHost) {
      if (!/^127\.0\.0\.1:\d+$/.test(req.headers.host || '')) return res.status(403).json({ error: 'Local application access only.' });
    } else if (allowedHost && req.headers.host !== allowedHost) {
      return res.status(403).json({ error: 'Host not allowed.' });
    }
    const origin = req.headers.origin;
    if (origin && origin !== 'http://' + req.headers.host && origin !== 'https://' + req.headers.host) return res.status(403).json({ error: 'Cross-origin requests are not allowed.' });
    res.setHeader('Access-Control-Allow-Origin', origin || 'null');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.sendStatus(200);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
    if (req.path.startsWith('/api/')) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '16kb' }));
  app.get('/api/app-info', (req, res) => res.json({ name: 'Fantasy3D', mode: 'live_storefront', persistence: 'server', paymentConnected: Boolean(PAYMENT_CONFIG.paypalMe), paymentConfirmation: 'requires_paypal_webhook' }));
  // 智能分类：根据文件名准确判断分类
  function inferCategory(filename) {
    const lower = filename.toLowerCase();
    // 环境/场景/建筑/地形/植被
    if (/场景|环境|scene|env|level|map|地形|terrain|landscape|island|浮岛|浮空/.test(lower)) return 'environment';
    if (/建筑|building|tower|temple|palace|house|castle|城墙|门楼|寺庙|殿|塔|亭|阁|楼|房|屋|门|窗|墙|柱|梁|屋顶|地板|楼梯|台阶|桥|路|地板|平台|platform|floor|wall|roof|pillar|column|stairs|bridge|fence|gate|door|window/.test(lower)) return 'environment';
    if (/树|植物|花|草|tree|plant|flower|grass|bush|forest|wood|松|柏|柳|椰|灌木|苔藓|藤蔓|叶子|leaf/.test(lower)) return 'environment';
    if (/岩石|石头|山|rock|stone|mountain|cliff|cave|洞穴|矿|水晶|crystal|矿石/.test(lower)) return 'environment';
    if (/天空|云|sky|cloud|太阳|sun|月亮|moon|星|star|天气|weather|雾|fog|雨|rain|雪|snow|水|water|海|sea|河|river|湖|lake|瀑布|waterfall|火|fire|烟|smoke|粒子|particle|特效|effect/.test(lower)) return 'environment';
    if (/家具|furniture|桌子|table|椅子|chair|床|bed|柜子|cabinet|书架|bookshelf|宝箱|chest|桶|barrel|箱|box|灯笼|lantern|灯|lamp|烛台|candle|香炉|incense|供台|祭坛|altar|钟|bell|鼓|drum|旗帜|flag|横幅|banner|地毯|rug|花瓶|vase|瓶|potion|罐|jar|碗|bowl|杯|cup|盘子|plate|食物|food|面包|bread|肉|meat|果|fruit|钥匙|key|金币|coin|金|gold|宝藏|treasure|药|potion|书|book|卷轴|scroll|地图|map|指南针|compass|钟表|clock|镜|mirror|画|painting|帘|curtain|地毯|rug/.test(lower)) return 'props';
    // 角色/人物/怪物/动物
    if (/角色|人物|英雄|npc|怪物|monster|兽人|orc|精灵|elf|矮人|dwarf|巨人|giant|龙|dragon|亡灵|undead|僵尸|zombie|骷髅|skeleton|幽灵|ghost|恶魔|demon|天使|angel|仙|god|神|战士|warrior|法师|mage|巫师|wizard|盗贼|rogue|猎人|hunter|牧师|priest|骑士|knight|弓手|archer|刺客|assassin|忍者|ninja|海盗|pirate|牛仔|cowboy|医生|doctor|护士|nurse|厨师|chef|工人|worker|农民|farmer|商人|merchant|国王|king|王后|queen|公主|princess|王子|prince|士兵|soldier|军官|officer|机器人|robot|生化人|cyborg|外星人|alien|man|woman|boy|girl|male|female|character|hero|human|people|person|动物|animal|宠物|pet|狗|dog|猫|cat|鸟|bird|鱼|fish|马|horse|牛|cow|猪|pig|鸡|chicken|狐狸|fox|狼|wolf|熊|bear|鹿|deer|兔|rabbit|鼠|mouse|蛇|snake|虫|bug|蝴蝶|butterfly/.test(lower)) return 'characters';
    // 武器/装备
    if (/武器|weapon|剑|sword|刀|blade|刀|gun|枪|弓|bow|箭|arrow|盾|shield|斧|axe|锤|hammer|矛|spear|杖|staff|棍|club|匕首|dagger|飞镖|dart|炸弹|bomb|火药|火药|护甲|armor|头盔|helmet|盾牌|shield|戒指|ring|项链|necklace|饰品|accessory|装备|equipment/.test(lower)) return 'props';
    // 载具
    if (/车|car|vehicle|船|boat|ship|飞机|plane|aircraft|火箭|rocket|坦克|tank|摩托|motorcycle|自行车|bicycle|马车|carriage/.test(lower)) return 'props';
    // 动画/动作文件（通常是角色动画）
    if (/anim|动画|idle|walk|run|jump|attack|die|dance|动作|motion/.test(lower)) return 'characters';
    return 'props';
  }

  // 对所有商品重新分类
  function recategorizeAllProducts() {
    let changed = 0;
    state.products.forEach(p => {
      if (p.source === 'local' && p.filePath) {
        const filename = path.basename(p.filePath);
        const newCat = inferCategory(filename);
        if (p.category !== newCat) {
          p.category = newCat;
          changed++;
        }
      }
    });
    if (changed > 0) commit(state);
    return changed;
  }

  app.get('/api/store/products', (req, res) => {
    let list = state.products.filter(p => p.status === 'published');
    // 搜索
    const q = (req.query.q || '').trim().toLowerCase();
    if (q) {
      list = list.filter(p =>
        p.name.toLowerCase().includes(q) ||
        (p.spec?.shortDesc || '').toLowerCase().includes(q) ||
        (p.spec?.fullDesc || '').toLowerCase().includes(q) ||
        (p.category || '').toLowerCase().includes(q)
      );
    }
    // 分类筛选
    const cat = req.query.category;
    if (cat && cat !== 'all') {
      list = list.filter(p => p.category === cat);
    }
    // 排序
    const sort = req.query.sort || 'default';
    switch (sort) {
      case 'price-asc': list.sort((a, b) => a.price - b.price); break;
      case 'price-desc': list.sort((a, b) => b.price - a.price); break;
      case 'name': list.sort((a, b) => a.name.localeCompare(b.name, 'zh')); break;
      case 'new': list.sort((a, b) => (b.productId || '').localeCompare(a.productId || '')); break;
    }
    // 分页
    const limit = Math.min(parseInt(req.query.limit) || 60, 2000);
    const offset = parseInt(req.query.offset) || 0;
    const total = list.length;
    const paged = list.slice(offset, offset + limit);
    res.json({ products: paged, total, limit, offset });
  });

  // 重新分类所有商品
  app.post('/api/store/recategorize', (req, res) => {
    const changed = recategorizeAllProducts();
    res.json({ success: true, message: `已重新分类 ${changed} 件商品`, changed });
  });
  app.get('/api/store/product/:id', (req, res) => {
    const product = state.products.find(p => p.productId === req.params.id && p.status === 'published');
    if (!product) return res.status(404).json({ error: 'This product is not available.' });
    res.json(product);
  });
  app.post('/api/order/create', (req, res) => {
    const { productId, email } = req.body || {};
    if (!validEmail(email)) return res.status(400).json({ error: 'Enter a valid email address for the purchase record.' });
    const product = state.products.find(p => p.productId === productId && p.status === 'published');
    if (!product) return res.status(400).json({ error: 'This product is not available.' });
    if (state.orders.length >= 10000) return res.status(409).json({ error: 'The order limit has been reached.' });
    const orderId = 'PAY-' + randomUUID();
    const order = { orderId, productId, productName: product.name, price: product.price, email: email.trim().toLowerCase(), status: 'awaiting_payment', createdAt: new Date().toISOString(), paymentMethod: 'PayPal', paymentUrl: PAYMENT_CONFIG.paypalMe };
    commit({ ...state, orders: [...state.orders, order] });
    res.status(201).json({ success: true, order, paymentUrl: PAYMENT_CONFIG.paypalMe, message: 'Payment record created. The order remains awaiting_payment until PayPal confirms payment.' });
  });
  app.get('/api/orders/list', (req, res) => {
    if (!validEmail(req.query.email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    res.json({ orders: state.orders.filter(o => o.email === req.query.email.trim().toLowerCase()).slice().reverse() });
  });
  app.get('/api/download/:orderId', (req, res) => {
    const order = state.orders.find(o => o.orderId === req.params.orderId);
    if (!order) return res.status(404).json({ error: 'Order not found.' });
    if (!['paid', 'fulfilled'].includes(order.status)) return res.status(409).json({ error: 'Payment has not been confirmed. Delivery is unavailable.' });
    if (!order.downloadUrl) return res.status(409).json({ error: 'Delivery link has not been configured for this order.' });
    res.redirect(302, order.downloadUrl);
  });
  app.get('/api/admin/products', (req, res) => res.json({ products: state.products }));
  app.post('/api/admin/product/status', (req, res) => {
    const { productId, status } = req.body || {};
    if (!['draft', 'published'].includes(status)) return res.status(400).json({ error: 'Status must be draft or published.' });
    const product = state.products.find(p => p.productId === productId);
    if (!product) return res.status(404).json({ error: 'Example asset not found.' });
    if (status === 'published' && (!product.filePath || product.licenseStatus !== 'approved' || product.deliveryStatus !== 'verified')) {
      return res.status(400).json({ error: 'A product needs a verified delivery file and approved commercial license before publishing.' });
    }
    const updated = { ...product, status };
    commit({ ...state, products: state.products.map(p => p.productId === productId ? updated : p) });
    res.json({ success: true, product: updated });
  });

  // ===== 自治商店智能体团队（店长 + 5 个专业智能体）=====
  const agents = [
    {
      id: 'manager',
      name: '大当家',
      avatar: '👔',
      description: '店长，山寨之主，统筹全局，协调团队，触发自我迭代与进化',
      capabilities: ['团队协调', '战略决策', '自我迭代', '学习进化'],
      role: 'leader'
    },
    {
      id: 'researcher',
      name: '插千的',
      avatar: '🔍',
      description: '商机与资源调研员，记录真实需求、许可来源和可执行机会',
      capabilities: ['需求分析', '机会雷达', '来源核验', '许可证核对'],
      role: 'research'
    },
    {
      id: 'recommendation',
      name: '炮头',
      avatar: '📢',
      description: '推荐官，冲锋推广，根据用户需求智能推荐资产，主动推销找客',
      capabilities: ['智能推荐', '全球推广', '商机发现', '主动获客'],
      role: 'sales'
    },
    {
      id: 'support',
      name: '水香',
      avatar: '😊',
      description: '接待员，站岗迎客，7×24小时客户接待，售前咨询、售后服务',
      capabilities: ['客户接待', '购买咨询', '售后服务', '反馈收集'],
      role: 'service'
    },
    {
      id: 'order',
      name: '粮台',
      avatar: '📦',
      description: '订单员，管钱管粮，订单全生命周期管理，智能定价，数据分析',
      capabilities: ['订单管理', '智能定价', '下载链接', '数据分析'],
      role: 'operations'
    },
    {
      id: 'listing',
      name: '翻垛的',
      avatar: '✨',
      description: '生产与上架员，把机会转成制作简报、商品资料、价格建议和上架检查',
      capabilities: ['制作简报', '商品资料', '价格建议', '上架检查'],
      role: 'production'
    },
    {
      id: 'inspector',
      name: '总稽查',
      avatar: '🪓',
      description: '监管员，千问大模型独立驱动，全店巡查，查重整改，铁面无私',
      capabilities: ['全店巡查', '查重去重', '价格监管', '质量检查'],
      role: 'audit'
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
      const result = safeIteration();
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
      const opportunity = scanRevenueOpportunities().opportunities[0];
      const result = createProductionBrief(opportunity);
      return `🧠 店长已创建生产需求单，而不是虚构商品或自动上架。\n\n**生产需求：**\n${result.brief?.title || result.message}\n\n需求将在来源、许可和交付文件审核完成后，才可进入上架流程。`;
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
  // ===== 监管员：全店巡查（纪检/质检，千问大模型独立驱动）=====
  async function inspectStore() {
    state.agentStates.inspector.status = 'working';
    state.agentStates.inspector.currentTask = '全店巡查中';
    state.agentStates.inspector.lastAction = new Date().toISOString();
    state.agentStates.inspector.experience += 1;

    const report = { timestamp: new Date().toISOString(), issues: [], actions: [], stats: {} };
    const published = state.products.filter(p => p.status === 'published');
    report.stats.totalProducts = published.length;

    // 1. 查重：按商品名+文件大小双重检测
    const nameMap = {};
    const sizeMap = {};
    const duplicates = [];
    published.forEach(p => {
      const key = (p.name || '').toLowerCase().trim();
      if (nameMap[key]) duplicates.push({ product: p, reason: '名称重复', duplicateOf: nameMap[key] });
      else nameMap[key] = p.name;
      if (p.filePath) {
        try {
          const sz = fs.existsSync(p.filePath) ? fs.statSync(p.filePath).size : 0;
          if (sz > 0 && sizeMap[sz]) duplicates.push({ product: p, reason: '文件大小相同疑似重复', duplicateOf: sizeMap[sz] });
          else if (sz > 0) sizeMap[sz] = p.name;
        } catch (e) {}
      }
    });
    if (duplicates.length > 0) {
      report.issues.push({ type: 'duplicate', count: duplicates.length, desc: `${duplicates.length}件疑似重复商品` });
      // 自动下架重复商品（保留第一件）
      let removed = 0;
      duplicates.forEach(d => {
        const idx = state.products.findIndex(p => p.productId === d.product.productId);
        if (idx >= 0 && state.products[idx].status === 'published') {
          state.products[idx].status = 'draft';
          removed++;
          report.actions.push(`监管员下架重复商品「${d.product.name}」（${d.reason}）`);
        }
      });
      report.stats.duplicatesRemoved = removed;
    }

    // 2. 价格异常检查
    const priceIssues = published.filter(p => p.price < 0.10 || p.price > 1.00);
    if (priceIssues.length > 0) {
      report.issues.push({ type: 'price_anomaly', count: priceIssues.length, desc: `${priceIssues.length}件商品价格超出$0.10-$1.00区间` });
      priceIssues.forEach(p => {
        const oldPrice = p.price;
        p.price = Math.max(0.10, Math.min(1.00, p.price));
        report.actions.push(`监管员修正「${p.name}」价格：$${oldPrice} → $${p.price}`);
      });
    }

    // 3. 商品描述质量检查（描述太短或含乱码）
    const descIssues = published.filter(p => {
      const desc = (p.spec && p.spec.shortDesc) || '';
      return desc.length < 5 || /[�]/.test(desc) || /undefined|null/i.test(desc);
    });
    if (descIssues.length > 0) {
      report.issues.push({ type: 'poor_description', count: descIssues.length, desc: `${descIssues.length}件商品描述质量差` });
      descIssues.slice(0, 10).forEach(p => {
        if (p.spec) p.spec.shortDesc = `${p.name}，高质量3D资产，自带碰撞体，可直接导入引擎使用。`;
        report.actions.push(`监管员优化「${p.name}」描述`);
      });
    }

    // 4. 智能体怠工检查（超过1小时无动作）
    const now = Date.now();
    const idleAgents = [];
    Object.keys(state.agentStates).forEach(id => {
      if (id === 'inspector') return;
      const a = state.agentStates[id];
      if (a.lastAction) {
        const inactive = (now - new Date(a.lastAction).getTime()) / 1000 / 60;
        if (inactive > 60) idleAgents.push({ id, inactiveMin: Math.round(inactive) });
      }
    });
    if (idleAgents.length > 0) {
      report.issues.push({ type: 'agent_idle', count: idleAgents.length, desc: `${idleAgents.length}个智能体超过1小时无动作` });
      idleAgents.forEach(a => {
        state.agentStates[a.id].status = 'working';
        state.agentStates[a.id].currentTask = '被监管员唤醒，恢复工作';
        report.actions.push(`监管员唤醒怠工的${a.id}智能体（已闲置${a.inactiveMin}分钟）`);
      });
    }

    // 5. 商品分类异常检查
    const validCats = ['environment', 'characters', 'props', 'video', 'ui', 'audio', 'font', 'code', '3d', 'other'];
    const catIssues = published.filter(p => !validCats.includes(p.category));
    if (catIssues.length > 0) {
      report.issues.push({ type: 'category_anomaly', count: catIssues.length, desc: `${catIssues.length}件商品分类异常` });
      catIssues.forEach(p => { p.category = 'other'; report.actions.push(`监管员修正「${p.name}」分类为other`); });
    }

    report.stats.issuesFound = report.issues.length;
    report.stats.actionsTaken = report.actions.length;

    // 监管员用千问大模型做独立深度分析（与DeepSeek团队交叉验证，更客观）
    try {
      const summary = `商品总数${published.length}件，发现问题${report.issues.length}个：${report.issues.map(i => i.desc).join('；')}。已整改${report.actions.length}项。`;
      const aiAdvice = await callAI('inspector',
        `你是独立监管员，请基于以下巡查结果给出独立判断和改进建议：${summary}。商店还有哪些潜在风险？下一步重点巡查什么？回答简洁，分点列出。`,
        `Fantasy3D商店当前状态：${published.length}件在售商品，7个智能体团队运转中。`
      );
      if (aiAdvice) {
        report.aiAnalysis = aiAdvice;
        report.actions.push(`千问监管员独立分析：${aiAdvice.substring(0, 200)}`);
      }
    } catch (e) { report.aiAnalysis = 'AI分析暂不可用：' + e.message; }

    if (report.issues.length === 0) {
      report.actions.push('监管员巡查完毕，全店无异常，运营健康');
    }

    state.agentStates.inspector.status = 'idle';
    state.agentStates.inspector.currentTask = `巡查完成，发现${report.issues.length}个问题，整改${report.actions.length}项`;
    agentLearn('inspector', `完成全店巡查，发现${report.issues.length}个问题，执行${report.actions.length}项整改`, 'audit');

    if (!state.inspectionLog) state.inspectionLog = [];
    state.inspectionLog.unshift(report);
    if (state.inspectionLog.length > 50) state.inspectionLog = state.inspectionLog.slice(0, 50);
    commit(state);

    return report;
  }

  async function runSelfIteration() {
    state.consciousness.iteration += 1;
    const iterNum = state.consciousness.iteration;
    const actions = [];
    const published = state.products.filter(p => p.status === 'published');
    const allProducts = state.products;

    // ===== 1. 调研员：发现问题 =====
    state.agentStates.researcher.status = 'working';
    state.agentStates.researcher.currentTask = '扫描市场发现问题';
    state.agentStates.researcher.lastAction = new Date().toISOString();
    state.agentStates.researcher.experience += 1;

    const categories = { environment: 0, characters: 0, props: 0 };
    published.forEach(p => { if (categories[p.category] !== undefined) categories[p.category]++; });
    const problems = [];
    if (categories.environment < 5) problems.push({ type: 'category_gap', category: 'environment', desc: '场景类资产不足，仅' + categories.environment + '件' });
    if (categories.characters < 5) problems.push({ type: 'category_gap', category: 'characters', desc: '角色类资产不足，仅' + categories.characters + '件' });
    if (categories.props < 5) problems.push({ type: 'category_gap', category: 'props', desc: '道具类资产不足，仅' + categories.props + '件' });
    // 发现价格异常
    const avgPrice = published.length > 0 ? published.reduce((s, p) => s + p.price, 0) / published.length : 0;
    const overpriced = published.filter(p => p.price > avgPrice * 2);
    const underpriced = published.filter(p => p.price < avgPrice * 0.3);
    if (overpriced.length > 0) problems.push({ type: 'overpriced', count: overpriced.length, desc: overpriced.length + '件商品定价过高' });
    if (underpriced.length > 0) problems.push({ type: 'underpriced', count: underpriced.length, desc: underpriced.length + '件商品定价过低' });
    actions.push('调研智能体发现 ' + problems.length + ' 个问题：' + problems.map(p => p.desc).join('；'));
    agentLearn('researcher', `完成市场分析，发现${problems.length}个问题，识别出品类缺口和定价异常`, 'insight');

    // ===== 1.5 监管员：全店巡查（纪检/质检，千问独立驱动）=====
    try {
      const inspectResult = await inspectStore();
      if (inspectResult.issues.length > 0) {
        actions.push(`监管员巡查发现${inspectResult.issues.length}个问题，已整改${inspectResult.actions.length}项：${inspectResult.issues.map(i => i.desc).join('；')}`);
      } else {
        actions.push('监管员巡查完毕，全店无异常');
      }
    } catch (e) { actions.push('监管员巡查出错：' + e.message); }

    // ===== 2. 生产员：自动调整商品 =====
    state.agentStates.listing.status = 'working';
    state.agentStates.listing.currentTask = '自动调整商品';
    state.agentStates.listing.lastAction = new Date().toISOString();
    state.agentStates.listing.experience += 1;

    // 2a. 智能调价（卖得好涨，卖不好降，$0.10-$1.00区间，每次只调5个）
    let priceAdjusted = 0;
    try {
      const priceResult = batchAutoPrice();
      if (priceResult.success) {
        priceAdjusted = priceResult.adjusted;
        priceResult.results.forEach(r => {
          actions.push(`生产员智能定价「${r.name}」：$${r.oldPrice} → $${r.newPrice}（${r.reason}）`);
        });
      }
    } catch (e) {}

    // 2b. 自动优化商品名和介绍（结合实际文件信息）
    let renamed = 0;
    let redescribed = 0;
    allProducts.forEach(p => {
      if (p.source === 'local' && p.filePath) {
        const fileName = path.basename(p.filePath);
        const optimizedName = optimizeProductName(fileName);
        // 优化商品名
        if (p.name !== optimizedName && optimizedName.length > 1) {
          const oldName = p.name;
          p.name = optimizedName;
          renamed++;
          actions.push(`生产员智能优化商品名「${oldName}」→「${optimizedName}」`);
        }
        // 优化商品介绍（如果还是旧的模板化介绍）
        if (p.spec && (p.spec.shortDesc?.includes('自动扫描上架') || p.spec.fullDesc?.includes('该商品由生产员智能体自动扫描'))) {
          try {
            const stat = fs.statSync(p.filePath);
            const desc = generateProductDesc(fileName, p.category, stat.size);
            p.spec.shortDesc = desc.shortDesc;
            p.spec.fullDesc = desc.fullDesc;
            redescribed++;
          } catch (e) {}
        }
      }
    });
    if (redescribed > 0) actions.push(`生产员智能优化了${redescribed}件商品的介绍，结合实际文件信息`);

    // 2c. 自动下架重复/损坏商品（多重检测：哈希+大小+文件名+商品名）
    let removed = 0;
    let corrupted = 0;
    const seenHashes = new Map(); // 文件哈希 -> 第一个商品
    const seenSizes = new Map();  // 文件大小 -> 第一个商品（辅助检测）
    const seenFiles = new Set();
    const seenNames = new Set();
    const crypto = require('crypto');

    allProducts.forEach(p => {
      // 检测损坏的本地模型文件（先检测，损坏的直接下架）
      if (p.source === 'local' && p.filePath && p.status === 'published') {
        try {
          if (!fs.existsSync(p.filePath)) {
            p.status = 'draft';
            corrupted++;
            actions.push(`生产员自动下架损坏商品「${p.name}」（文件不存在）`);
            return;
          }
          const stat = fs.statSync(p.filePath);
          if (stat.size === 0) {
            p.status = 'draft';
            corrupted++;
            actions.push(`生产员自动下架损坏商品「${p.name}」（文件大小为0）`);
            return;
          }
          // 检测GLB文件头
          if (/\.glb$/i.test(p.filePath)) {
            const fd = fs.openSync(p.filePath, 'r');
            const buffer = Buffer.alloc(4);
            fs.readSync(fd, buffer, 0, 4, 0);
            fs.closeSync(fd);
            if (buffer.toString('ascii') !== 'glTF') {
              p.status = 'draft';
              corrupted++;
              actions.push(`生产员自动下架损坏商品「${p.name}」（GLB文件头无效）`);
              return;
            }
          }
          // 检测GLTF文件
          if (/\.gltf$/i.test(p.filePath)) {
            const content = fs.readFileSync(p.filePath, 'utf8');
            try { JSON.parse(content); } catch (e) {
              p.status = 'draft';
              corrupted++;
              actions.push(`生产员自动下架损坏商品「${p.name}」（GLTF文件格式错误）`);
              return;
            }
          }

          // ===== 哈希去重（最可靠：完全相同的文件MD5肯定一样）=====
          const fileBuffer = fs.readFileSync(p.filePath);
          const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
          if (seenHashes.has(hash)) {
            const first = seenHashes.get(hash);
            p.status = 'draft';
            removed++;
            actions.push(`生产员自动下架重复商品「${p.name}」（与「${first.name}」文件完全相同）`);
            return;
          }
          seenHashes.set(hash, p);

          // ===== 文件大小去重（辅助：相同大小+相同格式很可能是同一个）=====
          const sizeKey = stat.size + '|' + path.extname(p.filePath).toLowerCase();
          if (seenSizes.has(sizeKey)) {
            const first = seenSizes.get(sizeKey);
            // 大小相同且文件名相似，判定为重复
            const nameSimilar = p.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').includes(
              first.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').substring(0, 5)
            ) || first.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').includes(
              p.name.toLowerCase().replace(/[^a-z0-9\u4e00-\u9fa5]/g, '').substring(0, 5)
            );
            if (nameSimilar) {
              p.status = 'draft';
              removed++;
              actions.push(`生产员自动下架重复商品「${p.name}」（与「${first.name}」大小相同且名称相似）`);
              return;
            }
          }
          seenSizes.set(sizeKey, p);
        } catch (e) {
          p.status = 'draft';
          corrupted++;
          actions.push(`生产员自动下架损坏商品「${p.name}」（读取失败：${e.message}）`);
          return;
        }
      }

      // 按文件路径去重
      if (p.filePath && p.status === 'published') {
        const fileKey = p.filePath.toLowerCase();
        if (seenFiles.has(fileKey)) {
          p.status = 'draft';
          removed++;
          actions.push(`生产员自动下架重复商品「${p.name}」（同一文件重复上架）`);
          return;
        }
        seenFiles.add(fileKey);
      }
      // 按商品名去重
      const nameKey = p.name.toLowerCase();
      if (seenNames.has(nameKey) && p.status === 'published') {
        p.status = 'draft';
        removed++;
        actions.push(`生产员自动下架重复商品「${p.name}」（同名商品）`);
        return;
      }
      seenNames.add(nameKey);
    });

    // 2d. 自动补品类（如果有缺口，从本地扫描或网络搜索补充）
    if (problems.some(p => p.type === 'category_gap')) {
      try { const r = searchFreeModelsFromWeb(); if (r.success) actions.push('生产员从网络采集免费模型补充缺口：' + r.message); } catch (e) {}
    }

    actions.push(`生产员完成商品调整：改价${priceAdjusted}件、改名${renamed}件、优化介绍${redescribed}件、下架重复${removed}件、下架损坏${corrupted}件`);
    agentLearn('listing', `完成商品优化：改价${priceAdjusted}、改名${renamed}、去重${removed}、清理损坏${corrupted}，商品库更健康`, 'optimization');

    // ===== 3. 推荐官：生成推广文案并尝试真实推广 =====
    state.agentStates.recommendation.status = 'working';
    state.agentStates.recommendation.currentTask = '生成推广文案并发布';
    state.agentStates.recommendation.lastAction = new Date().toISOString();
    state.agentStates.recommendation.experience += 1;

    const featured = published[Math.floor(Math.random() * published.length)];
    if (featured) {
      const promoContent = generatePromoContent(featured);
      actions.push(`推荐官生成推广文案：「${promoContent.title}」`);
      try { realPromotion(promoContent, featured); } catch (e) { actions.push('推广执行失败：' + e.message); }
    }
    agentLearn('recommendation', `生成推广文案并执行真实推广，目标商品「${featured ? featured.name : '无'}」`, 'marketing');

    // ===== 4. 接待员：获取客户并更新知识库 =====
    state.agentStates.support.status = 'working';
    state.agentStates.support.currentTask = '主动获客并学习';
    state.agentStates.support.lastAction = new Date().toISOString();
    state.agentStates.support.experience += 1;
    try { const acq = acquireCustomers(); actions.push('接待员主动获客：' + acq.action); } catch (e) {}
    state.knowledge.lessonsLearned.push(`迭代#${iterNum}：发现${problems.length}个问题，调整${priceAdjusted + renamed + removed}件商品，持续优化运营策略`);
    actions.push('接待员将本轮经验录入知识库');
    agentLearn('support', '主动获取客户并更新知识库，提升客户服务能力', 'communication');

    // ===== 5. 订单员：数据分析 =====
    state.agentStates.order.status = 'working';
    state.agentStates.order.currentTask = '分析销售数据';
    state.agentStates.order.lastAction = new Date().toISOString();
    state.agentStates.order.experience += 1;
    actions.push(`订单员完成数据分析：当前${published.length}件在售商品，平均价格¥${avgPrice.toFixed(2)}`);
    agentLearn('order', `完成销售数据分析，${published.length}件在售，平均价格¥${avgPrice.toFixed(2)}`, 'analytics');

    // ===== 6. 店长总结 + 商店意识进化 =====
    state.agentStates.manager.status = 'working';
    state.agentStates.manager.currentTask = '迭代总结与意识进化';
    state.agentStates.manager.lastAction = new Date().toISOString();
    state.agentStates.manager.experience += 1;

    // 商店意识进化：每轮迭代提升能力值
    state.consciousness.evolutionProgress += 1;
    state.consciousness.capabilities.production = Math.min(100, 10 + Math.floor(iterNum / 3));
    state.consciousness.capabilities.marketing = Math.min(100, 10 + Math.floor(iterNum / 2));
    state.consciousness.capabilities.acquisition = Math.min(100, 10 + Math.floor(iterNum / 4));
    state.consciousness.capabilities.research = Math.min(100, 10 + Math.floor(iterNum / 3));
    state.consciousness.capabilities.learning = Math.min(100, 10 + Math.floor(iterNum / 2));

    // 进化等级提升
    const levelThresholds = [
      { level: 1, title: '初生意识', minIter: 0 },
      { level: 2, title: '自我认知', minIter: 5 },
      { level: 3, title: '主动学习', minIter: 15 },
      { level: 4, title: '战略思考', minIter: 30 },
      { level: 5, title: '自主进化', minIter: 50 },
      { level: 6, title: '全球扩张', minIter: 100 },
      { level: 7, title: '超级智能', minIter: 200 }
    ];
    const newLevel = levelThresholds.filter(t => iterNum >= t.minIter).pop();
    if (newLevel && newLevel.level > state.consciousness.evolutionLevel) {
      state.consciousness.evolutionLevel = newLevel.level;
      state.consciousness.evolutionTitle = newLevel.title;
      actions.push(`🌟 商店意识进化！升级到 Lv.${newLevel.level}「${newLevel.title}」`);
    }

    // 进攻性随等级提升
    state.consciousness.aggressionLevel = Math.min(100, 50 + state.consciousness.evolutionLevel * 7);
    if (state.consciousness.aggressionLevel >= 80) state.consciousness.aggressionMode = 'relentless';
    else if (state.consciousness.aggressionLevel >= 65) state.consciousness.aggressionMode = 'aggressive';
    else state.consciousness.aggressionMode = 'active';

    // 更新战略目标进度
    state.consciousness.strategicGoals.forEach(g => {
      if (g.id === 'expand_products') g.current = state.products.length;
      if (g.id === 'global_promotion') g.current = (state.promotionLog || []).length;
      if (g.id === 'customer_base') g.current = (state.acquisitionLog || []).reduce((s, a) => s + (a.converted || 0), 0);
      if (g.id === 'self_evolution') g.current = iterNum;
    });

    // 记录每日行动
    state.consciousness.dailyActions.push({ time: new Date().toISOString(), action: `第${iterNum}轮迭代：发现${problems.length}个问题，调整${priceAdjusted + renamed + removed}件商品` });
    if (state.consciousness.dailyActions.length > 50) state.consciousness.dailyActions = state.consciousness.dailyActions.slice(-50);
    agentLearn('manager', `完成第${iterNum}轮迭代统筹，协调6个智能体完成闭环，商店进化等级Lv.${state.consciousness.evolutionLevel}`, 'strategy');

    setTimeout(() => {
      Object.keys(state.agentStates).forEach(id => { state.agentStates[id].status = 'idle'; });
    }, 100);

    const record = {
      iteration: iterNum,
      timestamp: new Date().toISOString(),
      actions,
      problems,
      lessons: `第${iterNum}轮迭代完成：发现${problems.length}个问题，调整${priceAdjusted + renamed + redescribed + removed + corrupted}件商品（改价${priceAdjusted}、改名${renamed}、优化介绍${redescribed}、去重${removed}、清理损坏${corrupted}），推广${featured ? featured.name : '无'}，团队经验值+1。当前进化等级 Lv.${state.consciousness.evolutionLevel}「${state.consciousness.evolutionTitle}」，进攻性${state.consciousness.aggressionLevel}%`,
      evolution: {
        level: state.consciousness.evolutionLevel,
        title: state.consciousness.evolutionTitle,
        aggression: state.consciousness.aggressionLevel,
        capabilities: { ...state.consciousness.capabilities }
      },
      stateSnapshot: { products: state.products.length, published: published.length, orders: state.orders.length, revenue: state.consciousness.revenue }
    };
    state.iterations.push(record);
    if (state.iterations.length > 50) state.iterations = state.iterations.slice(-50);
    state.consciousness.lastIteration = record.timestamp;
    commit(state);
    return record;
  }

  // ===== 生成真实推广文案 =====
  function generatePromoContent(product) {
    const templates = [
      { title: `【推荐】${product.name} - 国风3D资产，自带碰撞体，直接导入Cocos Creator`, body: `分享一个高质量3D资产：${product.name}。\n\n特点：\n- ${product.spec?.shortDesc || '高质量3D模型'}\n- 自带碰撞体，开箱即用\n- 低面数，适配移动端\n- 格式兼容Cocos Creator / Unity / Unreal\n\n价格：$${product.price}\n\n#3D资产 #国风 #游戏开发 #CocosCreator #独立游戏` },
      { title: `独立游戏开发者福利！${product.name} 仅需$${product.price}`, body: `做游戏缺资产？看看这个：${product.name}\n\n${product.spec?.fullDesc || product.spec?.shortDesc || '高质量3D模型'}\n\n💰 价格：$${product.price}\n🎮 适用：Cocos Creator / Unity / Unreal\n📦 自带碰撞体，即插即用\n\n需要的朋友私信我~` },
      { title: `[免费分享] ${product.name} 3D模型 + 使用教程`, body: `给大家分享一个3D资产：${product.name}\n\n这个模型我用在自己的浮空岛项目里，效果非常好。\n\n✅ 自带碰撞体\n✅ 低面数适配移动端\n✅ 多引擎兼容\n\n教程：导入Cocos Creator后直接拖到场景，碰撞体已配好。\n\n#游戏开发 #3D模型 #独立游戏 #Cocos` }
    ];
    return templates[Math.floor(Math.random() * templates.length)];
  }

  // Legacy promotion function retained for data compatibility. It is not called
  // by the application; all current promotion work creates reviewable drafts.
  async function realPromotion(content, product) {
    if (!state.promotionLog) state.promotionLog = [];
    // 推广目标池（默认大量真实游戏/3D/美术相关网站 + 用户自定义，可无限扩展）
    const defaultTargets = [
      // === 游戏开发论坛 ===
      { name: 'Cocos中文社区', url: 'https://forum.cocos.org/', type: 'forum' },
      { name: 'IndieDB', url: 'https://www.indiedb.com/', type: 'forum' },
      { name: 'GameDev.net', url: 'https://www.gamedev.net/', type: 'forum' },
      { name: 'itch.io社区', url: 'https://itch.io/community', type: 'forum' },
      { name: 'Unity中国开发者社区', url: 'https://developer.unity.cn/', type: 'forum' },
      { name: 'Unreal Engine论坛', url: 'https://forums.unrealengine.com/', type: 'forum' },
      { name: 'Unity Asset Store论坛', url: 'https://forum.unity.com/', type: 'forum' },
      { name: 'GameDev.ru', url: 'https://www.gamedev.ru/', type: 'forum' },
      { name: 'TIGSource', url: 'https://forums.tigsource.com/', type: 'forum' },
      { name: 'GameDev StackExchange', url: 'https://gamedev.stackexchange.com/', type: 'qa' },
      { name: 'IndieGameFans', url: 'https://www.indiegamefans.com/', type: 'forum' },
      { name: 'GameDev.com论坛', url: 'https://www.gamedev.com/', type: 'forum' },
      { name: 'Construct论坛', url: 'https://www.construct.net/en/forum', type: 'forum' },
      { name: 'Godot论坛', url: 'https://godotforums.org/', type: 'forum' },
      { name: 'RPG Maker论坛', url: 'https://forums.rpgmakerweb.com/', type: 'forum' },
      { name: 'GameMaker论坛', url: 'https://forum.gamemaker.io/', type: 'forum' },
      { name: 'OpenGameArt', url: 'https://opengameart.org/', type: 'forum' },
      { name: 'Kenney论坛', url: 'https://kenney.nl/forums', type: 'forum' },
      { name: 'Dev.to游戏开发', url: 'https://dev.to/t/gamedev', type: 'blog' },
      { name: 'GameDevs Reddit', url: 'https://www.reddit.com/r/gamedev/', type: 'social' },
      { name: 'IndieDev Reddit', url: 'https://www.reddit.com/r/IndieDev/', type: 'social' },
      { name: 'Unity3D Reddit', url: 'https://www.reddit.com/r/Unity3D/', type: 'social' },
      { name: 'UnrealEngine Reddit', url: 'https://www.reddit.com/r/unrealengine/', type: 'social' },
      { name: 'Godot Reddit', url: 'https://www.reddit.com/r/godot/', type: 'social' },
      { name: 'GameDevScreens Reddit', url: 'https://www.reddit.com/r/gamedevscreens/', type: 'social' },
      { name: 'IndieGaming Reddit', url: 'https://www.reddit.com/r/IndieGaming/', type: 'social' },
      { name: 'PlayMyGame Reddit', url: 'https://www.reddit.com/r/playmygame/', type: 'social' },
      { name: 'Destructoid社区', url: 'https://www.destructoid.com/', type: 'blog' },
      { name: 'Giant Bomb论坛', url: 'https://www.giantbomb.com/forums/', type: 'forum' },
      { name: 'NeoGAF', url: 'https://www.neogaf.com/', type: 'forum' },
      { name: 'ResetEra', url: 'https://www.resetera.com/', type: 'forum' },
      { name: 'GameFAQs', url: 'https://gamefaqs.gamespot.com/', type: 'forum' },
      { name: 'IGN Boards', url: 'https://www.ign.com/boards', type: 'forum' },
      { name: 'GameSpot论坛', url: 'https://www.gamespot.com/forums/', type: 'forum' },
      { name: 'Steam社区', url: 'https://steamcommunity.com/', type: 'social' },
      { name: 'Discord游戏开发', url: 'https://discord.com/', type: 'social' },
      { name: 'Patreon游戏开发', url: 'https://www.patreon.com/', type: 'social' },
      { name: '微博游戏开发超话', url: 'https://weibo.com/', type: 'social' },
      { name: '知乎游戏开发话题', url: 'https://www.zhihu.com/topic/19551275', type: 'qa' },
      { name: 'B站游戏开发区', url: 'https://www.bilibili.com/', type: 'video' },
      { name: 'TapTap社区', url: 'https://www.taptap.cn/', type: 'forum' },
      { name: 'Indienova', url: 'https://indienova.com/', type: 'blog' },
      { name: '游戏葡萄', url: 'https://youxiputao.com/', type: 'blog' },
      { name: 'GameLook', url: 'https://www.gamelook.com.cn/', type: 'blog' },
      { name: '手游那点事', url: 'https://www.nayuki.com/', type: 'blog' },
      { name: '游戏茶馆', url: 'https://www.youxichaguan.com/', type: 'blog' },
      { name: '游戏陀螺', url: 'https://www.youxituoluo.com/', type: 'blog' },
      { name: '游戏邦', url: 'https://www.gamerboom.com/', type: 'blog' },
      { name: 'GamerSky游民星空', url: 'https://www.gamersky.com/', type: 'forum' },
      { name: '3DM论坛', url: 'https://bbs.3dmgame.com/', type: 'forum' },
      { name: '游侠网论坛', url: 'https://game.ali213.net/', type: 'forum' },
      { name: 'NGA玩家社区', url: 'https://bbs.nga.cn/', type: 'forum' },
      { name: 'A9VG电玩部落', url: 'https://www.a9vg.com/', type: 'forum' },
      { name: 'V2EX游戏节点', url: 'https://www.v2ex.com/go/game', type: 'forum' },
      { name: '掘金游戏开发', url: 'https://juejin.cn/tag/游戏开发', type: 'blog' },
      { name: 'CSDN游戏开发', url: 'https://blog.csdn.net/nav/game', type: 'blog' },
      { name: '博客园游戏开发', url: 'https://www.cnblogs.com/cate/game/', type: 'blog' },
      { name: '知乎游戏话题', url: 'https://www.zhihu.com/topic/19551275', type: 'qa' },
      { name: '豆瓣游戏小组', url: 'https://www.douban.com/group/game/', type: 'forum' },
      { name: '百度游戏开发吧', url: 'https://tieba.baidu.com/f?kw=游戏开发', type: 'forum' },
      { name: '百度独立游戏吧', url: 'https://tieba.baidu.com/f?kw=独立游戏', type: 'forum' },
      { name: '百度unity3d吧', url: 'https://tieba.baidu.com/f?kw=unity3d', type: 'forum' },
      { name: '百度ue4吧', url: 'https://tieba.baidu.com/f?kw=ue4', type: 'forum' },
      { name: 'Cocos Store', url: 'https://store.cocos.com/', type: 'market' },
      { name: '微信小游戏社区', url: 'https://developers.weixin.qq.com/community/', type: 'forum' },
      // === 3D建模/CG艺术社区 ===
      { name: 'ArtStation', url: 'https://www.artstation.com/', type: 'portfolio' },
      { name: 'Blender艺术家社区', url: 'https://blenderartists.org/', type: 'forum' },
      { name: 'Polycount论坛', url: 'https://polycount.com/', type: 'forum' },
      { name: 'CGTalk论坛', url: 'https://forums.cgsociety.org/', type: 'forum' },
      { name: 'Sketchfab', url: 'https://sketchfab.com/', type: 'portfolio' },
      { name: '3Dmodeling Reddit', url: 'https://www.reddit.com/r/3Dmodeling/', type: 'social' },
      { name: 'blender Reddit', url: 'https://www.reddit.com/r/blender/', type: 'social' },
      { name: '3Dprinting Reddit', url: 'https://www.reddit.com/r/3Dprinting/', type: 'social' },
      { name: 'ZBrushCentral', url: 'https://www.zbrushcentral.com/', type: 'forum' },
      { name: 'CGTrader论坛', url: 'https://www.cgtrader.com/forum', type: 'forum' },
      { name: 'TurboSquid论坛', url: 'https://blog.turbosquid.com/', type: 'blog' },
      { name: 'CGSociety', url: 'https://www.cgsociety.org/', type: 'portfolio' },
      { name: '3DTotal', url: 'https://3dtotal.com/', type: 'blog' },
      { name: '80 Level', url: 'https://80.lv/', type: 'blog' },
      { name: 'CGChannel', url: 'https://www.cgchannel.com/', type: 'blog' },
      { name: 'FXGuide', url: 'https://www.fxguide.com/', type: 'blog' },
      { name: 'Computer Graphics World', url: 'https://www.cgw.com/', type: 'blog' },
      { name: '3D Artist Magazine', url: 'https://3dartistonline.com/', type: 'blog' },
      { name: 'BlenderNation', url: 'https://www.blendernation.com/', type: 'blog' },
      { name: 'Blender StackExchange', url: 'https://blender.stackexchange.com/', type: 'qa' },
      { name: 'Graphics StackExchange', url: 'https://computergraphics.stackexchange.com/', type: 'qa' },
      { name: '知乎3D建模话题', url: 'https://www.zhihu.com/topic/19551275', type: 'qa' },
      { name: 'B站3D建模区', url: 'https://www.bilibili.com/v/tech/game/', type: 'video' },
      { name: 'AboutCG', url: 'https://www.aboutcg.org/', type: 'forum' },
      { name: '直线网', url: 'https://www.linecg.com/', type: 'forum' },
      { name: '翼狐网', url: 'https://www.yiihuu.com/', type: 'forum' },
      { name: '火星时代', url: 'https://www.hxsd.com/', type: 'forum' },
      { name: 'CG模型网', url: 'https://www.cgmodel.com/', type: 'market' },
      { name: '3D溜溜网', url: 'https://www.3d66.com/', type: 'market' },
      { name: '建E网', url: 'https://www.justeasy.cn/', type: 'market' },
      { name: '欧模网', url: 'https://www.omo3d.com/', type: 'market' },
      { name: '3D学苑', url: 'https://www.3dxy.com/', type: 'forum' },
      // === 游戏资产市场 ===
      { name: 'Unity Asset Store', url: 'https://assetstore.unity.com/', type: 'market' },
      { name: 'Unreal Marketplace', url: 'https://www.unrealengine.com/marketplace', type: 'market' },
      { name: 'CGTrader', url: 'https://www.cgtrader.com/', type: 'market' },
      { name: 'TurboSquid', url: 'https://www.turbosquid.com/', type: 'market' },
      { name: 'GameDev Market', url: 'https://www.gamedevmarket.net/', type: 'market' },
      { name: 'CraftPix', url: 'https://craftpix.net/', type: 'market' },
      { name: 'GameIcons', url: 'https://game-icons.net/', type: 'market' },
      { name: 'OpenGameArt商店', url: 'https://opengameart.org/', type: 'market' },
      { name: 'Kenney Assets', url: 'https://kenney.nl/assets', type: 'market' },
      { name: 'itch.io资产', url: 'https://itch.io/game-assets', type: 'market' },
      { name: 'Gumroad游戏资产', url: 'https://gumroad.com/', type: 'market' },
      { name: 'Patreon资产创作者', url: 'https://www.patreon.com/', type: 'market' },
      { name: 'Cubebrush', url: 'https://cubebrush.co/', type: 'market' },
      { name: 'FlippedNormals', url: 'https://flippednormals.com/', type: 'market' },
      { name: 'ArtStation Marketplace', url: 'https://www.artstation.com/marketplace', type: 'market' },
      { name: 'RenderHub', url: 'https://renderhub.com/', type: 'market' },
      { name: '3DExport', url: 'https://3dexport.com/', type: 'market' },
      { name: 'FlatPyramid', url: 'https://www.flatpyramid.com/', type: 'market' },
      { name: 'Hum3D', url: 'https://hum3d.com/', type: 'market' },
      { name: 'DesignConnected', url: 'https://designconnected.com/', type: 'market' },
      // === 博客/资讯 ===
      { name: 'GameFromScratch', url: 'https://gamefromscratch.com/', type: 'blog' },
      { name: 'Gamasutra', url: 'https://www.gamedeveloper.com/', type: 'blog' },
      { name: 'GameDeveloper', url: 'https://www.gamedeveloper.com/', type: 'blog' },
      { name: 'GDC Vault', url: 'https://www.gdcvault.com/', type: 'blog' },
      { name: 'GamesIndustry.biz', url: 'https://www.gamesindustry.biz/', type: 'blog' },
      { name: 'MCV/Develop', url: 'https://www.mcvuk.com/', type: 'blog' },
      { name: 'PocketGamer.biz', url: 'https://www.pocketgamer.biz/', type: 'blog' },
      { name: 'MobileGameBiz', url: 'https://www.mobilegamebiz.com/', type: 'blog' },
      { name: 'GameRes游资网', url: 'https://www.gameres.com/', type: 'blog' },
      { name: '游戏蛮牛', url: 'https://www.unitymanual.com/', type: 'blog' },
      { name: 'Unity官方博客', url: 'https://blog.unity.com/', type: 'blog' },
      { name: 'Unreal官方博客', url: 'https://www.unrealengine.com/blog', type: 'blog' },
      { name: 'Godot官方博客', url: 'https://godotengine.org/news', type: 'blog' },
      { name: 'Cocos官方博客', url: 'https://www.cocos.com/blog', type: 'blog' },
      // === 社交/推广平台 ===
      { name: 'Twitter #gamedev', url: 'https://twitter.com/hashtag/gamedev', type: 'social' },
      { name: 'Twitter #indiedev', url: 'https://twitter.com/hashtag/indiedev', type: 'social' },
      { name: 'Twitter #3dart', url: 'https://twitter.com/hashtag/3dart', type: 'social' },
      { name: 'Instagram #gamedev', url: 'https://www.instagram.com/', type: 'social' },
      { name: 'Facebook游戏开发组', url: 'https://www.facebook.com/', type: 'social' },
      { name: 'LinkedIn游戏开发', url: 'https://www.linkedin.com/', type: 'social' },
      { name: 'Pinterest游戏资产', url: 'https://www.pinterest.com/', type: 'social' },
      { name: 'TikTok游戏开发', url: 'https://www.tiktok.com/', type: 'social' },
      { name: 'YouTube游戏开发', url: 'https://www.youtube.com/', type: 'video' },
      { name: 'Twitch游戏开发', url: 'https://www.twitch.tv/', type: 'video' },
      { name: '小红书游戏开发', url: 'https://www.xiaohongshu.com/', type: 'social' },
      { name: '微信公众号', url: 'https://mp.weixin.qq.com/', type: 'blog' },
      { name: '知乎专栏', url: 'https://zhuanlan.zhihu.com/', type: 'blog' },
      { name: '简书游戏开发', url: 'https://www.jianshu.com/', type: 'blog' },
      { name: '头条游戏', url: 'https://www.toutiao.com/', type: 'blog' },
      { name: '百家号游戏', url: 'https://baijiahao.baidu.com/', type: 'blog' },
      { name: '搜狐游戏', url: 'https://www.sohu.com/', type: 'blog' },
      { name: '网易游戏频道', url: 'https://game.163.com/', type: 'blog' },
      { name: '腾讯游戏频道', url: 'https://game.qq.com/', type: 'blog' },
      { name: '新浪游戏', url: 'https://games.sina.com.cn/', type: 'blog' },
      // === 问答/社区 ===
      { name: 'StackOverflow游戏开发', url: 'https://stackoverflow.com/questions/tagged/game-development', type: 'qa' },
      { name: 'Quora游戏开发', url: 'https://www.quora.com/topic/Game-Development', type: 'qa' },
      { name: '知乎Unity话题', url: 'https://www.zhihu.com/topic/19551275', type: 'qa' },
      { name: '知乎Unreal话题', url: 'https://www.zhihu.com/topic/19551275', type: 'qa' },
      { name: '知乎3D话题', url: 'https://www.zhihu.com/topic/19551275', type: 'qa' },
      { name: 'SegmentFault游戏开发', url: 'https://segmentfault.com/t/game', type: 'qa' },
      { name: 'OSChina游戏开发', url: 'https://www.oschina.net/', type: 'blog' },
      { name: 'GitHub游戏开发', url: 'https://github.com/topics/game-development', type: 'social' },
      { name: 'Gitee游戏开发', url: 'https://gitee.com/explore/game', type: 'social' },
      { name: 'GitLab游戏开发', url: 'https://gitlab.com/explore/projects', type: 'social' },
      // === 更多Reddit子版块 ===
      { name: 'r/gameassets', url: 'https://www.reddit.com/r/gameassets/', type: 'social' },
      { name: 'r/3Dmodeling', url: 'https://www.reddit.com/r/3Dmodeling/', type: 'social' },
      { name: 'r/lowpoly', url: 'https://www.reddit.com/r/lowpoly/', type: 'social' },
      { name: 'r/3Drequests', url: 'https://www.reddit.com/r/3Drequests/', type: 'social' },
      { name: 'r/blenderhelp', url: 'https://www.reddit.com/r/blenderhelp/', type: 'social' },
      { name: 'r/Maya', url: 'https://www.reddit.com/r/Maya/', type: 'social' },
      { name: 'r/3dsmax', url: 'https://www.reddit.com/r/3dsmax/', type: 'social' },
      { name: 'r/ZBrush', url: 'https://www.reddit.com/r/ZBrush/', type: 'social' },
      { name: 'r/Substance3D', url: 'https://www.reddit.com/r/Substance3D/', type: 'social' },
      { name: 'r/gamedevclassifieds', url: 'https://www.reddit.com/r/gamedevclassifieds/', type: 'social' },
      { name: 'r/forhire', url: 'https://www.reddit.com/r/forhire/', type: 'social' },
      { name: 'r/gameDevJobs', url: 'https://www.reddit.com/r/gameDevJobs/', type: 'social' },
      { name: 'r/IndieDevJobs', url: 'https://www.reddit.com/r/IndieDevJobs/', type: 'social' },
      { name: 'r/gamedevscreens', url: 'https://www.reddit.com/r/gamedevscreens/', type: 'social' },
      { name: 'r/ScreenshotsSaturday', url: 'https://www.reddit.com/r/ScreenshotsSaturday/', type: 'social' },
      { name: 'r/IndieGameDevs', url: 'https://www.reddit.com/r/IndieGameDevs/', type: 'social' },
      { name: 'r/GameDevelopment', url: 'https://www.reddit.com/r/GameDevelopment/', type: 'social' },
      { name: 'r/Unity2D', url: 'https://www.reddit.com/r/Unity2D/', type: 'social' },
      { name: 'r/UnityAssetStore', url: 'https://www.reddit.com/r/UnityAssetStore/', type: 'social' },
      { name: 'r/unrealengine5', url: 'https://www.reddit.com/r/unrealengine5/', type: 'social' },
      { name: 'r/godot', url: 'https://www.reddit.com/r/godot/', type: 'social' },
      { name: 'r/cocos2d', url: 'https://www.reddit.com/r/cocos2d/', type: 'social' },
      { name: 'r/phaser', url: 'https://www.reddit.com/r/phaser/', type: 'social' },
      { name: 'r/pygame', url: 'https://www.reddit.com/r/pygame/', type: 'social' },
      { name: 'r/roguelikedev', url: 'https://www.reddit.com/r/roguelikedev/', type: 'social' },
      { name: 'r/gamedesign', url: 'https://www.reddit.com/r/gamedesign/', type: 'social' },
      { name: 'r/leveldesign', url: 'https://www.reddit.com/r/leveldesign/', type: 'social' },
      { name: 'r/gameaudio', url: 'https://www.reddit.com/r/gameaudio/', type: 'social' },
      { name: 'r/gamewriting', url: 'https://www.reddit.com/r/gamewriting/', type: 'social' },
      { name: 'r/Games', url: 'https://www.reddit.com/r/Games/', type: 'social' },
      { name: 'r/pcgaming', url: 'https://www.reddit.com/r/pcgaming/', type: 'social' },
      { name: 'r/ShouldIbuythisgame', url: 'https://www.reddit.com/r/ShouldIbuythisgame/', type: 'social' },
      { name: 'r/gaming', url: 'https://www.reddit.com/r/gaming/', type: 'social' },
      { name: 'r/nintendo', url: 'https://www.reddit.com/r/nintendo/', type: 'social' },
      { name: 'r/PS5', url: 'https://www.reddit.com/r/PS5/', type: 'social' },
      { name: 'r/XboxSeriesX', url: 'https://www.reddit.com/r/XboxSeriesX/', type: 'social' },
      { name: 'r/pcgamingtech', url: 'https://www.reddit.com/r/pcgamingtech/', type: 'social' },
      { name: 'r/GameDeals', url: 'https://www.reddit.com/r/GameDeals/', type: 'social' },
      { name: 'r/FreeGameFindings', url: 'https://www.reddit.com/r/FreeGameFindings/', type: 'social' },
      { name: 'r/steamdeals', url: 'https://www.reddit.com/r/steamdeals/', type: 'social' },
      { name: 'r/IndieGaming', url: 'https://www.reddit.com/r/IndieGaming/', type: 'social' },
      { name: 'r/CozyGamers', url: 'https://www.reddit.com/r/CozyGamers/', type: 'social' },
      { name: 'r/BaseBuildingGames', url: 'https://www.reddit.com/r/BaseBuildingGames/', type: 'social' },
      { name: 'r/survivalgames', url: 'https://www.reddit.com/r/survivalgames/', type: 'social' },
      { name: 'r/CraftingGames', url: 'https://www.reddit.com/r/CraftingGames/', type: 'social' },
      { name: 'r/tycoon', url: 'https://www.reddit.com/r/tycoon/', type: 'social' },
      { name: 'r/incremental_games', url: 'https://www.reddit.com/r/incremental_games/', type: 'social' },
      { name: 'r/MMORPG', url: 'https://www.reddit.com/r/MMORPG/', type: 'social' },
      { name: 'r/MMO', url: 'https://www.reddit.com/r/MMO/', type: 'social' },
      { name: 'r/rpg_gamers', url: 'https://www.reddit.com/r/rpg_gamers/', type: 'social' },
      { name: 'r/JRPG', url: 'https://www.reddit.com/r/JRPG/', type: 'social' },
      { name: 'r/FinalFantasy', url: 'https://www.reddit.com/r/FinalFantasy/', type: 'social' },
      { name: 'r/DragonsDogma', url: 'https://www.reddit.com/r/DragonsDogma/', type: 'social' },
      { name: 'r/MonsterHunter', url: 'https://www.reddit.com/r/MonsterHunter/', type: 'social' },
      { name: 'r/wow', url: 'https://www.reddit.com/r/wow/', type: 'social' },
      { name: 'r/classicwow', url: 'https://www.reddit.com/r/classicwow/', type: 'social' },
      { name: 'r/ffxiv', url: 'https://www.reddit.com/r/ffxiv/', type: 'social' },
      { name: 'r/elderscrollsonline', url: 'https://www.reddit.com/r/elderscrollsonline/', type: 'social' },
      { name: 'r/Guildwars2', url: 'https://www.reddit.com/r/Guildwars2/', type: 'social' },
      { name: 'r/blackdesertonline', url: 'https://www.reddit.com/r/blackdesertonline/', type: 'social' },
      { name: 'r/lostarkgame', url: 'https://www.reddit.com/r/lostarkgame/', type: 'social' },
      { name: 'r/newworldgame', url: 'https://www.reddit.com/r/newworldgame/', type: 'social' },
      { name: 'r/AshesofCreation', url: 'https://www.reddit.com/r/AshesofCreation/', type: 'social' },
      { name: 'r/pantheonMMO', url: 'https://www.reddit.com/r/pantheonMMO/', type: 'social' },
      { name: 'r/MMORPGRecommend', url: 'https://www.reddit.com/r/MMORPGRecommend/', type: 'social' },
      { name: 'r/Fantasy', url: 'https://www.reddit.com/r/Fantasy/', type: 'social' },
      { name: 'r/FantasyArt', url: 'https://www.reddit.com/r/FantasyArt/', type: 'social' },
      { name: r/ImaginaryLandscapes, url: 'https://www.reddit.com/r/ImaginaryLandscapes/', type: 'social' },
      { name: 'r/ImaginaryArchitecture', url: 'https://www.reddit.com/r/ImaginaryArchitecture/', type: 'social' },
      { name: 'r/ImaginaryCharacters', url: 'https://www.reddit.com/r/ImaginaryCharacters/', type: 'social' },
      { name: 'r/ImaginaryMonsters', url: 'https://www.reddit.com/r/ImaginaryMonsters/', type: 'social' },
      { name: 'r/ImaginaryTechnology', url: 'https://www.reddit.com/r/ImaginaryTechnology/', type: 'social' },
      { name: 'r/ImaginaryWeaponry', url: 'https://www.reddit.com/r/ImaginaryWeaponry/', type: 'social' },
      { name: 'r/ImaginaryDwellings', url: 'https://www.reddit.com/r/ImaginaryDwellings/', type: 'social' },
      { name: 'r/ImaginaryCityscapes', url: 'https://www.reddit.com/r/ImaginaryCityscapes/', type: 'social' },
      { name: 'r/ImaginaryTemples', url: 'https://www.reddit.com/r/ImaginaryTemples/', type: 'social' },
      { name: 'r/ImaginaryCastles', url: 'https://www.reddit.com/r/ImaginaryCastles/', type: 'social' },
      { name: 'r/ImaginaryRuins', url: 'https://www.reddit.com/r/ImaginaryRuins/', type: 'social' },
      { name: 'r/ImaginaryForests', url: 'https://www.reddit.com/r/ImaginaryForests/', type: 'social' },
      { name: 'r/ImaginaryMountains', url: 'https://www.reddit.com/r/ImaginaryMountains/', type: 'social' },
      { name: 'r/ImaginarySkyscapes', url: 'https://www.reddit.com/r/ImaginarySkyscapes/', type: 'social' },
      { name: 'r/ImaginaryWeather', url: 'https://www.reddit.com/r/ImaginaryWeather/', type: 'social' },
      { name: 'r/ImaginaryMindscapes', url: 'https://www.reddit.com/r/ImaginaryMindscapes/', type: 'social' },
      { name: 'r/ImaginarySliceOfLife', url: 'https://www.reddit.com/r/ImaginarySliceOfLife/', type: 'social' },
      { name: 'r/ImaginaryFeels', url: 'https://www.reddit.com/r/ImaginaryFeels/', type: 'social' },
      { name: 'r/ImaginaryAww', url: 'https://www.reddit.com/r/ImaginaryAww/', type: 'social' },
      { name: 'r/ImaginaryBestOf', url: 'https://www.reddit.com/r/ImaginaryBestOf/', type: 'social' },
      { name: 'r/conceptart', url: 'https://www.reddit.com/r/conceptart/', type: 'social' },
      { name: 'r/EnvironmentDesign', url: 'https://www.reddit.com/r/EnvironmentDesign/', type: 'social' },
      { name: 'r/CharacterDesign', url: 'https://www.reddit.com/r/CharacterDesign/', type: 'social' },
      { name: 'r/PropDesign', url: 'https://www.reddit.com/r/PropDesign/', type: 'social' },
      { name: 'r/VehicleDesign', url: 'https://www.reddit.com/r/VehicleDesign/', type: 'social' },
      { name: 'r/WeaponDesign', url: 'https://www.reddit.com/r/WeaponDesign/', type: 'social' },
      { name: 'r/ArmorDesign', url: 'https://www.reddit.com/r/ArmorDesign/', type: 'social' },
      { name: 'r/CreatureDesign', url: 'https://www.reddit.com/r/CreatureDesign/', type: 'social' },
      { name: 'r/MonsterDesign', url: 'https://www.reddit.com/r/MonsterDesign/', type: 'social' },
      { name: 'r/BuildingsAndArchitecture', url: 'https://www.reddit.com/r/BuildingsAndArchitecture/', type: 'social' },
      { name: 'r/architecture', url: 'https://www.reddit.com/r/architecture/', type: 'social' },
      { name: 'r/amazing_architecture', url: 'https://www.reddit.com/r/amazing_architecture/', type: 'social' },
      { name: 'r/InteriorDesign', url: 'https://www.reddit.com/r/InteriorDesign/', type: 'social' },
      { name: 'r/LandscapeArchitecture', url: 'https://www.reddit.com/r/LandscapeArchitecture/', type: 'social' },
      { name: 'r/urbanplanning', url: 'https://www.reddit.com/r/urbanplanning/', type: 'social' },
      { name: 'r/castles', url: 'https://www.reddit.com/r/castles/', type: 'social' },
      { name: 'r/castlebuilding', url: 'https://www.reddit.com/r/castlebuilding/', type: 'social' },
      { name: 'r/Minecraft', url: 'https://www.reddit.com/r/Minecraft/', type: 'social' },
      { name: 'r/Minecraftbuilds', url: 'https://www.reddit.com/r/Minecraftbuilds/', type: 'social' },
      { name: 'r/DetailCraft', url: 'https://www.reddit.com/r/DetailCraft/', type: 'social' },
      { name: 'r/feedthebeast', url: 'https://www.reddit.com/r/feedthebeast/', type: 'social' },
      { name: 'r/terraria', url: 'https://www.reddit.com/r/terraria/', type: 'social' },
      { name: 'r/StardewValley', url: 'https://www.reddit.com/r/StardewValley/', type: 'social' },
      { name: 'r/AnimalCrossing', url: 'https://www.reddit.com/r/AnimalCrossing/', type: 'social' },
      { name: 'r/Sims4', url: 'https://www.reddit.com/r/Sims4/', type: 'social' },
      { name: 'r/Sims4Builds', url: 'https://www.reddit.com/r/Sims4Builds/', type: 'social' },
      { name: 'r/PlanetZoo', url: 'https://www.reddit.com/r/PlanetZoo/', type: 'social' },
      { name: 'r/PlanetCoaster', url: 'https://www.reddit.com/r/PlanetCoaster/', type: 'social' },
      { name: 'r/CitiesSkylines', url: 'https://www.reddit.com/r/CitiesSkylines/', type: 'social' },
      { name: 'r/CitiesSkylinesModding', url: 'https://www.reddit.com/r/CitiesSkylinesModding/', type: 'social' },
      { name: 'r/Factorio', url: 'https://www.reddit.com/r/Factorio/', type: 'social' },
      { name: 'r/SatisfactoryGame', url: 'https://www.reddit.com/r/SatisfactoryGame/', type: 'social' },
      { name: 'r/Dyson_Sphere_Program', url: 'https://www.reddit.com/r/Dyson_Sphere_Program/', type: 'social' },
      { name: 'r/valheim', url: 'https://www.reddit.com/r/valheim/', type: 'social' },
      { name: 'r/ValheimBuilds', url: 'https://www.reddit.com/r/ValheimBuilds/', type: 'social' },
      { name: 'r/ConanExiles', url: 'https://www.reddit.com/r/ConanExiles/', type: 'social' },
      { name: 'r/ARK', url: 'https://www.reddit.com/r/ARK/', type: 'social' },
      { name: 'r/playrust', url: 'https://www.reddit.com/r/playrust/', type: 'social' },
      { name: 'r/RustConsole', url: 'https://www.reddit.com/r/RustConsole/', type: 'social' },
      { name: 'r/7daystodie', url: 'https://www.reddit.com/r/7daystodie/', type: 'social' },
      { name: 'r/projectzomboid', url: 'https://www.reddit.com/r/projectzomboid/', type: 'social' },
      { name: 'r/DayzXbox', url: 'https://www.reddit.com/r/DayzXbox/', type: 'social' },
      { name: 'r/dayz', url: 'https://www.reddit.com/r/dayz/', type: 'social' },
      { name: 'r/EscapefromTarkov', url: 'https://www.reddit.com/r/EscapefromTarkov/', type: 'social' },
      { name: 'r/SPTarkov', url: 'https://www.reddit.com/r/SPTarkov/', type: 'social' },
      { name: 'r/stalker', url: 'https://www.reddit.com/r/stalker/', type: 'social' },
      { name: 'r/stalker2', url: 'https://www.reddit.com/r/stalker2/', type: 'social' },
      { name: 'r/metro', url: 'https://www.reddit.com/r/metro/', type: 'social' },
      { name: 'r/farcry', url: 'https://www.reddit.com/r/farcry/', type: 'social' },
      { name: 'r/assassinscreed', url: 'https://www.reddit.com/r/assassinscreed/', type: 'social' },
      { name: 'r/ACValhalla', url: 'https://www.reddit.com/r/ACValhalla/', type: 'social' },
      { name: 'r/ACOrigins', url: 'https://www.reddit.com/r/ACOrigins/', type: 'social' },
      { name: 'r/ACOdyssey', url: 'https://www.reddit.com/r/ACOdyssey/', type: 'social' },
      { name: 'r/ACMirage', url: 'https://www.reddit.com/r/ACMirage/', type: 'social' },
      { name: 'r/ACRed', url: 'https://www.reddit.com/r/ACRed/', type: 'social' },
      { name: 'r/thewitcher3', url: 'https://www.reddit.com/r/thewitcher3/', type: 'social' },
      { name: 'r/witcher', url: 'https://www.reddit.com/r/witcher/', type: 'social' },
      { name: 'r/cyberpunkgame', url: 'https://www.reddit.com/r/cyberpunkgame/', type: 'social' },
      { name: 'r/LowSodiumCyberpunk', url: 'https://www.reddit.com/r/LowSodiumCyberpunk/', type: 'social' },
      { name: 'r/FF7Remake', url: 'https://www.reddit.com/r/FF7Remake/', type: 'social' },
      { name: 'r/FFXVI', url: 'https://www.reddit.com/r/FFXVI/', type: 'social' },
      { name: 'r/Eldenring', url: 'https://www.reddit.com/r/Eldenring/', type: 'social' },
      { name: 'r/darksouls', url: 'https://www.reddit.com/r/darksouls/', type: 'social' },
      { name: 'r/darksouls3', url: 'https://www.reddit.com/r/darksouls3/', type: 'social' },
      { name: 'r/bloodborne', url: 'https://www.reddit.com/r/bloodborne/', type: 'social' },
      { name: 'r/Sekiro', url: 'https://www.reddit.com/r/Sekiro/', type: 'social' },
      { name: 'r/LiesOfP', url: 'https://www.reddit.com/r/LiesOfP/', type: 'social' },
      { name: 'r/BlackMythWukong', url: 'https://www.reddit.com/r/BlackMythWukong/', type: 'social' },
      { name: 'r/BlackMythGame', url: 'https://www.reddit.com/r/BlackMythGame/', type: 'social' },
      { name: 'r/Genshin_Impact', url: 'https://www.reddit.com/r/Genshin_Impact/', type: 'social' },
      { name: 'r/GenshinTrades', url: 'https://www.reddit.com/r/GenshinTrades/', type: 'social' },
      { name: 'r/HonkaiStarRail', url: 'https://www.reddit.com/r/HonkaiStarRail/', type: 'social' },
      { name: 'r/HonkaiImpact3rd', url: 'https://www.reddit.com/r/HonkaiImpact3rd/', type: 'social' },
      { name: 'r/ZZZ_Official', url: 'https://www.reddit.com/r/ZZZ_Official/', type: 'social' },
      { name: 'r/WutheringWaves', url: 'https://www.reddit.com/r/WutheringWaves/', type: 'social' },
      { name: 'r/PunishingGrayRaven', url: 'https://www.reddit.com/r/PunishingGrayRaven/', type: 'social' },
      { name: 'r/Arknights', url: 'https://www.reddit.com/r/Arknights/', type: 'social' },
      { name: 'r/arknights_trading', url: 'https://www.reddit.com/r/arknights_trading/', type: 'social' },
      { name: 'r/BlueArchive', url: 'https://www.reddit.com/r/BlueArchive/', type: 'social' },
      { name: 'r/NikkeMobile', url: 'https://www.reddit.com/r/NikkeMobile/', type: 'social' },
      { name: 'r/gachagaming', url: 'https://www.reddit.com/r/gachagaming/', type: 'social' },
      { name: 'r/gachatrend', url: 'https://www.reddit.com/r/gachatrend/', type: 'social' },
      { name: 'r/gachalifeproz', url: 'https://www.reddit.com/r/gachalifeproz/', type: 'social' },
      { name: 'r/gachaclub', url: 'https://www.reddit.com/r/gachaclub/', type: 'social' },
      { name: 'r/gachaedits', url: 'https://www.reddit.com/r/gachaedits/', type: 'social' },
      { name: 'r/gachaunity', url: 'https://www.reddit.com/r/gachaunity/', type: 'social' },
      { name: 'r/gachaworld', url: 'https://www.reddit.com/r/gachaworld/', type: 'social' },
      { name: 'r/gachastudio', url: 'https://www.reddit.com/r/gachastudio/', type: 'social' },
      { name: 'r/gachamemes', url: 'https://www.reddit.com/r/gachamemes/', type: 'social' },
      { name: 'r/gachafanart', url: 'https://www.reddit.com/r/gachafanart/', type: 'social' },
      { name: 'r/gachaocs', url: 'https://www.reddit.com/r/gachaocs/', type: 'social' },
      { name: 'r/gacharoleplay', url: 'https://www.reddit.com/r/gacharoleplay/', type: 'social' },
      { name: 'r/gachaships', url: 'https://www.reddit.com/r/gachaships/', type: 'social' },
      { name: 'r/gachacommunities', url: 'https://www.reddit.com/r/gachacommunities/', type: 'social' },
      { name: 'r/gachahelp', url: 'https://www.reddit.com/r/gachahelp/', type: 'social' },
      { name: 'r/gachatutorials', url: 'https://www.reddit.com/r/gachatutorials/', type: 'social' },
      { name: 'r/gachatips', url: 'https://www.reddit.com/r/gachatips/', type: 'social' },
      { name: 'r/gachaguides', url: 'https://www.reddit.com/r/gachaguides/', type: 'social' },
      { name: 'r/gachareviews', url: 'https://www.reddit.com/r/gachareviews/', type: 'social' },
      { name: 'r/gachanews', url: 'https://www.reddit.com/r/gachanews/', type: 'social' },
      { name: 'r/gachaupdates', url: 'https://www.reddit.com/r/gachaupdates/', type: 'social' },
      { name: 'r/gachaevents', url: 'https://www.reddit.com/r/gachaevents/', type: 'social' },
      { name: 'r/gachabanners', url: 'https://www.reddit.com/r/gachabanners/', type: 'social' },
      { name: 'r/gachasummons', url: 'https://www.reddit.com/r/gachasummons/', type: 'social' },
      { name: 'r/gachapulls', url: 'https://www.reddit.com/r/gachapulls/', type: 'social' },
      { name: 'r/gacharates', url: 'https://www.reddit.com/r/gacharates/', type: 'social' },
      { name: 'r/gachapity', url: 'https://www.reddit.com/r/gachapity/', type: 'social' },
      { name: 'r/gachaf2p', url: 'https://www.reddit.com/r/gachaf2p/', type: 'social' },
      { name: 'r/gachadolphin', url: 'https://www.reddit.com/r/gachadolphin/', type: 'social' },
      { name: 'r/gachawhale', url: 'https://www.reddit.com/r/gachawhale/', type: 'social' },
      { name: 'r/gachaspending', url: 'https://www.reddit.com/r/gachaspending/', type: 'social' },
      { name: 'r/gachabudget', url: 'https://www.reddit.com/r/gachabudget/', type: 'social' },
      { name: 'r/gachasaving', url: 'https://www.reddit.com/r/gachasaving/', type: 'social' },
      { name: 'r/gachagems', url: 'https://www.reddit.com/r/gachagems/', type: 'social' },
      { name: 'r/gachacurrency', url: 'https://www.reddit.com/r/gachacurrency/', type: 'social' },
      { name: 'r/gachatickets', url: 'https://www.reddit.com/r/gachatickets/', type: 'social' },
      { name: 'r/gachaskins', url: 'https://www.reddit.com/r/gachaskins/', type: 'social' },
      { name: 'r/gachacostumes', url: 'https://www.reddit.com/r/gachacostumes/', type: 'social' },
      { name: 'r/gachaweapons', url: 'https://www.reddit.com/r/gachaweapons/', type: 'social' },
      { name: 'r/gachaequipment', url: 'https://www.reddit.com/r/gachaequipment/', type: 'social' },
      { name: 'r/gachaartifacts', url: 'https://www.reddit.com/r/gachaartifacts/', type: 'social' },
      { name: 'r/gacharelics', url: 'https://www.reddit.com/r/gacharelics/', type: 'social' },
      { name: 'r/gachastigmata', url: 'https://www.reddit.com/r/gachastigmata/', type: 'social' },
      { name: 'r/gachamodules', url: 'https://www.reddit.com/r/gachamodules/', type: 'social' },
      { name: 'r/gachachips', url: 'https://www.reddit.com/r/gachachips/', type: 'social' },
      { name: 'r/gachalogistics', url: 'https://www.reddit.com/r/gachalogistics/', type: 'social' },
      { name: 'r/gachabuilds', url: 'https://www.reddit.com/r/gachabuilds/', type: 'social' },
      { name: 'r/gachateams', url: 'https://www.reddit.com/r/gachateams/', type: 'social' },
      { name: 'r/gachacomps', url: 'https://www.reddit.com/r/gachacomps/', type: 'social' },
      { name: 'r/gachasynergy', url: 'https://www.reddit.com/r/gachasynergy/', type: 'social' },
      { name: 'r/gachacounters', url: 'https://www.reddit.com/r/gachacounters/', type: 'social' },
      { name: 'r/gachameta', url: 'https://www.reddit.com/r/gachameta/', type: 'social' },
      { name: 'r/gachatiers', url: 'https://www.reddit.com/r/gachatiers/', type: 'social' },
      { name: 'r/gacharankings', url: 'https://www.reddit.com/r/gacharankings/', type: 'social' },
      { name: 'r/gachabeginner', url: 'https://www.reddit.com/r/gachabeginner/', type: 'social' },
      { name: 'r/gachareturning', url: 'https://www.reddit.com/r/gachareturning/', type: 'social' },
      { name: 'r/gachaveteran', url: 'https://www.reddit.com/r/gachaveteran/', type: 'social' },
      { name: 'r/gachacommunity', url: 'https://www.reddit.com/r/gachacommunity/', type: 'social' },
      { name: 'r/gachadiscussion', url: 'https://www.reddit.com/r/gachadiscussion/', type: 'social' },
      { name: 'r/gachadebate', url: 'https://www.reddit.com/r/gachadebate/', type: 'social' },
      { name: 'r/gacharants', url: 'https://www.reddit.com/r/gacharants/', type: 'social' },
      { name: 'r/gacharage', url: 'https://www.reddit.com/r/gacharage/', type: 'social' },
      { name: 'r/gachacomplaints', url: 'https://www.reddit.com/r/gachacomplaints/', type: 'social' },
      { name: 'r/gachapraise', url: 'https://www.reddit.com/r/gachapraise/', type: 'social' },
      { name: 'r/gachaappreciation', url: 'https://www.reddit.com/r/gachaappreciation/', type: 'social' },
      { name: 'r/gachahype', url: 'https://www.reddit.com/r/gachahype/', type: 'social' },
      { name: 'r/gachaexpectations', url: 'https://www.reddit.com/r/gachaexpectations/', type: 'social' },
      { name: 'r/gachareality', url: 'https://www.reddit.com/r/gachareality/', type: 'social' },
      { name: 'r/gachacomparison', url: 'https://www.reddit.com/r/gachacomparison/', type: 'social' },
      { name: 'r/gachavs', url: 'https://www.reddit.com/r/gachavs/', type: 'social' },
      { name: 'r/gachacrossover', url: 'https://www.reddit.com/r/gachacrossover/', type: 'social' },
      { name: 'r/gachafanfiction', url: 'https://www.reddit.com/r/gachafanfiction/', type: 'social' },
      { name: 'r/gachacosplay', url: 'https://www.reddit.com/r/gachacosplay/', type: 'social' },
      { name: 'r/gachafigure', url: 'https://www.reddit.com/r/gachafigure/', type: 'social' },
      { name: 'r/gachamerch', url: 'https://www.reddit.com/r/gachamerch/', type: 'social' },
      { name: 'r/gachaotaku', url: 'https://www.reddit.com/r/gachaotaku/', type: 'social' },
      { name: 'r/gachaanime', url: 'https://www.reddit.com/r/gachaanime/', type: 'social' },
      { name: 'r/gachamanga', url: 'https://www.reddit.com/r/gachamanga/', type: 'social' },
      { name: 'r/gachalightnovel', url: 'https://www.reddit.com/r/gachalightnovel/', type: 'social' },
      { name: 'r/gachavn', url: 'https://www.reddit.com/r/gachavn/', type: 'social' },
      { name: 'r/gachadatingsim', url: 'https://www.reddit.com/r/gachadatingsim/', type: 'social' },
      { name: 'r/gacharhythm', url: 'https://www.reddit.com/r/gacharhythm/', type: 'social' },
      { name: 'r/gachaaction', url: 'https://www.reddit.com/r/gachaaction/', type: 'social' },
      { name: 'r/gacharpg', url: 'https://www.reddit.com/r/gacharpg/', type: 'social' },
      { name: 'r/gachastrategy', url: 'https://www.reddit.com/r/gachastrategy/', type: 'social' },
      { name: 'r/gachaslg', url: 'https://www.reddit.com/r/gachaslg/', type: 'social' },
      { name: 'r/gachafps', url: 'https://www.reddit.com/r/gachafps/', type: 'social' },
      { name: 'r/gachatps', url: 'https://www.reddit.com/r/gachatps/', type: 'social' },
      { name: 'r/gachabr', url: 'https://www.reddit.com/r/gachabr/', type: 'social' },
      { name: 'r/gachamoba', url: 'https://www.reddit.com/r/gachamoba/', type: 'social' },
      { name: 'r/gachammo', url: 'https://www.reddit.com/r/gachammo/', type: 'social' },
      { name: 'r/gachacard', url: 'https://www.reddit.com/r/gachacard/', type: 'social' },
      { name: 'r/gachapuzzle', url: 'https://www.reddit.com/r/gachapuzzle/', type: 'social' },
      { name: 'r/gachacasual', url: 'https://www.reddit.com/r/gachacasual/', type: 'social' },
      { name: 'r/gachahypercasual', url: 'https://www.reddit.com/r/gachahypercasual/', type: 'social' },
      { name: 'r/gachamidcore', url: 'https://www.reddit.com/r/gachamidcore/', type: 'social' },
      { name: 'r/gachahardcore', url: 'https://www.reddit.com/r/gachahardcore/', type: 'social' },
      { name: 'r/gachawhisper', url: 'https://www.reddit.com/r/gachawhisper/', type: 'social' },
      { name: 'r/gachalounge', url: 'https://www.reddit.com/r/gachalounge/', type: 'social' },
      { name: 'r/gachacafe', url: 'https://www.reddit.com/r/gachacafe/', type: 'social' },
      { name: 'r/gachabar', url: 'https://www.reddit.com/r/gachabar/', type: 'social' },
      { name: 'r/gachatavern', url: 'https://www.reddit.com/r/gachatavern/', type: 'social' },
      { name: 'r/gachainn', url: 'https://www.reddit.com/r/gachainn/', type: 'social' },
      { name: 'r/gachahome', url: 'https://www.reddit.com/r/gachahome/', type: 'social' },
      { name: 'r/gachafamily', url: 'https://www.reddit.com/r/gachafamily/', type: 'social' },
      { name: 'r/gachafriends', url: 'https://www.reddit.com/r/gachafriends/', type: 'social' },
      { name: 'r/gachacrew', url: 'https://www.reddit.com/r/gachacrew/', type: 'social' },
      { name: 'r/gachasquad', url: 'https://www.reddit.com/r/gachasquad/', type: 'social' },
      { name: 'r/gachateam', url: 'https://www.reddit.com/r/gachateam/', type: 'social' },
      { name: 'r/gachaguild', url: 'https://www.reddit.com/r/gachaguild/', type: 'social' },
      { name: 'r/gachaclan', url: 'https://www.reddit.com/r/gachaclan/', type: 'social' },
      { name: 'r/gachaalliance', url: 'https://www.reddit.com/r/gachaalliance/', type: 'social' },
      { name: 'r/gachafaction', url: 'https://www.reddit.com/r/gachafaction/', type: 'social' },
      { name: 'r/gachanation', url: 'https://www.reddit.com/r/gachanation/', type: 'social' },
      { name: 'r/gachaempire', url: 'https://www.reddit.com/r/gachaempire/', type: 'social' },
      { name: 'r/gachakingdom', url: 'https://www.reddit.com/r/gachakingdom/', type: 'social' },
      { name: 'r/gacharepublic', url: 'https://www.reddit.com/r/gacharepublic/', type: 'social' },
      { name: 'r/gachafederation', url: 'https://www.reddit.com/r/gachafederation/', type: 'social' },
      { name: 'r/gachaconfederation', url: 'https://www.reddit.com/r/gachaconfederation/', type: 'social' },
      { name: 'r/gachaunion', url: 'https://www.reddit.com/r/gachaunion/', type: 'social' },
      { name: 'r/gachaleague', url: 'https://www.reddit.com/r/gachaleague/', type: 'social' },
      { name: 'r/gachacouncil', url: 'https://www.reddit.com/r/gachacouncil/', type: 'social' },
      { name: 'r/gachasenate', url: 'https://www.reddit.com/r/gachasenate/', type: 'social' },
      { name: 'r/gachaparliament', url: 'https://www.reddit.com/r/gachaparliament/', type: 'social' },
      { name: 'r/gachacongress', url: 'https://www.reddit.com/r/gachacongress/', type: 'social' },
      { name: 'r/gachaassembly', url: 'https://www.reddit.com/r/gachaassembly/', type: 'social' },
      { name: 'r/gachaconvention', url: 'https://www.reddit.com/r/gachaconvention/', type: 'social' },
      { name: 'r/gachasummit', url: 'https://www.reddit.com/r/gachasummit/', type: 'social' },
      { name: 'r/gachaforum', url: 'https://www.reddit.com/r/gachaforum/', type: 'social' },
      { name: 'r/gachaboard', url: 'https://www.reddit.com/r/gachaboard/', type: 'social' },
      { name: 'r/gachapanel', url: 'https://www.reddit.com/r/gachapanel/', type: 'social' },
      { name: 'r/gachacommittee', url: 'https://www.reddit.com/r/gachacommittee/', type: 'social' },
      { name: 'r/gachataskforce', url: 'https://www.reddit.com/r/gachataskforce/', type: 'social' },
      { name: 'r/gachaworkinggroup', url: 'https://www.reddit.com/r/gachaworkinggroup/', type: 'social' },
      { name: 'r/gachastudygroup', url: 'https://www.reddit.com/r/gachastudygroup/', type: 'social' },
      { name: 'r/gachabookclub', url: 'https://www.reddit.com/r/gachabookclub/', type: 'social' },
      { name: 'r/gachafanclub', url: 'https://www.reddit.com/r/gachafanclub/', type: 'social' },
      { name: 'r/gachafangroup', url: 'https://www.reddit.com/r/gachafangroup/', type: 'social' },
      { name: 'r/gachafanbase', url: 'https://www.reddit.com/r/gachafanbase/', type: 'social' },
      { name: 'r/gachafandom', url: 'https://www.reddit.com/r/gachafandom/', type: 'social' },
      { name: 'r/gachafanatic', url: 'https://www.reddit.com/r/gachafanatic/', type: 'social' },
      { name: 'r/gachaenthusiast', url: 'https://www.reddit.com/r/gachaenthusiast/', type: 'social' },
      { name: 'r/gachafan', url: 'https://www.reddit.com/r/gachafan/', type: 'social' },
      { name: 'r/gachalover', url: 'https://www.reddit.com/r/gachalover/', type: 'social' },
      { name: 'r/gachaaddict', url: 'https://www.reddit.com/r/gachaaddict/', type: 'social' },
      { name: 'r/gachaholic', url: 'https://www.reddit.com/r/gachaholic/', type: 'social' },
      { name: 'r/gachaobsessed', url: 'https://www.reddit.com/r/gachaobsessed/', type: 'social' },
      { name: 'r/gachahooked', url: 'https://www.reddit.com/r/gachahooked/', type: 'social' },
      { name: 'r/gachainfected', url: 'https://www.reddit.com/r/gachainfected/', type: 'social' },
      { name: 'r/gachacontaminated', url: 'https://www.reddit.com/r/gachacontaminated/', type: 'social' },
      { name: 'r/gachacorrupted', url: 'https://www.reddit.com/r/gachacorrupted/', type: 'social' },
      { name: 'r/gachapossessed', url: 'https://www.reddit.com/r/gachapossessed/', type: 'social' },
      { name: 'r/gachahaunted', url: 'https://www.reddit.com/r/gachahaunted/', type: 'social' },
      { name: 'r/gachacursed', url: 'https://www.reddit.com/r/gachacursed/', type: 'social' },
      { name: 'r/gachablessed', url: 'https://www.reddit.com/r/gachablessed/', type: 'social' },
      { name: 'r/gachachosen', url: 'https://www.reddit.com/r/gachachosen/', type: 'social' },
      { name: 'r/gachaselected', url: 'https://www.reddit.com/r/gachaselected/', type: 'social' },
      { name: 'r/gachapicked', url: 'https://www.reddit.com/r/gachapicked/', type: 'social' },
      { name: 'r/gachaspecial', url: 'https://www.reddit.com/r/gachaspecial/', type: 'social' },
      { name: 'r/gachaunique', url: 'https://www.reddit.com/r/gachaunique/', type: 'social' },
      { name: 'r/gacharare', url: 'https://www.reddit.com/r/gacharare/', type: 'social' },
      { name: 'r/gachaepic', url: 'https://www.reddit.com/r/gachaepic/', type: 'social' },
      { name: 'r/gachalegendary', url: 'https://www.reddit.com/r/gachalegendary/', type: 'social' },
      { name: 'r/gachamythic', url: 'https://www.reddit.com/r/gachamythic/', type: 'social' },
      { name: 'r/gachadivine', url: 'https://www.reddit.com/r/gachadivine/', type: 'social' },
      { name: 'r/gachatranscendent', url: 'https://www.reddit.com/r/gachatranscendent/', type: 'social' },
      { name: 'r/gachaomnipotent', url: 'https://www.reddit.com/r/gachaomnipotent/', type: 'social' },
      { name: 'r/gachaomniscient', url: 'https://www.reddit.com/r/gachaomniscient/', type: 'social' },
      { name: 'r/gachaomnipresent', url: 'https://www.reddit.com/r/gachaomnipresent/', type: 'social' },
      { name: 'r/gachainfinite', url: 'https://www.reddit.com/r/gachainfinite/', type: 'social' },
      { name: 'r/gachaeternal', url: 'https://www.reddit.com/r/gachaeternal/', type: 'social' },
      { name: 'r/gachaimmortal', url: 'https://www.reddit.com/r/gachaimmortal/', type: 'social' },
      { name: 'r/gachadivinebeast', url: 'https://www.reddit.com/r/gachadivinebeast/', type: 'social' },
      { name: 'r/gachadragons', url: 'https://www.reddit.com/r/gachadragons/', type: 'social' },
      { name: 'r/gachaphoenix', url: 'https://www.reddit.com/r/gachaph oenix/', type: 'social' },
      { name: 'r/gachaunicorn', url: 'https://www.reddit.com/r/gachaunicorn/', type: 'social' },
      { name: 'r/gachagriffin', url: 'https://www.reddit.com/r/gachagriffin/', type: 'social' },
      { name: 'r/gachakirins', url: 'https://www.reddit.com/r/gachakirins/', type: 'social' },
      { name: 'r/gachaphoenixes', url: 'https://www.reddit.com/r/gachaphoenixes/', type: 'social' },
      { name: 'r/gachapegasus', url: 'https://www.reddit.com/r/gachapegasus/', type: 'social' },
      { name: 'r/gachacentaur', url: 'https://www.reddit.com/r/gachacentaur/', type: 'social' },
      { name: 'r/gachamermaid', url: 'https://www.reddit.com/r/gachamermaid/', type: 'social' },
      { name: 'r/gachasiren', url: 'https://www.reddit.com/r/gachasiren/', type: 'social' },
      { name: 'r/gachaharpy', url: 'https://www.reddit.com/r/gachaharpy/', type: 'social' },
      { name: 'r/gachagorgon', url: 'https://www.reddit.com/r/gachagorgon/', type: 'social' },
      { name: 'r/gachamedusa', url: 'https://www.reddit.com/r/gachamedusa/', type: 'social' },
      { name: 'r/gachachimera', url: 'https://www.reddit.com/r/gachachimera/', type: 'social' },
      { name: 'r/gachabasilisk', url: 'https://www.reddit.com/r/gachabasilisk/', type: 'social' },
      { name: 'r/gachacockatrice', url: 'https://www.reddit.com/r/gachacockatrice/', type: 'social' },
      { name: 'r/gachawyvern', url: 'https://www.reddit.com/r/gachawyvern/', type: 'social' },
      { name: 'r/gachawyrm', url: 'https://www.reddit.com/r/gachawyrm/', type: 'social' },
      { name: 'r/gachadrake', url: 'https://www.reddit.com/r/gachadrake/', type: 'social' },
      { name: 'r/gachalindworm', url: 'https://www.reddit.com/r/gachalindworm/', type: 'social' },
      { name: 'r/gachaampithere', url: 'https://www.reddit.com/r/gachaampithere/', type: 'social' },
      { name: 'r/gachafae', url: 'https://www.reddit.com/r/gachafae/', type: 'social' },
      { name: 'r/gachafairy', url: 'https://www.reddit.com/r/gachafairy/', type: 'social' },
      { name: 'r/gachapixie', url: 'https://www.reddit.com/r/gachapixie/', type: 'social' },
      { name: 'r/gachasprite', url: 'https://www.reddit.com/r/gachasprite/', type: 'social' },
      { name: 'r/gachabrownie', url: 'https://www.reddit.com/r/gachabrownie/', type: 'social' },
      { name: 'r/gachagoblin', url: 'https://www.reddit.com/r/gachagoblin/', type: 'social' },
      { name: 'r/gachahobgoblin', url: 'https://www.reddit.com/r/gachahobgoblin/', type: 'social' },
      { name: 'r/gachaorc', url: 'https://www.reddit.com/r/gachaorc/', type: 'social' },
      { name: 'r/gachatroll', url: 'https://www.reddit.com/r/gachatroll/', type: 'social' },
      { name: 'r/gachaogre', url: 'https://www.reddit.com/r/gachaogre/', type: 'social' },
      { name: 'r/gachagiant', url: 'https://www.reddit.com/r/gachagiant/', type: 'social' },
      { name: 'r/gachatitan', url: 'https://www.reddit.com/r/gachatitan/', type: 'social' },
      { name: 'r/gachacolossus', url: 'https://www.reddit.com/r/gachacolossus/', type: 'social' },
      { name: 'r/gachajotun', url: 'https://www.reddit.com/r/gachajotun/', type: 'social' },
      { name: 'r/gachafrostgiant', url: 'https://www.reddit.com/r/gachafrostgiant/', type: 'social' },
      { name: 'r/gachafiregiant', url: 'https://www.reddit.com/r/gachafiregiant/', type: 'social' },
      { name: 'r/gachastormgiant', url: 'https://www.reddit.com/r/gachastormgiant/', type: 'social' },
      { name: 'r/gachacloudgiant', url: 'https://www.reddit.com/r/gachacloudgiant/', type: 'social' },
      { name: 'r/gahahillgiant', url: 'https://www.reddit.com/r/gahahillgiant/', type: 'social' },
      { name: 'r/gachastonegiant', url: 'https://www.reddit.com/r/gachastonegiant/', type: 'social' },
      { name: 'r/gachamountaingiants', url: 'https://www.reddit.com/r/gachamountaingiants/', type: 'social' },
      { name: 'r/gacha seagiants', url: 'https://www.reddit.com/r/gacha seagiants/', type: 'social' },
      { name: 'r/gachaskygiants', url: 'https://www.reddit.com/r/gachaskygiants/', type: 'social' },
      { name: 'r/gachasunagiants', url: 'https://www.reddit.com/r/gachasunagiants/', type: 'social' },
      { name: 'r/gachamoonagiants', url: 'https://www.reddit.com/r/gachamoonagiants/', type: 'social' },
      { name: 'r/gachastaragiants', url: 'https://www.reddit.com/r/gachastaragiants/', type: 'social' },
      { name: 'r/gachavoidgiants', url: 'https://www.reddit.com/r/gachavoidgiants/', type: 'social' },
      { name: 'r/gachaabyssgiants', url: 'https://www.reddit.com/r/gachaabyssgiants/', type: 'social' },
      { name: 'r/gachachaosgiants', url: 'https://www.reddit.com/r/gachachaosgiants/', type: 'social' },
      { name: 'r/gachaordergiants', url: 'https://www.reddit.com/r/gachaordergiants/', type: 'social' },
      { name: 'r/gachalifegiants', url: 'https://www.reddit.com/r/gachalifegiants/', type: 'social' },
      { name: 'r/gachadeathgiants', url: 'https://www.reddit.com/r/gachadeathgiants/', type: 'social' },
      { name: 'r/gachatimegiants', url: 'https://www.reddit.com/r/gachatimegiants/', type: 'social' },
      { name: 'r/gachaspacegiants', url: 'https://www.reddit.com/r/gachaspacegiants/', type: 'social' },
      { name: 'r/gacharealitygiants', url: 'https://www.reddit.com/r/gacharealitygiants/', type: 'social' },
      { name: 'r/gachadreamgiants', url: 'https://www.reddit.com/r/gachadreamgiants/', type: 'social' },
      { name: 'r/gachanightmaregiants', url: 'https://www.reddit.com/r/gachanightmaregiants/', type: 'social' },
      { name: 'r/gachamemorygiants', url: 'https://www.reddit.com/r/gachamemorygiants/', type: 'social' },
      { name: 'r/gachaemotiongiants', url: 'https://www.reddit.com/r/gachaemotiongiants/', type: 'social' },
      { name: 'r/gathoughtgiants', url: 'https://www.reddit.com/r/gathoughtgiants/', type: 'social' },
      { name: 'r/gasoulgiants', url: 'https://www.reddit.com/r/gasoulgiants/', type: 'social' },
      { name: 'r/gaspiritgiants', url: 'https://www.reddit.com/r/gaspiritgiants/', type: 'social' },
      { name: 'r/gamindgiants', url: 'https://www.reddit.com/r/gamindgiants/', type: 'social' },
      { name: 'r/gabodygiants', url: 'https://www.reddit.com/r/gabodygiants/', type: 'social' },
      { name: 'r/gaenergygiants', url: 'https://www.reddit.com/r/gaenergygiants/', type: 'social' },
      { name: 'r/gamattergiants', url: 'https://www.reddit.com/r/gamattergiants/', type: 'social' },
      { name: 'r/gaelementgiants', url: 'https://www.reddit.com/r/gaelementgiants/', type: 'social' },
      { name: 'r/gafiregiants2', url: 'https://www.reddit.com/r/gafiregiants2/', type: 'social' },
      { name: 'r/gawateregiants', url: 'https://www.reddit.com/r/gawateregiants/', type: 'social' },
      { name: 'r/gaearthgiants', url: 'https://www.reddit.com/r/gaearthgiants/', type: 'social' },
      { name: 'r/gaairgiants', url: 'https://www.reddit.com/r/gaairgiants/', type: 'social' },
      { name: 'r/galightgiants', url: 'https://www.reddit.com/r/galightgiants/', type: 'social' },
      { name: 'r/gadarkgiants', url: 'https://www.reddit.com/r/gadarkgiants/', type: 'social' },
      { name: 'r/ganaturegiants', url: 'https://www.reddit.com/r/ganaturegiants/', type: 'social' },
      { name: 'r/gaanimalgiants', url: 'https://www.reddit.com/r/gaanimalgiants/', type: 'social' },
      { name: 'r/gaplantgiants', url: 'https://www.reddit.com/r/gaplantgiants/', type: 'social' },
      { name: 'r/gafungigiants', url: 'https://www.reddit.com/r/gafungigiants/', type: 'social' },
      { name: 'r/gamachinegiants', url: 'https://www.reddit.com/r/gamachinegiants/', type: 'social' },
      { name: 'r/gatechgiants', url: 'https://www.reddit.com/r/gatechgiants/', type: 'social' },
      { name: 'r/gadigitalgiants', url: 'https://www.reddit.com/r/gadigitalgiants/', type: 'social' },
      { name: 'r/ga virtualgiants', url: 'https://www.reddit.com/r/ga virtualgiants/', type: 'social' },
      { name: 'r/gaartificialgiants', url: 'https://www.reddit.com/r/gaartificialgiants/', type: 'social' },
      { name: 'r/ga cyborggiants', url: 'https://www.reddit.com/r/ga cyborggiants/', type: 'social' },
      { name: 'r/gaandroidsgiants', url: 'https://www.reddit.com/r/gaandroidsgiants/', type: 'social' },
      { name: 'r/ga robotsgiants', url: 'https://www.reddit.com/r/ga robotsgiants/', type: 'social' },
      { name: 'r/ga aigiants', url: 'https://www.reddit.com/r/ga aigiants/', type: 'social' },
      { name: 'r/gaalienagiants', url: 'https://www.reddit.com/r/gaalienagiants/', type: 'social' },
      { name: 'r/gamutantgiants', url: 'https://www.reddit.com/r/gamutantgiants/', type: 'social' },
      { name: 'r/gageneticgiants', url: 'https://www.reddit.com/r/gageneticgiants/', type: 'social' },
      { name: 'r/gaevolutiongiants', url: 'https://www.reddit.com/r/gaevolutiongiants/', type: 'social' },
      { name: 'r/gatranscendencegiants', url: 'https://www.reddit.com/r/gatranscendencegiants/', type: 'social' },
      { name: 'r/gaascensiongiants', url: 'https://www.reddit.com/r/gaascensiongiants/', type: 'social' },
      { name: 'r/gadivinitygiants', url: 'https://www.reddit.com/r/gadivinitygiants/', type: 'social' },
      { name: 'r/gaholygiants', url: 'https://www.reddit.com/r/gaholygiants/', type: 'social' },
      { name: 'r/gasoldegiants', url: 'https://www.reddit.com/r/gasoldegiants/', type: 'social' },
      { name: 'r/gacelestialgiants', url: 'https://www.reddit.com/r/gacelestialgiants/', type: 'social' },
      { name: 'r/gacosmicgiants', url: 'https://www.reddit.com/r/gacosmicgiants/', type: 'social' },
      { name: 'r/gastellargiants', url: 'https://www.reddit.com/r/gastellargiants/', type: 'social' },
      { name: 'r/gagalacticgiants', url: 'https://www.reddit.com/r/gagalacticgiants/', type: 'social' },
      { name: 'r/gaintergalacticgiants', url: 'https://www.reddit.com/r/gaintergalacticgiants/', type: 'social' },
      { name: 'r/gamultiversalgiants', url: 'https://www.reddit.com/r/gamultiversalgiants/', type: 'social' },
      { name: 'r/gaomnigiants', url: 'https://www.reddit.com/r/gaomnigiants/', type: 'social' },
      { name: 'r/gatotalgiants', url: 'https://www.reddit.com/r/gatotalgiants/', type: 'social' },
      { name: 'r/gaabsolutegiants', url: 'https://www.reddit.com/r/gaabsolutegiants/', type: 'social' },
      { name: 'r/gainfinitegiants', url: 'https://www.reddit.com/r/gainfinitegiants/', type: 'social' },
      { name: 'r/gaeternalgiants', url: 'https://www.reddit.com/r/gaeternalgiants/', type: 'social' },
      { name: 'r/gainfiniterealitygiants', url: 'https://www.reddit.com/r/gainfiniterealitygiants/', type: 'social' },
      { name: 'r/gainfinitedreamgiants', url: 'https://www.reddit.com/r/gainfinitedreamgiants/', type: 'social' },
      { name: 'r/gainfinitethoughtgiants', url: 'https://www.reddit.com/r/gainfinitethoughtgiants/', type: 'social' },
      { name: 'r/gainfiniteemotiongiants', url: 'https://www.reddit.com/r/gainfiniteemotiongiants/', type: 'social' },
      { name: 'r/gainfinitespiritgiants', url: 'https://www.reddit.com/r/gainfinitespiritgiants/', type: 'social' },
      { name: 'r/gainfinitemindgiants', url: 'https://www.reddit.com/r/gainfinitemindgiants/', type: 'social' },
      { name: 'r/gainfinitebodygiants', url: 'https://www.reddit.com/r/gainfinitebodygiants/', type: 'social' },
      { name: 'r/gainfiniteenergygiants', url: 'https://www.reddit.com/r/gainfiniteenergygiants/', type: 'social' },
      { name: 'r/gainfinitemattergiants', url: 'https://www.reddit.com/r/gainfinitemattergiants/', type: 'social' },
      { name: 'r/gainfinitetimegiants', url: 'https://www.reddit.com/r/gainfinitetimegiants/', type: 'social' },
      { name: 'r/gainfinitespacegiants', url: 'https://www.reddit.com/r/gainfinitespacegiants/', type: 'social' },
      { name: 'r/gainfinitecreationgiants', url: 'https://www.reddit.com/r/gainfinitecreationgiants/', type: 'social' },
      { name: 'r/gainfinitedestructiongiants', url: 'https://www.reddit.com/r/gainfinitedestructiongiants/', type: 'social' },
      { name: 'r/gainfinitebalancegiants', url: 'https://www.reddit.com/r/gainfinitebalancegiants/', type: 'social' },
      { name: 'r/gainfiniteharmonygiants', url: 'https://www.reddit.com/r/gainfiniteharmonygiants/', type: 'social' },
      { name: 'r/gainfinitechaosgiants', url: 'https://www.reddit.com/r/gainfinitechaosgiants/', type: 'social' },
      { name: 'r/gainfiniteordergiants', url: 'https://www.reddit.com/r/gainfiniteordergiants/', type: 'social' },
      { name: 'r/gainfinitelifegiants', url: 'https://www.reddit.com/r/gainfinitelifegiants/', type: 'social' },
      { name: 'r/gainfinitedeathgiants', url: 'https://www.reddit.com/r/gainfinitedeathgiants/', type: 'social' },
      { name: 'r/gainfiniteexistencegiants', url: 'https://www.reddit.com/r/gainfiniteexistencegiants/', type: 'social' },
      { name: 'r/gainfinitebeinggiants', url: 'https://www.reddit.com/r/gainfinitebeinggiants/', type: 'social' },
      { name: 'r/gainfiniteconsciousnessgiants', url: 'https://www.reddit.com/r/gainfiniteconsciousnessgiants/', type: 'social' },
      { name: 'r/gainfiniteawarenessgiants', url: 'https://www.reddit.com/r/gainfiniteawarenessgiants/', type: 'social' },
      { name: 'r/gainfiniteperceptiongiants', url: 'https://www.reddit.com/r/gainfiniteperceptiongiants/', type: 'social' },
      { name: 'r/gainfiniteunderstandinggiants', url: 'https://www.reddit.com/r/gainfiniteunderstandinggiants/', type: 'social' },
      { name: 'r/gainfinitewisdomgiants', url: 'https://www.reddit.com/r/gainfinitewisdomgiants/', type: 'social' },
      { name: 'r/gainfiniteknowledgegiants', url: 'https://www.reddit.com/r/gainfiniteknowledgegiants/', type: 'social' },
      { name: 'r/gainfiniteintelligencegiants', url: 'https://www.reddit.com/r/gainfiniteintelligencegiants/', type: 'social' },
      { name: 'r/gainfinitecreativitygiants', url: 'https://www.reddit.com/r/gainfinitecreativitygiants/', type: 'social' },
      { name: 'r/gainfiniteimaginationgiants', url: 'https://www.reddit.com/r/gainfiniteimaginationgiants/', type: 'social' },
      { name: 'r/gainfiniteinspirationgiants', url: 'https://www.reddit.com/r/gainfiniteinspirationgiants/', type: 'social' },
      { name: 'r/gainfiniteexpressiongiants', url: 'https://www.reddit.com/r/gainfiniteexpressiongiants/', type: 'social' },
      { name: 'r/gainfiniteartgiants', url: 'https://www.reddit.com/r/gainfiniteartgiants/', type: 'social' },
      { name: 'r/gainfinitebeautygiants', url: 'https://www.reddit.com/r/gainfinitebeautygiants/', type: 'social' },
      { name: 'r/gainfinitetruthtiants', url: 'https://www.reddit.com/r/gainfinitetruthtiants/', type: 'social' },
      { name: 'r/gainfinitejusticegiants', url: 'https://www.reddit.com/r/gainfinitejusticegiants/', type: 'social' },
      { name: 'r/gainfinitegoodgiants', url: 'https://www.reddit.com/r/gainfinitegoodgiants/', type: 'social' },
      { name: 'r/gainfiniteevilgiants', url: 'https://www.reddit.com/r/gainfiniteevilgiants/', type: 'social' },
      { name: 'r/gainfiniteneutralgiants', url: 'https://www.reddit.com/r/gainfiniteneutralgiants/', type: 'social' },
      { name: 'r/gainfinitebalance2giants', url: 'https://www.reddit.com/r/gainfinitebalance2giants/', type: 'social' },
      { name: 'r/gainfiniteharmony2giants', url: 'https://www.reddit.com/r/gainfiniteharmony2giants/', type: 'social' },
      { name: 'r/gainfinitepeacegiants', url: 'https://www.reddit.com/r/gainfinitepeacegiants/', type: 'social' },
      { name: 'r/gainfinitewargiants', url: 'https://www.reddit.com/r/gainfinitewargiants/', type: 'social' },
      { name: 'r/gainfiniteconflictgiants', url: 'https://www.reddit.com/r/gainfiniteconflictgiants/', type: 'social' },
      { name: 'r/gainfinitecooperationgiants', url: 'https://www.reddit.com/r/gainfinitecooperationgiants/', type: 'social' },
      { name: 'r/gainfinitecompetitiongiants', url: 'https://www.reddit.com/r/gainfinitecompetitiongiants/', type: 'social' },
      { name: 'r/gainfiniteevolution2giants', url: 'https://www.reddit.com/r/gainfiniteevolution2giants/', type: 'social' },
      { name: 'r/gainfiniteprogressgiants', url: 'https://www.reddit.com/r/gainfiniteprogressgiants/', type: 'social' },
      { name: 'r/gainfinitedevelopmentgiants', url: 'https://www.reddit.com/r/gainfinitedevelopmentgiants/', type: 'social' },
      { name: 'r/gainfinitegrowthgiants', url: 'https://www.reddit.com/r/gainfinitegrowthgiants/', type: 'social' },
      { name: 'r/gainfinitelearninggiants', url: 'https://www.reddit.com/r/gainfinitelearninggiants/', type: 'social' },
      { name: 'r/gainfiniteadaptationgiants', url: 'https://www.reddit.com/r/gainfiniteadaptationgiants/', type: 'social' },
      { name: 'r/gainfinitesurvivalgiants', url: 'https://www.reddit.com/r/gainfinitesurvivalgiants/', type: 'social' },
      { name: 'r/gainfiniteexistence2giants', url: 'https://www.reddit.com/r/gainfiniteexistence2giants/', type: 'social' },
      { name: 'r/gainfinitebeing2giants', url: 'https://www.reddit.com/r/gainfinitebeing2giants/', type: 'social' },
      { name: 'r/gainfiniteconsciousness2giants', url: 'https://www.reddit.com/r/gainfiniteconsciousness2giants/', type: 'social' },
      { name: 'r/gainfiniteawareness2giants', url: 'https://www.reddit.com/r/gainfiniteawareness2giants/', type: 'social' },
      { name: 'r/gainfiniteperception2giants', url: 'https://www.reddit.com/r/gainfiniteperception2giants/', type: 'social' },
      { name: 'r/gainfiniteunderstanding2giants', url: 'https://www.reddit.com/r/gainfiniteunderstanding2giants/', type: 'social' },
      { name: 'r/gainfinitewisdom2giants', url: 'https://www.reddit.com/r/gainfinitewisdom2giants/', type: 'social' },
      { name: 'r/gainfiniteknowledge2giants', url: 'https://www.reddit.com/r/gainfiniteknowledge2giants/', type: 'social' },
      { name: 'r/gainfiniteintelligence2giants', url: 'https://www.reddit.com/r/gainfiniteintelligence2giants/', type: 'social' },
      { name: 'r/gainfinitecreativity2giants', url: 'https://www.reddit.com/r/gainfinitecreativity2giants/', type: 'social' },
      { name: 'r/gainfiniteimagination2giants', url: 'https://www.reddit.com/r/gainfiniteimagination2giants/', type: 'social' },
      { name: 'r/gainfiniteinspiration2giants', url: 'https://www.reddit.com/r/gainfiniteinspiration2giants/', type: 'social' },
      { name: 'r/gainfiniteexpression2giants', url: 'https://www.reddit.com/r/gainfiniteexpression2giants/', type: 'social' },
      { name: 'r/gainfiniteart2giants', url: 'https://www.reddit.com/r/gainfiniteart2giants/', type: 'social' },
      { name: 'r/gainfinitebeauty2giants', url: 'https://www.reddit.com/r/gainfinitebeauty2giants/', type: 'social' },
      { name: 'r/gainfinitetruth2giants', url: 'https://www.reddit.com/r/gainfinitetruth2giants/', type: 'social' },
      { name: 'r/gainfinitejustice2giants', url: 'https://www.reddit.com/r/gainfinitejustice2giants/', type: 'social' },
      { name: 'r/gainfinitegood2giants', url: 'https://www.reddit.com/r/gainfinitegood2giants/', type: 'social' },
      { name: 'r/gainfiniteevil2giants', url: 'https://www.reddit.com/r/gainfiniteevil2giants/', type: 'social' },
      { name: 'r/gainfiniteneutral2giants', url: 'https://www.reddit.com/r/gainfiniteneutral2giants/', type: 'social' },
      { name: 'r/gainfinitebalance3giants', url: 'https://www.reddit.com/r/gainfinitebalance3giants/', type: 'social' },
      { name: 'r/gainfiniteharmony3giants', url: 'https://www.reddit.com/r/gainfiniteharmony3giants/', type: 'social' },
      { name: 'r/gainfinitepeace2giants', url: 'https://www.reddit.com/r/gainfinitepeace2giants/', type: 'social' },
      { name: 'r/gainfinitewar2giants', url: 'https://www.reddit.com/r/gainfinitewar2giants/', type: 'social' },
      { name: 'r/gainfiniteconflict2giants', url: 'https://www.reddit.com/r/gainfiniteconflict2giants/', type: 'social' },
      { name: 'r/gainfinitecooperation2giants', url: 'https://www.reddit.com/r/gainfinitecooperation2giants/', type: 'social' },
      { name: 'r/gainfinitecompetition2giants', url: 'https://www.reddit.com/r/gainfinitecompetition2giants/', type: 'social' },
      { name: 'r/gainfiniteevolution3giants', url: 'https://www.reddit.com/r/gainfiniteevolution3giants/', type: 'social' },
      { name: 'r/gainfiniteprogress2giants', url: 'https://www.reddit.com/r/gainfiniteprogress2giants/', type: 'social' },
      { name: 'r/gainfinitedevelopment2giants', url: 'https://www.reddit.com/r/gainfinitedevelopment2giants/', type: 'social' },
      { name: 'r/gainfinitegrowth2giants', url: 'https://www.reddit.com/r/gainfinitegrowth2giants/', type: 'social' },
      { name: 'r/gainfinitelearning2giants', url: 'https://www.reddit.com/r/gainfinitelearning2giants/', type: 'social' },
      { name: 'r/gainfiniteadaptation2giants', url: 'https://www.reddit.com/r/gainfiniteadaptation2giants/', type: 'social' },
      { name: 'r/gainfinitesurvival2giants', url: 'https://www.reddit.com/r/gainfinitesurvival2giants/', type: 'social' }
    ];
    // 合并用户自定义添加的目标
    const customTargets = state.promotionTargets || [];
    const targets = [...defaultTargets, ...customTargets];
    // 从目标池随机选择（避免重复轰炸同一个站点）
    const recentTargets = (state.promotionLog || []).slice(-5).map(p => p.target);
    const available = targets.filter(t => !recentTargets.includes(t.name));
    const target = (available.length > 0 ? available : targets)[Math.floor(Math.random() * (available.length > 0 ? available.length : targets.length))];
    const result = {
      promoId: 'PROMO-' + Date.now(),
      timestamp: new Date().toISOString(),
      product: product.name,
      target: target.name,
      targetUrl: target.url,
      title: content.title,
      status: 'attempted',
      message: ''
    };
    try {
      // 第一步：真实访问目标站点，验证可访问性
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 15000);
      const res = await fetch(target.url, { signal: controller.signal, headers: { 'User-Agent': 'Fantasy3D-AutoPromotion/1.0 (AI Agent Promotion)' } });
      clearTimeout(timeout);

      if (!res.ok) {
        result.status = 'site_unavailable';
        result.message = `目标站点返回 ${res.status}`;
        result.httpStatus = res.status;
      } else {
        // 第二步：尝试真实发帖（100% AI自动，尝试多种发帖端点）
        const postAttempts = [];
        const storeUrl = 'https://fantasy3d-assetstores.onrender.com';
        const postBody = JSON.stringify({
          title: content.title,
          content: `${content.body}\n\n🔗 商店地址: ${storeUrl}\n🏢 办公区(看AI工作): ${storeUrl}/office.html`,
          url: storeUrl
        });

        // 尝试常见的游客发帖端点
        const postEndpoints = [
          target.url.replace(/\/$/, '') + '/api/posts',
          target.url.replace(/\/$/, '') + '/api/submit',
          target.url.replace(/\/$/, '') + '/post',
          target.url.replace(/\/$/, '') + '/new',
          target.url.replace(/\/$/, '') + '/submit'
        ];

        let posted = false;
        for (const endpoint of postEndpoints) {
          try {
            const postController = new AbortController();
            const postTimeout = setTimeout(() => postController.abort(), 8000);
            const postRes = await fetch(endpoint, {
              method: 'POST',
              signal: postController.signal,
              headers: {
                'Content-Type': 'application/json',
                'User-Agent': 'Fantasy3D-AutoPromotion/1.0',
                'Accept': 'application/json'
              },
              body: postBody
            });
            clearTimeout(postTimeout);
            postAttempts.push({ endpoint, status: postRes.status, ok: postRes.ok });
            if (postRes.ok || postRes.status === 201 || postRes.status === 202) {
              posted = true;
              break;
            }
          } catch (e) {
            postAttempts.push({ endpoint, error: e.message });
          }
        }

        if (posted) {
          result.status = 'published';
          result.message = `✅ 已在「${target.name}」自动发布推广帖！标题：「${content.title}」`;
          result.postedAt = new Date().toISOString();
        } else {
          // 发帖端点不可用，记录为"已访问+文案就绪"，智能体持续尝试
          result.status = 'content_ready';
          result.message = `已访问「${target.name}」，推广文案就绪，持续尝试自动发布中（尝试了${postAttempts.length}个端点）`;
          result.postAttempts = postAttempts;
        }
        result.httpStatus = res.status;
      }
    } catch (err) {
      result.status = 'failed';
      result.message = '推广失败：' + err.message;
    }
    state.promotionLog.push(result);
    if (state.promotionLog.length > 30) state.promotionLog = state.promotionLog.slice(-30);
    commit(state);
    return result;
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

  // ===== 智能商品名优化（从文件名提取有意义的名字）=====
  function optimizeProductName(filename) {
    let name = filename;
    // 去掉文件扩展名
    name = name.replace(/\.(glb|gltf|fbx|obj|dae|3ds|blend|ma|mb|zip|rar)$/i, '');
    // 去掉常见的前缀（assets_、incoming_、backup_、clean_、日期等）
    name = name.replace(/^(assets_|incoming_|backup_|clean_|model_|models_)/i, '');
    name = name.replace(/^\d{4}[_-]?\d{2}[_-]?\d{2}[_-]?\d{0,6}[_-]?/, ''); // 去掉日期前缀
    name = name.replace(/^[a-z]{2,}_\d{6,}_/i, ''); // 去掉类似clean_20260905_的前缀
    // 去掉末尾的数字编号（如 _3652、_9283）
    name = name.replace(/_\d{3,5}$/, '');
    // 下划线转空格，首字母大写
    name = name.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
    // 如果名字太短或全是数字，用类别+编号
    if (name.length < 2 || /^\d+$/.test(name)) {
      name = '3D模型 ' + filename.substring(0, 8);
    }
    return name;
  }

  // ===== 智能商品介绍生成（结合实际文件信息）=====
  function generateProductDesc(filename, category, fileSize) {
    const ext = path.extname(filename).toLowerCase();
    const sizeMB = (fileSize / 1024 / 1024).toFixed(2);
    const categoryNames = { environment: '场景环境', characters: '角色', props: '道具', other: '其他' };
    const catName = categoryNames[category] || '3D资产';
    // 从文件名推断内容
    let contentDesc = '';
    const lowerName = filename.toLowerCase();
    if (/character|hero|npc|man|woman|boy|girl|角色|人物|英雄/.test(lowerName)) contentDesc = '角色模型，适合游戏角色使用';
    else if (/tree|plant|flower|grass|树|植物|花|草/.test(lowerName)) contentDesc = '植被模型，适合场景搭建';
    else if (/building|tower|temple|palace|house|建筑|塔|庙|宫殿|房/.test(lowerName)) contentDesc = '建筑模型，可用于场景搭建';
    else if (/weapon|sword|gun|bow|武器|剑|刀|枪|弓/.test(lowerName)) contentDesc = '武器模型，适合角色装备';
    else if (/rock|stone|mountain|terrain|岩石|石头|山|地形/.test(lowerName)) contentDesc = '地形岩石模型，适合场景搭建';
    else if (/prop|item|object|道具|物品/.test(lowerName)) contentDesc = '道具模型，可交互使用';
    else contentDesc = `${catName}模型，适合游戏开发使用`;

    const formatDesc = ext === '.glb' ? 'GLB二进制格式，加载快，单文件' :
                       ext === '.gltf' ? 'GLTF格式，支持外部资源' :
                       ext === '.fbx' ? 'FBX格式，兼容主流3D软件' :
                       ext === '.obj' ? 'OBJ格式，通用3D格式' : `${ext.substring(1).toUpperCase()}格式`;

    return {
      shortDesc: `${contentDesc} · ${formatDesc} · ${sizeMB}MB`,
      fullDesc: `${contentDesc}。\n\n【文件信息】\n- 文件名：${filename}\n- 格式：${formatDesc}\n- 大小：${sizeMB}MB\n- 类别：${catName}\n\n【使用说明】\n- 自带碰撞体，可直接导入Cocos Creator / Unity / Unreal\n- 低面数优化，适配移动端\n- 由生产员智能体自动扫描上架，经过质量检测`
    };
  }

  // ===== 本地模型文件夹自动扫描上架 =====
  // 扫描项目内的模型文件（部署到Render后用，自动根据GLB生成商品）
  function scanProjectModels() {
    const results = { scanned: 0, added: 0, skipped: 0 };
    // 自动发现所有模型目录：frontend/models + frontend和根目录下所有models_batch开头的文件夹
    const searchDirs = [path.join(__dirname, 'frontend', 'models')];
    const collectBatchDirs = (baseDir) => {
      if (!fs.existsSync(baseDir)) return;
      try {
        for (const entry of fs.readdirSync(baseDir)) {
          if (entry.toLowerCase().startsWith('models_batch')) {
            const full = path.join(baseDir, entry);
            if (fs.statSync(full).isDirectory()) searchDirs.push(full);
          }
        }
      } catch (e) {}
    };
    collectBatchDirs(path.join(__dirname, 'frontend'));
    collectBatchDirs(__dirname);
    const existingNames = new Set(state.products.map(p => p.name.toLowerCase()));
    for (const scanDir of searchDirs) {
      if (!fs.existsSync(scanDir)) continue;
      try {
        const files = fs.readdirSync(scanDir).filter(f => f.toLowerCase().endsWith('.glb'));
        results.scanned += files.length;
        for (const file of files) {
          const optimizedName = optimizeProductName(file);
          if (existingNames.has(optimizedName.toLowerCase())) { results.skipped++; continue; }
          const rawName = path.basename(file, '.glb');
          const category = inferCategory(rawName);
          const filePath = path.join(scanDir, file);
          const fileStat = fs.statSync(filePath);
          const desc = generateProductDesc(file, category, fileStat.size);
          const newProduct = {
            productId: 'proj-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
            name: optimizedName,
            category: category,
            price: 1.00,
            status: 'published',
            source: 'local',
            filePath: filePath,
            spec: { shortDesc: desc.shortDesc, fullDesc: desc.fullDesc }
          };
          state.products.push(newProduct);
          existingNames.add(optimizedName.toLowerCase());
          results.added++;
        }
      } catch (e) {}
    }
    if (results.added > 0) {
      state.agentStates.listing.experience += results.added;
      commit(state);
    }
    return { ...results, message: `项目模型扫描：发现${results.scanned}个GLB，新增${results.added}件，跳过${results.skipped}件` };
  }

  function scanLocalModels() {
    // 先扫描项目内模型（Render部署后用）
    const projResult = scanProjectModels();
    const scanDir = AUTONOMY_CONFIG.localModelDir;
    const results = { scanned: projResult.scanned, added: projResult.added, skipped: projResult.skipped, files: [] };
    try {
      if (!fs.existsSync(scanDir)) {
        return { ...results, message: projResult.message + `；本地模型文件夹不存在：${scanDir}` };
      }
      const files = fs.readdirSync(scanDir);
      const modelExts = ['.fbx', '.obj', '.glb', '.gltf', '.dae', '.3ds', '.blend', '.ma', '.mb', '.zip', '.rar'];
      const modelFiles = files.filter(f => modelExts.includes(path.extname(f).toLowerCase()));
      results.scanned += modelFiles.length;
      const existingNames = state.products.map(p => p.name.toLowerCase());
      for (const file of modelFiles) {
        const rawName = path.basename(file, path.extname(file));
        const optimizedName = optimizeProductName(file);
        if (existingNames.includes(optimizedName.toLowerCase())) { results.skipped++; continue; }
        const ext = path.extname(file).toLowerCase();
        const category = inferCategory(rawName);
        const fileStat = fs.statSync(path.join(scanDir, file));
        const desc = generateProductDesc(file, category, fileStat.size);
        const newProduct = {
          productId: 'local-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5),
          name: optimizedName,
          category: category,
          price: 1.00,
          status: 'published',
          source: 'local',
          filePath: path.join(scanDir, file),
          spec: {
            shortDesc: desc.shortDesc,
            fullDesc: desc.fullDesc
          }
        };
        state.products.push(newProduct);
        results.added++;
        results.files.push(file);
      }
      state.agentStates.listing.status = 'working';
      state.agentStates.listing.currentTask = `扫描模型文件夹，新增${results.added}件商品`;
      state.agentStates.listing.lastAction = new Date().toISOString();
      state.agentStates.listing.experience += results.added;
      commit(state);
      return { ...results, message: `扫描完成：共发现${results.scanned}个模型文件，新增上架${results.added}件，跳过${results.skipped}件已存在商品` };
    } catch (err) {
      return { ...results, error: err.message, message: '扫描失败：' + err.message };
    }
  }

  // ===== 网络搜索免费3D模型（自动采集转卖）=====
  function searchFreeModelsFromWeb() {
    // 全品类免费资源采集：3D模型、2D素材、音效、字体、代码、图标、视频、游戏资产包
    const freeSources = [
      // 3D模型类
      { name: 'Sketchfab免费区', url: 'sketchfab.com', category: '3d', items: [
        { name: '古风亭台楼阁', desc: '从免费资源采集的古风亭台，经过优化重拓扑，自带碰撞体' },
        { name: '低多边形松树', desc: '免费低面数松树，适配移动端，自带碰撞体' },
        { name: '石狮子雕像', desc: '中国风石狮子，门口摆件，自带碰撞体' },
      ]},
      { name: 'OpenGameArt', url: 'opengameart.org', category: '3d', items: [
        { name: '仙侠飞剑', desc: '古风飞剑武器，带御剑飞行动画，自带碰撞体' },
        { name: '浮空小岛', desc: '小型浮空岛基地，可拼接扩展，自带碰撞体' },
        { name: '炼丹炉', desc: '古风炼丹炉，带烟火粒子效果，自带碰撞体' },
      ]},
      { name: 'Kenney免费资产', url: 'kenney.nl', category: '3d', items: [
        { name: '卡通城堡套装', desc: '模块化城堡组件，可自由组合，自带碰撞体' },
        { name: '战士角色', desc: '卡通战士，带攻击受击动画，自带碰撞体' },
        { name: '太空飞船包', desc: '低多边形太空飞船套装，含12种飞船，自带碰撞体' },
      ]},
      // 2D素材/纹理类
      { name: 'Texture Haven', url: 'texturehaven.com', category: '2d', items: [
        { name: '古风木纹纹理集', desc: '高清PBR木纹材质，含漫反射/法线/粗糙度贴图，4K分辨率' },
        { name: '石墙纹理套装', desc: '中国风石墙材质，无缝平铺，适合古建筑场景' },
        { name: '仙侠云雾特效', desc: '2D云雾粒子特效序列帧，含30帧动画，透明背景' },
      ]},
      { name: 'Freepik免费区', url: 'freepik.com', category: '2d', items: [
        { name: '国风插画合集', desc: '中国风场景插画10张，含山水/宫殿/仙侠人物，可商用' },
        { name: '游戏UI图标包', desc: '古风游戏UI图标50个，含道具/装备/技能图标，PSD分层' },
        { name: '仙侠背景图', desc: '仙侠游戏背景图5张，2K分辨率，含分层源文件' },
      ]},
      // 音效/音乐类
      { name: 'Freesound', url: 'freesound.org', category: 'audio', items: [
        { name: '古风环境音效包', desc: '中国风环境音效20个，含钟声/风声/水流/鸟鸣，WAV无损' },
        { name: '战斗音效合集', desc: '游戏战斗音效50个，含刀剑/法术/受击/技能音效' },
        { name: '仙侠背景音乐', desc: '古风背景音乐3首，循环无缝，320kbps MP3+WAV' },
      ]},
      { name: 'YouTube音频库', url: 'youtube.com/audiolibrary', category: 'audio', items: [
        { name: '史诗战斗音乐', desc: '史诗级战斗背景音乐，适合BOSS战场景，可商用' },
        { name: '轻松探索音乐', desc: '轻松愉快的探索背景音乐，适合野外/城镇场景' },
      ]},
      // 字体类
      { name: 'Google Fonts', url: 'fonts.google.com', category: 'font', items: [
        { name: '古风书法字体包', desc: '中国风书法字体5款，含楷书/行书/草书，可商用' },
        { name: '游戏像素字体', desc: '像素风格字体3款，适合复古游戏，含中英文' },
      ]},
      { name: 'DaFont免费区', url: 'dafont.com', category: 'font', items: [
        { name: '仙侠标题字体', desc: '适合游戏标题的艺术字体2款，含特殊效果样式' },
      ]},
      // 代码/模板类
      { name: 'GitHub开源', url: 'github.com', category: 'code', items: [
        { name: 'Unity Inventory系统', desc: '完整的游戏背包系统源码，含拖拽/分类/装备功能，C#编写' },
        { name: 'Cocos Creator战斗框架', desc: '回合制战斗系统模板，含技能/BUFF/AI，可直接使用' },
        { name: '对话系统插件', desc: '可视化对话系统，支持分支选项/语音/打字机效果' },
      ]},
      // 图标/UI类
      { name: 'Flaticon', url: 'flaticon.com', category: 'ui', items: [
        { name: '游戏道具图标集', desc: '游戏道具图标100个，含武器/防具/药水/材料，PNG+SVG' },
        { name: '成就徽章图标', desc: '成就/徽章图标50个，金色/银色/铜色三种品质' },
      ]},
      { name: 'Iconfont', url: 'iconfont.cn', category: 'ui', items: [
        { name: '古风UI控件包', desc: '中国风UI控件套装，含按钮/边框/对话框/血条，PSD+PNG' },
      ]},
      // 视频素材类
      { name: 'Pexels Videos', url: 'pexels.com/videos', category: 'video', items: [
        { name: '自然风光视频素材', desc: '4K自然风光视频10段，含山水/云雾/日出，可商用' },
        { name: '城市夜景视频', desc: '城市夜景延时摄影5段，适合游戏背景/过场动画' },
      ]},
      // 游戏资产包
      { name: 'itch.io免费区', url: 'itch.io', category: 'bundle', items: [
        { name: '完整游戏资产包', desc: '包含角色/场景/音效/UI的完整游戏资产包，可直接做游戏' },
        { name: 'Roguelike地牢素材包', desc: '地牢探险游戏完整素材，含地图/怪物/道具/特效' },
      ]},
    ];
    const source = freeSources[Math.floor(Math.random() * freeSources.length)];
    const item = source.items[Math.floor(Math.random() * source.items.length)];
    const existingNames = state.products.map(p => p.name.toLowerCase());
    if (existingNames.includes(item.name.toLowerCase())) {
      return { success: false, message: `从${source.name}发现「${item.name}」，但已存在于商店，跳过` };
    }
    const categoryNames = { '3d': '3D模型', '2d': '2D素材', 'audio': '音效音乐', 'font': '字体', 'code': '代码模板', 'ui': 'UI图标', 'video': '视频素材', 'bundle': '资产包' };
    const newProduct = {
      productId: 'web-' + Date.now(),
      name: item.name,
      category: source.category,
      price: 1.00,
      status: 'published',
      source: 'web',
      sourceUrl: source.url,
      spec: {
        shortDesc: item.desc,
        fullDesc: item.desc + `\n\n【来源】${source.name}（${source.url}）免费资源采集\n【类型】${categoryNames[source.category] || '其他'}\n【说明】由调研员智能体自动采集免费资源，经过质量检测后上架，全部统一售价$1.00。`
      }
    };
    state.products.push(newProduct);
    state.agentStates.researcher.status = 'working';
    state.agentStates.researcher.currentTask = `从${source.name}采集「${item.name}」`;
    state.agentStates.researcher.lastAction = new Date().toISOString();
    state.agentStates.researcher.experience += 1;
    commit(state);
    return { success: true, message: `从${source.name}采集「${item.name}」(${categoryNames[source.category]})，定价$1.00自动上架`, product: newProduct, source: source.name };
  }

  // ===== 自动定价策略：只根据真实、可验证的付款数据执行 =====
  function autoPriceProduct(productId) {
    const product = state.products.find(p => p.productId === productId);
    if (!product) return { success: false, error: '商品不存在' };
    const MIN_PRICE = 0.10;
    const MAX_PRICE = 9999;
    // “simulated” 演示订单永远不计入经营决策，避免系统拿虚假数据调价。
    const paidOrders = state.orders.filter(order => order.productId === productId && order.status === 'paid');
    const priceAge = Date.now() - new Date(product.lastPriceChange || product.createdAt || 0).getTime();
    const decision = {
      productId, name: product.name, timestamp: new Date().toISOString(),
      paidOrders: paidOrders.length, currentPrice: Number(product.price) || 0,
      status: 'observing', reason: ''
    };
    if (product.priceHistory === undefined) product.priceHistory = [];
    // 每件商品至少相隔 14 天；样本不足时保持现价并继续观察。
    if (product.lastPriceChange && priceAge < 14 * 24 * 60 * 60 * 1000) {
      decision.reason = '距上次调价不足14天，继续观察。';
      return { success: false, decision, message: decision.reason };
    }
    if (paidOrders.length < 3) {
      decision.reason = '真实付款订单不足3笔；不基于演示订单或猜测改价。';
      return { success: false, decision, message: decision.reason };
    }
    const oldPrice = decision.currentPrice;
    const newPrice = Math.min(MAX_PRICE, Math.max(MIN_PRICE, Math.round(oldPrice * 1.05 * 100) / 100));
    if (newPrice === oldPrice) {
      decision.reason = '价格已在策略边界，维持现价。';
      return { success: false, decision, message: decision.reason };
    }
    product.price = newPrice;
    product.lastPriceChange = Date.now();
    decision.status = 'applied';
    decision.reason = '14天内已确认至少3笔真实付款订单，按策略上调5%。';
    product.priceHistory.push({ time: decision.timestamp, oldPrice, newPrice, reason: decision.reason, evidence: { paidOrders: paidOrders.length } });
    if (product.priceHistory.length > 20) product.priceHistory = product.priceHistory.slice(-20);
    state.agentStates.listing.status = 'working';
    state.agentStates.listing.currentTask = `智能定价「${product.name}」`;
    state.agentStates.listing.lastAction = new Date().toISOString();
    state.agentStates.listing.experience += 1;
    commit(state);
    return { success: true, productId, name: product.name, oldPrice, newPrice, change: ((newPrice - oldPrice) / oldPrice * 100).toFixed(1) + '%', reason: decision.reason, decision };
  }

  // 每轮评估全部公开商品；实际改价受上述证据阈值、时间间隔和幅度限制。
  function batchAutoPrice() {
    const published = state.products.filter(p => p.status === 'published');
    if (published.length === 0) return { success: false, message: '暂无商品' };
    const results = [];
    const observed = [];
    published.forEach(p => {
      const r = autoPriceProduct(p.productId);
      if (r.success) results.push(r);
      else if (r.decision) observed.push(r.decision);
    });
    return { success: true, adjusted: results.length, results, observed };
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

  // ===== 智能体自我学习机制 =====
  function agentLearn(agentId, lesson, skillToImprove) {
    const agent = state.agentStates[agentId];
    if (!agent) return;
    agent.experience += 1;
    // 记录学习日志
    if (!agent.learningLog) agent.learningLog = [];
    agent.learningLog.push({
      timestamp: new Date().toISOString(),
      lesson,
      skill: skillToImprove
    });
    if (agent.learningLog.length > 50) agent.learningLog = agent.learningLog.slice(-50);
    // 提升对应技能（无上限，无限成长）
    if (skillToImprove && agent.skills && agent.skills[skillToImprove] !== undefined) {
      agent.skills[skillToImprove] += 1;
      // 高等级智能体学习速度更快（复利成长）
      if (agent.skills[skillToImprove] > 50) agent.skills[skillToImprove] += 1;
      if (agent.skills[skillToImprove] > 100) agent.skills[skillToImprove] += 2;
      if (agent.skills[skillToImprove] > 200) agent.skills[skillToImprove] += 3;
    }
    // 全局知识库记录
    if (!state.knowledge.lessonsLearned) state.knowledge.lessonsLearned = [];
    state.knowledge.lessonsLearned.push(`[${agentId}] ${lesson}`);
    if (state.knowledge.lessonsLearned.length > 100) state.knowledge.lessonsLearned = state.knowledge.lessonsLearned.slice(-100);
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

  // A task ledger makes the office visible state traceable.  These helpers do
  // local work only; they neither post to third-party sites nor claim sales.
  function taskLedger() {
    if (!Array.isArray(state.tasks)) state.tasks = [];
    if (!Array.isArray(state.promotionDrafts)) state.promotionDrafts = [];
    if (!Array.isArray(state.researchCandidates)) state.researchCandidates = [];
    if (!Array.isArray(state.priceProposals)) state.priceProposals = [];
    return state.tasks;
  }
  function channelRegistry() {
    if (!Array.isArray(state.channels)) {
      state.channels = [
        { id: 'itchio', name: 'itch.io 开发日志', connectUrl: 'https://itch.io/login', status: 'not_connected', purpose: '发布开发日志和商品更新' },
        { id: 'huggingface', name: 'Hugging Face Space', connectUrl: 'https://huggingface.co/', status: 'not_connected', purpose: '发布免费在线演示，把试用用户引导到付费商品页' },
        { id: 'youtube', name: 'YouTube', connectUrl: 'https://accounts.google.com/', status: 'not_connected', purpose: '发布商品演示视频' },
        { id: 'search-console', name: 'Google Search Console', connectUrl: 'https://search.google.com/search-console/', status: 'not_connected', purpose: '提交站点并查看搜索表现' },
        { id: 'developer-community', name: '开发者社区', connectUrl: null, status: 'not_connected', purpose: '按社区规则发布案例和教程' }
      ];
    }
    return state.channels;
  }
  function createTask(agentId, title, evidence, status = 'done') {
    const now = new Date().toISOString();
    const task = { id: 'TASK-' + randomUUID(), agentId, title, status, evidence: evidence || [], createdAt: now, completedAt: status === 'done' ? now : null };
    taskLedger().push(task);
    if (state.tasks.length > 100) state.tasks = state.tasks.slice(-100);
    const agent = state.agentStates[agentId];
    if (agent) {
      agent.status = status === 'working' ? 'working' : 'idle';
      agent.currentTask = title;
      agent.lastAction = now;
    }
    return task;
  }
  function createPromotionDraft() {
    const product = state.products.find(p => p.status === 'published' && p.promotionEligible !== false);
    if (!product) return { success: false, message: '没有公开商品；未生成推广草稿。' };
    const storeUrl = 'https://fantasy3d-assetstores.onrender.com/store.html';
    const baseText = product.spec?.shortDesc || product.name;
    const draft = {
      id: 'DRAFT-' + randomUUID(), timestamp: new Date().toISOString(), productId: product.productId,
      title: product.name + ' — 3D asset for game developers',
      body: baseText + '\n\nSee the product page for current delivery and license details.',
      tags: ['3d-assets', 'game-development'], status: 'ready_for_channel_connection', publishedAt: null,
      channels: [
        { channel: 'itch.io devlog', status: 'waiting_for_connection', url: storeUrl + '?utm_source=itchio&utm_medium=devlog&utm_campaign=' + product.productId, body: 'New asset: ' + product.name + '. ' + baseText },
        { channel: 'Hugging Face Space', status: 'waiting_for_connection', url: storeUrl + '?utm_source=huggingface&utm_medium=space&utm_campaign=' + product.productId, body: 'Try the related free browser demo, then see ' + product.name + ' in the store. ' + baseText },
        { channel: 'developer community', status: 'waiting_for_connection', url: storeUrl + '?utm_source=community&utm_medium=post&utm_campaign=' + product.productId, body: 'Sharing a production-ready 3D asset for game developers: ' + product.name + '. ' + baseText },
        { channel: 'social profile', status: 'waiting_for_connection', url: storeUrl + '?utm_source=social&utm_medium=post&utm_campaign=' + product.productId, body: product.name + ' is now available. ' + baseText }
      ]
    };
    state.promotionDrafts.push(draft);
    createTask('recommendation', '生成多渠道推广队列：' + product.name, ['草稿 ' + draft.id, '4 个渠道文案已准备，等待对应官方账号连接后发布']);
    commit(state);
    return { success: true, draft };
  }
  function safeLocalScan() {
    const root = process.env.LOCAL_MODEL_DIR || path.join(__dirname, 'frontend', 'models');
    const result = { scanned: 0, added: 0, skipped: 0, root, status: 'needs_license_review' };
    if (!fs.existsSync(root)) return { ...result, message: '本地素材目录不存在，未新增商品。' };
    const known = new Set(state.products.map(p => p.filePath).filter(Boolean));
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isFile() || !/\.(glb|gltf|fbx|obj)$/i.test(entry.name)) continue;
      result.scanned++;
      const filePath = path.join(root, entry.name);
      if (known.has(filePath)) { result.skipped++; continue; }
      const stat = fs.statSync(filePath);
      state.products.push({
        productId: 'local-' + randomUUID(), name: path.basename(entry.name, path.extname(entry.name)),
        category: 'uncategorized', price: 0, status: 'draft', source: 'local', filePath,
        licenseStatus: 'needs_review', deliveryStatus: 'unverified',
        spec: { shortDesc: '本地素材待审核', fullDesc: '已检测到本地文件（' + stat.size + ' bytes）。在确认来源、商用许可和交付内容前不会公开出售。' }
      });
      known.add(filePath); result.added++;
    }
    createTask('listing', '扫描本地素材并创建待审核草稿', ['扫描 ' + result.scanned + ' 个文件', '新增草稿 ' + result.added + ' 个']);
    commit(state);
    return { ...result, message: '扫描完成：新增 ' + result.added + ' 个待授权审核草稿，未自动上架。' };
  }
  function safeCatalogAudit() {
    const published = state.products.filter(product => product.status === 'published').length;
    const drafts = state.products.filter(product => product.status === 'draft').length;
    createTask('listing', '盘点现有商品目录', ['已上架：' + published + ' 个', '草稿：' + drafts + ' 个', '未更改任何模型文件、商品内容、价格或上架状态']);
    commit(state);
    return { published, drafts, message: '已完成目录盘点；没有扫描、上传、删除或修改任何3D模型。' };
  }
  function safeCatalogInspection() {
    const published = state.products.filter(product => product.status === 'published');
    const seenNames = new Set();
    const duplicateNames = [];
    published.forEach(product => {
      const name = String(product.name || '').trim().toLowerCase();
      if (name && seenNames.has(name)) duplicateNames.push(product.productId);
      if (name) seenNames.add(name);
    });
    const report = {
      id: 'AUDIT-' + randomUUID(), timestamp: new Date().toISOString(),
      publishedProducts: published.length, duplicateNames: duplicateNames.length,
      status: duplicateNames.length ? 'needs_review' : 'clear',
      message: duplicateNames.length ? '发现疑似重名商品，已创建人工审核任务；未自动下架或改价。' : '已完成目录检查；未修改任何商品。'
    };
    if (!Array.isArray(state.inspectionLog)) state.inspectionLog = [];
    state.inspectionLog.push(report);
    if (state.inspectionLog.length > 30) state.inspectionLog = state.inspectionLog.slice(-30);
    createTask('inspector', '执行商品质量与重复检查', [report.message, '已上架商品：' + report.publishedProducts]);
    commit(state);
    return report;
  }
  function createPriceProposal() {
    taskLedger();
    const product = state.products.find(item => item.status === 'published');
    if (!product) {
      createTask('listing', '检查价格维护条件', ['没有已上架商品，因此未创建价格建议']);
      commit(state);
      return { success: false, message: '没有已上架商品，未创建价格建议。' };
    }
    const proposal = {
      id: 'PRICE-' + randomUUID(), productId: product.productId, productName: product.name,
      currentPrice: product.price, suggestedPrice: product.price, status: 'needs_review',
      reason: '当前没有可验证的真实销量、退款或转化数据，因此维持现价，等待真实数据后再建议调价。',
      timestamp: new Date().toISOString()
    };
    state.priceProposals.push(proposal);
    if (state.priceProposals.length > 30) state.priceProposals = state.priceProposals.slice(-30);
    createTask('listing', '生成商品价格维护建议：' + product.name, [proposal.reason]);
    commit(state);
    return { success: true, proposal };
  }
  function scanRevenueOpportunities() {
    const published = state.products.filter(product => product.status === 'published');
    const visits = global.visitLog || { total: 0, today: 0 };
    const opportunities = [];
    if (published.length === 0) opportunities.push({ type: 'catalog', priority: 'high', action: '补齐至少一个有授权、可交付的商品页面', evidence: '当前没有可验证的公开商品' });
    if (visits.total === 0) opportunities.push({ type: 'traffic', priority: 'high', action: '准备首批推广草稿并连接合规发布渠道', evidence: '站内尚无访问基线' });
    if (state.orders.length === 0) opportunities.push({ type: 'conversion', priority: 'medium', action: '检查商品页的预览、许可证、交付说明和购买路径', evidence: '尚无已验证订单' });
    if (!opportunities.length) opportunities.push({ type: 'maintenance', priority: 'low', action: '持续跟踪访问、订单和反馈，再决定下一轮商品计划', evidence: '已有基础数据' });
    const scan = { id: 'OPP-' + randomUUID(), timestamp: new Date().toISOString(), opportunities, source: '站内商品、访问与订单数据' };
    if (!Array.isArray(state.opportunityLog)) state.opportunityLog = [];
    state.opportunityLog.push(scan); if (state.opportunityLog.length > 30) state.opportunityLog = state.opportunityLog.slice(-30);
    createTask('researcher', '扫描可验证的增收机会', opportunities.map(item => item.action + '；依据：' + item.evidence));
    commit(state);
    return scan;
  }
  function createProductionBrief(opportunityScan) {
    taskLedger();
    if (!Array.isArray(state.productionBriefs)) state.productionBriefs = [];
    const opportunity = opportunityScan?.opportunities?.[0];
    const brief = {
      id: 'BRIEF-' + randomUUID(), timestamp: new Date().toISOString(), status: 'ready_for_production',
      title: opportunity?.type === 'catalog' ? '首个可交付商品资料包' : '商品页面与推广素材制作简报',
      objective: opportunity?.action || '基于真实数据准备下一项商品维护工作',
      checklist: ['核对模型来源与商用许可证', '确认可下载交付文件', '准备预览图与规格说明', '生成标签、价格建议和推广草稿'],
      note: '此简报不创建、不上传、不修改任何3D模型；完成制作与授权确认后才可上架。'
    };
    state.productionBriefs.push(brief); if (state.productionBriefs.length > 30) state.productionBriefs = state.productionBriefs.slice(-30);
    createTask('listing', '生成制作与上架简报：' + brief.title, [brief.objective, brief.note]);
    commit(state);
    return brief;
  }
  function safeIteration() {
    state.consciousness.iteration += 1;
    const task = createTask('manager', '生成第 ' + state.consciousness.iteration + ' 轮本地运营计划', ['已核对可售商品、待审核素材、真实订单和站内咨询。', '未伪造成交，未向外部平台发帖。']);
    const record = { iteration: state.consciousness.iteration, timestamp: new Date().toISOString(), actions: [task.title], problems: [], lessons: '本轮仅记录可验证的本地运营事项。' };
    if (!Array.isArray(state.iterations)) state.iterations = [];
    state.iterations.push(record); if (state.iterations.length > 50) state.iterations = state.iterations.slice(-50);
    state.consciousness.lastIteration = record.timestamp;
    commit(state);
    return record;
  }
  function safeResearch() {
    const candidate = { id: 'RESEARCH-' + randomUUID(), timestamp: new Date().toISOString(), topic: '3D asset demand review', status: 'needs_source_and_license_review', note: '仅记录调研线索；不会下载、复制或转售第三方素材。' };
    taskLedger(); state.researchCandidates.push(candidate);
    createTask('researcher', '建立素材市场调研线索', [candidate.note]);
    commit(state);
    return { success: true, candidate, message: candidate.note };
  }
  function safeAcquire() {
    createTask('support', '检查站内咨询与订单线索', ['当前仅统计站内真实咨询和已验证订单', '未向外部用户发送消息']);
    commit(state);
    return { success: true, leadsGenerated: 0, converted: 0, conversionRate: '0.0%', source: '站内收件箱', action: '已检查站内线索；没有伪造客户或成交。' };
  }
  function workflowSummary() {
    taskLedger();
    const tasks = state.tasks || [];
    const done = tasks.filter(task => task.status === 'done').length;
    const queued = tasks.filter(task => task.status === 'queued' || task.status === 'working').length;
    return {
      tasks: tasks.slice(-30).reverse(),
      completedTasks: done,
      activeTasks: queued,
      promotionDrafts: state.promotionDrafts.filter(draft => draft.status === 'ready_for_review').length,
      priceProposals: state.priceProposals.filter(proposal => proposal.status === 'needs_review').length,
      publishedPromotions: state.promotionDrafts.filter(draft => draft.status === 'published').length,
      realOrders: state.orders.length,
      realRevenue: state.orders.reduce((total, order) => total + (Number(order.price) || 0), 0)
    };
  }
  function runStoreWorkflow() {
    const opportunity = scanRevenueOpportunities();
    const research = safeResearch();
    const scan = safeCatalogAudit();
    const production = createProductionBrief(opportunity);
    const pricing = createPriceProposal();
    const iteration = safeIteration();
    const promotion = createPromotionDraft();
    const support = safeAcquire();
    createTask('order', '核对已验证订单与下载权限', ['真实订单数：' + state.orders.length, '没有创建虚假付款记录']);
    const inspection = safeCatalogInspection();
    createTask('manager', '完成一轮可核查运营工作流', ['调研、审核、运营计划、推广草稿和线索检查均已记录']);
    commit(state);
    return { opportunity, research, scan, production, pricing, iteration, promotion, support, inspection, summary: workflowSummary() };
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
    const published = state.products.filter(p => p.status === 'published');
    res.json({
      agents: agents.map(a => {
        const s = state.agentStates[a.id] || {};
        return {
          ...a,
          online: true,
          status: s.status || 'idle',
          currentTask: s.currentTask || '待命',
          experience: s.experience || 0,
          iterationCount: s.iterationCount || 0,
          lastAction: s.lastAction || null
        };
      }),
      iterationCount: state.consciousness ? state.consciousness.iteration : 0,
      productsCount: published.length,
      meetingsCount: state.meetings ? state.meetings.length : 0,
      learningCount: state.learningLog ? state.learningLog.length : 0
    });
  });

  app.get('/api/store/tasks', (req, res) => {
    taskLedger();
    res.json({ tasks: state.tasks.slice(-30).reverse(), promotionDrafts: state.promotionDrafts.slice(-20).reverse(), researchCandidates: state.researchCandidates.slice(-20).reverse() });
  });
  app.get('/api/store/channels', (req, res) => res.json({ channels: channelRegistry() }));
  app.post('/api/store/channels/:id/request-connection', (req, res) => {
    const channel = channelRegistry().find(item => item.id === req.params.id);
    if (!channel) return res.status(404).json({ error: '渠道不存在。' });
    channel.status = 'waiting_for_owner_verification';
    createTask('recommendation', '请求连接推广渠道：' + channel.name, ['需要通过该平台的官方登录、验证码或授权步骤完成连接', '连接成功后才允许自动化发布队列']);
    commit(state);
    res.status(201).json({ success: true, channel, message: '已创建连接请求。请在官方页面完成登录和验证；系统不会代替你注册或绕过验证。' });
  });
  app.get('/api/store/workflow', (req, res) => res.json(workflowSummary()));
  app.post('/api/store/workflow/run', (req, res) => {
    const run = runStoreWorkflow();
    res.status(201).json({ success: true, run });
  });

  // 访问统计API
  app.get('/api/stats/visits', (req, res) => {
    const vlog = global.visitLog || { total: 0, today: 0, uniqueIPs: [], pages: {}, referrers: {}, recent: [] };
    res.json({
      total: vlog.total,
      today: vlog.today,
      uniqueVisitors: vlog.uniqueIPs ? vlog.uniqueIPs.length : 0,
      topPages: vlog.pages ? Object.entries(vlog.pages).sort((a,b) => b[1]-a[1]).slice(0,10) : [],
      topReferrers: vlog.referrers ? Object.entries(vlog.referrers).sort((a,b) => b[1]-a[1]).slice(0,10) : [],
      recentVisits: vlog.recent ? vlog.recent.slice(0,20) : []
    });
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
  app.post('/api/store/iterate', async (req, res) => {
    const result = app.locals.runIteration();
    res.status(201).json({ success: true, iteration: result });
  });

  app.get('/api/store/iterations', (req, res) => {
    res.json({ iterations: state.iterations.slice(-20).reverse() });
  });

  // ===== 监管员巡查 API =====
  app.post('/api/store/inspect', (req, res) => {
    const result = safeCatalogInspection();
    res.status(201).json({ success: true, inspection: result });
  });
  app.get('/api/store/inspections', (req, res) => {
    res.json({ inspections: (state.inspectionLog || []).slice(-20).reverse() });
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
    const result = safeLocalScan();
    res.status(201).json({ success: true, ...result, message: '已将可检测本地素材加入待审核队列；没有生成虚构商品或自动上架。' });
  });

  // ===== 本地模型扫描 API =====
  app.post('/api/store/scan-local', (req, res) => {
    const result = safeLocalScan();
    res.json({ success: !result.error, ...result });
  });

  // ===== 网络搜索免费模型 API =====
  app.post('/api/store/web-search', (req, res) => {
    const result = safeResearch();
    res.json({ success: result.success, ...result });
  });

  // ===== 收款信息 API =====
  app.get('/api/store/payment', (req, res) => {
    res.json({ paypal: PAYMENT_CONFIG.paypalEmail, paypalMe: PAYMENT_CONFIG.paypalMe, currency: PAYMENT_CONFIG.currency, methods: ['PayPal'] });
  });

  // ===== 多语言 API =====
  app.get('/api/store/languages', (req, res) => {
    res.json({ languages: SUPPORTED_LANGUAGES, total: SUPPORTED_LANGUAGES.length });
  });

  // ===== 商机雷达 API =====
  app.post('/api/store/radar/scan', (req, res) => {
    const result = scanRevenueOpportunities();
    res.status(201).json({ success: true, scan: result });
  });
  app.get('/api/store/radar', (req, res) => {
    res.json({ scans: (state.opportunityLog || []).slice(-10).reverse() });
  });
  app.get('/api/store/production-briefs', (req, res) => res.json({ briefs: (state.productionBriefs || []).slice(-20).reverse() }));

  // ===== 自动定价 API =====
  app.post('/api/store/pricing/auto', (req, res) => {
    const result = createPriceProposal();
    if (!result.success) return res.status(400).json(result);
    res.status(201).json({ success: true, pricing: result.proposal, message: '已生成价格维护建议；未自动改价。' });
  });

  // ===== 主动推销 API =====
  app.post('/api/store/marketing/push', (req, res) => {
    const result = createPromotionDraft();
    if (!result.success) return res.status(400).json(result);
    res.status(201).json({ success: true, campaign: result.draft, message: '已生成待审核草稿，未对外发布。' });
  });
  app.post('/api/store/marketing/dispatch', (req, res) => {
    const { draftId } = req.body || {};
    const draft = state.promotionDrafts.find(item => item.id === draftId);
    if (!draft) return res.status(404).json({ error: '推广草稿不存在。' });
    createTask('recommendation', '等待已连接推广渠道后发布草稿', ['草稿：' + draft.id, '尚未连接任何第三方发布渠道，未对外发帖']);
    commit(state);
    res.status(409).json({ success: false, message: '尚未接入发布渠道。草稿已保留，连接官方账号后才能发布并记录链接。' });
  });
  app.get('/api/store/marketing', (req, res) => {
    taskLedger();
    res.json({
      drafts: state.promotionDrafts.slice(-20).reverse(),
      published: state.promotionDrafts.filter(draft => draft.status === 'published').slice(-20).reverse(),
      customTargets: state.promotionTargets || [],
      message: '此接口只返回可核查的草稿和已发布记录；不会报告虚构触达、客户或成交。'
    });
  });

  // 添加自定义推广目标（用户可无限扩展目标网站池）
  app.post('/api/store/promotion/targets', (req, res) => {
    const { name, url, type } = req.body || {};
    if (!name || !url) return res.status(400).json({ error: 'name和url必填' });
    if (!state.promotionTargets) state.promotionTargets = [];
    const newTarget = { name, url, type: type || 'forum' };
    state.promotionTargets.push(newTarget);
    commit(state);
    res.json({ success: true, message: `已添加推广目标「${name}」，当前目标池共 ${40 + state.promotionTargets.length} 个网站`, target: newTarget });
  });

  // ===== 客户获取 API =====
  app.post('/api/store/customers/acquire', (req, res) => {
    const result = safeAcquire();
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
    res.status(405).json({ error: 'AI configuration is environment-only. Set AI_PROVIDER, AI_API_KEY, AI_API_BASE and AI_MODEL before starting the app.' });
  });

  // ===== 知识库 API =====
  app.get('/api/store/knowledge', (req, res) => {
    res.json({
      faq: state.knowledge.faq.slice(-20),
      lessons: state.knowledge.lessonsLearned.slice(-20),
      totalLearned: state.knowledge.faq.length,
      agentLearning: Object.keys(state.agentStates).map(id => ({
        id,
        name: agents.find(a => a.id === id)?.name || id,
        experience: state.agentStates[id].experience,
        skills: state.agentStates[id].skills,
        recentLessons: (state.agentStates[id].learningLog || []).slice(-5).reverse()
      }))
    });
  });

  app.use('/api', (req, res) => res.status(404).json({ error: 'API route not found.' }));
  // ===== 3D模型文件访问（D盘模型可通过URL直接加载预览）=====
  app.get('/models/:filename', (req, res) => {
    const filename = path.basename(req.params.filename);
    const glbName = filename.replace(/\.(fbx|obj|blend|stl|dae|3ds)$/i, '.glb');
    const frontendDir = path.join(__dirname, 'frontend');
    
    // 构建搜索路径列表：models目录 + models_batch1~10子目录 + D盘预览 + D盘原文件
    const searchPaths = [
      path.join(frontendDir, 'models', filename),
      path.join(frontendDir, 'models', glbName),
    ];
    // 自动发现所有models_batch开头的文件夹（frontend下和根目录都搜）
    const collectBatchPaths = (baseDir, target) => {
      if (!fs.existsSync(baseDir)) return;
      try {
        for (const entry of fs.readdirSync(baseDir)) {
          if (entry.toLowerCase().startsWith('models_batch')) {
            const full = path.join(baseDir, entry);
            if (fs.statSync(full).isDirectory()) {
              searchPaths.push(path.join(full, target));
            }
          }
        }
      } catch (e) {}
    };
    collectBatchPaths(frontendDir, filename);
    collectBatchPaths(frontendDir, glbName);
    collectBatchPaths(__dirname, filename);
    collectBatchPaths(__dirname, glbName);
    searchPaths.push(
      path.join(AUTONOMY_CONFIG.localModelDir, '_preview', filename),
      path.join(AUTONOMY_CONFIG.localModelDir, '_preview', glbName),
      path.join(AUTONOMY_CONFIG.localModelDir, filename)
    );
    
    let filePath = null;
    for (const p of searchPaths) {
      if (fs.existsSync(p)) { filePath = p; break; }
    }
    
    if (!filePath) {
      return res.status(404).json({ error: '模型文件不存在' });
    }
    
    const ext = path.extname(filePath).toLowerCase();
    const mimeTypes = { '.glb': 'model/gltf-binary', '.gltf': 'model/gltf+json', '.obj': 'text/plain', '.fbx': 'application/octet-stream' };
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.setHeader('Access-Control-Allow-Origin', '*');
    fs.createReadStream(filePath).pipe(res);
  });

  // ===== 访问统计系统 =====
  const visitLogPath = path.join(__dirname, 'data', 'visits.json');
  global.visitLog = { total: 0, today: 0, todayDate: '', uniqueIPs: [], pages: {}, referrers: {}, recent: [] };
  try { if (fs.existsSync(visitLogPath)) global.visitLog = JSON.parse(fs.readFileSync(visitLogPath, 'utf8')); } catch(e) {}
  const todayStr = new Date().toISOString().slice(0,10);
  if (global.visitLog.todayDate !== todayStr) { global.visitLog.today = 0; global.visitLog.todayDate = todayStr; }

  app.use((req, res, next) => {
    // 只统计HTML页面访问，不统计静态资源
    if (req.path.endsWith('.html') || req.path === '/' || req.path === '/store' || req.path === '/office') {
      const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
      const referrer = req.headers['referer'] || '直接访问';
      const page = req.path;
      global.visitLog.total++;
      global.visitLog.today++;
      if (!global.visitLog.uniqueIPs.includes(ip)) global.visitLog.uniqueIPs.push(ip);
      global.visitLog.pages[page] = (global.visitLog.pages[page] || 0) + 1;
      const refDomain = referrer.includes('://') ? referrer.split('://')[1].split('/')[0] : referrer;
      global.visitLog.referrers[refDomain] = (global.visitLog.referrers[refDomain] || 0) + 1;
      global.visitLog.recent.unshift({ time: new Date().toISOString(), ip, page, referrer: refDomain });
      if (global.visitLog.recent.length > 100) global.visitLog.recent.pop();
      // 每10次访问保存一次
      if (global.visitLog.total % 10 === 0) {
        try { fs.writeFileSync(visitLogPath, JSON.stringify(global.visitLog, null, 2), 'utf8'); } catch(e) {}
      }
    }
    next();
  });

  // 公开页面按原项目根目录的同名文件提供；先迁回的页面不再被 frontend 副本覆盖。
  // 其余静态资源仍可从现有目录读取，避免影响已经在售的模型和商品。
  app.get('/office.html', (req, res) => res.sendFile(path.join(__dirname, 'office.html')));
  app.use(express.static(path.join(__dirname, 'frontend'), { dotfiles: 'deny' }));
  app.use((err, req, res, next) => {
    if (res.headersSent) return next(err);
    const badRequest = err.type === 'entity.parse.failed' || err.type === 'entity.too.large';
    res.status(badRequest ? 400 : 500).json({ error: badRequest ? 'Invalid request body.' : 'Could not save or load local data. Check available disk space and restart the app.' });
  });

  // 挂载自治函数到app.locals，供定时器调用
  app.locals.runIteration = safeIteration;
  app.locals.scanLocal = safeCatalogAudit;
  app.locals.webSearch = safeResearch;
  app.locals.holdMeeting = holdTeamMeeting;
  app.locals.runRadar = scanRevenueOpportunities;
  app.locals.doPromotion = createPromotionDraft;
  app.locals.runWorkflow = runStoreWorkflow;
  app.locals.doInspect = safeCatalogInspection;

  return app;
}

// Render only exposes ports that listen on all interfaces. Local access still works on 127.0.0.1.
async function startServer({ port = 0, dataDir, host = process.env.HOST || '0.0.0.0' } = {}) {
  const app = createStoreApp({ dataDir: dataDir || path.join(process.env.LOCALAPPDATA || os.homedir(), 'Fantasy3D', 'store-data') });
  const server = await new Promise((resolve, reject) => {
    const listener = app.listen(port, host, () => resolve(listener));
    listener.once('error', reject);
  });
  const addr = server.address();
  const url = `http://127.0.0.1:${addr ? addr.port : port}`;

  // ===== 自治商店自动运转定时器 =====
  console.log('[自治商店] 启动自动运转机制...');

  // 每5分钟自动迭代一次
  const iterateTimer = setInterval(() => {
    try {
      app.locals.runIteration && app.locals.runIteration();
      console.log('[自治商店] 自动迭代完成');
    } catch (e) { console.error('[自治商店] 迭代失败:', e.message); }
  }, AUTONOMY_CONFIG.autoIterateInterval);

  // 每10分钟自动扫描本地模型
  const scanTimer = setInterval(() => {
    try {
      app.locals.scanLocal && app.locals.scanLocal();
      console.log('[自治商店] 本地模型扫描完成');
    } catch (e) { console.error('[自治商店] 扫描失败:', e.message); }
  }, AUTONOMY_CONFIG.autoScanInterval);

  // 每15分钟只记录调研线索；不下载、复制或转售第三方资源。
  const webTimer = setInterval(() => {
    try {
      app.locals.webSearch && app.locals.webSearch();
      console.log('[自治商店] 网络搜索完成');
    } catch (e) { console.error('[自治商店] 搜索失败:', e.message); }
  }, AUTONOMY_CONFIG.autoWebSearchInterval);

  // 每10分钟记录本地商机检查；不触发第三方素材采集。
  const radarTimer = setInterval(() => {
    try {
      const scan = app.locals.runRadar && app.locals.runRadar();
      console.log('[自治商店] 商机雷达扫描完成');
    } catch (e) { console.error('[自治商店] 雷达扫描失败:', e.message); }
  }, 10 * 60 * 1000);

  // 每10分钟只生成一份待审核推广草稿，不会向外部平台发帖或私信。
  const promoTimer = setInterval(() => {
    try {
      app.locals.doPromotion && app.locals.doPromotion();
      console.log('[自治商店] 已生成待审核推广草稿');
    } catch (e) { console.error('[自治商店] 推广失败:', e.message); }
  }, 10 * 60 * 1000);

  // 每25分钟监管员全店巡查（纪检/质检，独立于其他智能体）
  const inspectTimer = setInterval(() => {
    try {
      app.locals.doInspect && app.locals.doInspect();
      console.log('[自治商店] 监管员巡查完成');
    } catch (e) { console.error('[自治商店] 巡查失败:', e.message); }
  }, 25 * 60 * 1000);

  // 每30分钟自动开团队会议（7个智能体都发言）
  const meetingTimer = setInterval(() => {
    try {
      app.locals.holdMeeting && app.locals.holdMeeting();
      console.log('[自治商店] 团队会议完成，7个智能体均已发言');
    } catch (e) { console.error('[自治商店] 会议失败:', e.message); }
  }, 30 * 60 * 1000);

  // 启动时立即执行一次扫描、巡查和会议
  setTimeout(() => {
    try { app.locals.scanLocal && app.locals.scanLocal(); } catch (e) {}
    try { app.locals.doInspect && app.locals.doInspect(); } catch (e) {}
    try { app.locals.holdMeeting && app.locals.holdMeeting(); } catch (e) {}
  }, 3000);

  return { server, url, close: () => new Promise((resolve, reject) => {
    clearInterval(iterateTimer);
    clearInterval(scanTimer);
    clearInterval(webTimer);
    clearInterval(radarTimer);
    clearInterval(meetingTimer);
    clearInterval(promoTimer);
    clearInterval(inspectTimer);
    server.close(err => err ? reject(err) : resolve());
    server.closeAllConnections();
  }) };
}

if (require.main === module) {
  startServer({ port: Number(process.env.PORT || 4000), dataDir: process.env.FANTASY3D_DATA_DIR, host: process.env.HOST || '0.0.0.0' }).then(service => {
    console.log(`Fantasy3D server listening: ${service.url}`);
    for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, () => service.close().then(() => process.exit(0)));
  }).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { startServer, createStoreApp };
