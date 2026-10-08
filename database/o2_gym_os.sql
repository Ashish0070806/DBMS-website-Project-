-- =====================================================================
-- O₂ FITNESS - ENTERPRISE DATABASE SCHEMA & REACTIVE TRIGGERS
-- =====================================================================

CREATE DATABASE IF NOT EXISTS o2_gym_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE o2_gym_db;

DROP TABLE IF EXISTS db_events;
DROP TABLE IF EXISTS checkins;
DROP TABLE IF EXISTS attendance;
DROP TABLE IF EXISTS transactions;
DROP TABLE IF EXISTS audit_logs;
DROP TABLE IF EXISTS members;
DROP TABLE IF EXISTS staff;
DROP TABLE IF EXISTS terminals;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS membership_plans;
DROP TABLE IF EXISTS roles;

-- ---------------------------------------------------------------------
-- 1. Table: roles
-- ---------------------------------------------------------------------
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    role_name VARCHAR(50) NOT NULL UNIQUE,
    display_name VARCHAR(100) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO roles (id, role_name, display_name, description) VALUES
(1, 'admin', 'System Administrator / Root Access', 'Complete system administration and cluster control'),
(2, 'staff', 'Staff Account / Operations Terminal', 'Full floor operations, attendance, payments, and member control'),
(3, 'member', 'Member / Client Portal', 'Self-service athlete profile, workout schedules and billing');

