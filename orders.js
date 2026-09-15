(() => {
  "use strict";
  const { request, node, message, money, validateEmail, rememberEmail, recalledEmail } = window.FantasyStore;
  const form = document.getElementById("ordersForm");
  const email = document.getElementById("queryEmail");
  const submit = document.getElementById("loadOrders");
  const list = document.getElementById("orderList");
  const feedback = document.getElementById("ordersMessage");
  let loading = false;
  email.value = recalledEmail();
  window.addEventListener("fantasy3d-download", event => {
    const detail = event.detail || {};
    const status = document.getElementById("downloadStatus");
    if (detail.state === "completed") message(status, `Sample TXT saved: ${detail.path || "Downloads"}. 示例文本已保存，不含模型。`, "success");
    else if (detail.state === "failed") message(status, detail.message || "Sample download failed. 示例文本下载失败，请重试。", "error");
  });
  async function downloadSample(order, button, status) {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "Preparing sample…";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const path = `/api/download/${encodeURIComponent(order.orderId)}`;
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) {
        let errorText = `Sample download failed (${response.status}).`;
        try { const data = await response.json(); if (typeof data.error === "string") errorText = data.error; } catch (_) { /* Keep HTTP error. */ }
        throw new Error(errorText);
      }
      if (!(response.headers.get("content-type") || "").includes("text/plain")) throw new Error("Unexpected sample format. 示例文件格式异常。");
      await response.text();
      const link = node("a");
      link.href = path;
      link.download = `Fantasy3D-sample-${String(order.orderId).replace(/[^a-zA-Z0-9_-]/g, "_")}.txt`;
      document.body.append(link);
      link.click();
      link.remove();
      message(status, "Sample TXT download starting… 正在下载示例文本至 Downloads 文件夹；不含真实 3D 模型。");
    } catch (error) { message(status, error.name === "AbortError" ? "Download timed out. 下载超时，请重试。" : `${error.message} 下载失败，请重试。`, "error"); }
    finally { clearTimeout(timeout); button.disabled = false; button.textContent = "Download Sample TXT · 下载示例文本"; }
  }
  async function loadOrders() {
    if (loading) return;
    if (!validateEmail(email)) { message(feedback, "Enter a valid email address. 请输入有效邮箱地址。", "error"); return; }
    loading = true;
    submit.disabled = true;
    email.readOnly = true;
    list.replaceChildren();
    message(feedback, "Loading local demo orders… 正在查询本地模拟订单…");
    try {
      const data = await request(`/orders/list?email=${encodeURIComponent(email.value)}`);
      if (!Array.isArray(data.orders)) throw new Error("Invalid order list. 订单列表数据异常。");
      rememberEmail(email.value);
      message(feedback, data.orders.length ? `${data.orders.length} demo order(s). 模拟订单，无真实支付。` : "No local demo orders for this email. 此邮箱暂无本地模拟订单。");
      data.orders.forEach(order => {
        if (!order || typeof order.orderId !== "string") throw new Error("Invalid order data. 订单数据异常。");
        const card = node("article", undefined, "order-card");
        card.append(node("h3", order.productName), node("p", `Order ID: ${order.orderId}`), node("p", `Demo price: $${money(order.price)} · Charged: $0.00`), node("p", `Status: ${order.status === "simulated" ? "simulated · 模拟订单" : "unverified · 状态未确认"}`));
        const status = node("p", "", "feedback");
        status.hidden = true;
        if (order.status === "simulated") {
          const download = node("button", "Download Sample TXT · 下载示例文本", "download-btn");
          download.type = "button";
          download.addEventListener("click", () => downloadSample(order, download, status));
          card.append(download);
        }
        card.append(node("p", "Sample text only; no model files included. 仅示例文本，不含模型文件。", "sample-note"), status);
        list.append(card);
      });
    } catch (error) { list.replaceChildren(); message(feedback, error.message, "error"); }
    finally { loading = false; submit.disabled = false; email.readOnly = false; }
  }
  form.addEventListener("submit", event => { event.preventDefault(); loadOrders(); });
  if (email.value) loadOrders();
})();
