<?php
/**
 * O2 GYM OS - Registration API Endpoint (Member & Staff Account Creation)
 * Inserts new users, members, or staff records into MySQL database.
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_guard.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Role, X-User-Identifier');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    http_response_code(200);
    exit;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed. Use POST.']);
    exit;
}

$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: $_POST;

$role = strtolower(trim($data['role'] ?? 'member'));
$fullName = trim($data['full_name'] ?? '');
$email = trim($data['email'] ?? '');
$password = trim($data['password'] ?? '');
$phone = trim($data['phone'] ?? '');

// RBAC ENFORCEMENT:
$caller = getAuthenticatedUser($pdo);

// Rule 1 & 2: The 'admin' role CANNOT be requested or selected via registration forms
if ($role === 'admin') {
    denyAccess(
        "Access Denied: You do not have the required role permissions to perform this action.",
        $pdo,
        $caller ? $caller['id'] : null
    );
}

// Rule 3: Staff can only register new members, cannot elevate accounts to staff or admin
if ($caller && strtolower($caller['role_name']) === 'staff' && $role !== 'member') {
    denyAccess(
        "Access Denied: You do not have the required role permissions to perform this action.",
        $pdo,
        $caller['id']
    );
}

// Public registration constraint: only 'member' or 'staff' allowed
if ($role !== 'member' && $role !== 'staff') {
    denyAccess(
        "Access Denied: You do not have the required role permissions to perform this action.",
        $pdo,
        $caller ? $caller['id'] : null
    );
}

// Validation
if (empty($fullName) || empty($email) || empty($password)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Full Name, Email, and Password are required.']);
    exit;
}

if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Please provide a valid email address.']);
    exit;
}

if (strlen($password) < 4) {
    http_response_code(400);
    echo json_encode(['status' => 'error', 'message' => 'Password must be at least 4 characters long.']);
    exit;
}

try {
    // Check if email already exists
    $checkStmt = $pdo->prepare("SELECT id FROM users WHERE email = :email LIMIT 1");
    $checkStmt->execute([':email' => $email]);
    if ($checkStmt->fetch()) {
        http_response_code(409);
        echo json_encode(['status' => 'error', 'message' => 'An account with this email already exists. Please log in instead.']);
        exit;
    }

    $pdo->beginTransaction();

    $roleId = ($role === 'staff') ? 2 : 3;
    $roleName = ($role === 'staff') ? 'staff' : 'member';

    // Generate unique identifier
    $prefix = ($role === 'staff') ? 'STF' : 'MEM';
    $count = $pdo->query("SELECT COUNT(*) FROM users WHERE role_id = {$roleId}")->fetchColumn();
    $identifier = $prefix . '-' . str_pad($count + 101, 3, '0', STR_PAD_LEFT);

    // Insert into users table
    $userStmt = $pdo->prepare("
        INSERT INTO users (identifier, email, password_hash, role_id, full_name, phone, status)
        VALUES (:ident, :email, :pass, :rid, :name, :phone, 'active')
    ");
    $userStmt->execute([
        ':ident' => $identifier,
        ':email' => $email,
        ':pass'  => $password, // Direct password verification support
        ':rid'   => $roleId,
        ':name'  => $fullName,
        ':phone' => $phone
    ]);
    $userId = $pdo->lastInsertId();

    // Insert into role-specific table
    if ($role === 'staff') {
        $department = trim($data['department'] ?? 'Front-Desk Operations');
        $station = trim($data['station'] ?? 'Operator / Front-Desk Terminal 01');
        $shift = trim($data['shift'] ?? 'Morning Shift (06:00 - 14:00)');

        $staffStmt = $pdo->prepare("
            INSERT INTO staff (user_id, department, station_name, shift, status)
            VALUES (:uid, :dept, :station, :shift, 'On Duty')
        ");
        $staffStmt->execute([
            ':uid'     => $userId,
            ':dept'    => $department,
            ':station' => $station,
            ':shift'   => $shift
        ]);
    } else {
        // Member Registration
        $planCode = trim($data['plan_code'] ?? 'PL-001');
        
        // Find plan details
        $planStmt = $pdo->prepare("SELECT id, duration_days, plan_name, price_inr FROM membership_plans WHERE plan_code = :pcode LIMIT 1");
        $planStmt->execute([':pcode' => $planCode]);
        $plan = $planStmt->fetch();

        $planId = $plan ? $plan['id'] : 1;
        $durationDays = $plan ? (int)$plan['duration_days'] : 365;

        $startDate = date('Y-m-d');
        $expiryDate = date('Y-m-d', strtotime("+{$durationDays} days"));

        $memberStmt = $pdo->prepare("
            INSERT INTO members (user_id, member_code, plan_id, start_date, expiry_date, status)
            VALUES (:uid, :code, :pid, :sdate, :edate, 'ACTIVE')
        ");
        $memberStmt->execute([
            ':uid'   => $userId,
            ':code'  => $identifier,
            ':pid'   => $planId,
            ':sdate' => $startDate,
            ':edate' => $expiryDate
        ]);
    }

    // Insert audit log
    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $logStmt = $pdo->prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (:uid, :act, :ip)");
    $logStmt->execute([
        ':uid' => $userId,
        ':act' => "Created new {$roleName} account: {$identifier} ({$fullName})",
        ':ip'  => $ip
    ]);

    $pdo->commit();

    echo json_encode([
        'status' => 'success',
        'message' => "Account created successfully! Your {$roleName} ID is {$identifier}.",
        'user' => [
            'id' => $userId,
            'identifier' => $identifier,
            'email' => $email,
            'full_name' => $fullName,
            'role' => $roleName
        ]
    ]);

} catch (PDOException $e) {
    if ($pdo->inTransaction()) {
        $pdo->rollBack();
    }
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
}
?>
