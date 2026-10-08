<?php
/**
 * O₂ FITNESS - Member Check-in API Endpoint
 * Protected by Role-Based Access Control (RBAC)
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_guard.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Role, X-User-Identifier');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$caller = requireRole($pdo, ['admin', 'staff', 'member']);
$callerRole = strtolower($caller['role_name']);
$method = $_SERVER['REQUEST_METHOD'];

// =====================================================================
// GET: Check-in Activity Telemetry (Scoped by RBAC)
// =====================================================================
if ($method === 'GET') {
    try {
        if ($callerRole === 'member') {
            // Members can ONLY view their own checkin history
            $stmt = $pdo->prepare("
                SELECT 
                    c.id,
                    u.identifier AS member_code,
                    u.full_name AS name,
                    c.checkin_time,
                    c.locker_number AS locker,
                    t.location_name AS terminal,
                    c.status
                FROM checkins c
                JOIN members m ON c.member_id = m.id
                JOIN users u ON m.user_id = u.id
                LEFT JOIN terminals t ON c.terminal_id = t.id
                WHERE u.id = :myId
                ORDER BY c.id DESC
                LIMIT 20
            ");
            $stmt->execute([':myId' => $caller['id']]);
            $feed = $stmt->fetchAll();

            echo json_encode([
                'status' => 'success',
                'role_scope' => 'member',
                'data' => $feed
            ]);
            exit;
        }

        // Staff and Admin can view full turnstile check-in feed
        $stmt = $pdo->query("
            SELECT 
                c.id,
                u.identifier AS member_code,
                u.full_name AS name,
                c.checkin_time,
                c.locker_number AS locker,
                t.location_name AS terminal,
                c.status
            FROM checkins c
            JOIN members m ON c.member_id = m.id
            JOIN users u ON m.user_id = u.id
            LEFT JOIN terminals t ON c.terminal_id = t.id
            ORDER BY c.id DESC
            LIMIT 50
        ");
        $feed = $stmt->fetchAll();

        echo json_encode([
            'status' => 'success',
            'role_scope' => $callerRole,
            'data' => $feed
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// =====================================================================
// POST: Authorize Turnstile Entry (Admin & Staff Only)
// =====================================================================
if ($method === 'POST') {
    // Member role CANNOT authorize check-ins or scan other members
    if ($callerRole === 'member') {
        denyAccess(
            "Access Denied: You do not have the required role permissions to perform this action.",
            $pdo,
            $caller['id']
        );
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $memberCode = trim($data['member_code'] ?? '');
    $terminalCode = trim($data['terminal_code'] ?? 'TRM-01');
    $locker = trim($data['locker'] ?? 'L-' . rand(100, 399));

    if (empty($memberCode)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Member Code or Email required.']);
        exit;
    }

    try {
        // Find member
        $stmt = $pdo->prepare("
            SELECT m.id AS member_id, u.full_name, m.status, p.plan_name, m.dues_inr
            FROM members m
            JOIN users u ON m.user_id = u.id
            LEFT JOIN membership_plans p ON m.plan_id = p.id
            WHERE u.identifier = :code1 OR u.email = :code2
            LIMIT 1
        ");
        $stmt->execute([':code1' => $memberCode, ':code2' => $memberCode]);
        $member = $stmt->fetch();

        if (!$member) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => "Member '{$memberCode}' not found."]);
            exit;
        }

        if (strtoupper($member['status']) !== 'ACTIVE') {
            http_response_code(403);
            echo json_encode([
                'status' => 'error', 
                'message' => "Access Blocked: Member status is '{$member['status']}'."
            ]);
            exit;
        }

        // Find terminal
        $tStmt = $pdo->prepare("SELECT id, location_name FROM terminals WHERE terminal_code = :tcode LIMIT 1");
        $tStmt->execute([':tcode' => $terminalCode]);
        $term = $tStmt->fetch();
        $terminalId = $term ? $term['id'] : 1;

        // Insert Checkin record
        $ins = $pdo->prepare("
            INSERT INTO checkins (member_id, terminal_id, locker_number, status)
            VALUES (:mid, :tid, :locker, 'Completed')
        ");
        $ins->execute([
            ':mid' => $member['member_id'],
            ':tid' => $terminalId,
            ':locker' => $locker
        ]);

        // Update streak
        $upd = $pdo->prepare("UPDATE members SET attendance_streak = attendance_streak + 1 WHERE id = :mid");
        $upd->execute([':mid' => $member['member_id']]);

        // Audit Log
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $logStmt = $pdo->prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (:uid, :act, :ip)");
        $logStmt->execute([
            ':uid' => $caller['id'],
            ':act' => "CHECKIN: {$member['full_name']} ({$memberCode}) authorized by {$callerRole} @ {$terminalCode}",
            ':ip'  => $ip
        ]);

        echo json_encode([
            'status' => 'success',
            'message' => "Check-in Authorized! Welcome, {$member['full_name']}.",
            'details' => [
                'member_name' => $member['full_name'],
                'plan' => $member['plan_name'] ?? 'Annual Platinum Ultra',
                'locker_assigned' => $locker,
                'time' => date('Y-m-d H:i:s'),
                'terminal' => $term['location_name'] ?? 'Terminal 01'
            ]
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}
