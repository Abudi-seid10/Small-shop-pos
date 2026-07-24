const path = require("path");
const express = require("express");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const multer = require("multer");
const XLSX = require("xlsx");
const { db, getDatePart, recalculateDailySummary } = require("./database");

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || "replace-this-secret-in-production";
const TOKEN_EXPIRY = "24h";
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }
});

app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

function isValidDate(date) {
  return /^\d{4}-\d{2}-\d{2}$/.test(date);
}

function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization || "";
  const [scheme, token] = authHeader.split(" ");

  if (scheme !== "Bearer" || !token) {
    return res.status(401).json({ message: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET);
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ message: "Admin access required" });
  }
  return next();
}

function formatInvoiceNumber(timestamp) {
  const datePart = getDatePart(timestamp);
  const compactDate = datePart.replace(/-/g, "");
  const prefix = `INV-${compactDate}`;

  const countRow = db
    .prepare("SELECT COUNT(*) AS count FROM sales WHERE invoice_number LIKE ?")
    .get(`${prefix}-%`);

  const sequence = String((countRow.count || 0) + 1).padStart(6, "0");
  return `${prefix}-${sequence}`;
}

function normalizeDateRange(query) {
  if (query.date) {
    if (!isValidDate(query.date)) {
      return { error: "Invalid date format. Use YYYY-MM-DD" };
    }
    return { startDate: query.date, endDate: query.date };
  }

  if (!query.startDate && !query.endDate) {
    return {};
  }

  if (!query.startDate || !query.endDate) {
    return { error: "Provide both startDate and endDate in YYYY-MM-DD format" };
  }

  if (!isValidDate(query.startDate) || !isValidDate(query.endDate)) {
    return { error: "Invalid date format. Use YYYY-MM-DD" };
  }

  return { startDate: query.startDate, endDate: query.endDate };
}

function toMoney(value) {
  return Number(Number(value || 0).toFixed(2));
}

function formatMoney(value) {
  return `₹${toMoney(value).toFixed(2)}`;
}

function sanitizeProductsForRole(products, role) {
  if (role === "admin") {
    return products;
  }

  return products.map((product) => {
    const { cost_price, ...safeProduct } = product;
    return safeProduct;
  });
}

function normalizeCategory(categoryValue) {
  const value = String(categoryValue || "").trim().toLowerCase();
  if (value === "electronics") return "Electronics";
  if (value === "stationery" || value === "stationary") return "Stationery";
  if (value === "services" || value === "service") return "Services";
  return null;
}

app.get("/", (req, res) => {
  res.redirect("/login.html");
});

app.post("/api/login", (req, res) => {
  const { username, password } = req.body || {};

  if (!username || !password) {
    return res.status(400).json({ message: "Username and password are required" });
  }

  const user = db
    .prepare("SELECT id, username, password_hash, full_name, role FROM users WHERE username = ?")
    .get(String(username).trim());

  if (!user) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  const passwordMatch = bcrypt.compareSync(String(password), user.password_hash);
  if (!passwordMatch) {
    return res.status(401).json({ message: "Invalid username or password" });
  }

  const token = jwt.sign(
    {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role
    },
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );

  return res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.full_name,
      role: user.role
    }
  });
});

app.get("/api/products", authMiddleware, (req, res) => {
  let query = "SELECT * FROM products WHERE 1 = 1";
  const params = [];

  if (req.query.search) {
    query += " AND name LIKE ?";
    params.push(`%${String(req.query.search).trim()}%`);
  }

  if (req.query.category) {
    query += " AND category = ?";
    params.push(String(req.query.category));
  }

  query += " ORDER BY name ASC";

  const rows = db.prepare(query).all(...params);
  return res.json(sanitizeProductsForRole(rows, req.user.role));
});

