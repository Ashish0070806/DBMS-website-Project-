# O₂ Fitness &mdash; Enterprise Operations Terminal (INR & User Registration)

A cybernetic Gym Management Terminal and Database Suite built using **HTML5**, **CSS3**, **JavaScript**, and **MySQL** (with PHP database PDO bridge).

---

## 💎 Membership Plans & Pricing (INR ₹)

| Tier | Plan Name | Duration | Price (INR) | Inclusions & Access Privileges |
| :--- | :--- | :--- | :--- | :--- |
| **Tier 01** | **Annual Platinum Ultra** | 12 Months / Yearly (365 Days) | **₹8,999** | All club access, cold plunge, sauna, biometric scan protocol, dedicated locker storage |
| **Tier 02** | **Semi Annual Pro** | 6 Months (180 Days) | **₹4,999** | Access to weight room floor, full cardio arena privileges, & dedicated locker vaults |
| **Tier 03** | **Monthly Plus+** | Monthly (30 Days) | **₹2,999** | Standard floor access, no lockers included, no lock-in contract, auto-renews monthly |
| **Student** | **Student Membership** | 28 Days Plan | **₹899** | 28 days plan, valid student ID required, full strength floor pass, off-peak access |

---

## 👤 User Registration & Authentication (No Pre-filled Accounts)

The login screen features two modes:
1. **Log In Tab**: Log in using your registered Email Address or Account ID (`MEM-XXX` or `STF-XXX`) and security password.
2. **Create New Account Tab**:
   - Register a **New Member** (selects from the 4 INR plans: Annual Platinum Ultra, Semi Annual Pro, Monthly Plus+, Student Membership).
   - Register a **New Staff / Operator** (assigns to front desk or gym floor terminal).
   - Generates a unique ID (e.g. `MEM-101`, `STF-101`) and saves their details and password securely into the **MySQL Database** (`users`, `members`, and `staff` tables).
   - Enables immediate login with the newly created credentials!

> 🔑 **System Administrator**: Default root admin access is available via `admin@o2gym.io` / `admin123` (Identifier: `ADM-001`).

---

## 🛡️ Role-Based Access Control (RBAC) & Security Gateway

O₂ Fitness strictly enforces Role-Based Access Control across all backend endpoints, database operations, and interface views:

| Role | Target Portal | Allowed Permissions | Forbidden Operations |
| :--- | :--- | :--- | :--- |
| **`member`** | `member.html` | • **READ**: Own profile, assigned plan, and personal check-in logs<br>• **UPDATE**: Own profile details (Name, Phone, Password) | • Cannot access staff/admin terminals or operations dashboards<br>• Cannot modify plan terms, pricing, or status<br>• Cannot view other athletes' data |
| **`staff`** | `dashboard.html`<br>`staff.html` | • **READ**: Member profiles, live check-ins, subscription statuses<br>• **CREATE/WRITE**: Register new members (`member` role), authorize check-ins<br>• **UPDATE**: Member plan details, assigned coaches, and shift profile | • Cannot create, modify, or elevate accounts to `staff` or `admin`<br>• Cannot access admin root terminal (`admin.html`)<br>• Cannot modify root system configurations |
| **`admin`** | `admin.html`<br>All Portals | • **FULL ACCESS**: All database tables, user records, staff stations, and cluster health<br>• **User Role Provisioning**: Assign or revoke `member`, `staff`, or `admin` roles<br>• **System Configuration**: Security settings, audit logs, node configs | • None (Full Root Access) |

### 🔒 Elevation Prevention & Enforcement Rules:
1. **Self-Registration Constraint**: Public frontend interface (`index.html`) permits registration only for `member` and `staff`.
2. **Admin Provisioning**: The `admin` role CANNOT be self-registered or elevated from public forms; it must be provisioned by Root Admin via `api/admin.php` or seeded in MySQL.
3. **HTTP 403 Forbidden Response**: Any unauthorized access or escalation attempt is blocked and logged to `audit_logs`:
   ```json
   {
     "status": 403,
     "error": "Access Denied: You do not have the required role permissions to perform this action."
   }
   ```
