const tokenKey = "pos_token";
const userKey = "pos_user";

let currentUser = {};
let isAdmin = false;

function getToken() {
  return localStorage.getItem(tokenKey);
}

function setAuth(token, user) {
  localStorage.setItem(tokenKey, token);
  localStorage.setItem(userKey, JSON.stringify(user));
}

function clearAuth() {
  localStorage.removeItem(tokenKey);
  localStorage.removeItem(userKey);
}

function formatMoney(amount) {
  return `₹${Number(amount || 0).toFixed(2)}`;
}

function showMessage(element, message, type) {
  if (!element) return;
  element.textContent = message;
  element.className = `message ${type}`;
}

function showToast(message, type = "info") {
  const toast = document.getElementById("toast");
  if (!toast) return;

  toast.textContent = message;
  toast.style.background = type === "error" ? "#a93121" : "#1f3046";
  toast.classList.add("show");

  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    toast.classList.remove("show");
  }, 2500);
}

async function apiRequest(url, options = {}) {
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {})
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  try {
    const response = await fetch(url, {
      ...options,
      headers
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload.message || "Request failed");
    }

    return payload;
  } catch (error) {
    if (String(error.message).toLowerCase().includes("token")) {
      clearAuth();
    }
    throw error;
  }
}

function setupLoginPage() {
  const loginForm = document.getElementById("loginForm");
  if (!loginForm) return false;

  if (getToken()) {
    window.location.href = "/dashboard.html";
    return true;
  }

  loginForm.addEventListener("submit", async (event) => {
    event.preventDefault();

    const username = document.getElementById("username").value.trim();
    const password = document.getElementById("password").value;
    const messageEl = document.getElementById("message");

    try {
      const result = await apiRequest("/api/login", {
        method: "POST",
        body: JSON.stringify({ username, password })
      });

      setAuth(result.token, result.user);
      showMessage(messageEl, "Login successful. Redirecting...", "success");
      window.setTimeout(() => {
        window.location.href = "/dashboard.html";
      }, 400);
    } catch (error) {
      showMessage(messageEl, error.message, "error");
    }
  });

  return true;
}

function setupDashboardPage() {
  const sectionRoot = document.getElementById("posSection");
  if (!sectionRoot) return false;

  const token = getToken();
  if (!token) {
    window.location.href = "/login.html";
    return true;
  }

  const userInfo = document.getElementById("userInfo");
  currentUser = JSON.parse(localStorage.getItem(userKey) || "{}");
  isAdmin = currentUser.role === "admin";
  userInfo.textContent = `${currentUser.fullName || currentUser.username || "User"} (${currentUser.role || "staff"})`;

  applyRoleAccess();

  const state = {
    products: [],
    filteredProducts: [],
    cart: [],
    pinnedIds: new Set(loadPinnedIds())
  };

  setupNavigation();
  setupLogout();
  setupPOS(state);
  setupProductManagement();
  setupExpenseManagement();
  setupSalesHistory();
  setupReports();

  return true;
}

function setupNavigation() {
  const navButtons = Array.from(document.querySelectorAll(".nav-btn"));
  const sections = Array.from(document.querySelectorAll(".section"));

  navButtons.forEach((button) => {
    button.addEventListener("click", () => {
      navButtons.forEach((b) => b.classList.remove("active"));
      sections.forEach((s) => s.classList.remove("active"));

      button.classList.add("active");
      const sectionId = button.dataset.section;
      document.getElementById(sectionId).classList.add("active");
    });
  });
}

function applyRoleAccess() {
  if (isAdmin) {
    return;
  }

  document.querySelectorAll(".admin-only").forEach((el) => {
    el.classList.add("is-hidden");
  });

  const activeBtn = document.querySelector(".nav-btn.active");
  if (!activeBtn || activeBtn.classList.contains("is-hidden")) {
    const posBtn = document.querySelector('.nav-btn[data-section="posSection"]');
    if (posBtn) {
      posBtn.classList.add("active");
      document.querySelectorAll(".section").forEach((section) => section.classList.remove("active"));
      const posSection = document.getElementById("posSection");
      if (posSection) posSection.classList.add("active");
    }
  }
}

function pinStorageKey() {
  return `pos_pins_${currentUser.username || "guest"}`;
}

function loadPinnedIds() {
  try {
    const data = JSON.parse(localStorage.getItem(pinStorageKey()) || "[]");
    if (!Array.isArray(data)) return [];
    return data.map((id) => Number(id)).filter((id) => Number.isInteger(id));
  } catch (error) {
    return [];
  }
}

