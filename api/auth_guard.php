<?php
/**
 * O₂ FITNESS - RBAC Enforcer & Security Gateway Middleware
 * Enforces Role-Based Access Control, token verification, and security audit logging.
 */

require_once __DIR__ . '/db.php';

/**
 * Standardized 403 Forbidden Response
 */
function denyAccess(string $reason = "Access Denied: You do not have the required role permissions to perform this action.", ?PDO $pdo = null, ?int $userId = null) {
    http_response_code(403);
    
    // Log security incident if database connection is available
    if ($pdo) {
        try {
            $ip = $_SERVER['REMOTE_ADDR'] ?? '127.0.0.1';
            $uri = $_SERVER['REQUEST_URI'] ?? 'UNKNOWN_ROUTE';
            $method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
            $stmt = $pdo->prepare("INSERT INTO audit_logs (user_id, action, ip_address) VALUES (:uid, :act, :ip)");
            $stmt->execute([
                ':uid' => $userId,
                ':act' => "SECURITY ALERT [403 FORBIDDEN]: {$reason} on {$method} {$uri}",
                ':ip'  => $ip
            ]);
        } catch (Exception $e) {
            // Silently continue to guarantee 403 return
        }
    }

    echo json_encode([
        "status" => 403,
        "error" => $reason
    ]);
    exit;
}

/**
 * Standardized 401 Unauthorized Response
 */
function denyUnauthenticated(string $message = "Authentication Required: Missing or invalid authentication credentials.") {
    http_response_code(401);
    echo json_encode([
        "status" => 401,
        "error" => $message
    ]);
    exit;
}

/**
 * Resolves the authenticated user from session or HTTP headers
 *
 * @param PDO $pdo
 * @return array|null User record including role_name
 */
function getAuthenticatedUser(PDO $pdo): ?array {
    // 1. Check PHP Session
    if (isset($_SESSION['user_id']) && !empty($_SESSION['user_id'])) {
        $stmt = $pdo->prepare("
            SELECT u.id, u.identifier, u.email, u.full_name, u.status, r.role_name, r.display_name AS role_display
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE u.id = :id AND u.status = 'active'
            LIMIT 1
        ");
        $stmt->execute([':id' => $_SESSION['user_id']]);
        $user = $stmt->fetch();
        if ($user) {
            return $user;
        }
    }

    // 2. Check Authorization Header (Bearer token or User Identifier)
    $allHeaders = function_exists('getallheaders') ? getallheaders() : [];
    // Normalize header keys to lowercase
    $lowerHeaders = [];
    foreach ($allHeaders as $k => $v) {
        $lowerHeaders[strtolower($k)] = $v;
    }

    $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? $lowerHeaders['authorization'] ?? '';
    $identifier = null;

    if (!empty($authHeader) && preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
        $token = trim($matches[1]);
        // Support token as either identifier (e.g. ADM-001, STF-101) or email
        $identifier = $token;
    }

    // Fallback to custom headers if provided
    if (!$identifier) {
        $identifier = trim($_SERVER['HTTP_X_USER_IDENTIFIER'] ?? $lowerHeaders['x-user-identifier'] ?? '');
    }

    if ($identifier) {
        $stmt = $pdo->prepare("
            SELECT u.id, u.identifier, u.email, u.full_name, u.status, r.role_name, r.display_name AS role_display
            FROM users u
            JOIN roles r ON u.role_id = r.id
            WHERE (u.identifier = :ident1 OR u.email = :ident2) AND u.status = 'active'
            LIMIT 1
        ");
        $stmt->execute([':ident1' => $identifier, ':ident2' => $identifier]);
        $user = $stmt->fetch();
        if ($user) {
            // Sync session
            $_SESSION['user_id'] = $user['id'];
            $_SESSION['identifier'] = $user['identifier'];
            $_SESSION['role'] = $user['role_name'];
            return $user;
        }
    }

    return null;
}

/**
 * Enforces that the request is authenticated and has one of the allowed roles
 *
 * @param PDO $pdo
 * @param array $allowedRoles Array of permitted roles, e.g. ['admin'], ['admin', 'staff']
 * @return array The authenticated user
 */
function requireRole(PDO $pdo, array $allowedRoles): array {
    $user = getAuthenticatedUser($pdo);

    if (!$user) {
        denyUnauthenticated();
    }

    $userRole = strtolower($user['role_name']);
    $allowed = array_map('strtolower', $allowedRoles);

    if (!in_array($userRole, $allowed, true)) {
        denyAccess(
            "Access Denied: You do not have the required role permissions to perform this action.",
            $pdo,
            $user['id']
        );
    }

    return $user;
}
