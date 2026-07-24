# Small Shop POS

A comprehensive Point of Sale (POS) system for small retail businesses. Built with React, TypeScript, Vite, and Supabase.

## Features

- **Dashboard**: Overview of today's sales, revenue, total products, and low stock alerts
- **Point of Sale**: Product selection, cart management, barcode scanning, and checkout
- **Inventory Management**: Add, edit, delete products with stock tracking and low stock alerts
- **Sales History**: View all sales with filtering by date (today, this week, this month)
- **Expense Tracking**: Track business expenses by category with payment methods
- **Authentication**: Secure login/logout using Supabase Auth
- **Mobile Responsive**: Touch-friendly interface optimized for tablets and phones
- **Barcode Scanning**: Manual barcode entry for quick product lookup
- **Tax Calculations**: Automatic GST/tax calculations per product

## Setup

### Prerequisites

- Node.js (v18 or higher)
- A Supabase account and project

### Database Setup

1. Go to your Supabase project's SQL Editor
2. Open the `supabase-schema.sql` file in this repository
3. Run the SQL script to create all required tables and sample data

### Environment Configuration

1. Copy `.env.example` to `.env`:
   ```bash
   cp .env.example .env
   ```

2. Replace the placeholder values with your Supabase project URL and publishable key:
   ```
   VITE_SUPABASE_URL=your-supabase-project-url
   VITE_SUPABASE_PUBLISHABLE_KEY=your-supabase-publishable-key
   ```

### Installation

1. Install dependencies:
   ```bash
   npm install
   ```

2. Start the development server:
   ```bash
   npm run dev
   ```

3. Open your browser to the URL shown in the terminal (usually `http://localhost:5173`)

### Building for Production

```bash
npm run build
```

The built files will be in the `dist` directory.

## Database Schema

The system uses the following tables:

- **categories**: Product categories
- **products**: Product inventory with pricing, stock, and tax rates
- **sales**: Sales transactions with customer and payment info
- **sale_items**: Individual items in each sale
- **expenses**: Business expense tracking
- **customers**: Customer management for credit/udhaar
- **customer_transactions**: Credit/debit transactions for customers

## Usage

### First Time Setup

1. Set up your Supabase project and run the database schema
2. Configure your environment variables
3. Start the development server
4. Sign up for a Supabase account or use existing credentials to log in
5. **Create your first admin user** (see below)

### Creating the First Admin User

Since the system requires an admin to create other users, you need to manually create the first admin account:

1. **Sign up** through the application at `http://localhost:5173/login`
2. **Get your user ID** by running this in Supabase SQL Editor:
   ```sql
   SELECT id, email FROM auth.users WHERE email = 'your-email@example.com';
   ```
3. **Insert your admin role** by running this in Supabase SQL Editor:
   ```sql
   INSERT INTO user_roles (auth_id, role, full_name, phone) VALUES
   ('YOUR_USER_ID_HERE', 'admin', 'Your Name', '+1234567890');
   ```
4. **Refresh the application** - you'll now have admin access with full permissions

Alternatively, you can use the provided `create-admin.sql` file which contains these steps with placeholders to fill in.

### Daily Operations

1. **Dashboard**: Check today's sales, revenue, and stock alerts
2. **POS**: Process sales by selecting products or scanning barcodes
3. **Inventory**: Add new products, update stock levels, or edit product details
4. **Sales**: View sales history and generate reports
5. **Expenses**: Track daily business expenses

## Features in Detail

### Barcode Scanning
- Enter barcodes manually in the POS interface
- System automatically looks up products by barcode
- Adds product to cart when barcode is found

### Tax Calculations
- Each product can have a custom tax rate
- Tax is automatically calculated in the cart
- Total includes subtotal, tax, and final amount

### Stock Management
- Set minimum stock levels for each product
- Dashboard alerts when stock is low
- Stock automatically updated when sales are made

### Payment Methods
- Cash
- Card
- UPI
- Credit (for customer accounts)

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite
- **Backend**: Supabase (PostgreSQL database, Auth, Real-time)
- **Styling**: CSS with CSS variables for theming
- **Routing**: React Router DOM

## License

MIT
