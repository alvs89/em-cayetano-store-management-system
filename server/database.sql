-- E.M. Cayetano Store Management System
-- Database Schema & Initialization Script

-- This script mirrors the current runtime schema created by server/index.js.
-- The application also runs safe schema checks on startup for existing databases.

CREATE SCHEMA IF NOT EXISTS public;
SET search_path TO public;

-- 1. SCHEMA MIGRATIONS
-- Tracks one-time data migrations applied by the backend.
CREATE TABLE IF NOT EXISTS schema_migrations (
    migration_key TEXT PRIMARY KEY,
    applied_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')
);

-- Removed out-of-scope modules. Drop legacy tables from older database versions.
DROP TABLE IF EXISTS invoice_series_entries CASCADE;
DROP TABLE IF EXISTS daily_operations CASCADE;

-- 2. USERS TABLE
-- Stores admin-managed accounts, roles, access status, and authentication recovery fields.
CREATE TABLE IF NOT EXISTS users (
    user_id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE NOT NULL,
    email VARCHAR(100) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(30) CHECK (role IN ('Admin', 'Cashier', 'Inventory Staff')) NOT NULL,
    branch VARCHAR(50),
    status VARCHAR(20) DEFAULT 'Active',
    must_change_password BOOLEAN DEFAULT false,
    otp_code VARCHAR(10),
    otp_expires TIMESTAMP,
    login_otp_code VARCHAR(10),
    login_otp_expires TIMESTAMP,
    reset_otp_code VARCHAR(10),
    reset_otp_expires TIMESTAMP,
    token_version INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')
);

-- 3. PRODUCTS TABLE
-- Stores the shared product catalog.
CREATE TABLE IF NOT EXISTS products (
    product_id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(120),
    default_selling_price NUMERIC(12,2),
    wsp_code VARCHAR(60),
    cost_price NUMERIC(12,2),
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')
);

-- 4. BRANCH INVENTORY TABLE
-- Stores stock counts, stock status, and reorder planning values per branch.
CREATE TABLE IF NOT EXISTS branch_inventory (
    inventory_id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(product_id) ON DELETE CASCADE,
    branch VARCHAR(50) NOT NULL,
    stock_level INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 5,
    lead_time_days INTEGER,
    safety_stock INTEGER,
    average_daily_sales NUMERIC(10,2),
    average_daily_sales_mode VARCHAR(20) DEFAULT 'auto',
    manual_average_daily_sales NUMERIC(10,2),
    average_daily_sales_override_reason TEXT,
    status VARCHAR(20) DEFAULT 'In Stock',
    last_updated TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'),
    UNIQUE (product_id, branch)
);

-- 5. STOCK MOVEMENTS TABLE
-- Tracks every inventory quantity change for accountability and reports.
CREATE TABLE IF NOT EXISTS stock_movements (
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
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')
);

-- 6. SALES TRANSACTIONS TABLE
-- Stores completed sales, payment details, discounts, and optional cancellation fields.
CREATE TABLE IF NOT EXISTS sales_transactions (
    sales_transaction_id SERIAL PRIMARY KEY,
    sales_number VARCHAR(40) UNIQUE NOT NULL,
    branch VARCHAR(50) NOT NULL,
    customer_type VARCHAR(40) DEFAULT 'walk_in' CHECK (customer_type IN ('walk_in', 'sister_company', 'hardware_reseller', 'regular', 'contractor')),
    total_quantity INTEGER NOT NULL DEFAULT 0,
    subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    discount_type VARCHAR(40) DEFAULT 'none',
    discount_label VARCHAR(120),
    delivery_charge NUMERIC(12,2) NOT NULL DEFAULT 0,
    vatable_sales NUMERIC(12,2) NOT NULL DEFAULT 0,
    vat_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_method VARCHAR(30) DEFAULT 'cash' CHECK (payment_method IN ('cash', 'gcash', 'bank_transfer', 'credit')),
    amount_received NUMERIC(12,2),
    change_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    payment_reference VARCHAR(120),
    payment_confirmed BOOLEAN NOT NULL DEFAULT false,
    payment_confirmed_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    payment_confirmed_by_name TEXT,
    payment_confirmed_at TIMESTAMP,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    sold_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    sold_by_name TEXT,
    remarks TEXT,
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'),
    cancelled_at TIMESTAMP,
    cancelled_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    cancel_reason TEXT
);

