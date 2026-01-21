# E.M. Cayetano Trading - Quick Start Guide
## How to Access the Dashboard

---

## ⚠️ IMPORTANT: Read This First!

**Getting "Invalid username or password" error?**

Make sure you:
1. ✅ Type username in **lowercase** (`admin`, not `Admin` or `ADMIN`)
2. ✅ Type password **exactly** as shown (`admin123` or `emp123`)
3. ✅ **Select a branch** from the dropdown (Manggahan or San Rafael)
4. ✅ Check for typos - passwords are case-sensitive!

**Test these credentials:**
- Username: `admin` 
- Password: `admin123`
- Branch: `Manggahan`
- 2FA Code: `123456`

---

## 🚀 Simple 3-Step Login Process

### Step 1: Login Screen
1. Open the application - you'll see the **Login Screen**
2. Enter your credentials EXACTLY as shown below (case-sensitive):

#### **Demo Accounts Available:**

**Admin Account:**
- **Username:** `admin` (lowercase)
- **Password:** `admin123` (exact spelling)
- **Branch:** Select either `Manggahan` or `San Rafael`

**Employee Account:**
- **Username:** `employee` (lowercase)
- **Password:** `emp123` (exact spelling)
- **Branch:** Select either `Manggahan` or `San Rafael`

**Alternative Employee:**
- **Username:** `preyes` (lowercase)
- **Password:** `emp123` (exact spelling)
- **Branch:** Select either `Manggahan` or `San Rafael` (San Rafael recommended)

⚠️ **Important:** Passwords are case-sensitive. Type them exactly as shown!

3. Click the yellow **"Login"** button

---

### Step 2: Two-Factor Authentication (2FA)
After successful login, you'll automatically be redirected to the **2FA Screen**.

1. Wait for the animation to complete (2.5 seconds)
2. You'll see 6 empty boxes for entering the verification code
3. **Enter this code:** `123456`
4. Click the yellow **"Verify Code"** button

**Note:** The code `123456` is the demo verification code for testing purposes.

---

### Step 3: Welcome to the Dashboard! 🎉
After successful 2FA verification, you'll be automatically redirected to the **Dashboard** where you can:

- View system overview and statistics
- Access all modules via the sidebar
- Manage inventory, generate reports, search products, and more!

---

## 📋 Complete Login Flow

```
1. Start → Login Screen
   ├─ Username: admin (or employee)
   ├─ Password: admin123 (or emp123)
   └─ Branch: Manggahan or San Rafael
   
2. Click "Login" → 2FA Screen (automatic redirect)
   ├─ Wait for code entry form to appear
   └─ Enter: 123456
   
3. Click "Verify Code" → Dashboard (automatic redirect)
   └─ ✓ You're now logged in!
```

---

## 🎯 Module Access from Dashboard

Once logged in, you'll see the **sidebar navigation** with these modules:

### Available to All Users:
- 🔍 **Search Products** - Quick product lookup
- 📦 **Dashboard** - System overview (home)
- 📦 **Inventory** - Manage products and stock
- 🗄️ **Archive** - View deleted/archived items
- 📊 **Reports** - Generate various reports
- 🔔 **Alerts** - Stock alerts and notifications
- ❓ **Help** - Documentation and support

### Admin-Only Modules:
- ⚙️ **Maintenance** - System settings and configuration
- 👥 **User Management** - Manage user accounts

---

## 🔐 Security Features (Behind the Scenes)

When you log in, here's what happens automatically:

1. **Linear Search Algorithm** finds your username in the database
2. **Bcrypt Algorithm** verifies your password against the encrypted hash
3. **2FA Authentication** adds an extra security layer
4. Your session is established securely

All of this happens in milliseconds!

---

## 🆘 Troubleshooting

### "Invalid username or password" error?
- Double-check you're using the correct credentials
- Make sure you've selected a branch
- Try: `admin` / `admin123` with any branch

### "Invalid verification code" error?
- The demo code is always: `123456`
- Make sure you enter all 6 digits
- If code expires, click "Resend Code"

### Stuck on 2FA screen?
- Click "Back to Login" button
- Re-login from the start

---

## 🎨 User Interface Notes

**Color Scheme:**
- 🟡 Yellow (#FFFF00) - Primary actions and highlights
- 🔴 Red (#FF0000) - Logout, delete, and warnings
- ⚪ White/Gray - Background and text

**Quick Actions:**
- Click any module in the sidebar to navigate
- Your name and role appear at the top of the sidebar
- Red logout button is at the bottom of the sidebar

---

## 📝 Creating Your Own Account (Optional)

From the Login Screen:
1. Click **"Create Account"** link
2. Fill in your information:
   - Full Name
   - Username (must be unique)
   - Email
   - Branch
   - Role
3. You'll be redirected to **Set Password Screen**
4. Create a password (minimum 6 characters)
5. Return to Login Screen and log in!

**Note:** Your password will be securely hashed with Bcrypt before storage.

---

## 🔄 Logging Out

When you're done:
1. Click the red **"Logout"** button at the bottom of the sidebar
2. Confirm logout in the dialog
3. You'll be returned to the Login Screen

---

## 🌟 Key Features to Explore

### In Inventory Module:
- ✅ Click column headers to **sort** (uses Merge Sort algorithm)
- ✅ Use search bar for **fast filtering** (uses Binary/Linear Search)
- ✅ Add, edit, or delete products with confirmation dialogs

### In Search Module:
- ✅ Real-time search across all inventory
- ✅ Intelligent algorithm selection for optimal speed
- ✅ Filter by branch, category, status

### In Reports Module:
- ✅ Generate various report types
- ✅ Export to PDF or CSV
- ✅ Date range selection

---

## 📚 Need More Help?

- **Full User Guide:** See `USER_GUIDE.md` for comprehensive documentation
- **Help Module:** Click the Help icon in the sidebar after logging in
- **Technical Details:** All algorithm integrations are documented in the user guide

---

## ⚡ Quick Reference Card

```
┌─────────────────────────────────────────────┐
│  QUICK LOGIN REFERENCE                      │
├─────────────────────────────────────────────┤
│  Admin Login:                               │
│    Username: admin                          │
│    Password: admin123                       │
│    Branch: Manggahan or San Rafael          │
│    2FA Code: 123456                         │
├─────────────────────────────────────────────┤
│  Employee Login:                            │
│    Username: employee                       │
│    Password: emp123                         │
│    Branch: Manggahan or San Rafael          │
│    2FA Code: 123456                         │
├─────────────────────────────────────────────┤
│  Additional Employee:                       │
│    Username: preyes                         │
│    Password: emp123                         │
│    Branch: San Rafael (recommended)         │
│    2FA Code: 123456                         │
└─────────────────────────────────────────────┘
```

---

## 🎉 You're All Set!

That's it! You now know how to:
- ✅ Log into the system
- ✅ Complete 2FA verification
- ✅ Access the Dashboard
- ✅ Navigate between modules
- ✅ Log out securely

**Enjoy using the E.M. Cayetano Trading Inventory Management System!**

---

**Last Updated:** November 2, 2025  
**System Version:** 2.0 (Algorithm Integration)  
**For detailed documentation, see:** USER_GUIDE.md