app.post("/api/products", authMiddleware, requireAdmin, (req, res) => {
  const { name, category, selling_price, cost_price, stock_quantity } = req.body || {};

  const allowedCategories = ["Electronics", "Stationery", "Services"];
  if (!name || !allowedCategories.includes(category)) {
    return res.status(400).json({ message: "Valid name and category are required" });
  }

  const sellingPrice = Number(selling_price);
  const costPrice = Number(cost_price);
  const stockQty = Number(stock_quantity);

  if (
    Number.isNaN(sellingPrice) ||
    Number.isNaN(costPrice) ||
    Number.isNaN(stockQty) ||
    sellingPrice < 0 ||
    costPrice < 0 ||
    stockQty < 0
  ) {
    return res
      .status(400)
      .json({ message: "Prices and stock must be valid non-negative numbers" });
  }

  const result = db
    .prepare(
      `
      INSERT INTO products (name, category, selling_price, cost_price, stock_quantity)
      VALUES (?, ?, ?, ?, ?)
    `
    )
    .run(String(name).trim(), category, sellingPrice, costPrice, Math.floor(stockQty));

  const product = db.prepare("SELECT * FROM products WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(product);
});

app.get("/api/products/template", authMiddleware, requireAdmin, (req, res) => {
  const templateRows = [
    {
      name: "USB Cable Type-C",
      category: "Electronics",
      selling_price: 199,
      cost_price: 110,
      stock_quantity: 50
    },
    {
      name: "A4 Paper Ream (500 sheets)",
      category: "Stationery",
      selling_price: 320,
      cost_price: 250,
      stock_quantity: 40
    },
    {
      name: "Lamination A4",
      category: "Services",
      selling_price: 35,
      cost_price: 12,
      stock_quantity: 9999
    }
  ];

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(templateRows);
  XLSX.utils.book_append_sheet(workbook, worksheet, "ProductsTemplate");

  const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });
  res.setHeader(
    "Content-Type",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  );
  res.setHeader("Content-Disposition", 'attachment; filename="products_import_template.xlsx"');
  return res.send(buffer);
});

app.post(
  "/api/products/import",
  authMiddleware,
  requireAdmin,
  upload.single("file"),
  (req, res) => {
    if (!req.file || !req.file.buffer) {
      return res.status(400).json({ message: "Excel file is required" });
    }

    let rows;
    try {
      const workbook = XLSX.read(req.file.buffer, { type: "buffer" });
      const firstSheet = workbook.SheetNames[0];
      if (!firstSheet) {
        return res.status(400).json({ message: "Excel file does not contain any sheet" });
      }
      rows = XLSX.utils.sheet_to_json(workbook.Sheets[firstSheet], { defval: "" });
    } catch (error) {
      return res.status(400).json({ message: "Invalid Excel file" });
    }

    if (!rows.length) {
      return res.status(400).json({ message: "Excel file is empty" });
    }

    const insertStmt = db.prepare(
      `
      INSERT INTO products (name, category, selling_price, cost_price, stock_quantity)
      VALUES (?, ?, ?, ?, ?)
    `
    );
    const updateStmt = db.prepare(
      `
      UPDATE products
      SET category = ?, selling_price = ?, cost_price = ?, stock_quantity = ?
      WHERE id = ?
    `
    );
    const findByNameStmt = db.prepare("SELECT id FROM products WHERE LOWER(name) = LOWER(?)");

    const processImport = db.transaction(() => {
      let inserted = 0;
      let updated = 0;

      rows.forEach((row, index) => {
        const rowNumber = index + 2;
        const name = String(row.name ?? row.Name ?? "").trim();
        const category = normalizeCategory(row.category ?? row.Category);
        const sellingPrice = Number(row.selling_price ?? row.SellingPrice ?? row.sellingPrice);
        const costPrice = Number(row.cost_price ?? row.CostPrice ?? row.costPrice);
        const stockQuantity = Number(
          row.stock_quantity ?? row.StockQuantity ?? row.stockQuantity ?? 0
        );

        if (!name) {
          throw new Error(`Row ${rowNumber}: name is required`);
        }
        if (!category) {
          throw new Error(`Row ${rowNumber}: category must be Electronics, Stationery, or Services`);
        }
        if (Number.isNaN(sellingPrice) || sellingPrice < 0) {
          throw new Error(`Row ${rowNumber}: selling_price must be a valid non-negative number`);
        }
        if (Number.isNaN(costPrice) || costPrice < 0) {
          throw new Error(`Row ${rowNumber}: cost_price must be a valid non-negative number`);
        }
        if (Number.isNaN(stockQuantity) || stockQuantity < 0) {
          throw new Error(`Row ${rowNumber}: stock_quantity must be a valid non-negative number`);
        }

        const existing = findByNameStmt.get(name);
        const finalStock = Math.floor(stockQuantity);

        if (existing) {
          updateStmt.run(category, sellingPrice, costPrice, finalStock, existing.id);
          updated += 1;
        } else {
          insertStmt.run(name, category, sellingPrice, costPrice, finalStock);
          inserted += 1;
        }
      });

      return { inserted, updated, total: rows.length };
    });

    try {
      const result = processImport();
      return res.json({
        message: `Import completed. Inserted: ${result.inserted}, Updated: ${result.updated}`,
        ...result
      });
    } catch (error) {
      return res.status(400).json({ message: error.message || "Failed to import products" });
    }
  }
);