-- 7. SALES ITEMS TABLE
-- Stores the sold item lines under each sales transaction.
CREATE TABLE IF NOT EXISTS sales_items (
    sales_item_id SERIAL PRIMARY KEY,
    sales_transaction_id INT NOT NULL REFERENCES sales_transactions(sales_transaction_id) ON DELETE CASCADE,
    inventory_id INT,
    product_id INT,
    is_inventory_item BOOLEAN NOT NULL DEFAULT true,
    item_name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    branch VARCHAR(50) NOT NULL,
    quantity_sold INTEGER NOT NULL,
    unit_price NUMERIC(12,2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    previous_quantity INTEGER NOT NULL,
    new_quantity INTEGER NOT NULL,
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')
);

-- 8. PURCHASE TRANSACTIONS TABLE
-- Stores supplier delivery and purchase entries that add stock to inventory.
CREATE TABLE IF NOT EXISTS purchase_transactions (
    purchase_transaction_id SERIAL PRIMARY KEY,
    purchase_number VARCHAR(40) UNIQUE NOT NULL,
    branch VARCHAR(50) NOT NULL,
    supplier_name VARCHAR(120) NOT NULL,
    document_type VARCHAR(20) DEFAULT 'DR' CHECK (document_type IN ('DR', 'SI', 'OR', 'OTHER')),
    document_number VARCHAR(80),
    payment_terms VARCHAR(30) DEFAULT 'cash' CHECK (payment_terms IN ('cash', 'cod', 'credit', 'branch_transfer')),
    subtotal_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
    total_quantity INTEGER NOT NULL DEFAULT 0,
    remarks TEXT,
    status VARCHAR(20) DEFAULT 'completed' CHECK (status IN ('completed', 'cancelled')),
    encoded_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    encoded_by_name TEXT,
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'),
    cancelled_at TIMESTAMP,
    cancelled_by INT REFERENCES users(user_id) ON DELETE SET NULL,
    cancel_reason TEXT
);

-- 9. PURCHASE ITEMS TABLE
-- Stores item-level purchase lines and resulting inventory balances.
CREATE TABLE IF NOT EXISTS purchase_items (
    purchase_item_id SERIAL PRIMARY KEY,
    purchase_transaction_id INT NOT NULL REFERENCES purchase_transactions(purchase_transaction_id) ON DELETE CASCADE,
    inventory_id INT REFERENCES branch_inventory(inventory_id) ON DELETE SET NULL,
    product_id INT REFERENCES products(product_id) ON DELETE SET NULL,
    item_name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    branch VARCHAR(50) NOT NULL,
    quantity_received INTEGER NOT NULL,
    unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
    subtotal NUMERIC(12,2) NOT NULL DEFAULT 0,
    previous_quantity INTEGER NOT NULL DEFAULT 0,
    new_quantity INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')
);

-- 10. ARCHIVED INVENTORY TABLE
-- Stores inactive inventory records for restore and history workflows.
CREATE TABLE IF NOT EXISTS archived_inventory (
    archived_inventory_id SERIAL PRIMARY KEY,
    original_inventory_id INT,
    product_id INT,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    branch VARCHAR(50) NOT NULL,
    stock_level INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 5,
    lead_time_days INTEGER,
    safety_stock INTEGER,
    average_daily_sales NUMERIC(10,2),
    average_daily_sales_mode VARCHAR(20) DEFAULT 'auto',
    manual_average_daily_sales NUMERIC(10,2),
    average_daily_sales_override_reason TEXT,
    status VARCHAR(20) DEFAULT 'In Stock',
    supplier_name VARCHAR(120),
    default_selling_price NUMERIC(12,2),
    wsp_code VARCHAR(60),
    cost_price NUMERIC(12,2),
    last_updated TIMESTAMP,
    archived_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila'),
    archive_reason VARCHAR(40),
    archived_by INT REFERENCES users(user_id) ON DELETE SET NULL
);

-- 11. AUDIT LOGS TABLE
-- Records important user actions for accountability.
CREATE TABLE IF NOT EXISTS audit_logs (
    id SERIAL PRIMARY KEY,
    actor_id INT,
    actor_name TEXT,
    target_id INT,
    target_name TEXT,
    target_type VARCHAR(60),
    action TEXT,
    reason TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')
);

-- 12. BACKUP LOGS TABLE
-- Records backup and restore activity.
CREATE TABLE IF NOT EXISTS backup_logs (
    id SERIAL PRIMARY KEY,
    action VARCHAR(20) NOT NULL,
    actor_id INT,
    actor_name TEXT,
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')
);

-- 13. SYSTEM LOGS TABLE
-- Stores operational and security events for maintenance checks.
CREATE TABLE IF NOT EXISTS system_logs (
    id SERIAL PRIMARY KEY,
    event_type VARCHAR(80) NOT NULL,
    severity VARCHAR(20) DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warning', 'error')),
    message TEXT NOT NULL,
    context JSONB DEFAULT '{}'::jsonb,
    actor_id INT REFERENCES users(user_id) ON DELETE SET NULL,
    actor_name TEXT,
    is_security BOOLEAN DEFAULT false,
    created_at TIMESTAMP DEFAULT (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Manila')
);

CREATE INDEX IF NOT EXISTS idx_system_logs_cleanup
ON system_logs (created_at)
WHERE is_security = false AND severity IN ('debug', 'info');

-- 14. INITIAL SEED DATA
-- Creates the first admin account placeholder for initial setup.
-- Replace password_hash with a real bcrypt hash before using this SQL directly,
-- or run reset-admin.js with ADMIN_RESET_PASSWORD configured.
INSERT INTO users (full_name, username, email, password_hash, role, branch, status, must_change_password)
VALUES (
    'System Admin',
    'admin',
    'admin@emcayetano.com',
    'PLACEHOLDER_HASH_FOR_DEV',
    'Admin',
    'Manggahan',
    'Active',
    false
)
ON CONFLICT (username) DO NOTHING;
