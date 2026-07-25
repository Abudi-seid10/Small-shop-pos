import bcrypt from 'bcryptjs'
import express from 'express'
import jwt from 'jsonwebtoken'
import { randomBytes } from 'node:crypto'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { db, initializeDatabase, recalculateDailySummary } from './database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const publicDir = path.join(__dirname, 'public')
const app = express()
const port = Number(process.env.PORT) || 3000
const generatedJwtSecret = randomBytes(32).toString('hex')
const jwtSecret = process.env.JWT_SECRET || generatedJwtSecret
const jwtExpiry = '24h'
const productCategories = new Set(['Electronics', 'Stationery', 'Services'])
const expenseCategories = new Set(['Rent', 'Utilities', 'Supplies', 'Salary', 'Other'])
const paymentMethods = new Set(['Cash', 'Card', 'UPI'])
const pageRateLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 120 })
const apiRateLimit = createRateLimiter({ windowMs: 60_000, maxRequests: 300 })
const loginRateLimit = createRateLimiter({ windowMs: 15 * 60_000, maxRequests: 20 })

initializeDatabase()

if (!process.env.JWT_SECRET) {
  console.warn('JWT_SECRET is not set. Generated a temporary in-memory secret for this session.')
}

app.use(express.json())
app.use(express.urlencoded({ extended: false }))
app.use((req, res, next) => {
  res.setHeader('Cache-Control', 'no-store')
  next()
})
app.use(express.static(publicDir))

app.get('/', pageRateLimit, (_req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'))
})

app.get('/login', pageRateLimit, (_req, res) => {
  res.sendFile(path.join(publicDir, 'login.html'))
})

app.get('/dashboard', pageRateLimit, (_req, res) => {
  res.sendFile(path.join(publicDir, 'dashboard.html'))
})

function createHttpError(status, message) {
  const error = new Error(message)
  error.status = status
  return error
}

function createRateLimiter({ windowMs, maxRequests }) {
  const requestLog = new Map()

  return (req, res, next) => {
    const now = Date.now()
    const key = `${req.ip}:${req.path}`
    const existingEntry = requestLog.get(key)
    const recentRequests = (existingEntry ?? []).filter((timestamp) => now - timestamp < windowMs)

    if (recentRequests.length >= maxRequests) {
      const message = 'Too many requests. Please try again shortly.'

      if (req.path.startsWith('/api')) {
        res.status(429).json({ message })
        return
      }

      res.status(429).type('text/plain').send(message)
      return
    }

    recentRequests.push(now)
    requestLog.set(key, recentRequests)
    next()
  }
}

function isValidDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
}

function normalizeDate(value, fieldName) {
  if (!value) {
    return null
  }

  if (!isValidDate(value)) {
    throw createHttpError(400, `${fieldName} must use YYYY-MM-DD format.`)
  }

  return value
}

function getToday() {
  return new Date().toISOString().slice(0, 10)
}

function requireString(value, fieldName) {
  if (typeof value !== 'string' || !value.trim()) {
    throw createHttpError(400, `${fieldName} is required.`)
  }

  return value.trim()
}

function optionalString(value) {
  if (value == null || value === '') {
    return null
  }

  if (typeof value !== 'string') {
    throw createHttpError(400, 'Invalid text value.')
  }

  return value.trim() || null
}

function requireNumber(value, fieldName) {
  const numberValue = Number(value)

  if (!Number.isFinite(numberValue)) {
    throw createHttpError(400, `${fieldName} must be a valid number.`)
  }

  return numberValue
}

function requirePositiveAmount(value, fieldName) {
  const amount = requireNumber(value, fieldName)

  if (amount <= 0) {
    throw createHttpError(400, `${fieldName} must be greater than zero.`)
  }

  return Number(amount.toFixed(2))
}

function requireNonNegativeAmount(value, fieldName) {
  const amount = requireNumber(value, fieldName)

  if (amount < 0) {
    throw createHttpError(400, `${fieldName} cannot be negative.`)
  }

  return Number(amount.toFixed(2))
}

function requireWholeNumber(value, fieldName, { allowZero = false } = {}) {
  const numberValue = Number(value)

  if (!Number.isInteger(numberValue)) {
    throw createHttpError(400, `${fieldName} must be a whole number.`)
  }

  if (allowZero ? numberValue < 0 : numberValue <= 0) {
    throw createHttpError(400, `${fieldName} must be ${allowZero ? 'zero or greater' : 'greater than zero'}.`)
  }

  return numberValue
}

function requireAllowedValue(value, fieldName, allowedValues) {
  const normalizedValue = requireString(value, fieldName)

  if (!allowedValues.has(normalizedValue)) {
    throw createHttpError(400, `${fieldName} is invalid.`)
  }

  return normalizedValue
}

