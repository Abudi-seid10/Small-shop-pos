const TOKEN_KEY = 'small-shop-pos-token'
const USER_KEY = 'small-shop-pos-user'

const state = {
  token: localStorage.getItem(TOKEN_KEY),
  user: readStoredUser(),
  products: [],
  cart: [],
  editingProductId: null
}

document.addEventListener('DOMContentLoaded', () => {
  const page = document.body.dataset.page

  if (page === 'login') {
    initializeLoginPage()
    return
  }

  initializeDashboardPage()
})

function readStoredUser() {
  try {
    const value = localStorage.getItem(USER_KEY)
    return value ? JSON.parse(value) : null
  } catch {
    return null
  }
}

function initializeLoginPage() {
  if (state.token) {
    window.location.replace('/dashboard.html')
    return
  }

  const form = document.getElementById('login-form')
  form?.addEventListener('submit', async (event) => {
    event.preventDefault()
    hideMessage()

    const formData = new FormData(form)
    const username = String(formData.get('username') || '').trim()
    const password = String(formData.get('password') || '').trim()

    if (!username || !password) {
      showMessage('error', 'Please enter both username and password.')
      return
    }

    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      })
      const payload = await parseJsonResponse(response)

      if (!response.ok) {
        throw new Error(payload.message)
      }

      state.token = payload.token
      state.user = payload.user
      localStorage.setItem(TOKEN_KEY, payload.token)
      localStorage.setItem(USER_KEY, JSON.stringify(payload.user))
      window.location.replace('/dashboard.html')
    } catch (error) {
      showMessage('error', error.message || 'Unable to sign in.')
    }
  })
}

function initializeDashboardPage() {
  if (!state.token) {
    window.location.replace('/login.html')
    return
  }

  const today = new Date().toISOString().slice(0, 10)
  document.getElementById('today-label').textContent = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'long',
    year: 'numeric'
  })
  document.getElementById('staff-name').textContent = state.user?.fullName || 'Signed-in staff'
  document.getElementById('staff-role').textContent = state.user?.role || 'Staff'
  document.getElementById('summary-date').value = today
  document.getElementById('sales-date-filter').value = today
  document.getElementById('expenses-date-filter').value = today
  document.getElementById('profit-start-date').value = `${today.slice(0, 8)}01`
  document.getElementById('profit-end-date').value = today

  bindNavigation()
  bindPosInteractions()
  bindExpenseForm()
  bindProductForm()
  bindReportFilters()
  bindLogout()

  void loadDashboardData()
}

function bindNavigation() {
  const buttons = document.querySelectorAll('.nav-button')
  const sections = document.querySelectorAll('.view-section')

  for (const button of buttons) {
    button.addEventListener('click', () => {
      const targetView = button.dataset.view

      for (const navButton of buttons) {
        navButton.classList.toggle('active', navButton === button)
      }

      for (const section of sections) {
        section.classList.toggle('active', section.id === targetView)
      }
    })
  }
}

function bindPosInteractions() {
  document.getElementById('product-search').addEventListener('input', renderProducts)
  document.getElementById('category-filter').addEventListener('change', renderProducts)
  document.getElementById('clear-cart-button').addEventListener('click', clearCart)
  document.getElementById('complete-sale-button').addEventListener('click', () => {
    void completeSale()
  })
  document.getElementById('sales-date-filter').addEventListener('change', () => {
    void loadSales()
  })
}

function bindExpenseForm() {
  const form = document.getElementById('expense-form')
  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    hideMessage()

    const formData = new FormData(form)

    try {
      await apiFetch('/api/expenses', {
        method: 'POST',
        body: JSON.stringify({
          description: formData.get('description'),
          amount: formData.get('amount'),
          category: formData.get('category')
        })
      })

      form.reset()
      showMessage('success', 'Expense saved successfully.')
      await Promise.all([loadExpenses(), loadDailySummary(), loadProfitLoss()])
    } catch (error) {
      showMessage('error', error.message)
    }
  })

  document.getElementById('expenses-date-filter').addEventListener('change', () => {
    void loadExpenses()
  })
}

