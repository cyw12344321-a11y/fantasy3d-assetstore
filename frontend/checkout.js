(() => {
  "use strict";
  const { request, message, money, validateEmail, rememberEmail, recalledEmail, verifyAppInfo } = window.FantasyStore;
  const form = document.getElementById("checkoutForm");
  const email = document.getElementById("buyerEmail");
  const submit = document.getElementById("submitOrder");
  const feedback = document.getElementById("checkoutMessage");
  const retry = document.getElementById("retryProduct");
  const successMsg = document.getElementById("successMsg");
  let selectedProduct = null;
  let submitting = false;
  let completed = false;
  let loading = false;
  email.value = recalledEmail();

  // PayPal 付款完成后会带着 token 跳回本页：自动确认收款并交付
  async function handlePayPalReturn() {
    const qs = new URLSearchParams(window.location.search);
    const productNameEl = document.getElementById("productName");
    if (qs.get("ppcancelled")) {
      productNameEl.textContent = "付款已取消";
      message(feedback, "付款已取消，你可以重新点击按钮前往 PayPal 完成支付。", "error");
      return false;
    }
    const token = qs.get("token");
    if (!token || !qs.get("ppreturn")) return false;
    form.hidden = true;
    productNameEl.textContent = "PayPal 付款确认中…";
    message(feedback, "已从 PayPal 返回，正在确认收款、准备交付，请稍候…");
    try {
      const result = await request("/order/capture", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      });
      const order = result && result.order;
      if (result && result.success && order && ["paid", "fulfilled"].includes(order.status)) {
        completed = true;
        document.getElementById("productName").textContent = "✅ 付款成功 · 模型已自动交付";
        message(feedback, `收款已确认，订单 ${order.orderId} 已自动交付，点击下方按钮下载模型。`, "success");
        successMsg.hidden = false;
        const dl = document.createElement("a");
        dl.href = `/api/download/${encodeURIComponent(order.orderId)}`;
        dl.textContent = "⬇ 下载已购模型文件";
        dl.className = "filter-btn";
        dl.style.marginTop = "12px";
        dl.style.display = "inline-block";
        successMsg.insertAdjacentElement("afterend", dl);
        return true;
      }
      message(feedback, "付款还未完成确认。若你已扣款，可到「订单」页查询，不会重复扣款。", "error");
    } catch (error) {
      message(feedback, `确认收款时出错：${error.message}。若已扣款请到「订单」页查询，不会重复扣款。`, "error");
    }
    return true;
  }

  async function loadProduct() {
    if (loading) return;
    retry.hidden = true;
    submit.disabled = true;
    selectedProduct = null;
    const productId = new URLSearchParams(window.location.search).get("pid");
    if (!productId || !productId.trim() || productId.length > 128) {
      message(feedback, "请先从商店选择一件已上架商品。", "error");
      return;
    }
    loading = true;
    message(feedback, "正在加载商品…");
    try {
      const product = await request(`/store/product/${encodeURIComponent(productId)}`);
      if (!product || product.productId !== productId || product.status !== "published" || !Number.isFinite(Number(product.price))) throw new Error("此商品不存在或已下架，请返回商店。");
      if (!await verifyAppInfo()) throw new Error("收款服务暂不可用，请稍后重试。");
      selectedProduct = product;
      document.getElementById("productId").value = product.productId;
      document.getElementById("productName").textContent = product.name;
      document.getElementById("priceDisplay").textContent = money(product.price);
      message(feedback, "");
      submit.disabled = false;
    } catch (error) {
      message(feedback, error.message, "error");
      retry.hidden = false;
    } finally { loading = false; }
  }

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitting || completed) return;
    if (!selectedProduct) { message(feedback, "请先选择一件可用商品。", "error"); return; }
    if (!validateEmail(email)) { message(feedback, "请输入有效的邮箱地址，用于接收和查询订单。", "error"); return; }
    submitting = true;
    submit.disabled = true;
    email.readOnly = true;
    submit.textContent = "正在创建 PayPal 订单…";
    message(feedback, "");
    try {
      const result = await request("/order/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productId: selectedProduct.productId, email: email.value })
      });
      if (!result.success || !result.order) throw new Error("收款服务响应异常，请先到订单页确认，避免重复下单。");
      rememberEmail(email.value);
      const goto = result.approvalUrl || result.paymentUrl;
      if (result.mode === "api" && goto) {
        // 整页跳转到 PayPal 收银台，付款完成后会自动跳回本页完成交付
        message(feedback, "正在跳转到 PayPal 安全收银台…", "success");
        window.location.href = goto;
        return;
      }
      if (goto) {
        completed = true;
        successMsg.hidden = false;
        message(feedback, `付款记录 ${result.order.orderId} 已创建，请在打开的页面完成付款。`, "success");
        window.open(goto, "_blank", "noopener");
      } else {
        throw new Error("未获取到收款链接。");
      }
    } catch (error) {
      message(feedback, `${error.message} 若请求中断，请先查看订单再重试。`, "error");
      submit.textContent = "前往 PayPal";
    } finally {
      submitting = false;
      submit.disabled = completed;
      email.readOnly = completed;
    }
  });

  retry.addEventListener("click", loadProduct);
  (async () => { if (!(await handlePayPalReturn())) loadProduct(); })();
})();
