-- E.M. Cayetano Trading System
-- Database Schema & Initialization Script

-- 1. USERS TABLE (Authentication & Authorization)
-- Stores login credentials and role information (Admin vs Employee)
CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) CHECK (role IN ('Admin', 'Employee')) NOT NULL,
    branch VARCHAR(50),
    status VARCHAR(20) DEFAULT 'Active',
    otp_code VARCHAR(10),
    otp_expires TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. PRODUCTS TABLE (Inventory Management)
-- Stores the shared product catalog
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(120),
    default_selling_price NUMERIC(12,2),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. BRANCH INVENTORY TABLE
-- Stores stock counts per branch for each product
CREATE TABLE branch_inventory (
    inventory_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    branch VARCHAR(50) NOT NULL,
    stock_level INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 5,
    lead_time_days INTEGER,
    safety_stock INTEGER,
    average_daily_sales NUMERIC(10,2),
    status VARCHAR(20) DEFAULT 'In Stock',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE (product_id, branch)
);

-- 4. ARCHIVED INVENTORY TABLE
-- Stores archived branch inventory records for restore/history workflows
CREATE TABLE archived_inventory (
    archived_inventory_id SERIAL PRIMARY KEY,
    original_inventory_id INT,
    product_id INT,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(120),
    default_selling_price NUMERIC(12,2),
    branch VARCHAR(50) NOT NULL,
    stock_level INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 5,
    lead_time_days INTEGER,
    safety_stock INTEGER,
    average_daily_sales NUMERIC(10,2),
    status VARCHAR(20) DEFAULT 'In Stock',
    last_updated TIMESTAMP,
    archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    archived_by INT REFERENCES users(user_id) ON DELETE SET NULL
);

-- 5. STOCK MOVEMENTS TABLE
-- Tracks every inventory quantity change for accountability and reports.
CREATE TABLE stock_movements (
    movement_id SERIAL PRIMARY KEY,
    inventory_id INT,
    product_id INT,
    item_name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    branch VARCHAR(50) NOT NULL,
    action VARCHAR(20) CHECK (action IN ('stock_in', 'stock_out', 'initial_stock', 'adjustment')) NOT NULL,
    quantity_changed INTEGER NOT NULL,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    reason VARCHAR(40),
    note TEXT,
    actor_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    actor_name TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 6. SALES TRANSACTIONS TABLE
-- Stores official sales records without turning the system into a full POS.
CREATE TABLE sales_transactions (
    sales_transaction_id SERIAL PRIMARY KEY,
    sales_number VARCHAR(40) UNIQUE NOT NULL,
    branch VARCHAR(50) NOT NULL,
    customer_type VARCHAR(40) DEFAULT 'walk_in' CHECK (customer_type IN ('walk_in', 'regular', 'contractor')),
    total_quantity INTEGER NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    sold_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    sold_by_name TEXT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    cancelled_at TIMESTAMP,
    cancelled_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    cancel_reason TEXT
);

-- 7. SALES ITEMS TABLE
-- Stores the sold item lines under each sales transaction.
CREATE TABLE sales_items (
    sales_item_id SERIAL PRIMARY KEY,
    sales_transaction_id INT NOT NULL REFERENCES sales_transactions(sales_transaction_id) ON DELETE CASCADE,
    inventory_id INT,
    product_id INT,
    item_name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    branch VARCHAR(50) NOT NULL,
    quantity_sold INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 8. INITIAL SEED DATA (System Admin)
-- Creates the first admin account to allow initial login.
-- Username: admin
-- Password: set securely by running reset-admin.js with ADMIN_RESET_PASSWORD configured.
-- Note: password_hash is a placeholder and must be replaced with a real bcrypt hash before use.
INSERT INTO users (full_name, username, email, password_hash, role, branch, status)
VALUES (
    'System Admin', 
    'admin', 
    'admin@emcayetano.com', 
    'PLACEHOLDER_HASH_FOR_DEV', 
    'Admin', 
    'Main Branch', 
    'Active'
);
