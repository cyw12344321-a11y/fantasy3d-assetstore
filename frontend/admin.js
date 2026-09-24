(() => {
  "use strict";
  const { request: apiRequest, node, message, money } = window.FantasyStore;
  const operatorToken = document.getElementById("operatorToken");
  function request(path, options = {}) {
    const headers = { ...options.headers };
    if (operatorToken.value) headers.Authorization = `Bearer ${operatorToken.value}`;
    return apiRequest(path, { ...options, headers });
  }
  const tbody = document.getElementById("adminTableBody");
  const feedback = document.getElementById("adminMessage");
  const reload = document.getElementById("reloadProducts");
  let busy = false;
  function render(products) {
    tbody.replaceChildren();
    products.forEach(product => {
      const row = node("tr");
      row.append(node("td", product.productId), node("td", product.name), node("td", product.category), node("td", `$${money(product.price)}`));
      const statusCell = node("td");
      const status = product.status === "published" ? "published" : "draft";
      statusCell.append(node("span", status, `status-${status}`));
      const actions = node("td");
      ["published", "draft"].forEach(targetStatus => {
        const button = node("button", targetStatus === "published" ? "Publish" : "Draft", `action-btn ${targetStatus === "published" ? "publish-btn" : "draft-btn"}`);
        button.type = "button";
        button.disabled = status === targetStatus;
        button.dataset.current = String(status === targetStatus);
        button.addEventListener("click", () => setStatus(product.productId, targetStatus));
        actions.append(button);
      });
      row.append(statusCell, actions);
      tbody.append(row);
    });
  }
  async function refresh() {
    const data = await request("/admin/products");
    if (!Array.isArray(data.products)) throw new Error("Invalid product list. 商品列表数据异常。");
    render(data.products);
    return data.products.length;
  }
  function setBusy(value) {
    busy = value;
    reload.disabled = value;
    tbody.querySelectorAll("button").forEach(button => { button.disabled = value || button.dataset.current === "true"; });
  }
  async function load() {
    if (busy) return;
    setBusy(true);
    message(feedback, "正在加载商品目录…");
    try {
      const count = await refresh();
      message(feedback, count ? "已同步商品目录，上下架改动已生效。" : "暂无商品。");
    } catch (error) { message(feedback, error.message, "error"); }
    finally { setBusy(false); }
  }
  async function setStatus(productId, status) {
    if (busy || !["published", "draft"].includes(status)) return;
    setBusy(true);
    message(feedback, "Saving local catalog… 正在保存本地商品状态…");
    try {
      const data = await request("/admin/product/status", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId, status }) });
      if (!data.success) throw new Error("Status update was not confirmed. 未能确认状态更新。");
      await refresh();
      message(feedback, `${productId}: ${status}. Saved locally. 已保存到本机。`, "success");
    } catch (error) { message(feedback, `${error.message} Reload to check the latest status. 请重新加载确认最新状态。`, "error"); }
    finally { setBusy(false); }
  }
  reload.addEventListener("click", load);
  document.getElementById("operatorForm").addEventListener("submit", event => { event.preventDefault(); load(); });
  load();
})();
