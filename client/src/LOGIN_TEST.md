# Login Testing Checklist
## E.M. Cayetano Trading - Inventory Management System

---

## ✅ Quick Login Test

Copy and paste these exact values:

### Test 1: Admin Login
```
Username: admin
Password: admin123
Branch: Manggahan
2FA Code: 123456
```

### Test 2: Employee Login
```
Username: employee
Password: emp123
Branch: San Rafael
2FA Code: 123456
```

### Test 3: Alternative Employee Login
```
Username: preyes
Password: emp123
Branch: San Rafael
2FA Code: 123456
```

---

## 🔍 Step-by-Step Verification

### Step 1: Login Screen
- [ ] Login screen is visible
- [ ] Three input fields present: Username, Password, Branch
- [ ] Yellow "Login" button is visible

### Step 2: Enter Credentials
- [ ] Type `admin` in Username field (all lowercase)
- [ ] Type `admin123` in Password field (exactly as shown)
- [ ] Click Branch dropdown and select `Manggahan`
- [ ] All three fields are filled

### Step 3: Submit Login
- [ ] Click yellow "Login" button
- [ ] Loading indicator appears briefly
- [ ] Redirected to 2FA screen (NOT error message)

### Step 4: Two-Factor Authentication
- [ ] 2FA screen loads with 6 empty boxes
- [ ] Type `123456` in the boxes
- [ ] Yellow "Verify Code" button becomes enabled
- [ ] Click "Verify Code" button

### Step 5: Dashboard Access
- [ ] Success animation plays
- [ ] Redirected to Dashboard automatically
- [ ] Sidebar visible with navigation menu
- [ ] User name "Edna Cayetano" displayed in sidebar
- [ ] "Admin" role badge visible
- [ ] "Manggahan" branch shown
- [ ] Dashboard content visible

---

## ❌ Common Issues & Solutions

### Issue: "Invalid username or password"

**Possible Causes:**
1. Username has uppercase letters (should be all lowercase)
2. Password has typos or wrong case
3. Branch not selected from dropdown
4. Extra spaces in username or password

**Solution:**
- Clear both fields completely
- Type slowly and carefully: `admin` then `admin123`
- Select branch from dropdown (don't type it)
- Try again

---

### Issue: "Please fill in all fields"

**Cause:** One or more fields are empty

**Solution:**
- Check all three fields:
  - Username: `admin`
  - Password: `admin123`
  - Branch: Must select from dropdown

---

### Issue: Stuck on login screen, no redirect

**Cause:** JavaScript error or network issue

**Solution:**
1. Open browser console (F12) and check for errors
2. Refresh page (F5)
3. Try different browser
4. Clear browser cache

---

### Issue: "Invalid verification code" on 2FA screen

**Cause:** Wrong 2FA code entered

**Solution:**
- The demo code is always: `123456`
- Type it exactly: 1-2-3-4-5-6
- If expired, click "Resend Code"

---

## 🧪 Developer Testing

### Console Verification

Open browser console (F12) and check for:

**Expected console logs during login:**
```
✓ Linear Search: Finding user by username
✓ User found: admin
✓ Bcrypt: Verifying password (or fallback authentication)
✓ Password verified successfully
✓ Redirecting to 2FA...
```

**No errors should appear:**
```
❌ Cannot read property of undefined
❌ Hash validation failed
❌ User not found
```

### Network Requests

In Network tab (F12 → Network):
- ✓ No external API calls should fail
- ✓ No 404 errors for assets
- ✓ Images load successfully

---

## 🔐 Authentication Flow Validation

### What Happens Behind the Scenes

When you click "Login" with `admin` / `admin123`:

1. **Linear Search Algorithm** executes:
   - Searches user array for username "admin"
   - Checks if user status is "Active"
   - Returns user object

2. **Password Verification**:
   - For demo accounts (admin, employee, preyes):
     - Direct comparison with hardcoded passwords
     - This is a fallback for testing purposes
   - For newly created users:
     - Bcrypt verification against stored hash

3. **2FA Preparation**:
   - User object passed to 2FA screen
   - 2FA code generated (simulated as "123456")
   - Redirect to TwoFactorAuthScreen

4. **2FA Verification**:
   - Code "123456" compared with entered code
   - If match: redirect to Dashboard
   - If no match: show error

5. **Dashboard Load**:
   - User context established
   - Session created
   - Navigation menu rendered based on role

---

## 📊 Test Results Template

### Test Date: _____________
### Tester: _____________

| Test Case | Status | Notes |
|-----------|--------|-------|
| Admin login with correct credentials | ☐ Pass ☐ Fail | |
| Employee login with correct credentials | ☐ Pass ☐ Fail | |
| Login with wrong password | ☐ Pass ☐ Fail | Should show error |
| Login without selecting branch | ☐ Pass ☐ Fail | Should show error |
| 2FA with correct code (123456) | ☐ Pass ☐ Fail | |
| 2FA with wrong code | ☐ Pass ☐ Fail | Should show error |
| Dashboard loads after successful 2FA | ☐ Pass ☐ Fail | |
| User info displayed correctly | ☐ Pass ☐ Fail | |
| Navigation menu visible | ☐ Pass ☐ Fail | |
| Admin sees User Management module | ☐ Pass ☐ Fail | |
| Employee does NOT see User Management | ☐ Pass ☐ Fail | |

---

## 🎯 Success Criteria

All of the following must be true for successful login:

✅ Login screen accepts credentials without errors  
✅ 2FA screen loads after login  
✅ 2FA code "123456" is accepted  
✅ Dashboard loads with user information  
✅ Sidebar navigation is functional  
✅ User name, role, and branch are displayed correctly  
✅ No console errors during the entire flow  
✅ All animations and transitions work smoothly  

---

## 🚨 Critical Issues to Report

If any of these occur, report immediately:

🔴 Cannot type in input fields  
🔴 Login button does nothing when clicked  
🔴 Page crashes or freezes  
🔴 Console shows red errors  
🔴 Cannot proceed past 2FA screen even with correct code  
🔴 Dashboard loads but is blank/empty  
🔴 User information shows as undefined or null  

---

## 📞 Support Information

If login still doesn't work after following all troubleshooting steps:

1. **Check browser compatibility:**
   - Chrome 90+ ✅
   - Firefox 88+ ✅
   - Safari 14+ ✅
   - Edge 90+ ✅

2. **Verify JavaScript is enabled:**
   - Settings → Privacy → JavaScript: Enabled

3. **Clear all browser data:**
   - Cache, cookies, local storage
   - Hard refresh (Ctrl+F5 or Cmd+Shift+R)

4. **Try incognito/private mode:**
   - Eliminates extension conflicts

---

**Last Updated:** November 2, 2025  
**Version:** 2.0 (Algorithm Integration)  
**Status:** ✅ Ready for Testing
