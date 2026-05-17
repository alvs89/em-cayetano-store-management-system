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

-- 5. INITIAL SEED DATA (System Admin)
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
