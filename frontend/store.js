(() => {
  "use strict";
  const { request, node, message, money } = window.FantasyStore;
  const grid = document.getElementById("productGrid");
  const feedback = document.getElementById("storeMessage");
  const modal = document.getElementById("productModal");
  const filters = document.querySelectorAll(".filter-btn[data-filter]");
  const retry = document.getElementById("retryProducts");
  const searchInput = document.getElementById("searchInput");
  const sortSelect = document.getElementById("sortSelect");
  const resultCount = document.getElementById("resultCount");
  const loadMoreBtn = document.getElementById("loadMoreBtn");
  const cartBtn = document.getElementById("cartBtn");
  const cartCount = document.getElementById("cartCount");
  const langSelect = document.getElementById("langSelect");

  let products = [];
  let selectedProduct = null;
  let activeFilter = "all";
  let loading = false;
  let currentOffset = 0;
  let totalCount = 0;
  const PAGE_SIZE = 2000;
  let cart = JSON.parse(localStorage.getItem("fantasy3d_cart") || "[]");
  let currentLang = localStorage.getItem("fantasy3d_lang") || "zh";

  // ===== 多语言词典 =====
  const i18n = {
    zh: {
      searchPlaceholder: "🔍 搜索商品名称/描述...",
      all: "全部", props: "道具", environment: "场景", characters: "角色",
      sortDefault: "默认排序", sortPriceAsc: "价格从低到高", sortPriceDesc: "价格从高到低",
      sortName: "按名称", sortNew: "最新上架",
      resultCount: "共 {n} 件商品", loadMore: "加载更多 ↓",
      addToCart: "加入购物车", buyNow: "立即购买", cart: "购物车",
      cartEmpty: "购物车是空的", cartTotal: "合计", checkout: "去结算",
      preview3d: "🎮 3D 可预览", webSource: "🌐 网络采集", aiSource: "✨ AI 生产",
      loading: "正在加载商品…", noResult: "没有找到匹配的商品",
      loadingModel: "⏳ 3D模型加载中…", modelTimeout: "📦 模型加载超时，购买后可下载源文件查看",
      modelNoPreview: "📦 该模型暂不支持在线预览，购买后可下载源文件",
      close: "关闭", price: "价格", usd: "USD"
    },
    en: {
      searchPlaceholder: "🔍 Search products...",
      all: "All", props: "Props", environment: "Environment", characters: "Characters",
      sortDefault: "Default", sortPriceAsc: "Price: Low to High", sortPriceDesc: "Price: High to Low",
      sortName: "Name", sortNew: "Newest",
      resultCount: "{n} products", loadMore: "Load More ↓",
      addToCart: "Add to Cart", buyNow: "Buy Now", cart: "Cart",
      cartEmpty: "Your cart is empty", cartTotal: "Total", checkout: "Checkout",
      preview3d: "🎮 3D Preview", webSource: "🌐 Web", aiSource: "✨ AI Made",
      loading: "Loading products…", noResult: "No products found",
      loadingModel: "⏳ Loading 3D model…", modelTimeout: "📦 Model load timeout, download after purchase",
      modelNoPreview: "📦 No online preview, download after purchase",
      close: "Close", price: "Price", usd: "USD"
    },
    ja: {
      searchPlaceholder: "🔍 商品を検索...",
      all: "すべて", props: "小物", environment: "環境", characters: "キャラ",
      sortDefault: "デフォルト", sortPriceAsc: "価格：安い順", sortPriceDesc: "価格：高い順",
      sortName: "名前順", sortNew: "新着順",
      resultCount: "全{n}件", loadMore: "もっと読み込む ↓",
      addToCart: "カートに追加", buyNow: "今すぐ購入", cart: "カート",
      cartEmpty: "カートは空です", cartTotal: "合計", checkout: "会計へ",
      preview3d: "🎮 3Dプレビュー", webSource: "🌐 ウェブ", aiSource: "✨ AI生成",
      loading: "商品を読み込み中…", noResult: "商品が見つかりません",
      loadingModel: "⏳ 3Dモデル読み込み中…", modelTimeout: "📦 読み込みタイムアウト",
      modelNoPreview: "📦 プレビュー不可、購入後ダウンロード",
      close: "閉じる", price: "価格", usd: "USD"
    },
    ko: {
      searchPlaceholder: "🔍 상품 검색...",
      all: "전체", props: "소품", environment: "환경", characters: "캐릭터",
      sortDefault: "기본", sortPriceAsc: "가격 낮은순", sortPriceDesc: "가격 높은순",
      sortName: "이름순", sortNew: "최신순",
      resultCount: "총 {n}개", loadMore: "더 보기 ↓",
      addToCart: "장바구니 추가", buyNow: "바로 구매", cart: "장바구니",
      cartEmpty: "장바구니가 비었습니다", cartTotal: "합계", checkout: "결제하기",
      preview3d: "🎮 3D 미리보기", webSource: "🌐 웹", aiSource: "✨ AI 생성",
      loading: "상품 로딩중…", noResult: "상품을 찾을 수 없습니다",
      loadingModel: "⏳ 3D 모델 로딩중…", modelTimeout: "📦 로딩 시간초과",
      modelNoPreview: "📦 미리보기 불가",
      close: "닫기", price: "가격", usd: "USD"
    },
    es: {
      searchPlaceholder: "🔍 Buscar productos...",
      all: "Todo", props: "Accesorios", environment: "Entorno", characters: "Personajes",
      sortDefault: "Por defecto", sortPriceAsc: "Precio: menor a mayor", sortPriceDesc: "Precio: mayor a menor",
      sortName: "Nombre", sortNew: "Más nuevos",
      resultCount: "{n} productos", loadMore: "Cargar más ↓",
      addToCart: "Añadir al carrito", buyNow: "Comprar ahora", cart: "Carrito",
      cartEmpty: "El carrito está vacío", cartTotal: "Total", checkout: "Pagar",
      preview3d: "🎮 Vista 3D", webSource: "🌐 Web", aiSource: "✨ IA",
      loading: "Cargando productos…", noResult: "No se encontraron productos",
      loadingModel: "⏳ Cargando modelo 3D…", modelTimeout: "📦 Tiempo de espera agotado",
      modelNoPreview: "📦 Sin vista previa",
      close: "Cerrar", price: "Precio", usd: "USD"
    },
    fr: {
      searchPlaceholder: "🔍 Rechercher des produits...",
      all: "Tout", props: "Accessoires", environment: "Environnement", characters: "Personnages",
      sortDefault: "Par défaut", sortPriceAsc: "Prix croissant", sortPriceDesc: "Prix décroissant",
      sortName: "Nom", sortNew: "Nouveautés",
      resultCount: "{n} produits", loadMore: "Charger plus ↓",
      addToCart: "Ajouter au panier", buyNow: "Acheter", cart: "Panier",
      cartEmpty: "Le panier est vide", cartTotal: "Total", checkout: "Payer",
      preview3d: "🎮 Aperçu 3D", webSource: "🌐 Web", aiSource: "✨ IA",
      loading: "Chargement…", noResult: "Aucun produit trouvé",
      loadingModel: "⏳ Chargement du modèle 3D…", modelTimeout: "📦 Délai dépassé",
      modelNoPreview: "📦 Pas d'aperçu",
      close: "Fermer", price: "Prix", usd: "USD"
    },
    de: {
      searchPlaceholder: "🔍 Produkte suchen...",
      all: "Alle", props: "Requisiten", environment: "Umgebung", characters: "Charaktere",
      sortDefault: "Standard", sortPriceAsc: "Preis aufsteigend", sortPriceDesc: "Preis absteigend",
      sortName: "Name", sortNew: "Neueste",
      resultCount: "{n} Produkte", loadMore: "Mehr laden ↓",
      addToCart: "In den Warenkorb", buyNow: "Jetzt kaufen", cart: "Warenkorb",
      cartEmpty: "Warenkorb ist leer", cartTotal: "Gesamt", checkout: "Zur Kasse",
      preview3d: "🎮 3D-Vorschau", webSource: "🌐 Web", aiSource: "✨ KI",
      loading: "Produkte laden…", noResult: "Keine Produkte gefunden",
      loadingModel: "⏳ 3D-Modell lädt…", modelTimeout: "📦 Zeitüberschreitung",
      modelNoPreview: "📦 Keine Vorschau",
      close: "Schließen", price: "Preis", usd: "USD"
    },
    ru: {
      searchPlaceholder: "🔍 Поиск товаров...",
      all: "Все", props: "Реквизит", environment: "Окружение", characters: "Персонажи",
      sortDefault: "По умолчанию", sortPriceAsc: "Цена: по возрастанию", sortPriceDesc: "Цена: по убыванию",
      sortName: "По имени", sortNew: "Новинки",
      resultCount: "Всего: {n}", loadMore: "Загрузить ещё ↓",
      addToCart: "В корзину", buyNow: "Купить", cart: "Корзина",
      cartEmpty: "Корзина пуста", cartTotal: "Итого", checkout: "Оплата",
      preview3d: "🎮 3D просмотр", webSource: "🌐 Веб", aiSource: "✨ ИИ",
      loading: "Загрузка товаров…", noResult: "Товары не найдены",
      loadingModel: "⏳ Загрузка 3D модели…", modelTimeout: "📦 Превышено время ожидания",
      modelNoPreview: "📦 Нет предпросмотра",
      close: "Закрыть", price: "Цена", usd: "USD"
    }
  };

  function t(key) {
    const dict = i18n[currentLang] || i18n.zh;
    return dict[key] || i18n.zh[key] || key;
  }

  function applyLang() {
    langSelect.value = currentLang;
    searchInput.placeholder = t("searchPlaceholder");
    sortSelect.innerHTML = `
      <option value="default">${t("sortDefault")}</option>
      <option value="price-asc">${t("sortPriceAsc")}</option>
      <option value="price-desc">${t("sortPriceDesc")}</option>
      <option value="name">${t("sortName")}</option>
      <option value="new">${t("sortNew")}</option>`;
    loadMoreBtn.textContent = t("loadMore");
    document.documentElement.lang = currentLang;
  }

  function updateCartCount() {
    cartCount.textContent = cart.reduce((s, i) => s + i.qty, 0);
  }

  function saveCart() {
    localStorage.setItem("fantasy3d_cart", JSON.stringify(cart));
    updateCartCount();
  }

  function addToCart(product) {
    const existing = cart.find(i => i.productId === product.productId);
    if (existing) { existing.qty++; } else { cart.push({ productId: product.productId, name: product.name, price: product.price, qty: 1 }); }
    saveCart();
    message(feedback, `✅ 「${product.name}」已加入购物车`, "success");
  }

  function showCart() {
    const cartModal = document.createElement("dialog");
    cartModal.className = "modal";
    cartModal.style.cssText = "max-width:500px;padding:24px;";
    let total = 0;
    let itemsHtml = cart.length === 0 ? `<p style="color:#8a98a5;text-align:center;padding:30px 0;">${t("cartEmpty")}</p>` :
      cart.map(item => {
        total += item.price * item.qty;
        return `<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 0;border-bottom:1px solid #2a3544;">
          <span style="color:#e0e8f0;">${item.name} × ${item.qty}</span>
          <span style="color:#ffd700;">$${money(item.price * item.qty)}</span>
        </div>`;
      }).join("");
    cartModal.innerHTML = `
      <h2 style="color:#e0e8f0;margin-top:0;">🛒 ${t("cart")}</h2>
      ${itemsHtml}
      ${cart.length > 0 ? `<div style="display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:2px solid #ffd700;">
        <span style="color:#e0e8f0;font-size:18px;font-weight:bold;">${t("cartTotal")}:</span>
        <span style="color:#ffd700;font-size:22px;font-weight:bold;">$${money(total)}</span>
      </div>` : ""}
      <div style="display:flex;gap:10px;margin-top:20px;">
        <button class="modal-close" style="flex:1;">${t("close")}</button>
        ${cart.length > 0 ? `<button class="modal-buy" style="flex:1;">${t("checkout")}</button>` : ""}
      </div>`;
    document.body.appendChild(cartModal);
    cartModal.showModal();
    cartModal.querySelector(".modal-close").addEventListener("click", () => { cartModal.close(); cartModal.remove(); });
    const buyBtn = cartModal.querySelector(".modal-buy");
    if (buyBtn) buyBtn.addEventListener("click", () => { window.location.href = "checkout.html"; });
  }

  function render() {
    grid.replaceChildren();
    if (!products.length) { message(feedback, t("noResult")); resultCount.textContent = t("resultCount").replace("{n}", 0); return; }
    message(feedback, "");
    resultCount.textContent = t("resultCount").replace("{n}", totalCount);
    products.forEach(product => {
      const card = node("button", undefined, "product-card");
      card.type = "button";
      const is3D = product.source === 'local';
      const tagText = is3D ? t("preview3d") : (product.source === 'web' ? t("webSource") : t("aiSource"));
      card.append(node("h3", product.name), node("div", product.category, "cat"), node("div", `$${money(product.price)}`, "price"), node("p", tagText, "sample-note"));
      card.addEventListener("click", () => {
        selectedProduct = product;
        document.getElementById("modalName").textContent = product.name;
        document.getElementById("modalDesc").textContent = product.spec?.fullDesc || product.spec?.shortDesc || "3D资产商品";
        document.getElementById("modalPrice").textContent = money(product.price);
        const viewerContainer = document.getElementById("modelViewerContainer");
        const placeholder = document.getElementById("modelPlaceholder");
        const viewer = document.getElementById("modelViewer");
        const fileName = product.filePath ? product.filePath.split(/[\\/]/).pop() : (product.name + '.glb');
        const previewFileName = fileName.replace(/\.(fbx|obj|blend|stl|dae|3ds)$/i, '.glb');
        if (product.source === 'local') {
          viewerContainer.style.display = 'flex';
          placeholder.style.display = 'flex';
          placeholder.innerHTML = t("loadingModel");
          viewer.style.display = 'block';
          const modelUrl = '/models/' + encodeURIComponent(previewFileName);
          const setModelSrc = () => { viewer.src = modelUrl; viewer.alt = product.name + ' 3D预览'; };
          if (customElements.get('model-viewer')) { setModelSrc(); } else { customElements.whenDefined('model-viewer').then(setModelSrc); }
          const onLoad = () => { placeholder.style.display = 'none'; viewer.removeEventListener('load', onLoad); };
          viewer.addEventListener('load', onLoad);
          const onError = () => { placeholder.innerHTML = t("modelNoPreview"); placeholder.style.display = 'flex'; viewer.removeEventListener('error', onError); };
          viewer.addEventListener('error', onError);
          setTimeout(() => { if (placeholder.style.display !== 'none') { placeholder.innerHTML = t("modelTimeout"); placeholder.style.display = 'flex'; } }, 15000);
        } else {
          viewerContainer.style.display = 'none';
          placeholder.style.display = 'flex';
          const extName = fileName.split('.').pop() || '3D';
          placeholder.innerHTML = '📦 ' + extName.toUpperCase() + ' 模型文件 · 购买后可下载';
        }
        // 更新购买按钮
        const buyBtn = document.getElementById("buyBtn");
        buyBtn.textContent = t("buyNow");
        buyBtn.onclick = () => { if (selectedProduct) window.location.href = `checkout.html?pid=${encodeURIComponent(selectedProduct.productId)}`; };
        // 加入购物车按钮
        let addCartBtn = document.getElementById("addCartBtn");
        if (!addCartBtn) {
          addCartBtn = document.createElement("button");
          addCartBtn.id = "addCartBtn";
          addCartBtn.className = "modal-buy";
          addCartBtn.style.cssText = "background:linear-gradient(135deg,#4CAF50,#2E7D32);margin-right:8px;";
          document.getElementById("modalFooter").insertBefore(addCartBtn, buyBtn);
        }
        addCartBtn.textContent = t("addToCart");
        addCartBtn.onclick = () => addToCart(product);
        modal.showModal();
      });
      grid.append(card);
    });
    loadMoreBtn.hidden = currentOffset + products.length >= totalCount;
  }

  async function loadProducts(reset = true) {
    if (loading) return;
    loading = true;
    if (reset) { currentOffset = 0; products = []; }
    retry.hidden = true;
    filters.forEach(button => { button.disabled = true; });
    message(feedback, t("loading"));
    try {
      const params = new URLSearchParams({
        limit: PAGE_SIZE,
        offset: currentOffset,
        category: activeFilter,
        sort: sortSelect.value,
        q: searchInput.value.trim()
      });
      const data = await request("/store/products?" + params.toString());
      if (!Array.isArray(data.products)) throw new Error("Invalid product list.");
      const valid = data.products.filter(product => product && typeof product.productId === "string" && typeof product.name === "string" && Number.isFinite(Number(product.price)));
      products = reset ? valid : [...products, ...valid];
      totalCount = data.total || products.length;
      currentOffset += valid.length;
      render();
    } catch (error) { message(feedback, error.message, "error"); retry.hidden = false; }
    finally { loading = false; filters.forEach(button => { button.disabled = false; }); }
  }

  // 事件绑定
  document.getElementById("modalClose").addEventListener("click", () => modal.close());
  modal.addEventListener("click", event => {
    if (event.target === modal) {
      const bounds = modal.getBoundingClientRect();
      if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) modal.close();
    }
  });
  filters.forEach(button => button.addEventListener("click", () => {
    activeFilter = button.dataset.filter;
    filters.forEach(other => { other.classList.toggle("active", other === button); other.setAttribute("aria-pressed", String(other === button)); });
    loadProducts(true);
  }));
  let searchTimer;
  searchInput.addEventListener("input", () => { clearTimeout(searchTimer); searchTimer = setTimeout(() => loadProducts(true), 400); });
  sortSelect.addEventListener("change", () => loadProducts(true));
  loadMoreBtn.addEventListener("click", () => loadProducts(false));
  retry.addEventListener("click", () => loadProducts(true));
  cartBtn.addEventListener("click", showCart);
  langSelect.addEventListener("change", () => { currentLang = langSelect.value; localStorage.setItem("fantasy3d_lang", currentLang); applyLang(); loadProducts(true); });

  // 初始化
  applyLang();
  updateCartCount();
  loadProducts();
})();
