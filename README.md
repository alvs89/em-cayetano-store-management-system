# E.M. Cayetano Store Management System

A web-based inventory management system for E.M. Cayetano Trading. The system helps the store monitor branch inventory, manage stock-in and stock-out transactions, generate reports, track alerts, archive records, and administer user access.

## Project Overview

This project is built for the inventory workflow of E.M. Cayetano Trading. It centralizes product records, branch stock levels, archived items, user accounts, alerts, reports, maintenance tools, audit logs, and stock movement history in one responsive web application.

The current implementation focuses on:

- Real-time inventory and alert updates
- Branch-level stock status tracking
- Historical stock movement records
- Audit logging for important user actions
- Mobile-responsive layouts across all major pages
- Admin-controlled user management and maintenance actions
- PDF report export

## Tech Stack

### Frontend

- React 19
- Vite
- Tailwind CSS and custom responsive CSS
- Radix UI components
- Lucide React icons
- Axios for API requests
- jsPDF and jsPDF AutoTable for report export

### Backend

- Node.js
- Express.js
- PostgreSQL database connection using `pg`
- JWT authentication
- Bcrypt password hashing
- Nodemailer for email-based OTP and account notices

### Database

- PostgreSQL
- Neon as an optional hosted PostgreSQL platform for development and deployment

## Main Modules

- **Authentication**: Login, registration, forgot password, password reset, and two-factor verification.
- **Dashboard**: Inventory summary, alerts overview, quick access modules, recent activity, and system guidelines.
- **Search Products**: Product lookup with responsive result cards.
- **Inventory Management**: Add items, update stock, stock-in, stock-out, archive items, sorting, filtering, and responsive mobile cards.
- **Archive**: View and restore archived inventory records.
- **Reports**: Summary, detailed inventory, low stock alert, category breakdown, and stock movement history reports with PDF export.
- **Alerts**: Low-stock, out-of-stock, pending user, and system notifications with read/dismiss controls.
- **Maintenance**: Backup, restore, optimization actions, data integrity checks, and system information.
- **User Management**: Approve, deactivate, reactivate, change role, and change branch for users.

## Project Structure

```text
em-cayetano-store-management-system/
├── client/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/
│   │   │   ├── Dashboard.jsx
│   │   │   ├── InventoryModule.jsx
│   │   │   ├── ReportsModule.jsx
│   │   │   └── ...
│   │   ├── styles/
│   │   ├── utils/
│   │   ├── App.jsx
│   │   └── main.jsx
│   ├── package.json
│   └── vite.config.js
├── server/
│   ├── database.sql
│   ├── index.js
│   ├── package.json
│   └── reset-admin.js
├── documentation.txt
└── README.md
```

## Prerequisites

Install these before running the project:

- Node.js 18 or newer
- npm
- Git
- PostgreSQL database, preferably Neon

## Local Setup

### 1. Clone the Repository

```bash
git clone https://github.com/alvs89/em-cayetano-store-management-system.git
cd em-cayetano-store-management-system
```

### 2. Install Backend Dependencies

```bash
cd server
npm install
```

Create `server/.env`:

```env
PORT=5000
DATABASE_URL=your_postgresql_connection_string
JWT_SECRET=your_secure_jwt_secret
EMAIL_USER=your_email_address
EMAIL_PASS=your_email_app_password
```

Notes:

- `DATABASE_URL` is required.
- `JWT_SECRET` should be a strong random string.
- `EMAIL_USER` and `EMAIL_PASS` are required for OTP and email notifications.
- Do not commit `.env` files.

### 3. Install Frontend Dependencies

```bash
cd ../client
npm install
```

Optional `client/.env`:

```env
VITE_API_BASE_URL=http://localhost:5000
VITE_APP_VERSION=1.0.0
VITE_APP_ENV=Development
```

Some authentication screens currently target the local backend during development, so run the backend on port `5000` unless those API URLs are updated.

## Database Setup

The backend includes runtime schema setup in `server/index.js`. When the server starts, it creates or updates the required tables.

The important database tables are:

- `users`
- `products`
- `branch_inventory`
- `archived_inventory`
- `stock_movements`
- `audit_logs`
- `backup_logs`

### Clean Inventory Design

The product catalog and branch stock data are separated:

```text
products
- product_id
- name
- category
- created_at
```

```text
branch_inventory
- inventory_id
- product_id
- branch
- stock_level
- min_stock_level
- status
- last_updated
```

Stock status should come from `branch_inventory`, not `products`.

## Running the Application

Open two terminals.

### Backend

```bash
cd server
npm run dev
```

or:

```bash
npm start
```

The backend runs on:

```text
http://localhost:5000
```

### Frontend

```bash
cd client
npm run dev
```

The Vite development server usually runs on:

```text
http://localhost:5173
```

## Build Check

Before pushing changes, run:

```bash
cd client
npm run build
```

For backend syntax checking:

```bash
cd server
node --check index.js
```

## Default Admin Account

Use `server/reset-admin.js` if you need to reset the seeded admin account password in development.

```bash
cd server
node reset-admin.js
```

Coordinate with the group before changing shared admin credentials.

## Groupmate Development Guide

### Recommended Workflow

1. Pull the latest code before starting work.
2. Create a feature branch for your assigned task.
3. Keep changes focused on one feature or fix.
4. Run the frontend build before committing.
5. Avoid committing generated logs, build outputs, `node_modules`, or `.env` files.
6. Write clear commit messages.
7. Push your branch and open a pull request when ready.

### Suggested Branch Names

```text
feature/inventory-improvements
feature/reports-export
fix/mobile-layout
fix/database-schema
```

### Commit Message Examples

```text
Improve mobile dashboard layout
Add stock movement report
Fix archive restore validation
Refine database schema cleanup
```

## Security Notes

- Never commit `.env` files or database credentials.
- Use strong JWT secrets in production.
- Keep Neon credentials private.
- Admin-only features should remain protected by backend authorization.
- Audit logs should record important system actions for accountability.

## Group Members

- Donato, Raymond B.
- Guillermo, Alvin J.
- Niez, John Alces B.

Bachelor of Science in Computer Science Students, Technological Institute of the Philippines.
