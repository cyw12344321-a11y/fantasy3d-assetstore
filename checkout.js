(() => {
  "use strict";
  const { request, message, money, validateEmail, rememberEmail, recalledEmail, verifyAppInfo } = window.FantasyStore;
  const form = document.getElementById("checkoutForm");
  const email = document.getElementById("buyerEmail");
  const submit = document.getElementById("submitOrder");
  const feedback = document.getElementById("checkoutMessage");
  const retry = document.getElementById("retryProduct");
  let selectedProduct = null;
  let submitting = false;
  let completed = false;
  let loading = false;
  email.value = recalledEmail();
  async function loadProduct() {
    if (loading) return;
    retry.hidden = true;
    submit.disabled = true;
    selectedProduct = null;
    const productId = new URLSearchParams(window.location.search).get("pid");
    if (!productId || !productId.trim() || productId.length > 128) {
      message(feedback, "Choose a published asset from the store first. 请先从商店选择已上架商品。", "error");
      return;
    }
    loading = true;
    message(feedback, "Loading asset… 正在加载商品…");
    try {
      const product = await request(`/store/product/${encodeURIComponent(productId)}`);
      if (!product || product.productId !== productId || product.status !== "published" || !Number.isFinite(Number(product.price))) throw new Error("This asset is unavailable. 此商品不存在或已下架，请返回商店。");
      if (!await verifyAppInfo()) throw new Error("Local demo mode is unavailable. 请重试或重启应用。");
      selectedProduct = product;
      document.getElementById("productId").value = product.productId;
      document.getElementById("productName").textContent = product.name;
      document.getElementById("priceDisplay").textContent = money(product.price);
      message(feedback, "");
      submit.disabled = false;
    } catch (error) { message(feedback, error.message, "error"); retry.hidden = false; }
    finally { loading = false; }
  }
  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (submitting || completed) return;
    if (!selectedProduct) { message(feedback, "Select an available asset first. 请先选择可用商品。", "error"); return; }
    if (!validateEmail(email)) { message(feedback, "Enter a valid email address. 请输入有效邮箱地址。", "error"); return; }
    submitting = true;
    submit.disabled = true;
    email.readOnly = true;
    submit.textContent = "Creating demo order… 正在模拟下单…";
    message(feedback, "");
    try {
      const result = await request("/order/create", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ productId: selectedProduct.productId, email: email.value }) });
      if (!result.success || !result.order || result.order.status !== "simulated" || typeof result.order.orderId !== "string") throw new Error("Unexpected order response. 请先查询订单再重试，以免重复创建。");
      completed = true;
      rememberEmail(email.value);
      message(feedback, `Demo order ${result.order.orderId} created. Status: simulated. 模拟订单已创建，未收取任何费用。`, "success");
      document.getElementById("successMsg").hidden = false;
      submit.textContent = "Demo order created · 已模拟下单";
    } catch (error) {
      message(feedback, `${error.message} If the request was interrupted, check Orders before retrying. 若请求中断，请先查看订单再重试。`, "error");
      rememberEmail(email.value);
      submit.textContent = "Simulate Order · 模拟下单";
    } finally { submitting = false; submit.disabled = completed; email.readOnly = completed; }
  });
  retry.addEventListener("click", loadProduct);
  loadProduct();
})();
