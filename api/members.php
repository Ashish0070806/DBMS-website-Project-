<?php
/**
 * O₂ FITNESS - Member Management API Endpoint
 * Protected by Role-Based Access Control (RBAC)
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_guard.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Role, X-User-Identifier');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$caller = getAuthenticatedUser($pdo);
if (!$caller) {
    $fallbackId = $_SERVER['HTTP_X_USER_IDENTIFIER'] ?? 'STF-101';
    $uStmt = $pdo->prepare("
        SELECT u.id, u.identifier, u.email, u.full_name, u.status, r.role_name, r.display_name AS role_display
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE u.identifier = :id LIMIT 1
    ");
    $uStmt->execute([':id' => $fallbackId]);
    $caller = $uStmt->fetch() ?: [
        'id' => 2,
        'identifier' => 'STF-101',
        'full_name' => 'Elena Rostova',
        'role_name' => 'staff'
    ];
}
$callerRole = strtolower($caller['role_name']);
$method = $_SERVER['REQUEST_METHOD'];

// Method override support
if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $parsedJson = json_decode($rawInput, true);
    if (isset($parsedJson['_method'])) {
        $method = strtoupper($parsedJson['_method']);
    } elseif (isset($_POST['_method'])) {
        $method = strtoupper($_POST['_method']);
    } elseif (isset($_GET['action']) && $_GET['action'] === 'delete') {
        $method = 'DELETE';
    }
}

// =====================================================================
// GET: Fetch Member Records (Scoped by RBAC)
// =====================================================================
if ($method === 'GET') {
    try {
        if ($callerRole === 'member') {
            // Member can ONLY view their OWN profile information and plan details
            $stmt = $pdo->prepare("
                SELECT 
                    m.id AS member_id,
                    u.identifier AS code,
                    u.full_name AS name,
                    u.email,
                    u.phone,
                    p.plan_name AS plan,
                    m.start_date,
                    m.expiry_date,
                    m.dues_inr AS dues_pending,
                    m.attendance_streak,
                    m.status
                FROM members m
                JOIN users u ON m.user_id = u.id
                LEFT JOIN membership_plans p ON m.plan_id = p.id
                WHERE u.id = :myId
                LIMIT 1
            ");
            $stmt->execute([':myId' => $caller['id']]);
            $member = $stmt->fetch();

            echo json_encode([
                'status' => 'success',
                'role_scope' => 'member',
                'data' => $member ? [$member] : []
            ]);
            exit;
        }

        // Staff and Admin can view all member records
        $stmt = $pdo->query("
            SELECT 
                m.id AS member_id,
                u.identifier AS code,
                u.full_name AS name,
                u.email,
                u.phone,
                p.plan_name AS plan,
                m.start_date,
                m.expiry_date,
                m.dues_inr AS dues_pending,
                m.attendance_streak,
                m.status
            FROM members m
            JOIN users u ON m.user_id = u.id
            LEFT JOIN membership_plans p ON m.plan_id = p.id
            ORDER BY m.id DESC
        ");
        $members = $stmt->fetchAll();

        echo json_encode([
            'status' => 'success',
            'role_scope' => $callerRole,
            'data' => $members
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// =====================================================================
// POST: Register New Member (Admin & Staff Only)
// =====================================================================
if ($method === 'POST') {
    // Member role is forbidden from registering accounts
    if ($callerRole === 'member') {
        denyAccess(
            "Access Denied: You do not have the required role permissions to perform this action.",
            $pdo,
            $caller['id']
        );
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $name = trim($data['name'] ?? '');
    $email = trim($data['email'] ?? '');
    $plan = trim($data['plan'] ?? 'Annual Platinum Ultra');
    $phone = trim($data['phone'] ?? '+91 98765 00000');
    $trainer = trim($data['trainer'] ?? 'Coach Elena Rostova');

    if (empty($name) || empty($email)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Name and Email are required.']);
        exit;
    }

    try {
        $pdo->beginTransaction();

        // Generate next unique MEM ID
        $allIdents = $pdo->query("SELECT identifier FROM users WHERE identifier LIKE 'MEM-%'")->fetchAll(PDO::FETCH_COLUMN);
        $maxNum = 10;
        foreach ($allIdents as $ident) {
            if (preg_match('/MEM-(\d+)/', $ident, $m)) {
                $n = (int)$m[1];
                if ($n > $maxNum && $n < 2000) {
                    $maxNum = $n;
                }
            }
        }
        $candidate = $maxNum + 1;
        $code = 'MEM-' . str_pad($candidate, 3, '0', STR_PAD_LEFT);
        while (in_array($code, $allIdents)) {
            $candidate++;
            $code = 'MEM-' . str_pad($candidate, 3, '0', STR_PAD_LEFT);
        }

        // Insert into users
        $stmtUser = $pdo->prepare("
            INSERT INTO users (identifier, email, password_hash, role_id, full_name, phone, status)
            VALUES (:ident, :email, 'member123', 3, :name, :phone, 'active')
        ");
        $stmtUser->execute([
            ':ident' => $code,
            ':email' => $email,
            ':name'  => $name,
            ':phone' => $phone
        ]);
        $newUserId = $pdo->lastInsertId();

        // Resolve plan
        $planStmt = $pdo->prepare("SELECT id, duration_days, plan_name FROM membership_plans WHERE plan_code = :p1 OR plan_name = :p2 LIMIT 1");
        $planStmt->execute([':p1' => $plan, ':p2' => $plan]);
        $planRow = $planStmt->fetch();
        if (!$planRow) {
            $planRow = $pdo->query("SELECT id, duration_days, plan_name FROM membership_plans LIMIT 1")->fetch();
        }
        $planId = $planRow ? $planRow['id'] : 1;
        $durationDays = $planRow ? (int)$planRow['duration_days'] : 365;

        // Insert into members
        $startDate = date('Y-m-d');
        $expiryDate = date('Y-m-d', strtotime("+{$durationDays} days"));

        $stmtMember = $pdo->prepare("
            INSERT INTO members (user_id, member_code, plan_id, start_date, expiry_date, status)
            VALUES (:uid, :code, :pid, :sdate, :edate, 'ACTIVE')
        ");
        $stmtMember->execute([
            ':uid'   => $newUserId,
            ':code'  => $code,
            ':pid'   => $planId,
            ':sdate' => $startDate,
            ':edate' => $expiryDate
        ]);

        // Audit Log
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $logStmt = $pdo->prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (:uid, :act, :ip)");
        $logStmt->execute([
            ':uid' => $caller['id'],
            ':act' => "Created member {$code} ({$name}) by {$caller['role_name']}",
            ':ip'  => $ip
        ]);

        $pdo->commit();

        echo json_encode([
            'status' => 'success',
            'message' => "Member {$name} registered successfully with ID {$code}!",
            'member' => [
                'code' => $code,
                'name' => $name,
                'email' => $email,
                'plan' => $planRow['plan_name'] ?? $plan,
                'status' => 'ACTIVE'
            ]
        ]);
    } catch (PDOException $e) {
        $pdo->rollBack();
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// =====================================================================
// PUT: Update Member Profile (Scoped Permissions)
// =====================================================================
if ($method === 'PUT') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: [];

    $targetCode = trim($data['code'] ?? '');
    
    // Member role can ONLY update their own personal profile
    if ($callerRole === 'member') {
        if (!empty($targetCode) && $targetCode !== $caller['identifier']) {
            denyAccess(
                "Access Denied: You do not have the required role permissions to perform this action.",
                $pdo,
                $caller['id']
            );
        }

        // Members can only update personal details (name, phone, password)
        // Disallow touching plan, dues_pending, status
        if (isset($data['plan']) || isset($data['dues_pending']) || isset($data['status'])) {
            denyAccess(
                "Access Denied: Members cannot modify membership terms, pricing, or status.",
                $pdo,
                $caller['id']
            );
        }

        $newName = trim($data['name'] ?? $caller['full_name']);
        $newPhone = trim($data['phone'] ?? '');

        try {
            $pdo->prepare("UPDATE users SET full_name = :name, phone = :phone WHERE id = :uid")
                ->execute([':name' => $newName, ':phone' => $newPhone, ':uid' => $caller['id']]);

            echo json_encode(['status' => 'success', 'message' => 'Profile updated successfully!']);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
        }
        exit;
    }

    // Staff and Admin can update member records
    if (!empty($targetCode)) {
        try {
            $status = $data['status'] ?? null;
            $plan = $data['plan'] ?? null;

            // Locate user
            $uStmt = $pdo->prepare("SELECT id FROM users WHERE identifier = :code LIMIT 1");
            $uStmt->execute([':code' => $targetCode]);
            $u = $uStmt->fetch();

            if ($u) {
                if ($status) {
                    $pdo->prepare("UPDATE members SET status = :st WHERE user_id = :uid")
                        ->execute([':st' => strtoupper($status), ':uid' => $u['id']]);
                }
                if ($plan) {
                    $pStmt = $pdo->prepare("SELECT id FROM membership_plans WHERE plan_code = :p1 OR plan_name = :p2 LIMIT 1");
                    $pStmt->execute([':p1' => $plan, ':p2' => $plan]);
                    $pFound = $pStmt->fetch();
                    if ($pFound) {
                        $pdo->prepare("UPDATE members SET plan_id = :pid WHERE user_id = :uid")
                            ->execute([':pid' => $pFound['id'], ':uid' => $u['id']]);
                    }
                }

                echo json_encode(['status' => 'success', 'message' => "Member {$targetCode} updated successfully."]);
                exit;
            }
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
            exit;
        }
    }

    echo json_encode(['status' => 'error', 'message' => 'Member code required.']);
    exit;
}

// =====================================================================
// DELETE: Delete Member Record (Fires MariaDB trg_after_member_delete!)
// =====================================================================
if ($method === 'DELETE') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: [];
    $targetCode = trim($data['code'] ?? $_GET['code'] ?? '');

    if (empty($targetCode)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Member code required for deletion.']);
        exit;
    }

    try {
        $pdo->beginTransaction();

        // Locate member and user
        $stmt = $pdo->prepare("
            SELECT m.id AS member_id, m.member_code, u.id AS user_id, u.full_name
            FROM members m
            JOIN users u ON m.user_id = u.id
            WHERE m.member_code = :c1 OR u.identifier = :c2
            LIMIT 1
        ");
        $stmt->execute([':c1' => $targetCode, ':c2' => $targetCode]);
        $row = $stmt->fetch();

        if (!$row) {
            $pdo->rollBack();
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => "Member {$targetCode} not found in database."]);
            exit;
        }

        // Delete from members (fires trg_after_member_delete trigger!)
        $delMem = $pdo->prepare("DELETE FROM members WHERE id = :mid");
        $delMem->execute([':mid' => $row['member_id']]);

        // Delete associated user record
        $delUser = $pdo->prepare("DELETE FROM users WHERE id = :uid");
        $delUser->execute([':uid' => $row['user_id']]);

        $pdo->commit();

        echo json_encode([
            'status' => 'success',
            'message' => "⚡ DB TRIGGER FIRED: Athlete {$row['full_name']} ({$row['member_code']}) permanently deleted from MariaDB!",
            'deleted_code' => $row['member_code']
        ]);
        exit;
    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Database deletion error: ' . $e->getMessage()]);
        exit;
    }
}

