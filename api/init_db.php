<?php
/**
 * O2 GYM OS - Database Migration & Trigger Installer
 */
require_once __DIR__ . '/db.php';

try {
    $sql = file_get_contents(__DIR__ . '/../database/o2_gym_os.sql');

    // Split on DELIMITER blocks or execute cleanly
    // Replace DELIMITER // syntax for PDO execution
    $triggers = [
        "DROP TRIGGER IF EXISTS trg_after_member_insert",
        "CREATE TRIGGER trg_after_member_insert
        AFTER INSERT ON members
        FOR EACH ROW
        BEGIN
            INSERT INTO audit_logs (user_id, action, ip_address, created_at)
            VALUES (NEW.user_id, CONCAT('DB TRIGGER [MEMBER_ENROLLED]: New athlete ', NEW.member_code, ' enrolled (Plan ID: ', NEW.plan_id, ')'), '127.0.0.1', NOW());

            INSERT INTO db_events (event_type, table_name, record_id, message)
            VALUES ('INSERT', 'members', NEW.id, CONCAT('Athlete enrolled: ', NEW.member_code));
        END",

        "DROP TRIGGER IF EXISTS trg_after_member_update",
        "CREATE TRIGGER trg_after_member_update
        AFTER UPDATE ON members
        FOR EACH ROW
        BEGIN
            IF OLD.status <> NEW.status OR OLD.plan_id <> NEW.plan_id OR OLD.dues_inr <> NEW.dues_inr THEN
                INSERT INTO audit_logs (user_id, action, ip_address, created_at)
                VALUES (NEW.user_id, CONCAT('DB TRIGGER [MEMBER_UPDATED]: ', NEW.member_code, ' status changed from ', OLD.status, ' to ', NEW.status, ' (Dues: ₹', NEW.dues_inr, ')'), '127.0.0.1', NOW());

                INSERT INTO db_events (event_type, table_name, record_id, message)
                VALUES ('UPDATE', 'members', NEW.id, CONCAT('Athlete updated: ', NEW.member_code, ' -> ', NEW.status));
            END IF;
        END",

        "DROP TRIGGER IF EXISTS trg_after_checkin_insert",
        "CREATE TRIGGER trg_after_checkin_insert
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
        END",

        "DROP TRIGGER IF EXISTS trg_after_transaction_insert",
        "CREATE TRIGGER trg_after_transaction_insert
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
        END",

        "DROP TRIGGER IF EXISTS trg_after_member_delete",
        "CREATE TRIGGER trg_after_member_delete
        AFTER DELETE ON members
        FOR EACH ROW
        BEGIN
            INSERT INTO audit_logs (user_id, action, ip_address, created_at)
            VALUES (NULL, CONCAT('DB TRIGGER [MEMBER_DELETED]: Removed athlete ', OLD.member_code), '127.0.0.1', NOW());

            INSERT INTO db_events (event_type, table_name, record_id, message)
            VALUES ('DELETE', 'members', OLD.id, CONCAT('Athlete removed: ', OLD.member_code));
        END",

        "DROP TRIGGER IF EXISTS trg_after_plan_insert",
        "CREATE TRIGGER trg_after_plan_insert
        AFTER INSERT ON membership_plans
        FOR EACH ROW
        BEGIN
            INSERT INTO audit_logs (user_id, action, ip_address, created_at)
            VALUES (NULL, CONCAT('DB TRIGGER [PLAN_CREATED]: New tier ', NEW.plan_code, ' (', NEW.plan_name, ' - ₹', NEW.price_inr, ')'), '127.0.0.1', NOW());

            INSERT INTO db_events (event_type, table_name, record_id, message)
            VALUES ('INSERT', 'membership_plans', NEW.id, CONCAT('Plan added: ', NEW.plan_name, ' (', NEW.plan_code, ')'));
        END",

        "DROP TRIGGER IF EXISTS trg_after_plan_update",
        "CREATE TRIGGER trg_after_plan_update
        AFTER UPDATE ON membership_plans
        FOR EACH ROW
        BEGIN
            INSERT INTO audit_logs (user_id, action, ip_address, created_at)
            VALUES (NULL, CONCAT('DB TRIGGER [PLAN_UPDATED]: Tier ', NEW.plan_code, ' (', NEW.plan_name, ') price ₹', OLD.price_inr, ' -> ₹', NEW.price_inr), '127.0.0.1', NOW());

            INSERT INTO db_events (event_type, table_name, record_id, message)
            VALUES ('UPDATE', 'membership_plans', NEW.id, CONCAT('Plan updated: ', NEW.plan_name, ' (₹', NEW.price_inr, ')'));
        END",

        "DROP TRIGGER IF EXISTS trg_after_plan_delete",
        "CREATE TRIGGER trg_after_plan_delete
        AFTER DELETE ON membership_plans
        FOR EACH ROW
        BEGIN
            INSERT INTO audit_logs (user_id, action, ip_address, created_at)
            VALUES (NULL, CONCAT('DB TRIGGER [PLAN_DELETED]: Removed tier ', OLD.plan_code, ' (', OLD.plan_name, ')'), '127.0.0.1', NOW());

            INSERT INTO db_events (event_type, table_name, record_id, message)
            VALUES ('DELETE', 'membership_plans', OLD.id, CONCAT('Plan removed: ', OLD.plan_code));
        END"
    ];

    // Remove trigger sections from raw SQL for standard multi-query execution
    $baseSql = preg_replace('/DELIMITER[\s\S]*?DELIMITER ;/i', '', $sql);
    
    // Remove comments
    $cleanSql = preg_replace('/--.*$/m', '', $baseSql);
    $cleanSql = preg_replace('/\/\*[\s\S]*?\*\//m', '', $cleanSql);
    
    // Split and execute statements
    $statements = array_filter(array_map('trim', explode(';', $cleanSql)));
    foreach ($statements as $stmt) {
        if (!empty($stmt)) {
            $pdo->exec($stmt);
        }
    }

    // Execute triggers individually
    foreach ($triggers as $trg) {
        $pdo->exec($trg);
    }

    echo json_encode([
        'status' => 'success',
        'message' => 'Database tables, sample records, and 8 reactive triggers deployed successfully!'
    ], JSON_PRETTY_PRINT);

} catch (Exception $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => $e->getMessage()
    ], JSON_PRETTY_PRINT);
}