-- ---------------------------------------------------------------------
-- 2. Table: membership_plans (Configured in INR ₹)
-- ---------------------------------------------------------------------
CREATE TABLE membership_plans (
    id INT AUTO_INCREMENT PRIMARY KEY,
    plan_code VARCHAR(50) NOT NULL UNIQUE,
    plan_name VARCHAR(100) NOT NULL,
    tier_label VARCHAR(50) NOT NULL,
    duration_days INT NOT NULL,
    billing_period VARCHAR(50) NOT NULL,
    price_inr DECIMAL(10,2) NOT NULL,
    description TEXT,
    features JSON,
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO membership_plans (id, plan_code, plan_name, tier_label, duration_days, billing_period, price_inr, description, features) VALUES
(1, 'PL-001', 'Annual Platinum Ultra', 'TIER 01', 365, '12 MONTHS / YEARLY', 8999.00, 'All Club Access + Thermal Recovery Zone + Guest Pass Unlocks', '["All Club Access", "Cold Plunge & Sauna", "Biometric Scan Protocol", "Locker Access Included"]'),
(2, 'PL-002', 'Semi Annual Pro', 'TIER 02', 180, '6 MONTHS', 4999.00, 'Access to weight room, cardio arena, & locker vaults', '["Weight Room Access", "Cardio Arena Access", "Dedicated Locker Access"]'),
(3, 'PL-003', 'Monthly Plus+', 'TIER 03', 30, 'MONTHLY', 2999.00, 'Standard access no lockers with no lock-in auto renews monthly', '["Standard Floor Access", "No Lock-in Contract", "Auto-renews Monthly", "No Lockers Included"]'),
(4, 'PL-004', 'Student Membership', 'STUDENT', 28, '28 DAYS PLAN', 899.00, 'Student membership valid for 28 days with full strength floor pass', '["28 Days Plan", "Valid Student ID Required", "Full Strength Floor Pass", "Off-Peak & Weekend Access"]');

-- ---------------------------------------------------------------------
-- 3. Table: users
-- ---------------------------------------------------------------------
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    identifier VARCHAR(50) NOT NULL UNIQUE COMMENT 'STF-XXX, ADM-XXX, or MEM-XXX',
    email VARCHAR(100) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role_id INT NOT NULL,
    full_name VARCHAR(100) NOT NULL,
    phone VARCHAR(30) DEFAULT NULL,
    avatar_url VARCHAR(255) DEFAULT NULL,
    status ENUM('active', 'inactive', 'suspended') DEFAULT 'active',
    last_login DATETIME NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (role_id) REFERENCES roles(id) ON UPDATE CASCADE ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed Users: Root Admin, Staff, and All Core Athletes
INSERT INTO users (id, identifier, email, password_hash, role_id, full_name, phone, status) VALUES
(1, 'ADM-001', 'admin@o2gym.io', 'admin123', 1, 'System Administrator', '+91 98765 43210', 'active'),
(2, 'STF-101', 'alex.morgan@o2gym.io', 'staffpass123', 2, 'Alex Morgan', '+91 98765 11111', 'active'),
(3, 'MEM-2041', 'marcus.v@crossgrid.io', 'member123', 3, 'Marcus Vance', '+91 98765 43210', 'active'),
(4, 'MEM-2042', 'elena.barbell@kinetic.net', 'member123', 3, 'Elena Rostova', '+91 98765 43212', 'active'),
(5, 'MEM-2043', 'tariq.m@pulseops.com', 'member123', 3, 'Tariq Al-Mansoor', '+91 98765 43214', 'active'),
(6, 'MEM-2044', 'zhao.power@apex.fit', 'member123', 3, 'Chloe Zhao', '+91 98765 43215', 'active'),
(7, 'MEM-2045', 'jax.reid@ironhold.net', 'member123', 3, 'Jackson Reid', '+91 98765 43217', 'suspended'),
(8, 'MEM-2046', 'ksen.biometrics@vortex.org', 'member123', 3, 'Kavita Sen', '+91 98765 43219', 'active');

-- ---------------------------------------------------------------------
-- 4. Table: staff
-- ---------------------------------------------------------------------
CREATE TABLE staff (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    department VARCHAR(50) NOT NULL DEFAULT 'Front-Desk Operations',
    station_name VARCHAR(100) NOT NULL DEFAULT 'Front-Desk Terminal 01',
    shift VARCHAR(50) DEFAULT 'Morning Shift (06:00 - 14:00)',
    status ENUM('On Duty', 'Off Duty', 'On Leave') DEFAULT 'On Duty',
    hire_date DATE DEFAULT (CURRENT_DATE),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO staff (user_id, department, station_name, shift, status) VALUES
(2, 'Front-Desk Operations', 'Terminal 01: Turnstile Main Gate', 'Morning Shift (06:00 - 14:00)', 'On Duty');

-- ---------------------------------------------------------------------
-- 5. Table: members
-- ---------------------------------------------------------------------
CREATE TABLE members (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL UNIQUE,
    member_code VARCHAR(50) NOT NULL UNIQUE,
    plan_id INT NOT NULL,
    emergency_contact VARCHAR(120) DEFAULT 'Not Specified',
    dob DATE DEFAULT '1998-01-01',
    gender ENUM('MALE', 'FEMALE', 'OTHER') DEFAULT 'MALE',
    start_date DATE NOT NULL,
    expiry_date DATE NOT NULL,
    dues_inr DECIMAL(10,2) DEFAULT 0.00,
    attendance_streak INT DEFAULT 0,
    status ENUM('ACTIVE', 'EXPIRING', 'SUSPENDED') DEFAULT 'ACTIVE',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (plan_id) REFERENCES membership_plans(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO members (user_id, member_code, plan_id, emergency_contact, dob, gender, start_date, expiry_date, dues_inr, attendance_streak, status) VALUES
(3, 'MEM-2041', 1, 'Sarah Vance (Spouse) • 98765 43211', '1992-04-12', 'MALE', '2026-01-14', '2027-01-14', 0.00, 18, 'ACTIVE'),
(4, 'MEM-2042', 1, 'Dmitri Rostov (Bro) • 98765 43213', '1996-09-28', 'FEMALE', '2026-03-22', '2027-03-22', 0.00, 24, 'ACTIVE'),
(5, 'MEM-2043', 4, 'Farida Mansoor (Mother)', '1989-11-05', 'MALE', '2026-09-10', '2026-10-15', 899.00, 5, 'EXPIRING'),
(6, 'MEM-2044', 2, 'Kevin Zhao (Parent) • 98765 43216', '2001-02-17', 'FEMALE', '2026-06-01', '2026-12-01', 0.00, 12, 'ACTIVE'),
(7, 'MEM-2045', 3, 'Amanda Reid • 98765 43218', '1985-07-19', 'MALE', '2026-07-19', '2026-08-19', 2999.00, 0, 'SUSPENDED'),
(8, 'MEM-2046', 1, 'Rahul Sen (Brother)', '1998-12-03', 'FEMALE', '2026-03-18', '2027-03-18', 0.00, 9, 'ACTIVE');

-- ---------------------------------------------------------------------
-- 6. Table: terminals
-- ---------------------------------------------------------------------
CREATE TABLE terminals (
    id INT AUTO_INCREMENT PRIMARY KEY,
    terminal_code VARCHAR(50) NOT NULL UNIQUE,
    location_name VARCHAR(100) NOT NULL,
    ip_address VARCHAR(45) DEFAULT '127.0.0.1',
    status ENUM('Active', 'Offline', 'Maintenance') DEFAULT 'Active'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO terminals (terminal_code, location_name, status) VALUES
('TRM-01', 'Terminal 01: Turnstile Main Gate', 'Active'),
('TRM-02', 'Terminal 02: North Wing Express', 'Active');

-- ---------------------------------------------------------------------
-- 7. Table: checkins & attendance
-- ---------------------------------------------------------------------
CREATE TABLE checkins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    member_id INT NOT NULL,
    terminal_id INT DEFAULT 1,
    locker_number VARCHAR(50) DEFAULT 'L-101',
    checkin_time DATETIME DEFAULT CURRENT_TIMESTAMP,
    status VARCHAR(50) DEFAULT 'Completed',
    FOREIGN KEY (member_id) REFERENCES members(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO checkins (member_id, terminal_id, locker_number, checkin_time, status) VALUES
(1, 1, 'L-101', DATE_SUB(NOW(), INTERVAL 45 MINUTE), 'Active'),
(2, 1, 'L-102', DATE_SUB(NOW(), INTERVAL 75 MINUTE), 'Completed'),
(4, 2, 'L-103', DATE_SUB(NOW(), INTERVAL 120 MINUTE), 'Completed'),
(6, 1, 'L-104', DATE_SUB(NOW(), INTERVAL 180 MINUTE), 'Completed');

-- ---------------------------------------------------------------------
-- 8. Table: transactions (INR Financial Ledger)
-- ---------------------------------------------------------------------
CREATE TABLE transactions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    txn_ref VARCHAR(50) NOT NULL UNIQUE,
    user_id INT NOT NULL,
    plan_name VARCHAR(100) NOT NULL,
    payment_method VARCHAR(50) NOT NULL,
    amount_inr DECIMAL(10,2) NOT NULL,
    timestamp_ist DATETIME DEFAULT CURRENT_TIMESTAMP,
    status ENUM('CLEARED', 'PENDING', 'FAILED') DEFAULT 'CLEARED',
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

INSERT INTO transactions (txn_ref, user_id, plan_name, payment_method, amount_inr, timestamp_ist, status) VALUES
('TXN-884912', 3, 'Annual Platinum Ultra (₹8,999)', 'UPI / PhonePe AutoPay', 8999.00, DATE_SUB(NOW(), INTERVAL 2 HOUR), 'CLEARED'),
('TXN-884911', 4, 'Annual Platinum Ultra (₹8,999)', 'RuPay Card •••• 1092', 8999.00, DATE_SUB(NOW(), INTERVAL 4 HOUR), 'CLEARED'),
('TXN-884910', 6, 'Semi Annual Pro (₹4,999)', 'UPI / Razorpay (Desk-02)', 4999.00, DATE_SUB(NOW(), INTERVAL 6 HOUR), 'CLEARED'),
('TXN-884909', 8, 'Annual Platinum Ultra (₹8,999)', 'Net Banking (HDFC Bank)', 8999.00, DATE_SUB(NOW(), INTERVAL 1 DAY), 'CLEARED');

-- ---------------------------------------------------------------------
-- 9. Table: audit_logs
-- ---------------------------------------------------------------------
CREATE TABLE audit_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NULL,
    action VARCHAR(255) NOT NULL,
    ip_address VARCHAR(45) DEFAULT '127.0.0.1',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------
-- 10. Table: db_events (Real-Time Reactive UI Change Stream)
-- ---------------------------------------------------------------------
CREATE TABLE db_events (
    id INT AUTO_INCREMENT PRIMARY KEY,
    event_type VARCHAR(50) NOT NULL,
    table_name VARCHAR(50) NOT NULL,
    record_id INT NULL,
    message VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- DATABASE TRIGGERS (Automated Business Logic & Reactive Events)
-- =====================================================================

-- Trigger 1: Automatically log audit record and fire reactive event on Member Insertion
DROP TRIGGER IF EXISTS trg_after_member_insert;
DELIMITER //
CREATE TRIGGER trg_after_member_insert
AFTER INSERT ON members
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (user_id, action, ip_address, created_at)
    VALUES (NEW.user_id, CONCAT('DB TRIGGER [MEMBER_ENROLLED]: New athlete ', NEW.member_code, ' enrolled (Plan ID: ', NEW.plan_id, ')'), '127.0.0.1', NOW());

    INSERT INTO db_events (event_type, table_name, record_id, message)
    VALUES ('INSERT', 'members', NEW.id, CONCAT('Athlete enrolled: ', NEW.member_code));
END//
DELIMITER ;

-- Trigger 2: Automatically audit status/plan transitions and notify UI
DROP TRIGGER IF EXISTS trg_after_member_update;
DELIMITER //
CREATE TRIGGER trg_after_member_update
AFTER UPDATE ON members
FOR EACH ROW
BEGIN
    IF OLD.status <> NEW.status OR OLD.plan_id <> NEW.plan_id OR OLD.dues_inr <> NEW.dues_inr THEN
        INSERT INTO audit_logs (user_id, action, ip_address, created_at)
        VALUES (NEW.user_id, CONCAT('DB TRIGGER [MEMBER_UPDATED]: ', NEW.member_code, ' status changed from ', OLD.status, ' to ', NEW.status, ' (Dues: ₹', NEW.dues_inr, ')'), '127.0.0.1', NOW());

        INSERT INTO db_events (event_type, table_name, record_id, message)
        VALUES ('UPDATE', 'members', NEW.id, CONCAT('Athlete updated: ', NEW.member_code, ' -> ', NEW.status));
    END IF;
END//
DELIMITER ;

-- Trigger 3: Automatically increment streak on check-in and notify UI
DROP TRIGGER IF EXISTS trg_after_checkin_insert;
DELIMITER //
CREATE TRIGGER trg_after_checkin_insert
AFTER INSERT ON checkins
FOR EACH ROW
BEGIN
    UPDATE members 
    SET attendance_streak = attendance_streak + 1 
    WHERE id = NEW.member_id;

    INSERT INTO audit_logs (user_id, action, ip_address, created_at)
    SELECT m.user_id, CONCAT('DB TRIGGER [CHECKIN_LOGGED]: Turnstile access granted for ', m.member_code, ' (Locker: ', NEW.locker_number, ')'), '127.0.0.1', NOW()
    FROM members m WHERE m.id = NEW.member_id;

    INSERT INTO db_events (event_type, table_name, record_id, message)
    VALUES ('INSERT', 'checkins', NEW.id, CONCAT('Turnstile entry registered for Member ID: ', NEW.member_id));
END//
DELIMITER ;

-- Trigger 4: Automatically settle dues, activate member, and audit transaction
DROP TRIGGER IF EXISTS trg_after_transaction_insert;
DELIMITER //
CREATE TRIGGER trg_after_transaction_insert
AFTER INSERT ON transactions
FOR EACH ROW
BEGIN
    IF NEW.status = 'CLEARED' THEN
        UPDATE members 
        SET dues_inr = GREATEST(0.00, dues_inr - NEW.amount_inr),
            status = 'ACTIVE'
        WHERE user_id = NEW.user_id;
    END IF;

    INSERT INTO audit_logs (user_id, action, ip_address, created_at)
    VALUES (NEW.user_id, CONCAT('DB TRIGGER [PAYMENT_SETTLED]: Txn Ref ', NEW.txn_ref, ' cleared ₹', NEW.amount_inr, ' via ', NEW.payment_method), '127.0.0.1', NOW());

    INSERT INTO db_events (event_type, table_name, record_id, message)
    VALUES ('INSERT', 'transactions', NEW.id, CONCAT('Payment cleared: ', NEW.txn_ref, ' (₹', NEW.amount_inr, ')'));
END//
DELIMITER ;

-- Trigger 5: Audit member deletion and fire reactive event
DROP TRIGGER IF EXISTS trg_after_member_delete;
DELIMITER //
CREATE TRIGGER trg_after_member_delete
AFTER DELETE ON members
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (user_id, action, ip_address, created_at)
    VALUES (NULL, CONCAT('DB TRIGGER [MEMBER_DELETED]: Removed athlete ', OLD.member_code), '127.0.0.1', NOW());

    INSERT INTO db_events (event_type, table_name, record_id, message)
    VALUES ('DELETE', 'members', OLD.id, CONCAT('Athlete removed: ', OLD.member_code));
END//
DELIMITER ;

-- Trigger 6: Audit new membership plan creation and push reactive event to UI
DROP TRIGGER IF EXISTS trg_after_plan_insert;
DELIMITER //
CREATE TRIGGER trg_after_plan_insert
AFTER INSERT ON membership_plans
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (user_id, action, ip_address, created_at)
    VALUES (NULL, CONCAT('DB TRIGGER [PLAN_CREATED]: New tier ', NEW.plan_code, ' (', NEW.plan_name, ' - ₹', NEW.price_inr, ')'), '127.0.0.1', NOW());

    INSERT INTO db_events (event_type, table_name, record_id, message)
    VALUES ('INSERT', 'membership_plans', NEW.id, CONCAT('Plan added: ', NEW.plan_name, ' (', NEW.plan_code, ')'));
END//
DELIMITER ;

-- Trigger 7: Audit membership plan updates and notify reactive change stream
DROP TRIGGER IF EXISTS trg_after_plan_update;
DELIMITER //
CREATE TRIGGER trg_after_plan_update
AFTER UPDATE ON membership_plans
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (user_id, action, ip_address, created_at)
    VALUES (NULL, CONCAT('DB TRIGGER [PLAN_UPDATED]: Tier ', NEW.plan_code, ' (', NEW.plan_name, ') price ₹', OLD.price_inr, ' -> ₹', NEW.price_inr), '127.0.0.1', NOW());

    INSERT INTO db_events (event_type, table_name, record_id, message)
    VALUES ('UPDATE', 'membership_plans', NEW.id, CONCAT('Plan updated: ', NEW.plan_name, ' (₹', NEW.price_inr, ')'));
END//
DELIMITER ;

-- Trigger 8: Audit membership plan deletion and notify reactive change stream
DROP TRIGGER IF EXISTS trg_after_plan_delete;
DELIMITER //
CREATE TRIGGER trg_after_plan_delete
AFTER DELETE ON membership_plans
FOR EACH ROW
BEGIN
    INSERT INTO audit_logs (user_id, action, ip_address, created_at)
    VALUES (NULL, CONCAT('DB TRIGGER [PLAN_DELETED]: Removed tier ', OLD.plan_code, ' (', OLD.plan_name, ')'), '127.0.0.1', NOW());

    INSERT INTO db_events (event_type, table_name, record_id, message)
    VALUES ('DELETE', 'membership_plans', OLD.id, CONCAT('Plan removed: ', OLD.plan_code));
END//
DELIMITER ;

