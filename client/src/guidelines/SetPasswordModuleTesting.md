# Testing the Set Password Module - UPDATED GUIDE

## Overview
The Set Password Module ensures secure account activation and password management within the E.M. Cayetano Trading inventory system. This guide explains how to test all its features.

---

## 🚀 Quick Test Method (EASIEST - 3 Steps!)

### **Method 1: Via Forgot Password Flow**

1. **Access Forgot Password Screen**
   - From the login screen, click "Forgot Password?"
   
2. **Fill in Details & Submit**
   - Username: Enter any username (e.g., `admin` or `testuser`)
   - Email: Enter any email (e.g., `test@emcayetano.com`)
   - Click "Send Reset Link"
   - You'll see: "Reset Link Sent!" with a loading spinner

3. **Automatic Redirect**
   - After 2 seconds, you'll be automatically redirected to the **Set Password Screen**
   - Now you can test all the password features!

---

### **Method 2: Via New Employee Registration (Full Workflow)**

This tests the complete approval and password setup flow:

1. **Register New Employee**
   - From login screen, click "Create Account"
   - Fill in:
     - Full Name: `Test Employee`
     - Username: `testuser`
     - Email: `test@emcayetano.com`
     - Branch: `Manggahan`
   - Click "Submit Registration"
   - Success message appears

2. **Login as Admin**
   - Username: `admin`
   - Password: `your configured admin password`
   - Branch: `Manggahan`
   - Click "Login"

3. **Approve the New User**
   - Click "User Management" in sidebar
   - Click "Pending" tab
   - Find "Test Employee"
   - Click "Approve" button
   - System generates invite token (7-day validity)
   - Toast: "Test Employee approved successfully! Invite email with password setup link has been sent"

4. **Access Set Password**
   - Logout
   - Click "Forgot Password?"
   - Fill in any username and email
   - Click "Send Reset Link"
   - Automatically redirected to Set Password screen

---

## 🧪 Testing Password Strength Requirements

Once you're on the Set Password screen, test these scenarios:

### ❌ **Invalid Passwords (Should Show Errors):**

| Password | Issue | What You'll See |
|----------|-------|----------------|
| `Pass1!` | Too short (only 6 chars) | Red X ❌ on "At least 8 characters" |
| `password123!` | No uppercase letter | Red X ❌ on "One uppercase letter" |
| `PASSWORD123!` | No lowercase letter | Red X ❌ on "One lowercase letter" |
| `Password!` | No number | Red X ❌ on "One number" |
| `Password123` | No special character | Red X ❌ on "One special character" |
| `Pass123` | Multiple issues | Multiple red X marks |

### ✅ **Valid Passwords (Should Work):**

| Password | Result |
|----------|--------|
| `EMCTrade2025!` | ✓ All green checkmarks, button enabled |
| `MyP@ssw0rd` | ✓ All green checkmarks, button enabled |
| `Secure#2025` | ✓ All green checkmarks, button enabled |
| `Test@Pass1` | ✓ All green checkmarks, button enabled |

---

## 📋 Step-by-Step Testing Checklist

### **Visual Feedback Tests:**
- [ ] Password requirements box displays below confirm password field
- [ ] Each requirement shows red X ❌ by default
- [ ] As you type, requirements update in real-time
- [ ] Valid requirements show green checkmark ✓
- [ ] All 5 requirements must be green to enable submit

