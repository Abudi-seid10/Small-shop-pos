import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const databasePath = path.join(__dirname, 'pos-system.db')

export const db = new Database(databasePath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

// [name, category, selling_price, cost_price, stock_quantity]
const sampleProducts = [
  ['USB Cable', 'Electronics', 199, 120, 35],
  ['Fast Charger', 'Electronics', 899, 650, 18],
  ['Wireless Mouse', 'Electronics', 699, 480, 15],
  ['A4 Paper Ream', 'Stationery', 320, 240, 25],
  ['Blue Pen', 'Stationery', 15, 7, 100],
  ['Notebook', 'Stationery', 85, 52, 60],
  ['Black and White Printing', 'Services', 5, 1, 0],
  ['Color Printing', 'Services', 20, 4, 0],
  ['Lamination Service', 'Services', 35, 6, 0]
]

export async function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      full_name TEXT NOT NULL,
      role TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE,
      category TEXT NOT NULL,
      selling_price REAL NOT NULL CHECK (selling_price >= 0),
      cost_price REAL NOT NULL CHECK (cost_price >= 0),
      stock_quantity INTEGER NOT NULL DEFAULT 0 CHECK (stock_quantity >= 0)
    );

    CREATE TABLE IF NOT EXISTS sales (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      invoice_number TEXT NOT NULL UNIQUE,
      total_amount REAL NOT NULL CHECK (total_amount >= 0),
      payment_method TEXT NOT NULL,
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
      amount REAL NOT NULL CHECK (amount >= 0),
      category TEXT NOT NULL,
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
  `)

  await seedUsers()
  seedProducts()
}

async function seedUsers() {
  const userCount = db.prepare('SELECT COUNT(*) AS count FROM users').get().count

  if (userCount > 0) {
    return
  }

  const defaultAdminPassword = process.env.DEFAULT_ADMIN_PASSWORD || 'admin123'

  if (!process.env.DEFAULT_ADMIN_PASSWORD) {
    console.warn('DEFAULT_ADMIN_PASSWORD is not set. Seeding the documented default admin password.')
  }

  const passwordHash = await bcrypt.hash(defaultAdminPassword, 10)

  db.prepare(
    `INSERT INTO users (username, password_hash, full_name, role)
     VALUES (?, ?, ?, ?)`
  ).run('admin', passwordHash, 'Shop Administrator', 'Admin')
}

function seedProducts() {
  const productCount = db.prepare('SELECT COUNT(*) AS count FROM products').get().count

  if (productCount > 0) {
    return
  }

  const insertProduct = db.prepare(
    `INSERT INTO products (name, category, selling_price, cost_price, stock_quantity)
     VALUES (?, ?, ?, ?, ?)`
  )

  const insertMany = db.transaction((items) => {
    for (const item of items) {
      insertProduct.run(...item)
    }
  })

  insertMany(sampleProducts)
}

export function recalculateDailySummary(date) {
  const totalSales =
    db
      .prepare('SELECT COALESCE(SUM(total_amount), 0) AS total FROM sales WHERE substr(timestamp, 1, 10) = ?')
      .get(date).total ?? 0

  const totalExpenses =
    db
      .prepare('SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE substr(timestamp, 1, 10) = ?')
      .get(date).total ?? 0

  db.prepare(
    `INSERT INTO daily_summary (date, total_sales, total_expenses, cash_in_hand)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(date) DO UPDATE SET
       total_sales = excluded.total_sales,
       total_expenses = excluded.total_expenses,
       cash_in_hand = excluded.cash_in_hand`
  ).run(date, totalSales, totalExpenses, totalSales - totalExpenses)

  return db.prepare('SELECT * FROM daily_summary WHERE date = ?').get(date)
}
