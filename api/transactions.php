<?php
/**
 * O₂ FITNESS - Transactions Ledger API Endpoint
 * Handles INR billing, payment logging, and triggers automatic DB ledger updates.
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

$caller = requireRole($pdo, ['admin', 'staff', 'member']);
$callerRole = strtolower($caller['role_name']);
$method = $_SERVER['REQUEST_METHOD'];

// =====================================================================
// GET: Fetch Transactions
// =====================================================================
if ($method === 'GET') {
    try {
        if ($callerRole === 'member') {
            $stmt = $pdo->prepare("
                SELECT 
                    t.id,
                    t.txn_ref,
                    u.identifier AS member_code,
                    u.full_name AS name,
                    t.plan_name,
                    t.payment_method,
                    t.amount_inr,
                    t.timestamp_ist,
                    t.status
                FROM transactions t
                JOIN users u ON t.user_id = u.id
                WHERE u.id = :myId
                ORDER BY t.id DESC
            ");
            $stmt->execute([':myId' => $caller['id']]);
            $rows = $stmt->fetchAll();
        } else {
            $stmt = $pdo->query("
                SELECT 
                    t.id,
                    t.txn_ref,
                    u.identifier AS member_code,
                    u.full_name AS name,
                    t.plan_name,
                    t.payment_method,
                    t.amount_inr,
                    t.timestamp_ist,
                    t.status
                FROM transactions t
                JOIN users u ON t.user_id = u.id
                ORDER BY t.id DESC
                LIMIT 100
            ");
            $rows = $stmt->fetchAll();
        }

        echo json_encode([
            'status' => 'success',
            'data' => $rows
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// =====================================================================
// POST: Record New Transaction (Admin & Staff Only)
// =====================================================================
if ($method === 'POST') {
    if ($callerRole === 'member') {
        denyAccess("Access Denied: Members cannot log manual payments.", $pdo, $caller['id']);
    }

    $raw = file_get_contents('php://input');
    $data = json_decode($raw, true) ?: $_POST;

    $memberCode = trim($data['member_code'] ?? '');
    $planName = trim($data['plan_name'] ?? 'Annual Platinum Ultra (₹8,999)');
    $paymentMethod = trim($data['payment_method'] ?? 'UPI / PhonePe AutoPay');
    $amountInr = floatval($data['amount_inr'] ?? 8999.00);

    if (empty($memberCode)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Member Code is required.']);
        exit;
    }

    try {
        // Find user by identifier or email
        $uStmt = $pdo->prepare("SELECT id, full_name FROM users WHERE identifier = :c1 OR email = :c2 LIMIT 1");
        $uStmt->execute([':c1' => $memberCode, ':c2' => $memberCode]);
        $targetUser = $uStmt->fetch();

        if (!$targetUser) {
            http_response_code(404);
            echo json_encode(['status' => 'error', 'message' => "Member '{$memberCode}' not found."]);
            exit;
        }

        // Generate txn_ref
        $count = $pdo->query("SELECT COUNT(*) FROM transactions")->fetchColumn();
        $txnRef = 'TXN-' . str_pad($count + 884913, 6, '0', STR_PAD_LEFT);

        // Inserting into transactions will automatically FIRE trg_after_transaction_insert!
        $stmt = $pdo->prepare("
            INSERT INTO transactions (txn_ref, user_id, plan_name, payment_method, amount_inr, status)
            VALUES (:ref, :uid, :plan, :method, :amt, 'CLEARED')
        ");
        $stmt->execute([
            ':ref'    => $txnRef,
            ':uid'    => $targetUser['id'],
            ':plan'   => $planName,
            ':method' => $paymentMethod,
            ':amt'    => $amountInr
        ]);

        echo json_encode([
            'status' => 'success',
            'message' => "Payment of ₹{$amountInr} logged successfully for {$targetUser['full_name']}! (DB Trigger executed)",
            'txn_ref' => $txnRef
        ]);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}
