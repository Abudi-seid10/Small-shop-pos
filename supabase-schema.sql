-- Small Shop POS Database Schema
-- Run this in your Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Categories table
CREATE TABLE categories (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Products table
CREATE TABLE products (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  sku VARCHAR(50) UNIQUE,
  barcode VARCHAR(100),
  category_id UUID REFERENCES categories(id) ON DELETE SET NULL,
  description TEXT,
  cost_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  selling_price DECIMAL(10, 2) NOT NULL DEFAULT 0,
  stock_quantity INTEGER NOT NULL DEFAULT 0,
  min_stock_level INTEGER DEFAULT 10,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Sales table
CREATE TABLE sales (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sale_number VARCHAR(50) UNIQUE NOT NULL,
  customer_name VARCHAR(200),
  customer_phone VARCHAR(20),
  subtotal DECIMAL(10, 2) NOT NULL,
  tax_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(10, 2) NOT NULL DEFAULT 0,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL, -- cash, card, upi, credit
  payment_status VARCHAR(20) DEFAULT 'paid', -- paid, pending, partial
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID
);

-- Sale items table
CREATE TABLE sale_items (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  sale_id UUID NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),
  product_name VARCHAR(200) NOT NULL,
  quantity INTEGER NOT NULL,
  unit_price DECIMAL(10, 2) NOT NULL,
  tax_rate DECIMAL(5, 2) DEFAULT 0,
  tax_amount DECIMAL(10, 2) DEFAULT 0,
  discount_amount DECIMAL(10, 2) DEFAULT 0,
  total_price DECIMAL(10, 2) NOT NULL,
  cost_price DECIMAL(10, 2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Expenses table
CREATE TABLE expenses (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  expense_number VARCHAR(50) UNIQUE NOT NULL,
  category VARCHAR(100) NOT NULL, -- rent, utilities, supplies, salary, maintenance, other
  description TEXT NOT NULL,
  amount DECIMAL(10, 2) NOT NULL,
  expense_date DATE NOT NULL,
  payment_method VARCHAR(50),
  receipt_url TEXT,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID
);

-- Customers table (for credit/udhaar management)
CREATE TABLE customers (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  phone VARCHAR(20) UNIQUE,
  email VARCHAR(200),
  address TEXT,
  credit_limit DECIMAL(10, 2) DEFAULT 0,
  current_balance DECIMAL(10, 2) DEFAULT 0,
  notes TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Customer transactions (credit/debit)
CREATE TABLE customer_transactions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  customer_id UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE SET NULL,
  transaction_type VARCHAR(20) NOT NULL, -- credit, debit
  amount DECIMAL(10, 2) NOT NULL,
  balance_after DECIMAL(10, 2) NOT NULL,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User roles table (links Supabase auth users to application roles)
CREATE TABLE user_roles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  auth_id UUID NOT NULL UNIQUE, -- References Supabase auth.users.id
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'manager', 'sales')),
  full_name VARCHAR(200),
  phone VARCHAR(20),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_sku ON products(sku);
CREATE INDEX idx_products_barcode ON products(barcode);
CREATE INDEX idx_products_active ON products(is_active);
CREATE INDEX idx_sales_date ON sales(created_at);
CREATE INDEX idx_sale_items_sale ON sale_items(sale_id);
CREATE INDEX idx_sale_items_product ON sale_items(product_id);
CREATE INDEX idx_expenses_date ON expenses(expense_date);
CREATE INDEX idx_customers_phone ON customers(phone);
CREATE INDEX idx_customer_transactions_customer ON customer_transactions(customer_id);
CREATE INDEX idx_user_roles_auth ON user_roles(auth_id);
CREATE INDEX idx_user_roles_role ON user_roles(role);

-- Create a function to auto-generate sale numbers
CREATE OR REPLACE FUNCTION generate_sale_number()
RETURNS VARCHAR AS $$
DECLARE
  sale_num VARCHAR;
  date_prefix VARCHAR;
  seq_num INTEGER;
BEGIN
  date_prefix := TO_CHAR(NOW(), 'YYYYMMDD');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM 9) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM sales
  WHERE sale_number LIKE 'SALE-' || date_prefix || '-%';
  
  sale_num := 'SALE-' || date_prefix || '-' || LPAD(seq_num::TEXT, 4, '0');
  RETURN sale_num;
END;
$$ LANGUAGE plpgsql;

-- Create a function to auto-generate expense numbers
CREATE OR REPLACE FUNCTION generate_expense_number()
RETURNS VARCHAR AS $$
DECLARE
  exp_num VARCHAR;
  date_prefix VARCHAR;
  seq_num INTEGER;
BEGIN
  date_prefix := TO_CHAR(NOW(), 'YYYYMMDD');
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(expense_number FROM 9) AS INTEGER)), 0) + 1
  INTO seq_num
  FROM expenses
  WHERE expense_number LIKE 'EXP-' || date_prefix || '-%';
  
  exp_num := 'EXP-' || date_prefix || '-' || LPAD(seq_num::TEXT, '0000');
  RETURN exp_num;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_categories_updated_at BEFORE UPDATE ON categories
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_products_updated_at BEFORE UPDATE ON products
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_customers_updated_at BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_user_roles_updated_at BEFORE UPDATE ON user_roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Insert sample categories
INSERT INTO categories (name, description) VALUES
('Electronics', 'Electronic devices and accessories'),
('Groceries', 'Food items and daily essentials'),
('Clothing', 'Apparel and fashion items'),
('Beverages', 'Drinks and beverages'),
('Household', 'Home and kitchen items');