function getDateFilter(columnName, query) {
  const exactDate = normalizeDate(query.date, 'date')
  const startDate = normalizeDate(query.startDate, 'startDate')
  const endDate = normalizeDate(query.endDate, 'endDate')
  const clauses = []
  const parameters = []

  if (exactDate) {
    clauses.push(`substr(${columnName}, 1, 10) = ?`)
    parameters.push(exactDate)
  } else {
    if (startDate) {
      clauses.push(`substr(${columnName}, 1, 10) >= ?`)
      parameters.push(startDate)
    }

    if (endDate) {
      clauses.push(`substr(${columnName}, 1, 10) <= ?`)
      parameters.push(endDate)
    }
  }

  return {
    clause: clauses.length > 0 ? ` WHERE ${clauses.join(' AND ')}` : '',
    parameters
  }
}

function authenticate(req, _res, next) {
  try {
    const authorization = req.headers.authorization

    if (!authorization?.startsWith('Bearer ')) {
      throw createHttpError(401, 'Authentication required.')
    }

    const token = authorization.slice('Bearer '.length)
    req.user = jwt.verify(token, jwtSecret)
    next()
  } catch {
    next(createHttpError(401, 'Session expired. Please log in again.'))
  }
}

function createToken(user) {
  return jwt.sign(
    {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role
    },
    jwtSecret,
    { expiresIn: jwtExpiry }
  )
}

function buildSalesResponse(filterQuery) {
  const filter = getDateFilter('s.timestamp', filterQuery)
  const sales = db
    .prepare(
      `SELECT s.id, s.invoice_number, s.total_amount, s.payment_method, s.customer_name, s.timestamp,
              u.full_name AS staff_name, u.username
       FROM sales s
       JOIN users u ON u.id = s.user_id
       ${filter.clause}
       ORDER BY s.timestamp DESC, s.id DESC`
    )
    .all(...filter.parameters)

  if (sales.length === 0) {
    return []
  }

  const saleIdPlaceholders = sales.map(() => '?').join(', ')
  const items = db
    .prepare(
      `SELECT sale_id, product_name, quantity, unit_price, subtotal
       FROM sale_items
       WHERE sale_id IN (${saleIdPlaceholders})
       ORDER BY id ASC`
    )
    .all(...sales.map((sale) => sale.id))

  const itemsBySaleId = new Map()

  for (const item of items) {
    const existingItems = itemsBySaleId.get(item.sale_id) ?? []
    existingItems.push(item)
    itemsBySaleId.set(item.sale_id, existingItems)
  }

  return sales.map((sale) => {
    const saleItems = itemsBySaleId.get(sale.id) ?? []

    return {
      ...sale,
      items: saleItems,
      items_summary: saleItems.map((item) => `${item.product_name} × ${item.quantity}`).join(', ')
    }
  })
}

function generateInvoiceNumber() {
  const today = getToday().replaceAll('-', '')
  const prefix = `INV-${today}-`
  const latestSale = db
    .prepare(
      `SELECT invoice_number
       FROM sales
       WHERE invoice_number LIKE ?
       ORDER BY invoice_number DESC
       LIMIT 1`
    )
    .get(`${prefix}%`)

  const latestSequence = latestSale ? Number(latestSale.invoice_number.slice(-6)) : 0
  const nextSequence = String(latestSequence + 1).padStart(6, '0')

  return `${prefix}${nextSequence}`
}