function bindProductForm() {
  const form = document.getElementById('product-form')
  const cancelButton = document.getElementById('cancel-edit-button')

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    hideMessage()

    const formData = new FormData(form)
    const payload = {
      name: formData.get('name'),
      category: formData.get('category'),
      sellingPrice: formData.get('sellingPrice'),
      costPrice: formData.get('costPrice'),
      stockQuantity: formData.get('stockQuantity')
    }

    try {
      if (state.editingProductId) {
        await apiFetch(`/api/products/${state.editingProductId}`, {
          method: 'PUT',
          body: JSON.stringify(payload)
        })
        showMessage('success', 'Product updated successfully.')
      } else {
        await apiFetch('/api/products', {
          method: 'POST',
          body: JSON.stringify(payload)
        })
        showMessage('success', 'Product added successfully.')
      }

      resetProductForm()
      await loadProducts()
    } catch (error) {
      showMessage('error', error.message)
    }
  })

  cancelButton.addEventListener('click', resetProductForm)
}

function bindReportFilters() {
  document.getElementById('summary-date').addEventListener('change', () => {
    void loadDailySummary()
  })

  document.getElementById('profit-loss-form').addEventListener('submit', (event) => {
    event.preventDefault()
    void loadProfitLoss()
  })
}

function bindLogout() {
  document.getElementById('logout-button').addEventListener('click', () => {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    state.token = null
    state.user = null
    state.cart = []
    window.location.replace('/login.html')
  })
}

async function loadDashboardData() {
  hideMessage()

  try {
    await Promise.all([loadProducts(), loadSales(), loadExpenses(), loadDailySummary(), loadProfitLoss()])
  } catch (error) {
    showMessage('error', error.message)
  }
}

async function apiFetch(url, options = {}) {
  const headers = {
    Authorization: 'Bearer ' + state.token,
    'Content-Type': 'application/json',
    ...options.headers
  }

  const response = await fetch(url, { ...options, headers })
  const payload = await parseJsonResponse(response)

  if (response.status === 401) {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
    window.location.replace('/login.html')
    throw new Error(payload.message || 'Please sign in again.')
  }

  if (!response.ok) {
    throw new Error(payload.message || 'Request failed.')
  }

  return payload
}

async function parseJsonResponse(response) {
  try {
    return await response.json()
  } catch {
    return {}
  }
}

async function loadProducts() {
  state.products = await apiFetch('/api/products')
  renderProducts()
  renderProductList()
  syncCartWithProducts()
}

function renderProducts() {
  const searchValue = document.getElementById('product-search').value.trim().toLowerCase()
  const categoryValue = document.getElementById('category-filter').value
  const grid = document.getElementById('product-grid')

  const filteredProducts = state.products.filter((product) => {
    const matchesSearch = product.name.toLowerCase().includes(searchValue)
    const matchesCategory = !categoryValue || product.category === categoryValue
    return matchesSearch && matchesCategory
  })

  if (filteredProducts.length === 0) {
    grid.innerHTML = '<div class="list-card"><p>No products match your search.</p></div>'
    return
  }

  grid.innerHTML = filteredProducts
    .map((product) => {
      const isService = product.category === 'Services'
      const stockText = isService ? 'On demand service' : `Stock: ${product.stock_quantity}`
      const isOutOfStock = !isService && product.stock_quantity <= 0

      return `
        <article class="product-card">
          <div>
            <span class="badge">${product.category}</span>
          </div>
          <div>
            <h3>${escapeHtml(product.name)}</h3>
            <p class="product-card__meta">${stockText}</p>
          </div>
          <div class="product-card__footer">
            <strong>${formatCurrency(product.selling_price)}</strong>
            <button
              type="button"
              class="primary-button"
              data-product-id="${product.id}"
              ${isOutOfStock ? 'disabled' : ''}
            >
              ${isOutOfStock ? 'Out of stock' : 'Add'}
            </button>
          </div>
        </article>
      `
    })
    .join('')

  for (const button of grid.querySelectorAll('[data-product-id]')) {
    button.addEventListener('click', () => addToCart(Number(button.dataset.productId)))
  }
}

function renderProductList() {
  const container = document.getElementById('products-list')

  container.innerHTML = state.products
    .map(
      (product) => `
        <article class="list-card">
          <div class="list-card__grid">
            <div class="list-card__footer">
              <h3>${escapeHtml(product.name)}</h3>
              <span class="badge">${product.category}</span>
            </div>
            <p class="list-card__meta">
              Selling: ${formatCurrency(product.selling_price)} ·
              Cost: ${formatCurrency(product.cost_price)} ·
              Stock: ${product.category === 'Services' ? 'Service' : product.stock_quantity}
            </p>
            <div class="list-card__footer">
              <span class="list-card__amount">${formatCurrency(product.selling_price)}</span>
              <button type="button" class="secondary-button" data-edit-product="${product.id}">Edit</button>
            </div>
          </div>
        </article>
      `
    )
    .join('')

  for (const button of container.querySelectorAll('[data-edit-product]')) {
    button.addEventListener('click', () => startEditingProduct(Number(button.dataset.editProduct)))
  }
}

