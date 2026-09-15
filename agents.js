(() => {
  "use strict";
  const { request, node } = window.FantasyStore;
  const agentList = document.getElementById("agentList");
  const chatMessages = document.getElementById("chatMessages");
  const chatInput = document.getElementById("chatInput");
  const sendBtn = document.getElementById("sendBtn");
  const chatAvatar = document.getElementById("chatAvatar");
  const chatName = document.getElementById("chatName");
  const chatDesc = document.getElementById("chatDesc");
  const iterationLog = document.getElementById("iterationLog");

  let agents = [];
  let currentAgent = null;

  const roleNames = { leader: '店长', research: '调研', sales: '销售', service: '服务', operations: '运营', production: '生产' };

  async function loadConsciousness() {
    try {
      const data = await request("/store/consciousness");
      agents = data.team || [];
      document.getElementById("storeName").textContent = data.consciousness.name;
      document.getElementById("storeMantra").textContent = data.consciousness.mantra;
      document.getElementById("statIteration").textContent = data.consciousness.iteration;
      document.getElementById("statProducts").textContent = data.stats.products;
      document.getElementById("statOrders").textContent = data.stats.orders;
      document.getElementById("statRevenue").textContent = "¥" + Number(data.stats.revenue).toFixed(2);
      document.getElementById("statMeetings").textContent = data.stats.meetings;
      document.getElementById("statKnowledge").textContent = data.stats.knowledgeItems;
      document.getElementById("teamCount").textContent = agents.length + " 体";
      renderAgentList();
    } catch (err) {
      console.error("Load consciousness failed:", err);
    }
  }

  function renderAgentList() {
    agentList.innerHTML = "";
    agents.forEach(agent => {
      const card = node("div", "", "agent-card");
      card.dataset.id = agent.id;
      if (currentAgent && currentAgent.id === agent.id) card.classList.add("active");
      const top = node("div", "", "agent-card-top");
      top.appendChild(node("div", agent.avatar, "agent-card-avatar"));
      const info = node("div");
      info.appendChild(node("div", agent.name, "agent-card-name"));
      info.appendChild(node("div", roleNames[agent.role] || agent.role, "agent-card-role"));
      top.appendChild(info);
      card.appendChild(top);
      const st = agent.state || {};
      const statusClass = st.status === "working" ? "status-working" : "status-idle";
      const statusText = st.status === "working" ? "⚡ 工作中" : "○ 待命";
      card.appendChild(node("span", statusText, "agent-card-status " + statusClass));
      if (st.currentTask) card.appendChild(node("div", st.currentTask, "agent-card-task"));
      card.addEventListener("click", () => selectAgent(agent));
      agentList.appendChild(card);
    });
  }

  async function selectAgent(agent) {
    currentAgent = agent;
    document.querySelectorAll(".agent-card").forEach(c => c.classList.toggle("active", c.dataset.id === agent.id));
    chatAvatar.textContent = agent.avatar;
    chatName.textContent = agent.name;
    chatDesc.textContent = agent.description;
    sendBtn.disabled = false;
    chatMessages.innerHTML = "";
    try {
      const data = await request(`/agents/${agent.id}/history`);
      (data.messages || []).forEach(msg => appendMessage(msg.role, msg.content, msg.timestamp, msg.language));
    } catch (_) {}
    if (chatMessages.children.length === 0) {
      appendMessage("agent", getWelcome(agent.id), new Date().toISOString(), "zh");
    }
    chatInput.focus();
  }

  function getWelcome(id) {
    const w = {
      manager: "你好！我是店长智能体 🧠，商店的大脑。\n\n我可以：\n• 统筹6个智能体团队\n• 触发自我迭代进化\n• 召开团队会议商量决策\n• 汇报商店全貌\n\n试试对我说：\"自我迭代\"、\"开个会\"、\"状态汇报\"",
      researcher: "你好！我是调研智能体 🔍\n\n我负责市场分析、用户研究、趋势预测。\n问我：\"市场趋势\"、\"用户需求\"、\"竞争分析\"",
      recommendation: "你好！我是推荐智能体 🎯\n\n我帮你推荐最合适的3D资产。\n问我：\"推荐场景\"、\"有什么角色\"、\"便宜的资产\"",
      support: "你好！我是接待智能体 💬\n\n7×24小时在线，解答购买、下载、退款等问题。",
      order: "你好！我是订单智能体 📦\n\n输入下单邮箱查询订单和下载链接。",
      listing: "你好！我是生产上架智能体 ✨\n\n我能自主生产商品、生成描述、建议定价。\n问我：\"怎么写描述\"、\"定价建议\""
    };
    return w[id] || "你好！有什么可以帮你的？";
  }

  function appendMessage(role, content, timestamp, lang) {
    const msg = node("div", "", `msg ${role}`);
    const avatar = node("div", role === "user" ? "我" : (currentAgent?.avatar || "🤖"), "msg-avatar");
    const wrap = node("div");
    const bubble = node("div", content, "msg-bubble");
    wrap.appendChild(bubble);
    if (lang && lang !== "zh") {
      const langNames = { en: "English", ja: "日本語", ko: "한국어", es: "Español", fr: "Français", de: "Deutsch", ru: "Русский" };
      wrap.appendChild(node("div", "🌐 " + (langNames[lang] || lang), "msg-lang"));
    }
    if (timestamp) wrap.appendChild(node("div", new Date(timestamp).toLocaleTimeString(), "msg-lang"));
    msg.appendChild(avatar);
    msg.appendChild(wrap);
    chatMessages.appendChild(msg);
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  async function sendMessage() {
    const text = chatInput.value.trim();
    if (!text || !currentAgent || sendBtn.disabled) return;
    sendBtn.disabled = true;
    chatInput.disabled = true;
    appendMessage("user", text, new Date().toISOString());
    chatInput.value = "";
    try {
      const data = await request(`/agents/${currentAgent.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: text })
      });
      appendMessage("agent", data.reply.content, data.reply.timestamp, data.detectedLanguage);
    } catch (err) {
      appendMessage("agent", "出错了：" + err.message, new Date().toISOString());
    } finally {
      sendBtn.disabled = false;
      chatInput.disabled = false;
      chatInput.focus();
      loadConsciousness();
      loadIterations();
    }
  }

  async function loadIterations() {
    try {
      const data = await request("/store/iterations");
      const list = data.iterations || [];
      if (list.length === 0) {
        iterationLog.innerHTML = '<div style="color:#5a6875;font-size:12px;text-align:center;padding:20px;">暂无迭代记录</div>';
        return;
      }
      iterationLog.innerHTML = "";
      list.slice(0, 8).forEach(it => {
        const item = node("div", "", "log-item");
        item.appendChild(node("div", `迭代 #${it.iteration}`, "log-title"));
        item.appendChild(node("div", it.actions.slice(0, 2).join("；"), "log-content"));
        item.appendChild(node("div", new Date(it.timestamp).toLocaleString(), "log-time"));
        iterationLog.appendChild(item);
      });
    } catch (_) {}
  }

  async function doIterate() {
    try {
      await request("/store/iterate", { method: "POST" });
      await loadConsciousness();
      await loadIterations();
      if (currentAgent && currentAgent.id === "manager") {
        appendMessage("agent", "自我迭代完成！团队经验值+1，商品已优化。查看左侧状态和右侧日志。", new Date().toISOString());
      }
    } catch (err) {
      alert("迭代失败：" + err.message);
    }
  }

  async function doMeeting() {
    try {
      const data = await request("/store/meeting", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ topic: "日常运营会议" }) });
      await loadConsciousness();
      if (currentAgent && currentAgent.id === "manager") {
        const m = data.meeting;
        appendMessage("agent", `团队会议完成！\n\n主题：${m.topic}\n\n决策：${m.decision}\n\n行动项：\n${m.actionItems.map((a,i)=>`${i+1}. ${a}`).join("\n")}`, new Date().toISOString());
      } else {
        alert("团队会议已召开！店长已记录决策。");
      }
    } catch (err) {
      alert("会议失败：" + err.message);
    }
  }

  async function doProduce() {
    try {
      const data = await request("/store/produce", { method: "POST" });
      await loadConsciousness();
      if (currentAgent && (currentAgent.id === "listing" || currentAgent.id === "manager")) {
        appendMessage("agent", data.message || "生产完成！", new Date().toISOString());
      } else {
        alert("生产完成！" + (data.message || ""));
      }
    } catch (err) {
      alert("生产失败：" + err.message);
    }
  }

  async function doRadar() {
    try {
      const data = await request("/store/radar/scan", { method: "POST" });
      await loadConsciousness();
      const scan = data.scan;
      const msg = `📡 商机雷达扫描完成！\n\n发现 ${scan.totalOpportunities} 个商机（${scan.highPriority} 个高优先级）\n\n${scan.opportunities.map(o => `[${o.urgency === 'high' ? '高' : o.urgency === 'medium' ? '中' : '低'}] ${o.desc}`).join('\n')}\n\n建议：${scan.recommendation}`;
      if (currentAgent && (currentAgent.id === "researcher" || currentAgent.id === "manager")) {
        appendMessage("agent", msg, new Date().toISOString());
      } else {
        alert("雷达扫描完成！发现 " + scan.totalOpportunities + " 个商机");
      }
      addLog("📡 雷达扫描", `发现${scan.totalOpportunities}个商机，${scan.highPriority}个高优先级`);
    } catch (err) {
      alert("雷达扫描失败：" + err.message);
    }
  }

  async function doPricing() {
    try {
      const data = await request("/store/pricing/auto", { method: "POST" });
      await loadConsciousness();
      const p = data.pricing;
      const msg = `💰 自动定价完成！\n\n商品：${p.name}\n原价：¥${p.oldPrice} → 新价：¥${p.newPrice}\n变动：${p.change}\n原因：${p.reason}`;
      if (currentAgent && (currentAgent.id === "listing" || currentAgent.id === "manager")) {
        appendMessage("agent", msg, new Date().toISOString());
      } else {
        alert("定价完成！" + p.name + " ¥" + p.oldPrice + " → ¥" + p.newPrice);
      }
      addLog("💰 自动定价", `${p.name} ¥${p.oldPrice}→¥${p.newPrice} (${p.change})`);
    } catch (err) {
      alert("定价失败：" + err.message);
    }
  }

  async function doMarketing() {
    try {
      const data = await request("/store/marketing/push", { method: "POST" });
      await loadConsciousness();
      const c = data.campaign;
      const msg = `📢 主动推销启动！\n\n商品：${c.product}\n渠道：${c.channel}\n动作：${c.action}\n预计触达：${c.estimatedReach} 人\n预计转化：${c.expectedConversions} 单`;
      if (currentAgent && (currentAgent.id === "recommendation" || currentAgent.id === "manager")) {
        appendMessage("agent", msg, new Date().toISOString());
      } else {
        alert("推销启动！通过" + c.channel + "推广「" + c.product + "」");
      }
      addLog("📢 主动推销", `${c.channel}推广${c.product}，触达${c.estimatedReach}人`);
    } catch (err) {
      alert("推销失败：" + err.message);
    }
  }

  async function doAcquire() {
    try {
      const data = await request("/store/customers/acquire", { method: "POST" });
      await loadConsciousness();
      const a = data.acquisition;
      const msg = `🎣 客户获取完成！\n\n来源：${a.source}\n挖掘潜客：${a.leadsGenerated} 人\n成功转化：${a.converted} 人\n转化率：${a.conversionRate}`;
      if (currentAgent && (currentAgent.id === "support" || currentAgent.id === "manager")) {
        appendMessage("agent", msg, new Date().toISOString());
      } else {
        alert("获客完成！从" + a.source + "转化" + a.converted + "个客户");
      }
      addLog("🎣 客户获取", `从${a.source}转化${a.converted}/${a.leadsGenerated}人 (${a.conversionRate})`);
    } catch (err) {
      alert("获客失败：" + err.message);
    }
  }

  function addLog(title, content) {
    const item = document.createElement("div");
    item.className = "log-item";
    item.innerHTML = `<div class="log-title">${title}</div><div class="log-content">${content}</div><div class="log-time">${new Date().toLocaleTimeString()}</div>`;
    const log = document.getElementById("iterationLog");
    if (log.querySelector(".empty-state, div[style*='text-align:center']")) log.innerHTML = "";
    log.insertBefore(item, log.firstChild);
    while (log.children.length > 8) log.removeChild(log.lastChild);
  }

  sendBtn.addEventListener("click", sendMessage);
  chatInput.addEventListener("keydown", e => { if (e.key === "Enter") sendMessage(); });
  document.getElementById("btnIterate").addEventListener("click", doIterate);
  document.getElementById("btnMeeting").addEventListener("click", doMeeting);
  document.getElementById("btnProduce").addEventListener("click", doProduce);
  document.getElementById("btnRadar").addEventListener("click", doRadar);
  document.getElementById("btnPricing").addEventListener("click", doPricing);
  document.getElementById("btnMarketing").addEventListener("click", doMarketing);
  document.getElementById("btnAcquire").addEventListener("click", doAcquire);
  document.getElementById("btnRefresh").addEventListener("click", () => { loadConsciousness(); loadIterations(); });

  loadConsciousness();
  loadIterations();
  setInterval(() => { loadConsciousness(); }, 15000);

  // ===== 实时时钟 + 自动事件倒计时 =====
  const ITERATE_INTERVAL = 5 * 60;
  const MEETING_INTERVAL = 30 * 60;
  const SCAN_INTERVAL = 10 * 60;
  const WEBSEARCH_INTERVAL = 15 * 60;
  let startTime = Date.now();

  function updateClock() {
    const now = new Date();
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    const s = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('clockDisplay').textContent = `${h}:${m}:${s}`;

    const elapsed = Math.floor((Date.now() - startTime) / 1000);
    const nextIterate = ITERATE_INTERVAL - (elapsed % ITERATE_INTERVAL);
    const nextMeeting = MEETING_INTERVAL - (elapsed % MEETING_INTERVAL);
    const min = Math.floor(nextIterate / 60);
    const sec = nextIterate % 60;
    document.getElementById('countdownDisplay').textContent =
      `下次迭代: ${min}:${String(sec).padStart(2, '0')} | 下次会议: ${Math.floor(nextMeeting / 60)}分钟`;
  }
  updateClock();
  setInterval(updateClock, 1000);
})();
