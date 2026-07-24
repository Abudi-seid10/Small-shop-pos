const path = require("path");
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");

const dbPath = path.join(__dirname, "pos.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

function initDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL CHECK (role IN ('admin', 'staff'))
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT NOT NULL CHECK (category IN ('Electronics', 'Stationery', 'Services')),
      selling_price REAL NOT NULL CHECK (selling_price >= 0),
      cost_price REAL NOT NULL CHECK (cost_price >= 0),
      stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      total_amount REAL NOT NULL CHECK (total_amount >= 0),
      payment_method TEXT NOT NULL CHECK (payment_method IN ('Cash', 'Card', 'UPI')),
      customer_name TEXT,
      user_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS sale_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      sale_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      product_name TEXT NOT NULL,
      quantity INTEGER NOT NULL CHECK (quantity > 0),
      unit_price REAL NOT NULL CHECK (unit_price >= 0),
      subtotal REAL NOT NULL CHECK (subtotal >= 0),
      FOREIGN KEY (sale_id) REFERENCES sales(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      description TEXT NOT NULL,
      amount REAL NOT NULL CHECK (amount > 0),
      category TEXT NOT NULL CHECK (category IN ('Rent', 'Utilities', 'Supplies', 'Salary', 'Other')),
      user_id INTEGER NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS daily_summary (
      date TEXT PRIMARY KEY,
      total_sales REAL NOT NULL DEFAULT 0,
      total_expenses REAL NOT NULL DEFAULT 0,
      cash_in_hand REAL NOT NULL DEFAULT 0
    );

    CREATE INDEX IF NOT EXISTS idx_sales_timestamp ON sales(timestamp);
    CREATE INDEX IF NOT EXISTS idx_expenses_timestamp ON expenses(timestamp);
    CREATE INDEX IF NOT EXISTS idx_sale_items_sale_id ON sale_items(sale_id);
  `);

  seedAdminUser();
  seedSalesAgentUser();
  seedProducts();
}

function seedAdminUser() {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get("admin");
  if (!existing) {
    const passwordHash = bcrypt.hashSync("admin123", 10);
    db.prepare(
      "INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)"
    ).run("admin", passwordHash, "Administrator", "admin");
  }
}

function seedSalesAgentUser() {
  const existing = db.prepare("SELECT id FROM users WHERE username = ?").get("sales");
  if (!existing) {
    const passwordHash = bcrypt.hashSync("sales123", 10);
    db.prepare(
      "INSERT INTO users (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)"
    ).run("sales", passwordHash, "Sales Agent", "staff");
  }
}

function seedProducts() {
  const countRow = db.prepare("SELECT COUNT(*) AS count FROM products").get();
  if (countRow.count > 0) {
    return;
  }

  const sampleProducts = [
    ["USB Cable Type-C", "Electronics", 199, 110, 50],
    ["Fast Charger 20W", "Electronics", 699, 450, 25],
    ["Bluetooth Earphones", "Electronics", 1299, 900, 15],
    ["A4 Paper Ream (500 sheets)", "Stationery", 320, 250, 40],
    ["Ball Pen (Blue)", "Stationery", 15, 8, 300],
    ["Long Notebook", "Stationery", 65, 42, 120],
    ["Printout B/W (Per Page)", "Services", 5, 1, 9999],
    ["Printout Color (Per Page)", "Services", 20, 6, 9999],
    ["Photocopy (Per Page)", "Services", 2, 0.5, 9999],
    ["Lamination A4", "Services", 35, 12, 9999]
  ];

  const insertProduct = db.prepare(
    "INSERT INTO products (name, category, selling_price, cost_price, stock_quantity) VALUES (?, ?, ?, ?, ?)"
  );

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertProduct.run(...item);
    }
  });

  insertMany(sampleProducts);
}

function getDatePart(timestamp) {
  return String(timestamp).slice(0, 10);
}

function recalculateDailySummary(date) {
  const salesRow = db
    .prepare(
      "SELECT COALESCE(SUM(total_amount), 0) AS total_sales FROM sales WHERE DATE(timestamp) = ?"
    )
    .get(date);

  const expensesRow = db
    .prepare(
      "SELECT COALESCE(SUM(amount), 0) AS total_expenses FROM expenses WHERE DATE(timestamp) = ?"
    )
    .get(date);

  const totalSales = Number(salesRow.total_sales || 0);
  const totalExpenses = Number(expensesRow.total_expenses || 0);
  const cashInHand = totalSales - totalExpenses;

  db.prepare(
    `
      INSERT INTO daily_summary (date, total_sales, total_expenses, cash_in_hand)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(date)
      DO UPDATE SET
        total_sales = excluded.total_sales,
        total_expenses = excluded.total_expenses,
        cash_in_hand = excluded.cash_in_hand
    `
  ).run(date, totalSales, totalExpenses, cashInHand);
}

initDatabase();

module.exports = {
  db,
  getDatePart,
  recalculateDailySummary
};
