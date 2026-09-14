(() => {
  "use strict";
  const { request, node, message, money } = window.FantasyStore;
  const grid = document.getElementById("productGrid");
  const feedback = document.getElementById("storeMessage");
  const modal = document.getElementById("productModal");
  const filters = document.querySelectorAll(".filter-btn[data-filter]");
  const retry = document.getElementById("retryProducts");
  let products = [];
  let selectedProduct = null;
  let activeFilter = "all";
  let loading = false;
  function render() {
    grid.replaceChildren();
    const list = activeFilter === "all" ? products : products.filter(product => product.category === activeFilter);
    if (!list.length) { message(feedback, "No published demo assets in this category. 此分类暂无已上架演示商品。"); return; }
    message(feedback, "");
    list.forEach(product => {
      const card = node("button", undefined, "product-card");
      card.type = "button";
      card.append(node("h3", product.name), node("div", product.category, "cat"), node("div", `$${money(product.price)}`, "price"), node("p", "Demo listing · 示例商品", "sample-note"));
      card.addEventListener("click", () => {
        selectedProduct = product;
        document.getElementById("modalName").textContent = product.name;
        document.getElementById("modalDesc").textContent = product.spec?.fullDesc || product.spec?.shortDesc || "Demo asset description.";
        document.getElementById("modalPrice").textContent = money(product.price);
        modal.showModal();
      });
      grid.append(card);
    });
  }
  async function loadProducts() {
    if (loading) return;
    loading = true;
    retry.hidden = true;
    filters.forEach(button => { button.disabled = true; });
    message(feedback, "Loading demo assets… 正在加载商品…");
    try {
      const data = await request("/store/products");
      if (!Array.isArray(data.products)) throw new Error("Invalid product list. 商品列表数据异常。");
      products = data.products.filter(product => product && typeof product.productId === "string" && typeof product.name === "string" && Number.isFinite(Number(product.price)));
      render();
    } catch (error) { message(feedback, error.message, "error"); retry.hidden = false; }
    finally { loading = false; filters.forEach(button => { button.disabled = false; }); }
  }
  document.getElementById("modalClose").addEventListener("click", () => modal.close());
  modal.addEventListener("click", event => {
    if (event.target === modal) {
      const bounds = modal.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) modal.close();
    }
  });
  document.getElementById("buyBtn").addEventListener("click", () => {
    if (selectedProduct) window.location.href = `checkout.html?pid=${encodeURIComponent(selectedProduct.productId)}`;
  });
  filters.forEach(button => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filters.forEach(other => { other.classList.toggle("active", other === button); other.setAttribute("aria-pressed", String(other === button)); });
    render();
  }));
  retry.addEventListener("click", loadProducts);
  loadProducts();
})();