### **Password Requirements (Check Each):**
- [ ] **Minimum Length:** At least 8 characters
- [ ] **Uppercase:** One uppercase letter (A-Z)
- [ ] **Lowercase:** One lowercase letter (a-z)
- [ ] **Number:** One number (0-9)
- [ ] **Special Character:** One special character (!@#$%^&*)

### **Password Mismatch Test:**
- [ ] New Password: `EMCTrade2025!`
- [ ] Confirm Password: `EMCTrade2025@` (different)
- [ ] Click "Set Password & Activate Account"
- [ ] Error message: "Passwords do not match"

### **Empty Fields Test:**
- [ ] Leave New Password empty
- [ ] Click "Set Password & Activate Account"
- [ ] Error message: "Please fill in all fields"

### **Weak Password Test:**
- [ ] Enter: `weak`
- [ ] Button remains disabled (grayed out)
- [ ] Multiple red X marks visible

### **Success Flow Test:**
- [ ] New Password: `EMCTrade2025!`
- [ ] Confirm Password: `EMCTrade2025!`
- [ ] All 5 requirements show green ✓
- [ ] Button becomes enabled (yellow)
- [ ] Click "Set Password & Activate Account"
- [ ] Success screen appears with green checkmark
- [ ] "Password Set Successfully!" message
- [ ] Automatic redirect to login after 3 seconds

---

## 🔒 Security Features Being Tested

### **1. Link Validation**
- ✓ Shows loading spinner while validating
- ✓ Checks if user exists who needs password setup
- ✓ Verifies invite token hasn't expired (7-day limit)
- ✓ Shows error page if link is invalid

### **2. Password Strength Enforcement**
- ✓ Minimum 8 characters required
- ✓ Must contain uppercase letter
- ✓ Must contain lowercase letter
- ✓ Must contain number
- ✓ Must contain special character
- ✓ Submit button disabled until all met

### **3. Real-Time Validation**
- ✓ Requirements update as you type
- ✓ Visual feedback (green ✓ or red ❌)
- ✓ Clear indication of what's missing

### **4. Account Activation**
- ✓ User status changes to "Active"
- ✓ passwordSet flag set to true
- ✓ Invite token cleared
- ✓ User can now login

---

## 🎯 Expected Behaviors

### **On Set Password Screen Load:**
1. Shows loading spinner for 1 second
2. Validates the invite link
3. Displays user's name if found
4. Shows password requirement checklist
5. Both password fields empty
6. Submit button disabled

### **While Typing Password:**
1. Requirements update in real-time
2. Green checkmarks appear as requirements met
3. Red X marks show unmet requirements
4. Submit button enables when all requirements met

### **On Successful Submit:**
1. Success screen with green checkmark appears
2. "Password Set Successfully!" message
3. "Your account has been activated" message
4. 3-second countdown to login
5. Automatic redirect to login screen
6. Can now login with new password

### **On Failed Submit:**
1. Error message displays in red box
2. Specific error message shown:
   - "Please fill in all fields"
   - "Password does not meet security requirements"
   - "Passwords do not match"
3. Form remains editable
4. Can correct and resubmit

---

## 🧑‍💻 Test User Credentials

### **Existing Active Users:**
- **Admin Account:**
  - Username: `admin`
  - Password: `your configured admin password`
  - Branch: `Manggahan`
  - Role: Admin

- **Employee Account 1:**
  - Username: `employee`
  - Password: `your configured employee password`
  - Branch: `Manggahan`
  - Role: Employee

- **Employee Account 2:**
  - Username: `preyes`
  - Branch: `San Rafael`
  - Role: Employee

---

## 🐛 Troubleshooting

### **Issue: Not redirecting to Set Password screen**
**Solution:** 
- After clicking "Send Reset Link", wait 2 seconds
- You should see a loading spinner
- Then automatic redirect happens

### **Issue: Submit button won't enable**
**Solution:**
- Check all 5 requirements have green checkmarks ✓
- Password must be at least 8 characters
- Password must have: uppercase, lowercase, number, special char
- Both passwords must match

### **Issue: Want to test multiple times**
**Solutions:**
1. **Quick Way:** Just use Forgot Password flow each time
2. **New User:** Register a new employee with different username
3. **Reset Existing:** Have admin re-approve an existing pending user

### **Issue: Can't see password requirements**
**Solution:**
- Requirements box appears below "Confirm Password" field
- Scroll down if not visible
- Should have gray background with 5 checkboxes

---

## 💡 Tips for Thorough Testing

1. **Test Password Visibility Toggle:**
   - Click eye icon to show/hide password
   - Verify password becomes visible/hidden
   - Works on both password fields

2. **Test Edge Cases:**
   - Very long password (50+ characters)
   - Password with only special characters
   - Copy-paste passwords
   - Browser autofill

3. **Test Responsiveness:**
   - Resize browser window
   - Test on mobile viewport
   - Verify layout stays intact

4. **Test Multiple Scenarios:**
   - Test with admin account
   - Test with employee account
   - Test multiple registrations

---

## ✨ Success Indicators

You've successfully tested the Set Password Module when:

✅ Can access Set Password screen via Forgot Password  
✅ All 5 password requirements display correctly  
✅ Requirements update in real-time as you type  
✅ Weak passwords keep submit button disabled  
✅ Strong passwords enable submit button  
✅ Password mismatch shows error  
✅ Empty fields show error  
✅ Valid submission shows success screen  
✅ Redirects to login after success  
✅ User account status updates to Active  
✅ New password works for login  

---

## 📞 Need Help?

If you encounter issues:
1. Check that you filled both password fields
2. Verify all 5 requirements have green checkmarks
3. Make sure passwords match exactly
4. Wait for automatic redirect (2 seconds)
5. Try refreshing and starting over

**Common Valid Test Password:** `EMCTrade2025!`

This password meets all requirements:
- 8+ characters ✓
- Has uppercase (E, M, C, T) ✓
- Has lowercase (rade) ✓
- Has number (2025) ✓
- Has special char (!) ✓