4. **Client-Side Enforcer**: `rbac-guard.js` intercepts unauthorized page visits and API responses, displaying cybernetic security alerts and redirecting users to their permitted portal.

---

## 🖥️ Operations Terminal Modules

All 5 modules are tab-switchable from the sidebar:
1. **MEMBERS (Active Members Roster)**: Athletes roster, status filtering (`ALL`, `ACTIVE`, `EXPIRING`, `SUSPENDED`), search, Add Member modal with INR plans, and CSV export.
2. **ATTENDANCE (Live Attendance & Check-In Desk)**: Real-time turnstile scanner, authorize entry action, 7-day footfall chart, live turnstile verification feed.
3. **MEMBERSHIPS (Plans & Subscriptions)**: 4 Tier cards (`Annual Platinum Ultra - ₹8,999`, `Semi Annual Pro - ₹4,999`, `Monthly Plus+ - ₹2,999`, `Student Membership - ₹899`), expiring renewals queue with SMS push and one-click renewal.
4. **PAYMENTS (Financial Ledger & Billing)**: Revenue tracking in ₹ INR, daily billing velocity histogram, channel share (UPI AutoPay, RuPay/Cards POS, Cash & Net Banking), manual payment logging in ₹ INR, and CSV ledger export with IST timestamps.
5. **TRAINING (Training & Workout Plans)**: 12-Week Hypertrophy & Core Protocol, exercise execution directives with interactive checklists, certified coaches roster with live load management.

---

## 🚀 How to Run on Localhost

### Option 1: One-Click Launcher (`run_server.bat`)
1. Double-click `run_server.bat` in the project root.
2. The server will start and open automatically at:
   - **http://localhost:8000** (or `http://127.0.0.1:8000`)

### Option 2: Run via XAMPP (Apache & MySQL)
1. Ensure **Apache** and **MySQL** services are running in XAMPP Control Panel.
2. Open your web browser and navigate directly to:
   - **http://localhost/o2-gym-os/**

### Option 3: Terminal Launch with PHP
1. From the project folder in terminal:
   ```bash
   php -S 0.0.0.0:8000
   ```
2. Open **http://localhost:8000** in your web browser.

---

## 📂 Project Structure

- 🌐 **index.html** &mdash; Login & Account Registration Portal
- 🎨 **style.css** &mdash; Authentication Styling & Segmented Switch
- ⚙️ **app.js** &mdash; Registration & Login Controller
- 🖥️ **dashboard.html** &mdash; 5 Operations Modules Unified Terminal
- ⚡ **terminal.js** &mdash; Interactive Terminal Controller with INR Engine
- 🎨 **terminal.css** &mdash; Terminal Theme & Component Styling
- 🗄️ **database/o2_gym_os.sql** &mdash; MySQL Database Schema (INR Plans & Registration Tables)
- 🛡️ **rbac-guard.js** &mdash; Client-Side RBAC Enforcer & Route Gatekeeper
- 🛡️ **api/auth_guard.php** &mdash; RBAC Security Gateway Middleware
- 👑 **api/admin.php** &mdash; Admin Root Oversight & Role Provisioning API
- 🔌 **api/register.php** &mdash; User Registration Backend API (Elevation Guarded)
- 🔌 **api/login.php** &mdash; Authentication & Token Issuance Backend API
- 🔌 **api/members.php** &mdash; Member Roster API (Scoped by Role)
- 🔌 **api/checkin.php** &mdash; Turnstile Telemetry & Attendance API
- 🔌 **api/stats.php** &mdash; Metrics & Cluster Health API (Staff & Admin Only)
- 🚀 **run_server.bat** &mdash; Local server one-click launcher script