app.put("/api/products/:id", authMiddleware, requireAdmin, (req, res) => {
  const productId = Number(req.params.id);
  if (!Number.isInteger(productId) || productId <= 0) {
    return res.status(400).json({ message: "Invalid product id" });
  }

  const existing = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  if (!existing) {
    return res.status(404).json({ message: "Product not found" });
  }

  const { name, category, selling_price, cost_price, stock_quantity } = req.body || {};
  const allowedCategories = ["Electronics", "Stationery", "Services"];

  if (!name || !allowedCategories.includes(category)) {
    return res.status(400).json({ message: "Valid name and category are required" });
  }

  const sellingPrice = Number(selling_price);
  const costPrice = Number(cost_price);
  const stockQty = Number(stock_quantity);

  if (
    Number.isNaN(sellingPrice) ||
    Number.isNaN(costPrice) ||
    Number.isNaN(stockQty) ||
    sellingPrice < 0 ||
    costPrice < 0 ||
    stockQty < 0
  ) {
    return res
      .status(400)
      .json({ message: "Prices and stock must be valid non-negative numbers" });
  }

  db.prepare(
    `
      UPDATE products
      SET name = ?, category = ?, selling_price = ?, cost_price = ?, stock_quantity = ?
      WHERE id = ?
    `
  ).run(String(name).trim(), category, sellingPrice, costPrice, Math.floor(stockQty), productId);

  const updated = db.prepare("SELECT * FROM products WHERE id = ?").get(productId);
  return res.json(updated);
});

app.post("/api/sales", authMiddleware, (req, res) => {
  const { items, paymentMethod, customerName } = req.body || {};

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ message: "At least one sale item is required" });
  }

  const allowedMethods = ["Cash", "Card", "UPI"];
  if (!allowedMethods.includes(paymentMethod)) {
    return res.status(400).json({ message: "Invalid payment method" });
  }

  const normalizedItems = [];
  for (const item of items) {
    const productId = Number(item.productId);
    const quantity = Number(item.quantity);

    if (!Number.isInteger(productId) || !Number.isInteger(quantity) || quantity <= 0) {
      return res.status(400).json({ message: "Invalid item format in cart" });
    }

    normalizedItems.push({ productId, quantity });
  }

  const processSale = db.transaction(() => {
    const timestamp = new Date().toISOString();
    const date = getDatePart(timestamp);
    const invoiceNumber = formatInvoiceNumber(timestamp);

    const saleLineItems = [];
    let totalAmount = 0;

    for (const item of normalizedItems) {
      const product = db
        .prepare("SELECT id, name, category, selling_price, stock_quantity FROM products WHERE id = ?")
        .get(item.productId);

      if (!product) {
        throw new Error("One or more products do not exist");
      }

      if (product.category !== "Services" && product.stock_quantity < item.quantity) {
        throw new Error(`Insufficient stock for ${product.name}`);
      }

      if (product.category !== "Services") {
        db.prepare("UPDATE products SET stock_quantity = stock_quantity - ? WHERE id = ?").run(
          item.quantity,
          item.productId
        );
      }

      const unitPrice = Number(product.selling_price);
      const subtotal = unitPrice * item.quantity;
      totalAmount += subtotal;

      saleLineItems.push({
        productId: product.id,
        productName: product.name,
        quantity: item.quantity,
        unitPrice,
        subtotal
      });
    }

    const saleResult = db
      .prepare(
        `
          INSERT INTO sales (invoice_number, total_amount, payment_method, customer_name, user_id, timestamp)
          VALUES (?, ?, ?, ?, ?, ?)
        `
      )
      .run(
        invoiceNumber,
        toMoney(totalAmount),
        paymentMethod,
        customerName ? String(customerName).trim() : null,
        req.user.id,
        timestamp
      );

    const saleId = saleResult.lastInsertRowid;
    const insertSaleItem = db.prepare(
      `
        INSERT INTO sale_items (sale_id, product_id, product_name, quantity, unit_price, subtotal)
        VALUES (?, ?, ?, ?, ?, ?)
      `
    );

    for (const lineItem of saleLineItems) {
      insertSaleItem.run(
        saleId,
        lineItem.productId,
        lineItem.productName,
        lineItem.quantity,
        toMoney(lineItem.unitPrice),
        toMoney(lineItem.subtotal)
      );
    }

    recalculateDailySummary(date);

    return {
      saleId,
      invoiceNumber,
      totalAmount: toMoney(totalAmount),
      timestamp
    };
  });

  try {
    const result = processSale();
    return res.status(201).json(result);
  } catch (error) {
    return res.status(400).json({ message: error.message || "Failed to complete sale" });
  }
});

