# Web-Based Store Management System for E.M. Cayetano Trading

A comprehensive web application designed to streamline business operations, inventory management, and sales tracking for E.M. Cayetano Trading. This system provides a robust interface for managing stock, generating reports, and maintaining user access control.

## 📋 Table of Contents

* [Tech Stack](https://www.google.com/search?q=%23-tech-stack)
* [Project Overview](https://www.google.com/search?q=%23-project-overview)
* [Project Structure](https://www.google.com/search?q=%23-project-structure)
* [Prerequisites](https://www.google.com/search?q=%23-prerequisites)
* [Installation & Setup](https://www.google.com/search?q=%23-installation--setup)
* [Database Configuration (Neon)](https://www.google.com/search?q=%23-database-configuration-neon)
* [Running the Application](https://www.google.com/search?q=%23-running-the-application)
* [Security & Git Guidelines](https://www.google.com/search?q=%23-security--git-guidelines)
* [Authors](https://www.google.com/search?q=%23-authors)

---

## 🛠 Tech Stack

**Frontend**

* **Framework:** React.js (via Vite)
* **Styling:** Tailwind CSS (inferred), CSS Modules
* **Components:** Custom UI components (located in `client/src/components/ui`)
* **State Management:** React Context API (`DataContext.jsx`)

**Backend**

* **Runtime:** Node.js
* **Framework:** Express.js
* **Authentication:** JSON Web Tokens (JWT), Bcrypt.js
* **Utilities:** Nodemon, Dotenv, CORS

**Database**

* **Database:** PostgreSQL (hosted on Neon)
* **Driver:** `pg` (node-postgres)

---

## 📖 Project Overview

This system is engineered to modernize the manual processes of E.M. Cayetano Trading. It serves as a central hub for business data, ensuring data integrity and accessibility.

### Key Modules

* **Dashboard:** specialized views for quick insights into daily operations.
* **Inventory Management:** Track stock levels, add new items, and manage product details.
* **Search Module:** efficient lookup for products and records.
* **Reports Module:** Generate actionable insights and sales reports.
* **User Management:** Admin controls for managing staff accounts and permissions.
* **Archive & Maintenance:** Tools for data archiving and system health checks.
* **Alerts:** Notifications for low stock or critical system events.

---

## 📂 Project Structure

```bash
em-cayetano-store-management-system/
├── client/                 # Frontend Application (React + Vite)
│   ├── public/             # Static assets
│   ├── src/
│   │   ├── assets/         # Images and icons
│   │   ├── components/     # Reusable UI components & Feature Modules
│   │   │   ├── ui/         # Generic UI elements (Buttons, Inputs, etc.)
│   │   │   ├── Dashboard.jsx
│   │   │   ├── InventoryModule.jsx
│   │   │   └── ... (Other modules)
│   │   ├── styles/         # Global styles and CSS
│   │   ├── utils/          # Utility functions and algorithms
│   │   ├── App.jsx         # Main Application Component
│   │   └── main.jsx        # Entry point
│   ├── .env.example        # Client-side environment variable template
│   ├── vite.config.js      # Vite configuration
│   └── package.json        # Frontend dependencies
│
├── server/                 # Backend Application (Node + Express)
│   ├── node_modules/       # Backend dependencies
│   ├── database.sql        # SQL Schema for Database initialization
│   ├── index.js            # Server entry point
│   ├── .env                # Server-side environment variables (GitIgnored)
│   └── package.json        # Backend dependencies
│
└── README.md               # Project Documentation

```

---

## ✅ Prerequisites

Before you begin, ensure you have the following installed:

* [Node.js](https://www.google.com/search?q=https://nodejs.org/) (v16 or higher)
* [Git](https://www.google.com/search?q=https://git-scm.com/)
* A [Neon](https://www.google.com/search?q=https://neon.tech/) account (for the Serverless PostgreSQL database)

---

## ⚙️ Installation & Setup

### 1. Clone the Repository

```bash
git clone https://github.com/alvs89/em-cayetano-store-management-system.git
cd em-cayetano-store-management-system

```

### 2. Frontend Setup

Navigate to the client directory and install dependencies:

```bash
cd client
npm install

```

* Create a `.env` file in the `client/` folder based on `.env.example`.
* Configure your API base URL (e.g., `VITE_API_URL=http://localhost:5000`).

### 3. Backend Setup

Navigate to the server directory and install dependencies:

```bash
cd ../server
npm install

```

* Create a `.env` file in the `server/` folder.
* Add the following variables:
```env
PORT=5000
DATABASE_URL=your_neon_connection_string
JWT_SECRET=your_secure_random_string

```



---

## 🗄 Database Configuration (Neon)

This project uses **Neon**, a serverless PostgreSQL platform.

1. **Create a Project:** Log in to [Neon Console](https://www.google.com/search?q=https://console.neon.tech/) and create a new project.
2. **Get Connection String:** Copy the "Direct Connection" string from your Neon dashboard. It should look like `postgres://user:password@ep-xyz.aws.neon.tech/dbname?sslmode=require`.
3. **Configure Server:** Paste this string into your `server/.env` file as `DATABASE_URL`.
4. **Initialize Schema:**
* Locate the file `server/database.sql` in this repository.
* Run the SQL commands inside this file using the Neon SQL Editor or a local tool like pgAdmin connected to your Neon instance. This will create the necessary tables and relationships.



---

## 🚀 Running the Application

To run the full stack locally, you need two terminal windows.

**Terminal 1: Backend**

```bash
cd server
npm start
# OR if using nodemon for development:
npm run dev

```

*The server should start on port 5000 (or your defined port).*

**Terminal 2: Frontend**

```bash
cd client
npm run dev

```

*Vite will start the development server, typically at `http://localhost:5173`.*

---

## 🔒 Security & Git Guidelines

### Secure Coding Practices

* **Never commit `.env` files.** Ensure `.env` is listed in your `.gitignore`.
* **Sanitize Inputs:** Always validate and sanitize user inputs on the backend to prevent SQL injection (handled by parameterized queries in `pg`).
* **Secrets:** Keep `JWT_SECRET` and database credentials distinct for production and development.

### Git Workflow

* **Main Branch (`main`):** Stable, production-ready code only. Direct commits are restricted.
* **Development Branch (`dev` or `develop`):** Integration branch for ongoing work.
* **Feature Branches:** Create a new branch for every feature or bug fix.
* Naming convention: `feature/feature-name` or `fix/bug-description`.


* **Pull Requests:** All changes must go through a Pull Request (PR) from a feature branch to `dev`, then `dev` to `main`. Code review is required before merging.

---

## 👥 Authors

* **Donato, Raymond B.**
* **Guillermo, Alvin J.**
* **Niez, John Alces B.**

*Submitted to the Computer Science Department, Technological Institute of the Philippines.*
