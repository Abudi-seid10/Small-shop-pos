# Small Shop POS

A complete Point of Sale system for a small electronics and stationery shop with services such as printing and lamination.

## Tech Stack

- Node.js + Express.js
- SQLite with better-sqlite3
- JWT authentication
- bcryptjs password hashing
- React + Material UI frontend (CDN-based, no build step)

## Features

- Secure login with JWT token sessions (24-hour expiry)
- POS screen with product search, category filter, cart, and checkout
- Automatic invoice generation (`INV-YYYYMMDD-XXXXXX`)
- Stock updates on each sale with negative stock prevention
- Sales history with date filtering
- Expense management with categories
- Product add and edit management
- Daily summary report (sales, expenses, transactions, cash in hand)
- Profit & loss report by date range
- Role-based access for sales staff (sell, sales history, expenses only)
- Staff cannot view cost price or edit product data
- Pinned items on POS for faster access
- End-of-shift Telegram report from dashboard
- Full UI built with Material UI components
- Admin bulk product import from Excel with downloadable template

## Default Login

- Username: `admin`
- Password: `admin123`
- Username: `sales`
- Password: `sales123`

## Staff Role Rules

- Sales staff can:
	- Create sales
	- View their own sales history
	- Add and view their own expenses
	- Send end-of-shift report to Telegram
- Sales staff cannot:
	- Add/edit products
	- View product cost price
	- Access profit & loss report

## Telegram Setup For Shift Reports

Set these environment variables before running the app:

- `TELEGRAM_BOT_TOKEN`
- `TELEGRAM_CHAT_ID`

PowerShell example:

```powershell
$env:TELEGRAM_BOT_TOKEN="your_bot_token"
$env:TELEGRAM_CHAT_ID="your_channel_or_chat_id"
npm start
```

## Bulk Product Import (Admin)

1. Open Products section.
2. Click `Download Template`.
3. Fill rows in Excel with columns:
	- `name`
	- `category` (Electronics / Stationery / Services)
	- `selling_price`
	- `cost_price`
	- `stock_quantity`
4. Upload the file and click `Import Products`.

Notes:
- Existing products are matched by name and updated.
- New product names are inserted.

## Run Locally

1. Install dependencies:

	```bash
	npm install
	```

2. Start the server:

	```bash
	npm start
	```

3. Open in browser:

	```
	http://localhost:3000/login.html
	```

## Project Structure

```
small-shop-pos/
├── database.js
├── package.json
├── server.js
└── public/
	 ├── dashboard.html
	 ├── login.html
	 ├── script.js
	 └── style.css
```

## Notes

- The SQLite database file (`pos.db`) is created automatically on first run.
- Daily summaries are recalculated whenever a sale or expense is added.