app.get("/api/sales", authMiddleware, (req, res) => {
  const dateRange = normalizeDateRange(req.query);
  if (dateRange.error) {
    return res.status(400).json({ message: dateRange.error });
  }

  let query = `
    SELECT s.id, s.invoice_number, s.total_amount, s.payment_method, s.customer_name, s.timestamp,
           u.full_name AS staff_name
    FROM sales s
    JOIN users u ON u.id = s.user_id
    WHERE 1 = 1
  `;
  const params = [];

  if (dateRange.startDate && dateRange.endDate) {
    query += " AND DATE(s.timestamp) BETWEEN ? AND ?";
    params.push(dateRange.startDate, dateRange.endDate);
  }

  if (req.user.role !== "admin") {
    query += " AND s.user_id = ?";
    params.push(req.user.id);
  }

  query += " ORDER BY s.timestamp DESC";

  const sales = db.prepare(query).all(...params);
  const getItems = db
    .prepare(
      `
        SELECT product_name, quantity, unit_price, subtotal
        FROM sale_items
        WHERE sale_id = ?
        ORDER BY id ASC
      `
    );

  const result = sales.map((sale) => ({
    ...sale,
    items: getItems.all(sale.id)
  }));

  return res.json(result);
});

app.post("/api/expenses", authMiddleware, (req, res) => {
  const { description, amount, category } = req.body || {};
  const allowedCategories = ["Rent", "Utilities", "Supplies", "Salary", "Other"];

  if (!description || !allowedCategories.includes(category)) {
    return res.status(400).json({ message: "Valid description and category are required" });
  }

  const numericAmount = Number(amount);
  if (Number.isNaN(numericAmount) || numericAmount <= 0) {
    return res.status(400).json({ message: "Amount must be greater than 0" });
  }

  const timestamp = new Date().toISOString();
  const result = db
    .prepare(
      `
      INSERT INTO expenses (description, amount, category, user_id, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `
    )
    .run(String(description).trim(), toMoney(numericAmount), category, req.user.id, timestamp);

  recalculateDailySummary(getDatePart(timestamp));

  const expense = db.prepare("SELECT * FROM expenses WHERE id = ?").get(result.lastInsertRowid);
  return res.status(201).json(expense);
});

app.get("/api/expenses", authMiddleware, (req, res) => {
  const dateRange = normalizeDateRange(req.query);
  if (dateRange.error) {
    return res.status(400).json({ message: dateRange.error });
  }

  let query = `
    SELECT e.id, e.description, e.amount, e.category, e.timestamp, u.full_name AS staff_name
    FROM expenses e
    JOIN users u ON u.id = e.user_id
    WHERE 1 = 1
  `;
  const params = [];

  if (dateRange.startDate && dateRange.endDate) {
    query += " AND DATE(e.timestamp) BETWEEN ? AND ?";
    params.push(dateRange.startDate, dateRange.endDate);
  }

  if (req.user.role !== "admin") {
    query += " AND e.user_id = ?";
    params.push(req.user.id);
  }

  query += " ORDER BY e.timestamp DESC";

  const rows = db.prepare(query).all(...params);
  return res.json(rows);
});

app.get("/api/reports/daily-summary", authMiddleware, (req, res) => {
  const date = req.query.date || getDatePart(new Date().toISOString());
  if (!isValidDate(date)) {
    return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
  }

  recalculateDailySummary(date);

  const summary = db
    .prepare(
      `
      SELECT ds.date, ds.total_sales, ds.total_expenses, ds.cash_in_hand,
             (SELECT COUNT(*) FROM sales s WHERE DATE(s.timestamp) = ds.date) AS transactions
      FROM daily_summary ds
      WHERE ds.date = ?
    `
    )
    .get(date);

  return res.json(
    summary || {
      date,
      total_sales: 0,
      total_expenses: 0,
      cash_in_hand: 0,
      transactions: 0
    }
  );
});

