<?php
/**
 * O₂ FITNESS - Admin Root Control & Role Provisioning API
 * Accessible ONLY to users with 'admin' role.
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_guard.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Role, X-User-Identifier');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// RBAC STRICT ENFORCEMENT: Root Administrator Role ONLY
$caller = requireRole($pdo, ['admin']);

$method = $_SERVER['REQUEST_METHOD'];

// =====================================================================
// GET: Admin Oversight Queries
// =====================================================================
if ($method === 'GET') {
    $action = trim($_GET['action'] ?? 'users');

    try {
        if ($action === 'logs') {
            // Security & Audit Incident Logs
            $stmt = $pdo->query("
                SELECT a.id, a.user_id, u.identifier, u.full_name, a.action, a.ip_address, a.created_at
                FROM audit_logs a
                LEFT JOIN users u ON a.user_id = u.id
                ORDER BY a.id DESC
                LIMIT 100
            ");
            $logs = $stmt->fetchAll();

            echo json_encode([
                'status' => 'success',
                'action' => 'logs',
                'data' => $logs
            ]);
            exit;
        }

        if ($action === 'roles') {
            // System Role Catalog
            $stmt = $pdo->query("SELECT id, role_name, display_name, description FROM roles ORDER BY id ASC");
            $roles = $stmt->fetchAll();

            echo json_encode([
                'status' => 'success',
                'action' => 'roles',
                'data' => $roles
            ]);
            exit;
        }

        // Default: List All Users & Account Scopes
        $stmt = $pdo->query("
            SELECT 
                u.id, 
                u.identifier, 
                u.email, 
                u.full_name, 
                u.phone, 
                r.role_name, 
                r.display_name AS role_display, 
                u.status, 
                u.last_login, 
                u.created_at
            FROM users u
            JOIN roles r ON u.role_id = r.id
            ORDER BY u.id DESC
        ");
        $users = $stmt->fetchAll();

        echo json_encode([
            'status' => 'success',
            'action' => 'users',
            'data' => $users
        ]);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// =====================================================================
// POST: Role Provisioning & Security Enforcement
// =====================================================================
if ($method === 'POST') {
    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;
    $action = trim($data['action'] ?? '');

    try {
        if ($action === 'provision_role') {
            // Admin Role Provisioning: Assign member, staff, or admin
            $userId = (int)($data['user_id'] ?? 0);
            $newRoleName = strtolower(trim($data['new_role'] ?? ''));

            $rStmt = $pdo->prepare("SELECT id, role_name FROM roles WHERE role_name = :rname LIMIT 1");
            $rStmt->execute([':rname' => $newRoleName]);
            $role = $rStmt->fetch();

            if (!$role || !$userId) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Valid user_id and new_role (member, staff, admin) required.']);
                exit;
            }

            // Update user role
            $uStmt = $pdo->prepare("UPDATE users SET role_id = :rid WHERE id = :uid");
            $uStmt->execute([':rid' => $role['id'], ':uid' => $userId]);

            // Audit incident
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $logStmt = $pdo->prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (:uid, :act, :ip)");
            $logStmt->execute([
                ':uid' => $caller['id'],
                ':act' => "ROLE PROVISIONING: User ID #{$userId} elevated/changed to '{$newRoleName}' by Admin {$caller['identifier']}",
                ':ip'  => $ip
            ]);

            echo json_encode([
                'status' => 'success',
                'message' => "Role successfully provisioned: User #{$userId} is now '{$newRoleName}'."
            ]);
            exit;
        }

        if ($action === 'toggle_status') {
            // Activate or Suspend User Account
            $userId = (int)($data['user_id'] ?? 0);
            $newStatus = strtolower(trim($data['status'] ?? 'active'));

            if (!in_array($newStatus, ['active', 'suspended'], true) || !$userId) {
                http_response_code(400);
                echo json_encode(['status' => 'error', 'message' => 'Valid user_id and status (active, suspended) required.']);
                exit;
            }

            $uStmt = $pdo->prepare("UPDATE users SET status = :st WHERE id = :uid");
            $uStmt->execute([':st' => $newStatus, ':uid' => $userId]);

            // Audit incident
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $logStmt = $pdo->prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (:uid, :act, :ip)");
            $logStmt->execute([
                ':uid' => $caller['id'],
                ':act' => "ACCOUNT STATUS: User ID #{$userId} set to '{$newStatus}' by Admin {$caller['identifier']}",
                ':ip'  => $ip
            ]);

            echo json_encode([
                'status' => 'success',
                'message' => "User #{$userId} status changed to '{$newStatus}'."
            ]);
            exit;
        }

        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid action provided.']);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}
