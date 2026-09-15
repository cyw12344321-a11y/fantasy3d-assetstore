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
  async function downloadPaidOrder(order, button, status) {
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = "Preparing delivery…";
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const path = `/api/download/${encodeURIComponent(order.orderId)}`;
      const response = await fetch(path, { signal: controller.signal });
      if (!response.ok) {
        let errorText = `Delivery download failed (${response.status}).`;
        try { const data = await response.json(); if (typeof data.error === "string") errorText = data.error; } catch (_) { /* Keep HTTP error. */ }
        throw new Error(errorText);
      }
      if (response.redirected) { window.location.href = response.url; return; }
      const link = node("a");
      link.href = path;
      link.download = `Fantasy3D-${String(order.orderId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
      document.body.append(link);
      link.click();
      link.remove();
      message(status, "Delivery download is starting… 正在开始下载交付文件。");
    } catch (error) { message(status, error.name === "AbortError" ? "Download timed out. 下载超时，请重试。" : `${error.message} 下载失败，请重试。`, "error"); }
    finally { clearTimeout(timeout); button.disabled = false; button.textContent = "Download delivery · 下载交付文件"; }
  }
  async function loadOrders() {
    if (loading) return;
    if (!validateEmail(email)) { message(feedback, "Enter a valid email address. 请输入有效邮箱地址。", "error"); return; }
    loading = true;
    submit.disabled = true;
    email.readOnly = true;
    list.replaceChildren();
    message(feedback, "Loading orders… 正在查询订单…");
    try {
      const data = await request(`/orders/list?email=${encodeURIComponent(email.value)}`);
      if (!Array.isArray(data.orders)) throw new Error("Invalid order list. 订单列表数据异常。");
      rememberEmail(email.value);
      message(feedback, data.orders.length ? `${data.orders.length} order(s) found. 已找到 ${data.orders.length} 笔订单。` : "No orders found for this email. 此邮箱暂无订单。");
      data.orders.forEach(order => {
        if (!order || typeof order.orderId !== "string") throw new Error("Invalid order data. 订单数据异常。");
        const card = node("article", undefined, "order-card");
        const labels = { awaiting_payment: "Awaiting PayPal confirmation · 等待 PayPal 确认", paid: "Paid · 已付款", fulfilled: "Fulfilled · 已交付", refunded: "Refunded · 已退款" };
        card.append(node("h3", order.productName), node("p", `Order ID: ${order.orderId}`), node("p", `Price: $${money(order.price)} USD`), node("p", `Status: ${labels[order.status] || order.status}`));
        const status = node("p", "", "feedback");
        status.hidden = true;
        if (["paid", "fulfilled"].includes(order.status)) {
          const download = node("button", "Download delivery · 下载交付文件", "download-btn");
          download.type = "button";
          download.addEventListener("click", () => downloadPaidOrder(order, download, status));
          card.append(download);
        }
        if (order.status === "awaiting_payment") card.append(node("p", "Pay at the linked PayPal page. Delivery unlocks after payment is confirmed. 请在 PayPal 完成付款；确认后才可交付。", "sample-note"));
        card.append(status);
        list.append(card);
      });
    } catch (error) { list.replaceChildren(); message(feedback, error.message, "error"); }
    finally { loading = false; submit.disabled = false; email.readOnly = false; }
  }
  form.addEventListener("submit", event => { event.preventDefault(); loadOrders(); });
  if (email.value) loadOrders();
})();