-- Insert sample products
INSERT INTO products (name, sku, category_id, description, cost_price, selling_price, stock_quantity, tax_rate) VALUES
('Wireless Mouse', 'ELEC-001', (SELECT id FROM categories WHERE name = 'Electronics'), 'Bluetooth wireless mouse', 15.00, 25.00, 50, 10.00),
('USB Cable', 'ELEC-002', (SELECT id FROM categories WHERE name = 'Electronics'), 'USB-A to USB-C cable', 3.00, 8.00, 100, 10.00),
('Rice 5kg', 'GROC-001', (SELECT id FROM categories WHERE name = 'Groceries'), 'Premium basmati rice', 12.00, 18.00, 30, 5.00),
('Cooking Oil 1L', 'GROC-002', (SELECT id FROM categories WHERE name = 'Groceries'), 'Sunflower cooking oil', 4.00, 7.00, 45, 5.00),
('T-Shirt', 'CLTH-001', (SELECT id FROM categories WHERE name = 'Clothing'), 'Cotton t-shirt', 8.00, 15.00, 25, 10.00),
('Cola 500ml', 'BEV-001', (SELECT id FROM categories WHERE name = 'Beverages'), 'Carbonated soft drink', 0.50, 1.50, 80, 5.00),
('Detergent 1kg', 'HS-001', (SELECT id FROM categories WHERE name = 'Household'), 'Laundry detergent powder', 5.00, 10.00, 40, 5.00);

-- Enable Row Level Security (RLS)
ALTER TABLE categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE sale_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE customer_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;

-- Create policies for public access (for demo purposes - adjust for production)
CREATE POLICY "Public read access for categories" ON categories
  FOR SELECT USING (true);

CREATE POLICY "Public read access for products" ON products
  FOR SELECT USING (true);

CREATE POLICY "Public insert for products" ON products
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public update for products" ON products
  FOR UPDATE USING (true);

CREATE POLICY "Public delete for products" ON products
  FOR DELETE USING (true);

CREATE POLICY "Public read access for sales" ON sales
  FOR SELECT USING (true);

CREATE POLICY "Public insert for sales" ON sales
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read access for sale_items" ON sale_items
  FOR SELECT USING (true);

CREATE POLICY "Public insert for sale_items" ON sale_items
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public read access for expenses" ON expenses
  FOR SELECT USING (true);

CREATE POLICY "Public insert for expenses" ON expenses
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public update for expenses" ON expenses
  FOR UPDATE USING (true);

CREATE POLICY "Public delete for expenses" ON expenses
  FOR DELETE USING (true);

CREATE POLICY "Public read access for customers" ON customers
  FOR SELECT USING (true);

CREATE POLICY "Public insert for customers" ON customers
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Public update for customers" ON customers
  FOR UPDATE USING (true);

CREATE POLICY "Public delete for customers" ON customers
  FOR DELETE USING (true);

CREATE POLICY "Public read access for customer_transactions" ON customer_transactions
  FOR SELECT USING (true);

CREATE POLICY "Public insert for customer_transactions" ON customer_transactions
  FOR INSERT WITH CHECK (true);

-- User roles policies
CREATE POLICY "Users can read their own role" ON user_roles
  FOR SELECT USING (auth_id = auth.uid());

CREATE POLICY "Admins can read all roles" ON user_roles
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE auth_id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

CREATE POLICY "Admins can insert roles" ON user_roles
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE auth_id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

CREATE POLICY "Admins can update roles" ON user_roles
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE auth_id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

CREATE POLICY "Admins can delete roles" ON user_roles
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM user_roles 
      WHERE auth_id = auth.uid() AND role = 'admin' AND is_active = true
    )
  );

-- Insert default admin user (you need to replace with actual auth_id after user registration)
-- This is a placeholder - you'll need to get the actual auth_id from Supabase auth.users
-- INSERT INTO user_roles (auth_id, role, full_name, phone) VALUES
-- ('YOUR_AUTH_ID_HERE', 'admin', 'Admin User', '+1234567890');