app.get("/api/reports/profit-loss", authMiddleware, requireAdmin, (req, res) => {
  const { startDate, endDate } = req.query;

  if (!startDate || !endDate || !isValidDate(startDate) || !isValidDate(endDate)) {
    return res
      .status(400)
      .json({ message: "startDate and endDate are required in YYYY-MM-DD format" });
  }

  const revenueRow = db
    .prepare(
      "SELECT COALESCE(SUM(total_amount), 0) AS revenue FROM sales WHERE DATE(timestamp) BETWEEN ? AND ?"
    )
    .get(startDate, endDate);

  const cogsRow = db
    .prepare(
      `
      SELECT COALESCE(SUM(si.quantity * COALESCE(p.cost_price, 0)), 0) AS cogs
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN products p ON p.id = si.product_id
      WHERE DATE(s.timestamp) BETWEEN ? AND ?
    `
    )
    .get(startDate, endDate);

  const expensesRow = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS expenses FROM expenses WHERE DATE(timestamp) BETWEEN ? AND ?"
    )
    .get(startDate, endDate);

  const transactionsRow = db
    .prepare("SELECT COUNT(*) AS transactions FROM sales WHERE DATE(timestamp) BETWEEN ? AND ?")
    .get(startDate, endDate);

  const revenue = toMoney(revenueRow.revenue);
  const cogs = toMoney(cogsRow.cogs);
  const grossProfit = toMoney(revenue - cogs);
  const totalExpenses = toMoney(expensesRow.expenses);
  const netProfit = toMoney(grossProfit - totalExpenses);

  return res.json({
    startDate,
    endDate,
    revenue,
    cogs,
    grossProfit,
    totalExpenses,
    netProfit,
    transactions: transactionsRow.transactions || 0
  });
});

app.post("/api/reports/end-shift", authMiddleware, async (req, res) => {
  const date = req.body?.date || getDatePart(new Date().toISOString());
  if (!isValidDate(date)) {
    return res.status(400).json({ message: "Invalid date format. Use YYYY-MM-DD" });
  }

  const userId = req.user.id;

  const summary = db
    .prepare(
      `
      SELECT
        COALESCE(SUM(total_amount), 0) AS total_sales,
        COUNT(*) AS transactions
      FROM sales
      WHERE DATE(timestamp) = ? AND user_id = ?
    `
    )
    .get(date, userId);

  const paymentBreakdown = db
    .prepare(
      `
      SELECT payment_method, COALESCE(SUM(total_amount), 0) AS total
      FROM sales
      WHERE DATE(timestamp) = ? AND user_id = ?
      GROUP BY payment_method
      ORDER BY payment_method ASC
    `
    )
    .all(date, userId);

  const expenseSummary = db
    .prepare(
      `
      SELECT COALESCE(SUM(amount), 0) AS total_expenses
      FROM expenses
      WHERE DATE(timestamp) = ? AND user_id = ?
    `
    )
    .get(date, userId);

  const expenseByCategory = db
    .prepare(
      `
      SELECT category, COALESCE(SUM(amount), 0) AS total
      FROM expenses
      WHERE DATE(timestamp) = ? AND user_id = ?
      GROUP BY category
      ORDER BY category ASC
    `
    )
    .all(date, userId);

  const totalSales = toMoney(summary.total_sales);
  const totalExpenses = toMoney(expenseSummary.total_expenses);
  const netCollected = toMoney(totalSales - totalExpenses);

  const salesLines = paymentBreakdown.length
    ? paymentBreakdown.map((row) => `- ${row.payment_method}: ${formatMoney(row.total)}`).join("\n")
    : "- No sales";

  const expenseLines = expenseByCategory.length
    ? expenseByCategory.map((row) => `- ${row.category}: ${formatMoney(row.total)}`).join("\n")
    : "- No expenses";

  const reportText = [
    "Shift Report",
    `Date: ${date}`,
    `Staff: ${req.user.fullName} (@${req.user.username})`,
    "",
    `Transactions: ${summary.transactions || 0}`,
    `Total Sales: ${formatMoney(totalSales)}`,
    "",
    "Payment Breakdown:",
    salesLines,
    "",
    `Total Expenses: ${formatMoney(totalExpenses)}`,
    "Expense Breakdown:",
    expenseLines,
    "",
    `Net Collection: ${formatMoney(netCollected)}`,
    `Generated: ${new Date().toLocaleString("en-IN")}`
  ].join("\n");

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
  const telegramChatId = process.env.TELEGRAM_CHAT_ID;

  if (!telegramToken || !telegramChatId) {
    return res.status(400).json({
      message:
        "Telegram is not configured. Set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in your environment."
    });
  }

  try {
    const response = await fetch(`https://api.telegram.org/bot${telegramToken}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: telegramChatId,
        text: reportText
      })
    });

    const telegramResult = await response.json();
    if (!response.ok || !telegramResult.ok) {
      return res.status(502).json({ message: "Failed to send report to Telegram channel" });
    }

    return res.json({ message: "Shift report sent to Telegram", preview: reportText });
  } catch (error) {
    return res.status(502).json({ message: "Could not reach Telegram API" });
  }
});

app.use((req, res) => {
  return res.status(404).json({ message: "Endpoint not found" });
});

app.use((error, req, res, next) => {
  console.error(error);
  return res.status(500).json({ message: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`POS server running at http://localhost:${PORT}`);
});
