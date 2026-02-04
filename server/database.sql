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
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. PRODUCTS TABLE (Inventory Management)
-- Stores the hardware items, stock levels, and pricing
CREATE TABLE products (
    product_id SERIAL PRIMARY KEY,
    name VARCHAR(150) NOT NULL,
    category VARCHAR(50) NOT NULL,
    price DECIMAL(10, 2) NOT NULL,
    stock_level INTEGER DEFAULT 0,
    min_stock_level INTEGER DEFAULT 5,
    status VARCHAR(20) DEFAULT 'In Stock',
    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 3. INITIAL SEED DATA (System Admin)
-- Creates the first admin account to allow initial login.
-- Username: admin
-- Password: admin123 (Managed via server-side hardcoded check for now)
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