app.post('/api/login', loginRateLimit, (req, res, next) => {
  try {
    const username = requireString(req.body.username, 'Username').toLowerCase()
    const password = requireString(req.body.password, 'Password')
    const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username)

    if (!user || !bcrypt.compareSync(password, user.password_hash)) {
      throw createHttpError(401, 'Invalid username or password.')
    }

    const token = createToken(user)

    res.json({
      token,
      user: {
        id: user.id,
        username: user.username,
        fullName: user.full_name,
        role: user.role
      }
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/products', apiRateLimit, authenticate, (req, res, next) => {
  try {
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : ''
    const category = typeof req.query.category === 'string' ? req.query.category.trim() : ''
    const clauses = []
    const parameters = []

    if (search) {
      clauses.push('name LIKE ?')
      parameters.push(`%${search}%`)
    }

    if (category) {
      if (!productCategories.has(category)) {
        throw createHttpError(400, 'Category is invalid.')
      }

      clauses.push('category = ?')
      parameters.push(category)
    }

    const whereClause = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''
    const products = db
      .prepare(
        `SELECT id, name, category, selling_price, cost_price, stock_quantity
         FROM products
         ${whereClause}
         ORDER BY category ASC, name ASC`
      )
      .all(...parameters)

    res.json(products)
  } catch (error) {
    next(error)
  }
})

app.post('/api/products', apiRateLimit, authenticate, (req, res, next) => {
  try {
    const name = requireString(req.body.name, 'Name')
    const category = requireAllowedValue(req.body.category, 'Category', productCategories)
    const sellingPrice = requireNonNegativeAmount(req.body.sellingPrice, 'Selling price')
    const costPrice = requireNonNegativeAmount(req.body.costPrice, 'Cost price')
    const stockQuantity = requireWholeNumber(req.body.stockQuantity, 'Stock quantity', { allowZero: true })

    const result = db
      .prepare(
        `INSERT INTO products (name, category, selling_price, cost_price, stock_quantity)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(name, category, sellingPrice, costPrice, stockQuantity)

    const product = db
      .prepare('SELECT id, name, category, selling_price, cost_price, stock_quantity FROM products WHERE id = ?')
      .get(result.lastInsertRowid)

    res.status(201).json(product)
  } catch (error) {
    next(error)
  }
})

app.put('/api/products/:id', apiRateLimit, authenticate, (req, res, next) => {
  try {
    const productId = requireWholeNumber(req.params.id, 'Product ID')
    const existingProduct = db.prepare('SELECT id FROM products WHERE id = ?').get(productId)

    if (!existingProduct) {
      throw createHttpError(404, 'Product not found.')
    }

    const name = requireString(req.body.name, 'Name')
    const category = requireAllowedValue(req.body.category, 'Category', productCategories)
    const sellingPrice = requireNonNegativeAmount(req.body.sellingPrice, 'Selling price')
    const costPrice = requireNonNegativeAmount(req.body.costPrice, 'Cost price')
    const stockQuantity = requireWholeNumber(req.body.stockQuantity, 'Stock quantity', { allowZero: true })

    db.prepare(
      `UPDATE products
       SET name = ?, category = ?, selling_price = ?, cost_price = ?, stock_quantity = ?
       WHERE id = ?`
    ).run(name, category, sellingPrice, costPrice, stockQuantity, productId)

    const product = db
      .prepare('SELECT id, name, category, selling_price, cost_price, stock_quantity FROM products WHERE id = ?')
      .get(productId)

    res.json(product)
  } catch (error) {
    next(error)
  }
})

app.post('/api/sales', apiRateLimit, authenticate, (req, res, next) => {
  try {
    const items = Array.isArray(req.body.items) ? req.body.items : []

    if (items.length === 0) {
      throw createHttpError(400, 'Add at least one item to the cart.')
    }

    const paymentMethod = requireAllowedValue(req.body.paymentMethod, 'Payment method', paymentMethods)
    const customerName = optionalString(req.body.customerName)

    const result = db.transaction(() => {
      const timestamp = new Date().toISOString()
      const date = timestamp.slice(0, 10)
      const invoiceNumber = generateInvoiceNumber()
      let totalAmount = 0
      const lineItems = []

      for (const item of items) {
        const productId = requireWholeNumber(item.productId, 'Product ID')
        const quantity = requireWholeNumber(item.quantity, 'Quantity')
        const product = db
          .prepare(
            `SELECT id, name, category, selling_price, stock_quantity
             FROM products
             WHERE id = ?`
          )
          .get(productId)

        if (!product) {
          throw createHttpError(404, 'A selected product no longer exists.')
        }

        if (product.category !== 'Services' && quantity > product.stock_quantity) {
          throw createHttpError(400, `Insufficient stock for ${product.name}.`)
        }

        const subtotal = Number((product.selling_price * quantity).toFixed(2))
        totalAmount += subtotal
        lineItems.push({
          productId: product.id,
          productName: product.name,
          quantity,
          unitPrice: product.selling_price,
          subtotal
        })

        if (product.category !== 'Services') {
          db.prepare('UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?').run(quantity, product.id)
        }
      }

      const saleResult = db
        .prepare(
          `INSERT INTO sales (invoice_number, total_amount, payment_method, customer_name, user_id, timestamp)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(invoiceNumber, Number(totalAmount.toFixed(2)), paymentMethod, customerName, req.user.id, timestamp)

      const insertSaleItem = db.prepare(
        `INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
         VALUES (?, ?, ?, ?, ?, ?)`
      )

      for (const item of lineItems) {
        insertSaleItem.run(
          saleResult.lastInsertRowid,
          item.productId,
          item.productName,
          item.quantity,
          item.unitPrice,
          item.subtotal
        )
      }

      recalculateDailySummary(date)

      return {
        saleId: saleResult.lastInsertRowid,
        invoiceNumber,
        totalAmount: Number(totalAmount.toFixed(2)),
        timestamp,
        paymentMethod,
        customerName,
        items: lineItems
      }
    })()

    res.status(201).json(result)
  } catch (error) {
    next(error)
  }
})

app.get('/api/sales', apiRateLimit, authenticate, (req, res, next) => {
  try {
    res.json(buildSalesResponse(req.query))
  } catch (error) {
    next(error)
  }
})

app.post('/api/expenses', apiRateLimit, authenticate, (req, res, next) => {
  try {
    const description = requireString(req.body.description, 'Description')
    const amount = requirePositiveAmount(req.body.amount, 'Amount')
    const category = requireAllowedValue(req.body.category, 'Category', expenseCategories)
    const timestamp = new Date().toISOString()

    const result = db
      .prepare(
        `INSERT INTO expenses (description, amount, category, user_id, timestamp)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(description, amount, category, req.user.id, timestamp)

    recalculateDailySummary(timestamp.slice(0, 10))

    const expense = db
      .prepare(
        `SELECT e.id, e.description, e.amount, e.category, e.timestamp, u.full_name AS staff_name
         FROM expenses e
         JOIN users u ON u.id = e.user_id
         WHERE e.id = ?`
      )
      .get(result.lastInsertRowid)

    res.status(201).json(expense)
  } catch (error) {
    next(error)
  }
})

app.get('/api/expenses', apiRateLimit, authenticate, (req, res, next) => {
  try {
    const filter = getDateFilter('e.timestamp', req.query)
    const expenses = db
      .prepare(
        `SELECT e.id, e.description, e.amount, e.category, e.timestamp, u.full_name AS staff_name
         FROM expenses e
         JOIN users u ON u.id = e.user_id
         ${filter.clause}
         ORDER BY e.timestamp DESC, e.id DESC`
      )
      .all(...filter.parameters)

    res.json(expenses)
  } catch (error) {
    next(error)
  }
})

app.get('/api/reports/daily-summary', apiRateLimit, authenticate, (req, res, next) => {
  try {
    const date = normalizeDate(req.query.date, 'date') ?? getToday()
    const summary = recalculateDailySummary(date)
    const transactionCount = db
      .prepare('SELECT COUNT(*) AS count FROM sales WHERE substr(timestamp, 1, 10) = ?')
      .get(date).count

    res.json({
      date,
      totalSales: summary.total_sales,
      totalExpenses: summary.total_expenses,
      cashInHand: summary.cash_in_hand,
      transactionCount
    })
  } catch (error) {
    next(error)
  }
})

app.get('/api/reports/profit-loss', apiRateLimit, authenticate, (req, res, next) => {
  try {
    const startDate = normalizeDate(req.query.startDate, 'startDate') ?? getToday()
    const endDate = normalizeDate(req.query.endDate, 'endDate') ?? startDate

    if (startDate > endDate) {
      throw createHttpError(400, 'startDate cannot be later than endDate.')
    }

    const revenue =
      db
        .prepare(
          `SELECT COALESCE(SUM(total_amount), 0) AS total
           FROM sales
           WHERE substr(timestamp, 1, 10) >= ? AND substr(timestamp, 1, 10) <= ?`
        )
        .get(startDate, endDate).total ?? 0

    const totalExpenses =
      db
        .prepare(
          `SELECT COALESCE(SUM(amount), 0) AS total
           FROM expenses
           WHERE substr(timestamp, 1, 10) >= ? AND substr(timestamp, 1, 10) <= ?`
        )
        .get(startDate, endDate).total ?? 0

    const costOfGoodsSold =
      db
        .prepare(
          `SELECT COALESCE(SUM(si.quantity * p.cost_price), 0) AS total
           FROM sale_items si
           JOIN sales s ON s.id = si.sale_id
           JOIN products p ON p.id = si.product_id
           WHERE substr(s.timestamp, 1, 10) >= ? AND substr(s.timestamp, 1, 10) <= ?`
        )
        .get(startDate, endDate).total ?? 0

    const grossProfit = revenue - costOfGoodsSold
    const netProfit = grossProfit - totalExpenses

    res.json({
      startDate,
      endDate,
      totalRevenue: Number(revenue.toFixed(2)),
      costOfGoodsSold: Number(costOfGoodsSold.toFixed(2)),
      grossProfit: Number(grossProfit.toFixed(2)),
      totalExpenses: Number(totalExpenses.toFixed(2)),
      netProfit: Number(netProfit.toFixed(2))
    })
  } catch (error) {
    next(error)
  }
})

app.use('/api', (_req, _res, next) => {
  next(createHttpError(404, 'API endpoint not found.'))
})

app.use((error, _req, res, _next) => {
  const status = error.status || (error.code === 'SQLITE_CONSTRAINT_UNIQUE' ? 409 : 500)
  const message =
    status === 500
      ? 'Something went wrong. Please try again.'
      : error.message || 'Something went wrong. Please try again.'

  if (status === 500) {
    console.error(error)
  }

  res.status(status).json({ message })
})

app.listen(port, () => {
  console.log(`Small Shop POS running on http://localhost:${port}`)
})