function syncCartWithProducts() {
  state.cart = state.cart
    .map((item) => {
      const product = state.products.find((entry) => entry.id === item.productId)
      return product ? { ...item, name: product.name, price: product.selling_price, category: product.category } : null
    })
    .filter(Boolean)

  renderCart()
}

function addToCart(productId) {
  const product = state.products.find((item) => item.id === productId)

  if (!product) {
    showMessage('error', 'Product not found.')
    return
  }

  const existingItem = state.cart.find((item) => item.productId === productId)

  if (existingItem) {
    if (product.category !== 'Services' && existingItem.quantity >= product.stock_quantity) {
      showMessage('error', `Only ${product.stock_quantity} item(s) available for ${product.name}.`)
      return
    }

    existingItem.quantity += 1
  } else {
    state.cart.push({
      productId: product.id,
      name: product.name,
      category: product.category,
      price: product.selling_price,
      quantity: 1
    })
  }

  hideMessage()
  renderCart()
}

function updateCartQuantity(productId, delta) {
  const cartItem = state.cart.find((item) => item.productId === productId)
  const product = state.products.find((item) => item.id === productId)

  if (!cartItem || !product) {
    return
  }

  const nextQuantity = cartItem.quantity + delta

  if (nextQuantity <= 0) {
    state.cart = state.cart.filter((item) => item.productId !== productId)
  } else {
    if (product.category !== 'Services' && nextQuantity > product.stock_quantity) {
      showMessage('error', `Only ${product.stock_quantity} item(s) available for ${product.name}.`)
      return
    }

    cartItem.quantity = nextQuantity
  }

  renderCart()
}

function clearCart() {
  state.cart = []
  renderCart()
}

function renderCart() {
  const container = document.getElementById('cart-items')
  const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0)
  document.getElementById('cart-total').textContent = formatCurrency(total)

  if (state.cart.length === 0) {
    container.innerHTML = '<div class="list-card"><p>Your cart is empty.</p></div>'
    return
  }

  container.innerHTML = state.cart
    .map(
      (item) => `
        <article class="cart-item">
          <div class="cart-item__footer">
            <div>
              <h3>${escapeHtml(item.name)}</h3>
              <p class="cart-item__meta">${formatCurrency(item.price)} each</p>
            </div>
            <button type="button" class="icon-button icon-button--danger" data-remove-item="${item.productId}">✕</button>
          </div>
          <div class="cart-item__footer">
            <div class="cart-item__controls">
              <button type="button" class="icon-button" data-cart-step="-1" data-product-id="${item.productId}">−</button>
              <strong>${item.quantity}</strong>
              <button type="button" class="icon-button" data-cart-step="1" data-product-id="${item.productId}">+</button>
            </div>
            <strong>${formatCurrency(item.price * item.quantity)}</strong>
          </div>
        </article>
      `
    )
    .join('')

  for (const button of container.querySelectorAll('[data-cart-step]')) {
    button.addEventListener('click', () => {
      updateCartQuantity(Number(button.dataset.productId), Number(button.dataset.cartStep))
    })
  }

  for (const button of container.querySelectorAll('[data-remove-item]')) {
    button.addEventListener('click', () => {
      state.cart = state.cart.filter((item) => item.productId !== Number(button.dataset.removeItem))
      renderCart()
    })
  }
}

async function completeSale() {
  if (state.cart.length === 0) {
    showMessage('error', 'Your cart is empty.')
    return
  }

  const paymentMethod = document.getElementById('payment-method').value
  const customerName = document.getElementById('customer-name').value.trim()

  try {
    const sale = await apiFetch('/api/sales', {
      method: 'POST',
      body: JSON.stringify({
        paymentMethod,
        customerName,
        items: state.cart.map((item) => ({ productId: item.productId, quantity: item.quantity }))
      })
    })

    state.cart = []
    document.getElementById('customer-name').value = ''
    renderCart()
    showMessage('success', `Sale completed successfully. Invoice ${sale.invoiceNumber} created.`)
    await Promise.all([loadProducts(), loadSales(), loadDailySummary(), loadProfitLoss()])
  } catch (error) {
    showMessage('error', error.message)
  }
}

