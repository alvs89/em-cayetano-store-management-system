# E.M. Cayetano Trading - POS-Integrated Inventory Management System
## Complete User Guide (Updated Version with POS Workflow and Algorithm Integration)

---

## Table of Contents
1. [System Overview](#system-overview)
2. [Getting Started](#getting-started)
3. [User Authentication Flow](#user-authentication-flow)
4. [Dashboard](#dashboard)
5. [Inventory Module](#inventory-module)
6. [Search Module](#search-module)
7. [Sales / POS Module](#sales--pos-module)
8. [Reports Module](#reports-module)
9. [Alerts Module](#alerts-module)
10. [Archive Module](#archive-module)
11. [User Management Module](#user-management-module)
12. [Maintenance Module](#maintenance-module)
13. [Help Module](#help-module)
14. [Logging Out](#logging-out)
15. [Technical Features & Algorithm Integration](#technical-features--algorithm-integration)

---

## System Overview

### Purpose
The E.M. Cayetano Trading POS-Integrated Inventory Management System is a web-based platform designed to support daily hardware store operations. It combines inventory tracking with a practical sales/POS workflow so customer purchases can be recorded accurately and inventory can be deducted automatically after each completed transaction.

### Key Features
- **Dual-Branch Support**: Manage inventory for Manggahan and San Rafael locations
- **Role-Based Access**: Admin/Manager, Cashier, and Inventory Staff roles with clear responsibility boundaries
- **POS-Integrated Sales**: Record sold items, unit prices, discounts, payment method, amount received, change, and completed sales records
- **Automatic Inventory Deduction**: Successful sales reduce inventory immediately and create stock movement records
- **Enhanced Security**: Bcrypt password hashing, Two-Factor Authentication (2FA)
- **High Performance**: Merge Sort for efficient data sorting, Binary Search for fast lookups
- **Real-Time Operations**: Live filtering, searching, and data updates
- **Professional UI**: Yellow (#FFFF00) and Red (#FF0000) color scheme

### User Roles
- **Admin / Manager**: Full system access, including user management, reports, archive, maintenance, inventory setup, reorder review, and business oversight
- **Cashier**: Records customer purchases through the Sales/POS workflow and helps keep sales-based stock deduction accurate
- **Inventory Staff**: Handles inventory operations such as Stock In, Stock Out, physical stock checking, and inventory monitoring

---

## Getting Started

### Accessing the System
1. Navigate to the application URL in your web browser
2. You'll be greeted with the **Login Screen**

### System Requirements
- Modern web browser (Chrome, Firefox, Safari, Edge)
- Internet connection
- Valid user credentials

---

## User Authentication Flow

### 1. Admin-Managed Account Creation

The system no longer supports public account requests. This is intentional. In a real hardware store, access should be given only to approved store personnel. The Admin/Manager creates accounts, assigns roles, assigns the branch, and provides the temporary password.

#### Step-by-Step Process:
1. **Admin / Manager Opens User Management**
   - The Admin/Manager creates the account from the official employee list.

2. **Fill Account Details**
   - **Full Name**: Complete employee name
   - **Username**: Unique username for login
   - **Email**: Valid email address
   - **Branch**: Manggahan or San Rafael
   - **Role**: Admin/Manager, Cashier, or Inventory Staff

3. **Temporary Password**
   - The system generates a temporary password.
   - The user must change this password during first login.
   - Passwords are protected using **Bcrypt** before storage.

4. **Access Control**
   - If an employee resigns or should no longer use the system, the Admin/Manager can deactivate the account instead of deleting operational history.

#### Technical Note:
```
🔒 Security: Bcrypt Algorithm
- Password undergoes 10 rounds of hashing
- Salt is automatically generated and included in hash
- Stored format: $2b$10$[salt][hash]
- Impossible to reverse-engineer original password
```

---

### 2. Login Process

#### Step-by-Step Process:
1. **Enter Credentials**
   - **Username**: Your registered username
   - **Password**: Your password (entered in plain text)
   
2. **Authentication** (Behind the Scenes)
   - System retrieves the matching user account from the database
   - Your entered password is compared with stored hash using **Bcrypt verification**
   - Bcrypt re-hashes your input and compares with stored hash
   - Only matching hashes grant access
   
3. **Two-Factor Authentication (2FA)**
   - Upon successful password verification, you're redirected to **2FA Screen**
   - A 6-digit code is displayed on screen
   - **Enter the 6-digit code** in the input field
   - Code validation occurs
   
4. **Access Granted**
   - Successful 2FA verification redirects to Dashboard
   - Session is established
   - User context is set (role, branch, preferences)

#### Authentication Flow Diagram:
```
Login Screen
    ↓
Enter Username/Password
    ↓
[Database Lookup] Find User
    ↓
[Bcrypt] Verify Password Hash
    ↓
2FA Screen - Display 6-Digit Code
    ↓
Enter Code → Validate
    ↓
Dashboard (Logged In)
```

---

### 3. Forgot Password

If you forget your password:
1. Click **"Forgot Password?"** on Login Screen
2. Enter your **registered email**
3. System validates email exists
4. Redirected to **Set Password Screen**
5. Create new password (hashed with Bcrypt)
6. Return to Login Screen

---

## Dashboard

### Overview
The Dashboard is your command center after successful login. It provides:
- Quick access to all modules
- System overview and statistics
- Branch-specific information
- User profile access

### Dashboard Features:
1. **Navigation Menu**
   - Sidebar or top navigation with module icons
   - Color-coded sections (Yellow/Red theme)
   
2. **Quick Stats** (Visible to all users)
   - Total inventory items
   - Low stock alerts count
   - Recent activities
   - Branch-specific metrics
   
3. **Module Access Buttons**
   - **Inventory**: Manage products and stock
   - **Search**: Quick product lookup
   - **Reports**: Generate and view reports
   - **Alerts**: Stock and system notifications
   - **Archive**: View archived items
   - **User Management**: (Admin only) Manage user accounts
   - **Maintenance**: (Admin only) System settings
   - **Help**: Documentation and support

4. **User Profile Section**
   - Display name and role
   - Branch information
   - Logout button

---

## Inventory Module

### Purpose
Centralized inventory management with advanced sorting, searching, and filtering capabilities powered by integrated algorithms.

### Features & Algorithm Integration:

#### 1. **View Inventory**
- **Table Display**
  - Product ID, Name, Description, Quantity, Price, Category, Branch, Status
  - Responsive design for mobile/tablet/desktop
  
- **Sorting Functionality** 🔥 **[Merge Sort Algorithm]**
  - Click any column header to sort
  - **Behind the Scenes**:
    - Merge Sort algorithm processes the entire inventory dataset
    - Time Complexity: O(n log n) - efficient for large datasets
    - Stable sort maintains relative order of equal elements
    - Ascending/Descending toggle
  - **Sortable Columns**: All columns support sorting
  
#### Technical Note - Merge Sort:
```javascript
// When you click a column header:
1. Merge Sort divides inventory into smaller arrays
2. Recursively sorts each sub-array
3. Merges sorted sub-arrays back together
4. Returns fully sorted inventory
5. UI updates with sorted data
```

#### 2. **Search & Filter** 🔥 **[Binary Search & Linear Search]**

**Real-Time Search Bar**
- Type product name, ID, or description
- **Algorithm Selection**:
  - If inventory is **sorted** by the search field → **Binary Search** used
    - Time Complexity: O(log n) - extremely fast
    - Divides search space in half each iteration
  - If inventory is **unsorted** → **Linear Search** used
    - Time Complexity: O(n) - checks each item
    - Reliable for any dataset state

**Filter Options**
- **By Branch**: Manggahan / San Rafael / All
- **By Category**: Electronics, Clothing, Food, etc.
- **By Status**: Available, Low Stock, Out of Stock
- **Combination Filters**: Apply multiple filters simultaneously

**Filter Algorithm Flow**:
```
User enters search term
    ↓
Is inventory sorted by search field?
    ↓           ↓
   YES         NO
    ↓           ↓
Binary Search  Linear Search
    ↓           ↓
Return matching items
    ↓
Display filtered results
```

#### 3. **Add New Product**
- Click **"Add Product"** button
- Fill form fields:
  - Product Name
  - Description
  - Quantity (number)
  - Price (decimal)
  - Category (dropdown)
  - Branch (dropdown)
  
- **Duplicate Prevention** 🔥 **[Linear Search]**
  - Before adding, system searches existing inventory
  - Linear Search checks if product ID/name already exists
  - Prevents duplicate entries
  
- **Validation**
  - All fields required
  - Quantity must be positive number
  - Price must be valid decimal
  
- **Automatic Status Assignment**
  - Quantity > 20: "Available"
  - Quantity 1-20: "Low Stock"
  - Quantity 0: "Out of Stock"

#### 4. **Edit Product**
- Click **Edit** icon/button on any row
- Modal/form opens with current data pre-filled
- Modify any field
- **Validation applies** (same as Add)
- Click **"Save Changes"**
- **Re-sorting**: If sort is active, Merge Sort re-processes data

#### 5. **Delete Product**
- Click **Delete** icon/button
- **Confirmation Dialog** appears
  - "Are you sure you want to delete [Product Name]?"
  - Cancel / Confirm buttons
- Upon confirmation:
  - Product moved to Archive (soft delete)
  - Removed from active inventory
  - Can be restored from Archive Module

#### 6. **Export Inventory**
- **Export to CSV**: Download current view as spreadsheet
- **Export to PDF**: Generate printable inventory report
- **Filters Applied**: Exported data reflects current filters/sorting

---

## Search Module

### Purpose
Quick product lookup across the entire inventory database with intelligent algorithm selection.

### Features:

#### 1. **Universal Search Bar**
- Large search input field
- Placeholder: "Search by product name, ID, category..."
- Real-time results as you type

#### 2. **Intelligent Search Algorithm** 🔥 **[Binary Search + Linear Search]**

**How It Works**:
```
User enters search query
    ↓
System analyzes current inventory state
    ↓
Is inventory sorted by Product ID or Name?
    ↓              ↓
  YES             NO
    ↓              ↓
Binary Search    Linear Search
(Fast - O(log n)) (Comprehensive - O(n))
    ↓              ↓
Return results in milliseconds
```

**Search Capabilities**:
- **Exact Match**: "Product-001" finds exact ID
- **Partial Match**: "Prod" finds all products starting with "Prod"
- **Case Insensitive**: "laptop" = "LAPTOP" = "Laptop"
- **Multi-Field**: Searches across Name, ID, Description, Category

#### 3. **Search Results Display**
- **Grid/List View Toggle**
- **Result Count**: "Found 15 results for 'laptop'"
- **Product Cards** showing:
  - Product image (if available)
  - Name
  - ID
  - Price
  - Quantity
  - Branch
  - Quick Actions (View, Edit, Delete)

#### 4. **Advanced Filters**
- Same filtering options as Inventory Module
- **Search Within Results**: Narrow down search results
- **Sort Results**: Apply Merge Sort to search results

#### 5. **Search History** (Optional Feature)
- Recent searches saved
- Quick re-search with one click

---

## Sales / POS Module

### Purpose
The Sales / POS module records customer purchases and deducts inventory automatically after a successful transaction. This reduces manual stock updates, improves transaction accuracy, and makes sales-based stock movement traceable.

### Standard Sales Workflow
1. **Select Customer Type**
   - Choose Walk-in Customer, Regular Customer, or Contractor / Project Buyer.

2. **Add Sold Items**
   - Select one or more inventory items.
   - Enter the quantity sold.
   - Confirm or enter the unit price.
   - If the item has a default selling price, the Unit Price is auto-filled.
   - The system prevents duplicate item lines and prevents selling more than the current stock.

3. **Record Payment Details**
   - Select the payment method: Cash, GCash, Bank Transfer, or Store Credit.
   - Enter an optional discount.
   - For cash payments, enter the amount received.
   - The system computes the change automatically.

4. **Save Sale**
   - The system validates item quantity, unit price, discount, amount received, and available stock.
   - The backend saves the sale as a database transaction.
   - Inventory is deducted automatically.
   - A stock movement is recorded as **Stock Out - Sales**.
   - The audit trail records who saved the transaction.

### Important Business Rules
- Sales require a valid unit price because totals depend on it.
- Discounts cannot be greater than the sales subtotal.
- Cash amount received must be equal to or greater than the amount due.
- Non-cash payments are recorded with zero change.
- Sales deductions are separate from non-sales Stock Out reasons such as damage, expiry, missing items, transfer, or correction.

---

## Reports Module

### Purpose
Generate comprehensive reports with advanced data analysis and efficient searching.

### Report Types:

#### 1. **Inventory Summary Report**
- Total items per branch
- Category breakdown
- Stock value calculation
- Status distribution (Available/Low/Out of Stock)

#### 2. **Stock Level Report**
- Products below the low-stock threshold
- Overstocked items
- Trending items

#### 3. **Branch Comparison Report**
- Side-by-side branch metrics
- Performance indicators
- Stock distribution

#### 4. **Custom Reports**
- Date range selection
- Custom field selection
- Filtered data reports

### Report Generation Process:

#### Step-by-Step:
1. **Select Report Type** (dropdown)
2. **Configure Parameters**
   - Date Range (From/To)
   - Branch (Manggahan / San Rafael / Both)
   - Categories (Select multiple)
   - Status filters
   
3. **Generate Report** (Click button)
   - **Algorithm Integration** 🔥:
     - **Merge Sort**: Sorts report data by selected criteria
     - **Binary Search**: Quickly locates specific date ranges or categories
     - Data aggregation and calculations
   
4. **View Report**
   - Interactive table display
   - Charts and graphs (if applicable)
   - Summary statistics
   
5. **Export Options**
   - **PDF**: Professional formatted report
   - **CSV**: Spreadsheet format
   - **Print**: Direct printing

#### Report Features:
- **Pagination**: Navigate large reports
- **Search Within Report** 🔥 **[Binary/Linear Search]**
  - Search bar to find specific entries
  - Algorithm selection based on sort state
- **Dynamic Filtering**: Real-time filter adjustments
- **Auto-Save**: Save report configurations for reuse

---

## Alerts Module

### Purpose
Real-time notifications for stock levels, system events, and important updates.

### Alert Types:

#### 1. **Low Stock Alerts**
- **Trigger**: When product quantity ≤ 20
- **Display**:
  - Product name
  - Current quantity
  - Branch
  - Suggested reorder amount
- **Actions**: Restock button (navigates to Edit Product)

#### 2. **Out of Stock Alerts**
- **Trigger**: When product quantity = 0
- **Priority**: High (Red highlighting)
- **Actions**: Immediate restock option

#### 3. **System Alerts**
- Updates and maintenance notifications
- User activity alerts (Admin only)
- Security alerts (failed login attempts)

### Alert Features:

#### 1. **Alert Dashboard**
- **Categorized Tabs**: Low Stock / Out of Stock / System / All
- **Badge Counts**: Number of unread alerts
- **Priority Sorting** 🔥 **[Merge Sort]**
  - Alerts sorted by priority (High → Medium → Low)
  - Then by date (Newest first)
  - Merge Sort ensures efficient ordering

#### 2. **Alert Search** 🔥 **[Linear Search]**
- Search alerts by product name or alert type
- Linear Search scans alert descriptions

#### 3. **Alert Actions**
- **Mark as Read**: Dismisses alert
- **Take Action**: Direct link to fix issue (e.g., restock)
- **Dismiss All**: Clear all read alerts

#### 4. **Alert Settings** (Admin)
- Configure alert thresholds
- Email notifications toggle
- Alert frequency settings

---

## Archive Module

### Purpose
View and manage soft-deleted inventory items with restoration capabilities.

### Features:

#### 1. **Archived Items View**
- **Table Display**: Similar to Inventory Module
  - Product details
  - Date archived
  - Archived by (username)
  - Reason (if provided)

#### 2. **Search Archived Items** 🔥 **[Linear Search]**
- Search bar for finding archived products
- Linear Search through archived dataset
- Filter by date range, branch, category

#### 3. **Sort Archived Items** 🔥 **[Merge Sort]**
- Sort by any column
- Date archived (most common sort)
- Merge Sort processes archived inventory

#### 4. **Restore Products**
- **Select Items**: Checkbox for bulk selection
- **Restore Button**: Returns items to active inventory
- **Confirmation Dialog**: Prevents accidental restoration
- **Process**:
  - Item removed from archive
  - Added back to main inventory
  - Status recalculated based on quantity

#### 5. **Permanent Delete** (Admin Only)
- **Hard Delete**: Permanently removes item
- **Warning Dialog**: "This action cannot be undone"
- **Confirmation Required**: Type product name to confirm

#### 6. **Export Archive**
- Export archived inventory to CSV/PDF
- Useful for record-keeping and audits

---

## User Management Module

**Access**: Admin / Manager Only

### Purpose
Manage user accounts, roles, and permissions across both branches.

### Features:

#### 1. **User List View**
- **Table Columns**:
  - Username
  - Full Name
  - Email
  - Branch
  - Role (Admin/Manager, Cashier, or Inventory Staff)
  - Status (Active/Inactive)
  - Created Date
  
- **Sorting** 🔥 **[Merge Sort]**
  - Sort by any column
  - Multi-level sorting (e.g., Branch → Role → Name)

#### 2. **Search Users** 🔥 **[Binary/Linear Search]**
- Search by username, name, or email
- Algorithm selection based on sort state
- Real-time filtering

#### 3. **Create User Account**
- Click **"Create User Account"** button
- **Form Fields**:
  - Full Name
  - Username
  - Email (format validation)
  - Branch (dropdown)
  - Role (Admin/Manager, Cashier, or Inventory Staff)
  
- **Password Setup**:
  - System generates a temporary password
  - User changes password on first login
  - **Bcrypt hashing** applied
  
- **Duplicate Prevention**:
  - Linear Search checks existing usernames
  - Email uniqueness validation

#### 4. **Edit User**
- Click **Edit** button on user row
- **Editable Fields**:
  - Full Name
  - Email
  - Branch
  - Role (Admin/Manager can change roles)
  - Status (Active/Inactive)
  
- **Password Reset**:
  - "Reset Password" button
  - User receives notification
  - Redirected to Set Password Screen on next login

#### 5. **Deactivate/Activate User**
- **Toggle Status**: Active ↔ Inactive
- **Inactive Users**:
  - Cannot log in
  - Data preserved
  - Can be reactivated anytime

#### 6. **Delete User**
- **Confirmation Dialog**: Required
- **Soft Delete**: Moved to archived users
- **Data Retention**: User's activity history preserved

#### 7. **User Activity Log** (Optional)
- View user login history
- Track actions performed
- Audit trail for compliance

---

## Maintenance Module

**Access**: Admin Only

### Purpose
System configuration, data maintenance, and administrative tools.

### Features:

#### 1. **System Settings**
- **Branch Management**:
  - Add/Edit branch details
  - Branch-specific configurations
  
- **Category Management**:
  - Add/Edit/Delete product categories
  - Category sorting 🔥 **[Merge Sort]**
  
- **Alert Thresholds**:
  - Set Low Stock threshold (default: 20)
  - Configure Out of Stock notifications

#### 2. **Database Maintenance**
- **Backup Database**:
  - Download complete system backup
  - Scheduled automatic backups
  
- **Restore Database**:
  - Upload backup file
  - Restore to previous state
  
- **Clear Archive**:
  - Permanently delete all archived items
  - **Warning**: Irreversible action

#### 3. **Data Integrity Tools**
- **Duplicate Detection** 🔥 **[Binary Search + Linear Search]**:
  - Scan inventory for duplicate Product IDs
  - Binary Search on sorted IDs for efficiency
  - Report and merge duplicates
  
- **Data Validation**:
  - Check for missing required fields
  - Identify data inconsistencies
  
- **Orphan Data Cleanup**:
  - Remove references to deleted items
  - Clean up broken relationships

#### 4. **Security Settings**
- **Password Policy**:
  - Minimum length (default: 6)
  - Complexity requirements toggle
  
- **2FA Settings**:
  - Enable/Disable 2FA globally
  - 2FA enforcement for Admins
  
- **Session Management**:
  - Session timeout duration
  - Concurrent login policy

#### 5. **System Logs**
- **Activity Logs**:
  - All user actions timestamped
  - Searchable log entries 🔥 **[Linear Search]**
  
- **Error Logs**:
  - System errors and exceptions
  - Debugging information
  
- **Export Logs**: Download as CSV for external analysis

#### 6. **Performance Monitoring**
- **Algorithm Performance**:
  - Track Merge Sort execution times
  - Binary Search vs Linear Search usage statistics
  - Bcrypt hashing performance
  
- **System Metrics**:
  - Active users count
  - Database size
  - Response times

---

## Help Module

### Purpose
Comprehensive documentation and support resources.

### Features:

#### 1. **User Documentation**
- **Getting Started Guide**: First-time user walkthrough
- **Module Guides**: Detailed instructions for each module
- **Video Tutorials**: Step-by-step video guides
- **FAQ**: Frequently asked questions

#### 2. **Search Help Articles** 🔥 **[Linear Search]**
- Search bar for finding help topics
- Linear Search through documentation
- Related articles suggestions

#### 3. **Algorithm Information**
- **Educational Content**:
  - "How Merge Sort Works"
  - "Understanding Binary Search"
  - "Why We Use Bcrypt"
  
- **Performance Explanations**:
  - Time complexity basics
  - When each algorithm is used
  - Benefits to end-users

#### 4. **Troubleshooting**
- **Common Issues**:
  - Login problems
  - Password reset
  - Data not displaying
  
- **Error Messages**: Explanations and solutions

#### 5. **Contact Support**
- **Support Form**:
  - Submit issue description
  - Attach screenshots
  - Priority selection
  
- **Contact Information**:
  - Email: support@emcayetano.com
  - Phone: [Support Number]
  - Business Hours

#### 6. **System Information**
- Current version
- Release notes
- Upcoming features
- Known issues

---

## Logging Out

### Step-by-Step:

1. **Locate Logout Button**
   - Usually in top-right corner
   - Or in user profile dropdown menu

2. **Click "Logout"**
   - Confirmation dialog may appear (optional)
   - "Are you sure you want to logout?"

3. **Session Termination**
   - User context cleared
   - Authentication tokens invalidated
   - Local data cleared

4. **Redirect to Login Screen**
   - Safely logged out
   - Can log back in anytime

### Security Note:
- Always log out on shared computers
- Session automatically expires after inactivity (configurable in Maintenance)
- Closing browser doesn't log you out (session persists)

---

## Technical Features & Algorithm Integration

### 1. Merge Sort Algorithm

**Purpose**: Efficient sorting of large datasets

**Where It's Used**:
- ✅ Inventory Module: Sorting inventory table by any column
- ✅ Reports Module: Sorting report data
- ✅ Alerts Module: Sorting alerts by priority and date
- ✅ Archive Module: Sorting archived items
- ✅ User Management: Sorting user lists
- ✅ Maintenance Module: Sorting categories and logs

**How It Works**:
```javascript
// Simplified concept:
1. Divide inventory array into two halves
2. Recursively sort each half
3. Merge sorted halves back together
4. Result: Fully sorted array

// Example with 8 items:
[38, 27, 43, 3, 9, 82, 10, 1]
         ↓ (divide)
[38, 27, 43, 3] [9, 82, 10, 1]
         ↓ (divide more)
[38, 27] [43, 3] [9, 82] [10, 1]
         ↓ (divide to single)
[38][27][43][3][9][82][10][1]
         ↓ (merge & sort)
[27,38][3,43][9,82][1,10]
         ↓ (merge & sort)
[3,27,38,43][1,9,10,82]
         ↓ (final merge)
[1,3,9,10,27,38,43,82] ✓
```

**Performance**:
- Time Complexity: O(n log n)
- Space Complexity: O(n)
- Stable sort (maintains relative order)
- Predictable performance

**User Benefits**:
- ⚡ Fast sorting even with thousands of products
- 🎯 Consistent performance
- 📊 Reliable data organization

---

### 2. Binary Search Algorithm

**Purpose**: Ultra-fast searching in sorted datasets

**Where It's Used**:
- ✅ Search Module: When inventory is sorted
- ✅ Inventory Module: Fast filtering on sorted columns
- ✅ Reports Module: Date range searches
- ✅ Maintenance Module: Duplicate detection

**How It Works**:
```javascript
// Searching for "Product-045" in sorted array:

Step 1: Check middle element
[001, 012, 023, 034, 045, 056, 067, 078, 089]
                    ↑ (middle: 045)
                 Found! ✓

// If not found, repeat in relevant half:
Searching for "078":
[001, 012, 023, 034, 045, 056, 067, 078, 089]
                    ↑ (middle: 045)
                   078 > 045, search right half
                [056, 067, 078, 089]
                      ↑ (middle: 067)
                   078 > 067, search right half
                      [078, 089]
                       ↑ (middle: 078)
                      Found! ✓
```

**Performance**:
- Time Complexity: O(log n)
- Example: Searching 1,000,000 items takes ~20 comparisons
- Space Complexity: O(1)

**Requirements**:
- ⚠️ Data MUST be sorted
- Only works on ordered datasets

**User Benefits**:
- ⚡⚡⚡ Extremely fast searches
- 💨 Instant results even with massive inventories
- 🎯 Pinpoint accuracy

---

### 3. Linear Search Algorithm

**Purpose**: Comprehensive searching in any dataset (sorted or unsorted)

**Where It's Used**:
- ✅ Search Module: When inventory is unsorted
- ✅ Inventory Module: General filtering, duplicate checking
- ✅ User Management: Username uniqueness validation
- ✅ Alerts Module: Alert searching
- ✅ Archive Module: Archived item searches
- ✅ Help Module: Documentation search

**How It Works**:
```javascript
// Searching for "Laptop" in unsorted array:
Check item 1: "Mouse" ❌
Check item 2: "Keyboard" ❌
Check item 3: "Monitor" ❌
Check item 4: "Laptop" ✓ Found!

// Continues through entire array if needed
```

**Performance**:
- Time Complexity: O(n)
- Example: Searching 1,000 items may take up to 1,000 comparisons
- Space Complexity: O(1)

**Advantages**:
- ✅ Works on any data (sorted or unsorted)
- ✅ Simple and reliable
- ✅ Finds all matches (not just first)
- ✅ No preprocessing required

**User Benefits**:
- 🔍 Comprehensive search results
- 📋 Works in all scenarios
- 🎯 Never misses a match

---

### 4. Bcrypt Password Hashing Algorithm

**Purpose**: Secure password storage and verification

**Where It's Used**:
- ✅ Admin-created accounts: Protect temporary password setup
- ✅ Login Screen: Verify entered passwords
- ✅ Set Password Screen: Hash password changes
- ✅ Forgot Password: Hash new passwords after reset
- ✅ User Management: Hash passwords for new users

**How It Works**:

**Hashing Process** (Set Password / Password Change):
```javascript
User enters: "MyPassword123"
         ↓
Bcrypt generates random salt: "$2b$10$N9qo8uLOickgx2ZMRZoMye"
         ↓
Combines salt + password
         ↓
Applies 10 rounds of hashing (2^10 = 1,024 iterations)
         ↓
Final hash: "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy"
         ↓
Stored in database
```

**Verification Process** (Login):
```javascript
User enters: "MyPassword123"
         ↓
System retrieves stored hash from database
         ↓
Bcrypt extracts salt from stored hash
         ↓
Re-hashes entered password with same salt
         ↓
Compares new hash with stored hash
         ↓
Match? → Login successful ✓
No match? → Login failed ❌
```

**Security Features**:
- 🔐 **One-way hashing**: Cannot reverse to get original password
- 🧂 **Unique salt**: Each password gets unique random salt
- ⏱️ **Computational cost**: 10 rounds makes brute-force attacks impractical
- 🛡️ **Industry standard**: Used by major platforms worldwide

**Performance**:
- Intentionally slow (security feature)
- Hashing: ~60-100ms per password
- Verification: ~60-100ms per attempt
- Protects against rapid brute-force attacks

**User Benefits**:
- 🔒 Passwords never stored in readable form
- 🛡️ Protected even if database is compromised
- 🔐 Each user's password uniquely secured
- ✅ Industry-standard security

---

## Algorithm Selection Intelligence

### Smart Algorithm Switching

The system intelligently selects the optimal algorithm based on data state:

#### Scenario 1: Sorted Inventory Search
```
User sorts inventory by Product ID (Merge Sort applied)
    ↓
User searches for "Product-045"
    ↓
System detects: Inventory is sorted by Product ID
    ↓
Uses: Binary Search (O(log n))
    ↓
Result: Ultra-fast search ⚡
```

#### Scenario 2: Unsorted Inventory Search
```
User hasn't sorted inventory
    ↓
User searches for "Laptop"
    ↓
System detects: Inventory is unsorted
    ↓
Uses: Linear Search (O(n))
    ↓
Result: Comprehensive search ✓
```

#### Scenario 3: Sorting Large Dataset
```
Inventory has 5,000 products
    ↓
User clicks "Sort by Price"
    ↓
Uses: Merge Sort (O(n log n))
    ↓
~12,000 operations (instead of 25,000,000 with bubble sort)
    ↓
Result: Sorted in milliseconds 🚀
```

---

## Performance Comparison

### Real-World Examples

**Dataset**: 10,000 products

| Operation | Algorithm | Comparisons | Time |
|-----------|-----------|-------------|------|
| Sort entire inventory | Merge Sort | ~120,000 | ~50ms |
| Sort entire inventory | Bubble Sort (not used) | ~50,000,000 | ~5000ms |
| Search sorted data | Binary Search | ~14 | <1ms |
| Search unsorted data | Linear Search | ~5,000 (avg) | ~10ms |
| Hash password | Bcrypt | 1,024 rounds | ~80ms |
| Verify password | Bcrypt | 1,024 rounds | ~80ms |

**Key Takeaways**:
- Merge Sort is **100x faster** than simple sorting algorithms
- Binary Search is **350x faster** than Linear Search (when applicable)
- Bcrypt intentionally slow for security (prevents attacks)

---

## Data Flow Example: Complete User Journey

### Scenario: Admin Adds Product, Employee Searches It

```
1. ADMIN LOGS IN
   ├─ LoginScreen: Linear Search finds admin user
   ├─ Bcrypt verifies password (80ms)
   ├─ 2FA validation
   └─ → Dashboard

2. ADMIN NAVIGATES TO INVENTORY MODULE
   ├─ Inventory data loaded
   ├─ Initial display (unsorted)
   └─ Shows 5,000 products

3. ADMIN ADDS NEW PRODUCT "Gaming Laptop XL"
   ├─ Clicks "Add Product"
   ├─ Fills form (Name, Qty: 50, Price: 45000, Branch: Manggahan)
   ├─ System checks duplicates (Linear Search through 5,000 items)
   ├─ No duplicates found
   ├─ Product added to inventory
   ├─ Status auto-set: "Available" (Qty > 20)
   └─ Success message displayed

4. ADMIN SORTS BY PRODUCT NAME
   ├─ Clicks "Product Name" column header
   ├─ Merge Sort processes 5,001 products
   ├─ ~60,000 operations in ~50ms
   └─ Inventory displayed alphabetically

5. ADMIN LOGS OUT
   └─ Session cleared

6. EMPLOYEE LOGS IN (Different Branch: San Rafael)
   ├─ LoginScreen: Linear Search finds employee user
   ├─ Bcrypt verifies password (75ms)
   ├─ 2FA validation
   └─ → Dashboard

7. EMPLOYEE NAVIGATES TO SEARCH MODULE
   └─ Empty search bar displayed

8. EMPLOYEE SEARCHES FOR "Gaming"
   ├─ Types "Gaming" in search bar
   ├─ System checks: Inventory sorted? NO (branch filter applied)
   ├─ Linear Search scans inventory
   ├─ Finds multiple matches including "Gaming Laptop XL"
   ├─ Results displayed: 12 products found
   └─ Shows products from ALL branches (or filters by San Rafael)

9. EMPLOYEE CLICKS "Gaming Laptop XL"
   ├─ Product details displayed
   ├─ Shows: Manggahan branch, Qty: 50, Price: 45000
   └─ Option to view full details

10. EMPLOYEE GENERATES REPORT
    ├─ Navigates to Reports Module
    ├─ Selects "Stock Level Report" for San Rafael
    ├─ Merge Sort arranges report data
    ├─ Binary Search finds date range
    ├─ Report generated and displayed
    └─ Export to PDF option available
```

---

## Troubleshooting Common Issues

### Login Issues

**Problem**: "Invalid username or password"
- **Cause**: Incorrect credentials or user doesn't exist
- **Solution**: 
  - Double-check username (case-sensitive)
  - Use "Forgot Password" if needed
  - Contact admin if account doesn't exist

**Problem**: 2FA code not working
- **Cause**: Code mismatch
- **Solution**: 
  - Enter the exact 6-digit code displayed
  - Check for typos
  - Code is case-sensitive (if letters included)

---

### Search Not Finding Results

**Problem**: Product exists but search doesn't find it
- **Cause**: Filters applied or typo in search term
- **Solution**:
  - Clear all filters (Branch, Category, Status)
  - Check spelling of search term
  - Try partial search (e.g., "Lap" instead of "Laptop")

**Problem**: Search is slow
- **Cause**: Large dataset with Linear Search
- **Solution**:
  - Sort inventory first (enables Binary Search)
  - Apply filters to narrow dataset
  - Contact admin if persistent

---

### Sorting Not Working

**Problem**: Clicking column header doesn't sort
- **Cause**: JavaScript disabled or browser issue
- **Solution**:
  - Refresh page (F5)
  - Clear browser cache
  - Try different browser
  - Check internet connection

---

### Password Issues

**Problem**: Can't set password (too short)
- **Cause**: Minimum 6 characters required
- **Solution**: Use password with at least 6 characters

**Problem**: Password not accepted during login
- **Cause**: Incorrect password or caps lock on
- **Solution**:
  - Check caps lock key
  - Re-type carefully
  - Use "Forgot Password" to reset

---

## Best Practices

### For Efficient Searching
1. **Sort before searching**: Enable Binary Search for speed
2. **Use specific terms**: "LAP-001" better than "laptop"
3. **Apply filters first**: Narrow dataset before searching
4. **Use wildcards wisely**: Partial terms find more results

### For Data Entry
1. **Check duplicates**: Search before adding new products
2. **Use consistent naming**: "Laptop HP 15" vs "HP 15 Laptop"
3. **Fill all fields**: Complete data improves searchability
4. **Regular updates**: Keep quantities current

### For Security
1. **Strong passwords**: Mix letters, numbers, symbols
2. **Don't share accounts**: Each user should have own login
3. **Log out on shared PCs**: Prevent unauthorized access
4. **Change passwords regularly**: Every 3-6 months
5. **Report suspicious activity**: Contact admin immediately

### For Performance
1. **Close unused tabs**: Keep one instance open
2. **Regular browser updates**: Use latest browser version
3. **Clear cache periodically**: Helps with speed
4. **Use filters**: Reduce data displayed for faster loading

---

## Keyboard Shortcuts (Optional Feature)

If implemented:
- **Ctrl + F**: Focus search bar
- **Ctrl + N**: Add new product (in Inventory)
- **Ctrl + S**: Save changes
- **Esc**: Close modal/dialog
- **Alt + L**: Logout
- **F5**: Refresh page

---

## Glossary

**Algorithm**: Step-by-step procedure for solving a problem or performing a task

**Bcrypt**: Cryptographic hashing algorithm designed for password security

**Binary Search**: Search algorithm that divides search space in half each iteration (requires sorted data)

**Branch**: Physical location of business (Manggahan or San Rafael)

**Hash**: One-way transformation of data (passwords) into fixed-length string

**Inventory**: Collection of products and stock managed by the system

**Linear Search**: Search algorithm that checks each item sequentially

**Merge Sort**: Efficient sorting algorithm using divide-and-conquer approach

**O(n)**: Big-O notation - Linear time complexity (proportional to data size)

**O(log n)**: Big-O notation - Logarithmic time complexity (very fast)

**O(n log n)**: Big-O notation - Linearithmic time complexity (efficient for sorting)

**Salt**: Random data added to passwords before hashing for added security

**Session**: Period of active user interaction with system after login

**Soft Delete**: Marking data as deleted without permanently removing it

**Two-Factor Authentication (2FA)**: Security process requiring two verification steps

**Verification**: Process of confirming password matches stored hash

---

## System Updates & Changelog

### Version 2.0 (Current - Algorithm Integration)

**New Features**:
- ✅ Merge Sort for all table sorting operations
- ✅ Binary Search for sorted dataset searches
- ✅ Linear Search for unsorted/comprehensive searches
- ✅ Bcrypt password hashing and verification
- ✅ Intelligent algorithm selection
- ✅ Performance monitoring

**Improvements**:
- 🚀 100x faster sorting vs previous version
- 🚀 350x faster searching (when sorted)
- 🔒 Enhanced password security
- 📊 Better performance with large datasets
- 🎯 More accurate search results

**Bug Fixes**:
- Fixed duplicate product entries
- Resolved slow sorting on large datasets
- Improved password validation
- Enhanced error handling

---

## Support & Contact

**Technical Support**:
- Email: support@emcayetano.com
- Phone: [Your Support Number]
- Hours: Monday-Friday, 8:00 AM - 5:00 PM

**For Issues**:
1. Check Help Module documentation
2. Review Troubleshooting section
3. Contact system administrator
4. Email technical support with:
   - Username (don't include password)
   - Issue description
   - Screenshots (if applicable)
   - Steps to reproduce

**Feature Requests**:
- Submit through Help Module feedback form
- Email: features@emcayetano.com

**Emergency Support**:
- Critical system down issues
- Data loss incidents
- Security concerns
- Phone: [Emergency Number]

---

## Conclusion

The E.M. Cayetano Trading Inventory Management System combines modern web technology with proven algorithms to deliver a fast, secure, and efficient inventory management experience. The integration of Merge Sort, Binary Search, Linear Search, and Bcrypt ensures optimal performance while maintaining data security.

**Key Benefits**:
- ⚡ Lightning-fast operations
- 🔒 Bank-level password security
- 📊 Scalable to thousands of products
- 🎯 Accurate and reliable
- 👥 User-friendly interface
- 🌐 Accessible from anywhere

Welcome to the future of inventory management!

---

**Document Version**: 2.0  
**Last Updated**: November 2, 2025  
**Prepared For**: E.M. Cayetano Trading Users  
**System Version**: 2.0 (Algorithm Integration Update)