function savePinnedIds(idSet) {
  localStorage.setItem(pinStorageKey(), JSON.stringify(Array.from(idSet)));
}

function setupLogout() {
  document.getElementById("logoutBtn").addEventListener("click", () => {
    clearAuth();
    window.location.href = "/login.html";
  });
}

function setupPOS(state) {
  const productSearch = document.getElementById("productSearch");
  const categoryFilter = document.getElementById("categoryFilter");
  const clearCartBtn = document.getElementById("clearCartBtn");
  const completeSaleBtn = document.getElementById("completeSaleBtn");

  async function loadProducts() {
    try {
      state.products = await apiRequest("/api/products");
      applyProductFilters();
      renderPinnedProducts();
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function applyProductFilters() {
    const search = productSearch.value.trim().toLowerCase();
    const category = categoryFilter.value;
    state.filteredProducts = state.products.filter((product) => {
      const matchesSearch = !search || String(product.name).toLowerCase().includes(search);
      const matchesCategory = !category || product.category === category;
      return matchesSearch && matchesCategory;
    });
    renderProducts();
  }

  function renderProducts() {
    const grid = document.getElementById("productGrid");
    if (!state.filteredProducts.length) {
      grid.innerHTML = "<p>No products found.</p>";
      return;
    }

    grid.innerHTML = state.filteredProducts
      .map((p) => {
        const lowStock = p.category !== "Services" && p.stock_quantity <= 5;
        const isPinned = state.pinnedIds.has(p.id);
        return `
          <article class="product-card">
            <button class="pin-btn ${isPinned ? "active" : ""}" data-pin-product="${p.id}" title="Pin item">📌</button>
            <h4>${escapeHtml(p.name)}</h4>
            <div class="price">${formatMoney(p.selling_price)}</div>
            <div class="meta">${p.category} | Stock: ${p.stock_quantity}</div>
            ${lowStock ? '<div class="meta" style="color:#b44530;">Low stock</div>' : ""}
            <button class="btn btn-primary" data-add-product="${p.id}">Add</button>
          </article>
        `;
      })
      .join("");

    grid.querySelectorAll("[data-add-product]").forEach((button) => {
      button.addEventListener("click", () => addToCart(Number(button.dataset.addProduct)));
    });

    grid.querySelectorAll("[data-pin-product]").forEach((button) => {
      button.addEventListener("click", () => {
        togglePin(Number(button.dataset.pinProduct));
      });
    });
  }

  function renderPinnedProducts() {
    const pinnedWrap = document.getElementById("pinnedProducts");
    const pinnedProducts = state.products.filter((product) => state.pinnedIds.has(product.id));
    if (!pinnedProducts.length) {
      pinnedWrap.innerHTML = "<span class=\"pin-empty\">No pinned items yet</span>";
      return;
    }

    pinnedWrap.innerHTML = pinnedProducts
      .map(
        (product) => `
        <button class="pin-chip" data-pinned-add="${product.id}">
          ${escapeHtml(product.name)}
        </button>
      `
      )
      .join("");

    pinnedWrap.querySelectorAll("[data-pinned-add]").forEach((button) => {
      button.addEventListener("click", () => addToCart(Number(button.dataset.pinnedAdd)));
    });
  }

  function togglePin(productId) {
    if (state.pinnedIds.has(productId)) {
      state.pinnedIds.delete(productId);
    } else {
      state.pinnedIds.add(productId);
    }
    savePinnedIds(state.pinnedIds);
    renderPinnedProducts();
    renderProducts();
  }

  function addToCart(productId) {
    const product = state.products.find((p) => p.id === productId);
    if (!product) return;

    const existing = state.cart.find((item) => item.productId === productId);
    const nextQty = (existing?.quantity || 0) + 1;

    if (product.category !== "Services" && nextQty > product.stock_quantity) {
      showToast(`Stock not available for ${product.name}`, "error");
      return;
    }

    if (existing) {
      existing.quantity += 1;
    } else {
      state.cart.push({
        productId: product.id,
        productName: product.name,
        unitPrice: Number(product.selling_price),
        quantity: 1,
        category: product.category
      });
    }

    renderCart();
  }

  function changeQty(productId, diff) {
    const item = state.cart.find((line) => line.productId === productId);
    if (!item) return;

    const product = state.products.find((p) => p.id === productId);
    const newQty = item.quantity + diff;

    if (newQty <= 0) {
      state.cart = state.cart.filter((line) => line.productId !== productId);
      renderCart();
      return;
    }

    if (
      product &&
      product.category !== "Services" &&
      Number.isInteger(product.stock_quantity) &&
      newQty > product.stock_quantity
    ) {
      showToast(`Stock not available for ${product.name}`, "error");
      return;
    }

    item.quantity = newQty;
    renderCart();
  }

  function renderCart() {
    const cartItems = document.getElementById("cartItems");
    const totalEl = document.getElementById("cartTotal");

    if (!state.cart.length) {
      cartItems.innerHTML = "<p>No items in cart.</p>";
      totalEl.textContent = formatMoney(0);
      return;
    }

    cartItems.innerHTML = state.cart
      .map((item) => {
        const subtotal = item.quantity * item.unitPrice;
        return `
          <div class="cart-item">
            <strong>${escapeHtml(item.productName)}</strong>
            <span>${item.quantity} x ${formatMoney(item.unitPrice)} = ${formatMoney(subtotal)}</span>
            <div class="btn-row">
              <button class="btn btn-outline" data-cart-minus="${item.productId}">-</button>
              <button class="btn btn-outline" data-cart-plus="${item.productId}">+</button>
              <button class="btn btn-danger" data-cart-remove="${item.productId}">Remove</button>
            </div>
          </div>
        `;
      })
      .join("");

    cartItems.querySelectorAll("[data-cart-minus]").forEach((button) => {
      button.addEventListener("click", () => changeQty(Number(button.dataset.cartMinus), -1));
    });
    cartItems.querySelectorAll("[data-cart-plus]").forEach((button) => {
      button.addEventListener("click", () => changeQty(Number(button.dataset.cartPlus), 1));
    });
    cartItems.querySelectorAll("[data-cart-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        state.cart = state.cart.filter((line) => line.productId !== Number(button.dataset.cartRemove));
        renderCart();
      });
    });

    const total = state.cart.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
    totalEl.textContent = formatMoney(total);
  }

  async function completeSale() {
    if (!state.cart.length) {
      showToast("Cart is empty", "error");
      return;
    }

    const paymentMethod = document.getElementById("paymentMethod").value;
    const customerName = document.getElementById("customerName").value.trim();

    try {
      const payload = {
        items: state.cart.map((line) => ({ productId: line.productId, quantity: line.quantity })),
        paymentMethod,
        customerName
      };

      const result = await apiRequest("/api/sales", {
        method: "POST",
        body: JSON.stringify(payload)
      });

      state.cart = [];
      document.getElementById("customerName").value = "";
      renderCart();
      await loadProducts();
      await loadSalesHistory();
      if (isAdmin) {
        await loadDailySummary();
      }
      showToast(`Sale complete: ${result.invoiceNumber}`);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  async function sendEndShiftReport() {
    const date = document.getElementById("shiftReportDate").value;
    try {
      const result = await apiRequest("/api/reports/end-shift", {
        method: "POST",
        body: JSON.stringify({ date })
      });
      document.getElementById("shiftReportHint").textContent = `Last sent for ${date}`;
      showToast(result.message || "Shift report sent");
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  document.getElementById("shiftReportDate").value = new Date().toISOString().slice(0, 10);
  document.getElementById("sendShiftReportBtn").addEventListener("click", sendEndShiftReport);

  productSearch.addEventListener("input", debounce(applyProductFilters, 250));
  categoryFilter.addEventListener("change", applyProductFilters);
  clearCartBtn.addEventListener("click", () => {
    state.cart = [];
    renderCart();
  });
  completeSaleBtn.addEventListener("click", completeSale);

  loadProducts();
  renderCart();
}

function setupSalesHistory() {
  const dateInput = document.getElementById("salesDate");
  const loadBtn = document.getElementById("loadSalesBtn");

  window.loadSalesHistory = async function loadSalesHistory() {
    try {
      const params = new URLSearchParams();
      if (dateInput.value) params.set("date", dateInput.value);

      const url = `/api/sales${params.toString() ? `?${params}` : ""}`;
      const sales = await apiRequest(url);
      renderSalesTable(sales);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  loadBtn.addEventListener("click", window.loadSalesHistory);
  window.loadSalesHistory();
}

function renderSalesTable(sales) {
  const wrap = document.getElementById("salesList");
  if (!sales.length) {
    wrap.innerHTML = "<p style='padding:12px;'>No sales found.</p>";
    return;
  }

  wrap.innerHTML = `
    <table>
      <thead>
        <tr>
          <th>Invoice</th>
          <th>Items</th>
          <th>Total</th>
          <th>Payment</th>
          <th>Customer</th>
          <th>Staff</th>
          <th>Date/Time</th>
        </tr>
      </thead>
      <tbody>
        ${sales
          .map((sale) => {
            const itemsSummary = sale.items
              .map((item) => `${escapeHtml(item.product_name)} (${item.quantity})`)
              .join(", ");
            return `
            <tr>
              <td>${escapeHtml(sale.invoice_number)}</td>
              <td>${itemsSummary}</td>
              <td>${formatMoney(sale.total_amount)}</td>
              <td>${sale.payment_method}</td>
              <td>${escapeHtml(sale.customer_name || "-")}</td>
              <td>${escapeHtml(sale.staff_name)}</td>
              <td>${new Date(sale.timestamp).toLocaleString()}</td>
            </tr>
          `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function setupProductManagement() {
  if (!isAdmin) {
    return;
  }

  const form = document.getElementById("productForm");
  const resetBtn = document.getElementById("resetProductForm");
  const productMap = new Map();

  async function loadProductsList() {
    try {
      const products = await apiRequest("/api/products");
      renderProductsTable(products);
    } catch (error) {
      showToast(error.message, "error");
    }
  }

  function fillForm(product) {
    document.getElementById("productId").value = product.id;
    document.getElementById("productName").value = product.name;
    document.getElementById("productCategory").value = product.category;
    document.getElementById("sellingPrice").value = product.selling_price;
    document.getElementById("costPrice").value = product.cost_price;
    document.getElementById("stockQuantity").value = product.stock_quantity;
  }

  function resetForm() {
    form.reset();
    document.getElementById("productId").value = "";
  }

  function renderProductsTable(products) {
    const wrap = document.getElementById("productsList");
    if (!products.length) {
      wrap.innerHTML = "<p style='padding:12px;'>No products available.</p>";
      return;
    }

    productMap.clear();
    products.forEach((product) => productMap.set(product.id, product));

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Category</th>
            <th>Selling Price</th>
            <th>Cost Price</th>
            <th>Stock</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          ${products
            .map(
              (p) => `
            <tr>
              <td>${escapeHtml(p.name)}</td>
              <td>${p.category}</td>
              <td>${formatMoney(p.selling_price)}</td>
              <td>${formatMoney(p.cost_price)}</td>
              <td>${p.stock_quantity}</td>
              <td><button class="btn btn-outline" data-edit-product-id="${p.id}">Edit</button></td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;

    wrap.querySelectorAll("[data-edit-product-id]").forEach((button) => {
      button.addEventListener("click", () => {
        const product = productMap.get(Number(button.dataset.editProductId));
        if (!product) return;
        fillForm(product);
      });
    });
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const id = document.getElementById("productId").value;
    const payload = {
      name: document.getElementById("productName").value.trim(),
      category: document.getElementById("productCategory").value,
      selling_price: Number(document.getElementById("sellingPrice").value),
      cost_price: Number(document.getElementById("costPrice").value),
      stock_quantity: Number(document.getElementById("stockQuantity").value)
    };

    try {
      if (id) {
        await apiRequest(`/api/products/${id}`, {
          method: "PUT",
          body: JSON.stringify(payload)
        });
        showToast("Product updated");
      } else {
        await apiRequest("/api/products", {
          method: "POST",
          body: JSON.stringify(payload)
        });
        showToast("Product added");
      }

      resetForm();
      await loadProductsList();
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  resetBtn.addEventListener("click", resetForm);
  loadProductsList();
}

function setupExpenseManagement() {
  const form = document.getElementById("expenseForm");
  const dateInput = document.getElementById("expensesDate");
  const loadBtn = document.getElementById("loadExpensesBtn");

  window.loadExpenses = async function loadExpenses() {
    try {
      const params = new URLSearchParams();
      if (dateInput.value) params.set("date", dateInput.value);

      const url = `/api/expenses${params.toString() ? `?${params}` : ""}`;
      const expenses = await apiRequest(url);
      renderExpenses(expenses);
    } catch (error) {
      showToast(error.message, "error");
    }
  };

  function renderExpenses(expenses) {
    const wrap = document.getElementById("expensesList");
    if (!expenses.length) {
      wrap.innerHTML = "<p style='padding:12px;'>No expenses found.</p>";
      return;
    }

    wrap.innerHTML = `
      <table>
        <thead>
          <tr>
            <th>Description</th>
            <th>Category</th>
            <th>Amount</th>
            <th>Staff</th>
            <th>Date/Time</th>
          </tr>
        </thead>
        <tbody>
          ${expenses
            .map(
              (e) => `
            <tr>
              <td>${escapeHtml(e.description)}</td>
              <td>${e.category}</td>
              <td>${formatMoney(e.amount)}</td>
              <td>${escapeHtml(e.staff_name)}</td>
              <td>${new Date(e.timestamp).toLocaleString()}</td>
            </tr>
          `
            )
            .join("")}
        </tbody>
      </table>
    `;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const payload = {
      description: document.getElementById("expenseDescription").value.trim(),
      amount: Number(document.getElementById("expenseAmount").value),
      category: document.getElementById("expenseCategory").value
    };

    try {
      await apiRequest("/api/expenses", {
        method: "POST",
        body: JSON.stringify(payload)
      });
      form.reset();
      await window.loadExpenses();
      if (isAdmin) {
        await loadDailySummary();
      }
      showToast("Expense added");
    } catch (error) {
      showToast(error.message, "error");
    }
  });

  loadBtn.addEventListener("click", window.loadExpenses);
  window.loadExpenses();
}

function setupReports() {
  if (!isAdmin) {
    return;
  }

  const dailyDate = document.getElementById("dailyDate");
  const startDate = document.getElementById("reportStartDate");
  const endDate = document.getElementById("reportEndDate");

  const today = new Date().toISOString().slice(0, 10);
  dailyDate.value = today;
  endDate.value = today;

  const monthStart = new Date();
  monthStart.setDate(1);
  startDate.value = monthStart.toISOString().slice(0, 10);

  document.getElementById("loadDailyBtn").addEventListener("click", loadDailySummary);
  document.getElementById("loadProfitBtn").addEventListener("click", loadProfitLoss);

  loadDailySummary();
  loadProfitLoss();
}

async function loadDailySummary() {
  const date = document.getElementById("dailyDate").value;
  const box = document.getElementById("dailySummary");

  try {
    const summary = await apiRequest(`/api/reports/daily-summary?date=${date}`);
    box.innerHTML = `
      <div class="stat"><span>Date</span><strong>${summary.date}</strong></div>
      <div class="stat"><span>Total Sales</span><strong>${formatMoney(summary.total_sales)}</strong></div>
      <div class="stat"><span>Total Expenses</span><strong>${formatMoney(summary.total_expenses)}</strong></div>
      <div class="stat"><span>Transactions</span><strong>${summary.transactions}</strong></div>
      <div class="stat"><span>Cash In Hand</span><strong>${formatMoney(summary.cash_in_hand)}</strong></div>
    `;
  } catch (error) {
    box.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

async function loadProfitLoss() {
  const startDate = document.getElementById("reportStartDate").value;
  const endDate = document.getElementById("reportEndDate").value;
  const box = document.getElementById("profitLoss");

  try {
    const result = await apiRequest(
      `/api/reports/profit-loss?startDate=${startDate}&endDate=${endDate}`
    );

    box.innerHTML = `
      <div class="stat"><span>Revenue</span><strong>${formatMoney(result.revenue)}</strong></div>
      <div class="stat"><span>COGS</span><strong>${formatMoney(result.cogs)}</strong></div>
      <div class="stat"><span>Gross Profit</span><strong>${formatMoney(result.grossProfit)}</strong></div>
      <div class="stat"><span>Total Expenses</span><strong>${formatMoney(result.totalExpenses)}</strong></div>
      <div class="stat"><span>Net Profit</span><strong>${formatMoney(result.netProfit)}</strong></div>
      <div class="stat"><span>Transactions</span><strong>${result.transactions}</strong></div>
    `;
  } catch (error) {
    box.innerHTML = `<p>${escapeHtml(error.message)}</p>`;
  }
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/\"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function debounce(fn, waitMs) {
  let timeout;
  return (...args) => {
    window.clearTimeout(timeout);
    timeout = window.setTimeout(() => fn(...args), waitMs);
  };
}

setupLoginPage();
setupDashboardPage();
