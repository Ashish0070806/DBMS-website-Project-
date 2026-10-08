<?php
/**
 * O2 GYM OS - Login Authentication API Endpoint
 * Authenticates Admin, Staff, and Members against MySQL database
 */

require_once __DIR__ . '/db.php';

// Allow Cross-Origin for VS Code local development
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

// Receive payload from JSON or standard FormData
$raw = file_get_contents('php://input');
$data = json_decode($raw, true) ?: $_POST;

$identity = trim($data['identity'] ?? '');
$password = trim($data['password'] ?? '');
$requestedRole = trim($data['role'] ?? '');
$remember = !empty($data['remember']);

if (empty($identity) || empty($password)) {
    http_response_code(400);
    echo json_encode([
        'status' => 'error',
        'message' => 'Both Operator Email/ID and Password are required.'
    ]);
    exit;
}

try {
    // Query matching user by email OR identifier
    $stmt = $pdo->prepare("
        SELECT 
            u.id,
            u.identifier,
            u.email,
            u.password_hash,
            u.full_name,
            u.avatar_url,
            u.status,
            r.role_name,
            r.display_name AS role_display
        FROM users u
        JOIN roles r ON u.role_id = r.id
        WHERE (u.email = :ident1 OR u.identifier = :ident2)
        LIMIT 1
    ");
    $stmt->execute([':ident1' => $identity, ':ident2' => $identity]);
    $user = $stmt->fetch();

    if (!$user) {
        http_response_code(401);
        echo json_encode([
            'status' => 'error',
            'message' => 'Invalid credentials. User identifier/email not found in database.'
        ]);
        exit;
    }

    // Verify Password (supports plain for seeds or sha256 or password_verify)
    $passwordValid = false;
    if ($user['password_hash'] === $password) {
        $passwordValid = true;
    } elseif ($user['password_hash'] === hash('sha256', $password)) {
        $passwordValid = true;
    } elseif (password_verify($password, $user['password_hash'])) {
        $passwordValid = true;
    }

    if (!$passwordValid) {
        http_response_code(401);
        echo json_encode([
            'status' => 'error',
            'message' => 'Access Denied: Incorrect security passcode provided.'
        ]);
        exit;
    }

    if ($user['status'] !== 'active') {
        http_response_code(403);
        echo json_encode([
            'status' => 'error',
            'message' => 'Account is suspended or inactive. Contact system administrator.'
        ]);
        exit;
    }

    // Optional Role Verification check & Role Escalation Prevention
    if (!empty($requestedRole) && $requestedRole !== 'all' && $user['role_name'] !== $requestedRole) {
        $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
        $logStmt = $pdo->prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (:uid, :act, :ip)");
        $logStmt->execute([
            ':uid' => $user['id'],
            ':act' => "SECURITY ALERT [403 FORBIDDEN]: Role escalation attempt - user is '{$user['role_name']}', requested '{$requestedRole}'",
            ':ip'  => $ip
        ]);

        http_response_code(403);
        echo json_encode([
            'status' => 403,
            'error' => "Access Denied: You do not have the required role permissions to perform this action."
        ]);
        exit;
    }

    // Generate secure auth token
    $authToken = bin2hex(random_bytes(32));

    // Update last_login
    $updateStmt = $pdo->prepare("UPDATE users SET last_login = NOW() WHERE id = :id");
    $updateStmt->execute([':id' => $user['id']]);

    // Record Audit Log
    $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
    $logStmt = $pdo->prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (:uid, :act, :ip)");
    $logStmt->execute([
        ':uid' => $user['id'],
        ':act' => "Successful login as {$user['role_name']} ({$user['identifier']})",
        ':ip'  => $ip
    ]);

    // Store in Session
    $_SESSION['user_id'] = $user['id'];
    $_SESSION['identifier'] = $user['identifier'];
    $_SESSION['role'] = $user['role_name'];
    $_SESSION['name'] = $user['full_name'];
    $_SESSION['auth_token'] = $authToken;

    // Determine redirect based on RBAC matrix
    if ($user['role_name'] === 'admin') {
        $redirect = 'admin.html';
    } elseif ($user['role_name'] === 'staff') {
        $redirect = 'dashboard.html';
    } else {
        $redirect = 'member.html';
    }

    echo json_encode([
        'status' => 'success',
        'message' => "Welcome back, {$user['full_name']}! Authentication verified.",
        'redirect' => $redirect,
        'auth_token' => $authToken,
        'user' => [
            'id' => $user['id'],
            'identifier' => $user['identifier'],
            'email' => $user['email'],
            'name' => $user['full_name'],
            'role' => $user['role_name'],
            'role_display' => $user['role_display'],
            'avatar' => $user['avatar_url'],
            'auth_token' => $authToken
        ]
    ]);

} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'message' => 'Database Query Error: ' . $e->getMessage()
    ]);
}
?>
