(() => {
  "use strict";
  async function request(path, options = {}) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
      const response = await fetch(`/api${path}`, { ...options, signal: controller.signal });
      if (!(response.headers.get("content-type") || "").includes("application/json")) throw new Error("The local service returned an invalid response. 本地服务响应异常。");
      const data = await response.json();
      if (!response.ok || data.success === false || data.error) throw new Error(typeof data.error === "string" ? data.error : `Request failed (${response.status}).`);
      return data;
    } catch (error) {
      if (error.name === "AbortError") throw new Error("Request timed out. 请求超时，请重试。");
      if (error instanceof TypeError) throw new Error("Cannot connect to the local service. 无法连接本地服务，请重启应用后重试。");
      if (error instanceof SyntaxError) throw new Error("The local service returned invalid data. 本地服务数据异常。");
      throw error;
    } finally { clearTimeout(timeout); }
  }
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = String(text);
    if (className) element.className = className;
    return element;
  }
  function message(element, text, kind = "info") {
    element.textContent = text;
    element.className = `feedback ${kind}`;
    element.hidden = !text;
    element.setAttribute("role", kind === "error" ? "alert" : "status");
  }
  function money(value) { return Number.isFinite(Number(value)) ? Number(value).toFixed(2) : "—"; }
  function validateEmail(input) {
    input.value = input.value.trim().toLowerCase();
    const valid = input.value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.value) && input.checkValidity();
    if (!valid) {
      input.setCustomValidity("Enter a valid email address. 请输入有效邮箱地址。");
      input.reportValidity();
      input.setCustomValidity("");
      input.focus();
    }
    return valid;
  }
  function rememberEmail(email) { try { sessionStorage.setItem("fantasy3d-order-email", email); } catch (_) { /* Optional convenience only. */ } }
  function recalledEmail() { try { return sessionStorage.getItem("fantasy3d-order-email") || ""; } catch (_) { return ""; } }
  async function verifyAppInfo() {
    try {
      const info = await request("/app-info");
      if (info.mode !== "live_storefront" || info.paymentConnected !== true) throw new Error("Payment link is not configured. 收款链接尚未配置。");
      const status = document.getElementById("serviceStatus");
      if (status) { status.textContent = "Storefront online · 订单需等待 PayPal 确认"; status.classList.remove("error-text"); }
      return info;
    } catch (error) {
      const status = document.getElementById("serviceStatus");
      if (status) { status.textContent = error.message; status.classList.add("error-text"); }
      return null;
    }
  }
  const appInfo = verifyAppInfo();
  window.FantasyStore = { request, node, message, money, validateEmail, rememberEmail, recalledEmail, appInfo, verifyAppInfo };
})();