async function loadSales() {
  const date = document.getElementById('sales-date-filter').value
  const sales = await apiFetch(`/api/sales?date=${encodeURIComponent(date)}`)
  const container = document.getElementById('sales-list')

  if (sales.length === 0) {
    container.innerHTML = '<div class="list-card"><p>No sales recorded for the selected date.</p></div>'
    return
  }

  container.innerHTML = sales
    .map(
      (sale) => `
        <article class="list-card">
          <div class="list-card__grid">
            <div class="list-card__footer">
              <div>
                <h3>${sale.invoice_number}</h3>
                <p class="list-card__meta">${formatDateTime(sale.timestamp)} · ${sale.payment_method}</p>
              </div>
              <strong class="list-card__amount">${formatCurrency(sale.total_amount)}</strong>
            </div>
            <p>${escapeHtml(sale.items_summary || 'No items')}</p>
            <div class="list-card__footer">
              <span class="list-card__meta">Customer: ${escapeHtml(sale.customer_name || 'Walk-in')}</span>
              <span class="list-card__meta">Staff: ${escapeHtml(sale.staff_name)}</span>
            </div>
          </div>
        </article>
      `
    )
    .join('')
}

async function loadExpenses() {
  const date = document.getElementById('expenses-date-filter').value
  const expenses = await apiFetch(`/api/expenses?date=${encodeURIComponent(date)}`)
  const container = document.getElementById('expenses-list')

  if (expenses.length === 0) {
    container.innerHTML = '<div class="list-card"><p>No expenses recorded for the selected date.</p></div>'
    return
  }

  container.innerHTML = expenses
    .map(
      (expense) => `
        <article class="list-card">
          <div class="list-card__grid">
            <div class="list-card__footer">
              <div>
                <h3>${escapeHtml(expense.description)}</h3>
                <p class="list-card__meta">${expense.category} · ${formatDateTime(expense.timestamp)}</p>
              </div>
              <strong class="list-card__amount">${formatCurrency(expense.amount)}</strong>
            </div>
            <p class="list-card__meta">Recorded by ${escapeHtml(expense.staff_name)}</p>
          </div>
        </article>
      `
    )
    .join('')
}

function startEditingProduct(productId) {
  const product = state.products.find((item) => item.id === productId)

  if (!product) {
    return
  }

  const form = document.getElementById('product-form')
  form.elements.productId.value = String(product.id)
  form.elements.name.value = product.name
  form.elements.category.value = product.category
  form.elements.sellingPrice.value = product.selling_price
  form.elements.costPrice.value = product.cost_price
  form.elements.stockQuantity.value = product.stock_quantity
  state.editingProductId = product.id
  document.getElementById('cancel-edit-button').classList.remove('hidden')
  form.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

function resetProductForm() {
  const form = document.getElementById('product-form')
  form.reset()
  form.elements.productId.value = ''
  state.editingProductId = null
  document.getElementById('cancel-edit-button').classList.add('hidden')
}

async function loadDailySummary() {
  const date = document.getElementById('summary-date').value
  const summary = await apiFetch(`/api/reports/daily-summary?date=${encodeURIComponent(date)}`)
  document.getElementById('summary-sales').textContent = formatCurrency(summary.totalSales)
  document.getElementById('summary-expenses').textContent = formatCurrency(summary.totalExpenses)
  document.getElementById('summary-transactions').textContent = String(summary.transactionCount)
  document.getElementById('summary-cash').textContent = formatCurrency(summary.cashInHand)
}

async function loadProfitLoss() {
  const startDate = document.getElementById('profit-start-date').value
  const endDate = document.getElementById('profit-end-date').value
  const report = await apiFetch(
    `/api/reports/profit-loss?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`
  )

  document.getElementById('report-revenue').textContent = formatCurrency(report.totalRevenue)
  document.getElementById('report-cogs').textContent = formatCurrency(report.costOfGoodsSold)
  document.getElementById('report-gross').textContent = formatCurrency(report.grossProfit)
  document.getElementById('report-expenses').textContent = formatCurrency(report.totalExpenses)
  document.getElementById('report-net').textContent = formatCurrency(report.netProfit)
}

function showMessage(type, text) {
  const messageElement = document.getElementById('message')
  messageElement.textContent = text
  messageElement.className = `message message--${type}`
}

function hideMessage() {
  const messageElement = document.getElementById('message')
  messageElement.textContent = ''
  messageElement.className = 'message hidden'
}

function formatCurrency(value) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2
  }).format(Number(value) || 0)
}

function formatDateTime(value) {
  return new Date(value).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit'
  })
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}
