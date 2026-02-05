# 🏗️ E.M. Cayetano Trading | Web-Based Store Management System

## 📖 Introduction

This project is a dedicated **Web-Based Store Management System** developed for **E.M. Cayetano Trading**.

The system is designed to modernize the hardware trading operations by replacing manual logbooks with a digital solution. It addresses critical business needs, including **real-time inventory tracking** across multiple branches (Manggahan & San Rafael) and secure **Employee Management**. Our goal is to minimize data discrepancies, prevent stockouts, and provide the administration with accurate sales reports.

---

## 🛠️ Tech Stack

We are using the **PERN Stack** (PostgreSQL, Express, React, Node) with a modern Cloud Database approach.

| Component | Technology | Description |
| --- | --- | --- |
| **Frontend** |  | Built with **Vite**. Handles UI, Login Screens, and Dashboard logic. |
| **Backend** |  | REST API handling authentication (2FA), database queries, and email alerts. |
| **Database** |  | **Cloud-hosted database.** Accessible by all team members in real-time. |
| **Security** | `bcryptjs`, `jsonwebtoken` | Encryption for passwords and secure session tokens. |
| **Email** | `Nodemailer` | Automated OTPs for 2FA and Password Recovery. |

---

## 📂 Project Structure

Understanding the folder structure is critical for collaboration. We have two main workspaces:

```bash
em-cayetano-trading/
├── 📂 client/               # THE FRONTEND (The Website)
│   ├── 📂 src/
│   │   ├── 📂 components/   # All screens (Login, Inventory, Dashboard, etc.)
│   │   ├── 📂 ui/           # Reusable buttons, cards, inputs
│   │   └── App.jsx          # Main Router (Navigation logic)
│   └── package.json         # Frontend dependencies
│
├── 📂 server/               # THE BACKEND (The API)
│   ├── index.js             # MAIN SERVER FILE (Routes for login, inventory, etc.)
│   ├── database.sql         # SQL commands used to create tables
│   ├── .env                 # 🔒 SECRETS (Not on GitHub - See Setup Guide)
│   └── package.json         # Backend dependencies
│
└── README.md                # This documentation

```

---

## 🚀 Collaborator Setup Guide

**Attention Team:** Since we are using a **Shared Cloud Database (Neon)**, you do *not* need to install PostgreSQL locally on your laptop. You just need to connect the code to the cloud.

Follow these steps exactly to get the project running on your local machine.

### **Prerequisites**

* Download and Install **Node.js** (LTS Version).
* Install **VS Code**.
* Install **Git**.

### **Step 1: Clone the Repository**

Open your terminal/command prompt and run:

```bash
git clone <PASTE_REPO_URL_HERE>
cd em-cayetano-trading

```

### **Step 2: Install Backend Dependencies**

We need to install the libraries for the server first.

1. Open VS Code in the project folder.
2. Open the Terminal (`Ctrl + ~`).
3. Run:

```bash
cd server
npm install

```

### **Step 3: Configure Environment Variables (CRITICAL)**

The system will **crash** if you skip this. The `.env` file contains our database passwords and is hidden from GitHub for security.

1. Inside the `server/` folder, create a new file named `.env`.
2. Paste the following template into it:
3. **Ask Alvin** for the actual values to fill in the blanks.

```env
# server/.env

# SERVER PORT
PORT=5000
NODE_ENV=development

# CLOUD DATABASE CONNECTION (Ask Alvin for the Link)
DATABASE_URL=postgres://neondb_owner:...........@ep-solitary-hat.....neon.tech/neondb?sslmode=require

# SECURITY KEYS
JWT_SECRET=em_cayetano_trading_secure_key_2026

# EMAIL SYSTEM (For 2FA)
EMAIL_USER=emcayetano.notifications@gmail.com
EMAIL_PASS=pjvhotebmfljuxty

```

### **Step 4: Install Frontend Dependencies**

Now, set up the React website.

1. Open a **new** terminal (keep the server one open, click the `+` button in VS Code terminal).
2. Run:

```bash
cd client
npm install

```

---

## ▶️ How to Run the Project

To work on the system, you must run **both** the Server and the Client at the same time in two separate terminals.

**Terminal 1 (Backend):**

```bash
cd server
npm run dev
# You should see: "🚀 Server running on port 5000" and "✅ Connected to PostgreSQL"

```

**Terminal 2 (Frontend):**

```bash
cd client
npm run dev
# You should see: "➜ Local: http://localhost:5173/"

```

👉 **Ctrl + Click** the localhost link to open the app!

---

## 🔒 Security & Git Rules

> ⚠️ **IMPORTANT:** Never commit your `.env` file to GitHub.

1. **Environment Variables:** If you change the database password or add an API key, update your local `.env`, but **DO NOT** upload it. Send the new keys to the group chat instead.
2. **Pull Updates:** Always run `git pull` before you start coding to get the latest changes from the team.
3. **Branching:** If working on a major feature, create a branch: `git checkout -b feature-name`.

---

## 🤝 Collaboration Features

* **Database:** We are all connected to the **same** Neon database. If Ray adds an item to the inventory, Alvin and the rest of the team will see it instantly after refreshing.
* **Admin Access:**
* **User:** `admin`
* **Pass:** `admin123`
* *Note: Admin can access any branch (Manggahan/San Rafael).*
