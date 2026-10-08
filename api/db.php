<?php
/**
 * O2 GYM OS - MySQL Database Connection Layer
 * Connects via PHP Data Objects (PDO) with error reporting and security.
 */

header('Content-Type: application/json; charset=UTF-8');

$host = getenv('DB_HOST') ?: '127.0.0.1';
$port = getenv('DB_PORT') ?: '3308';
$dbname = getenv('DB_NAME') ?: 'o2_gym_db';
$username = getenv('DB_USER') ?: 'o2_gym';
$password = getenv('DB_PASS') ?: 'o2gym123';

$options = [
    PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
    PDO::ATTR_EMULATE_PREPARES   => true,
];

date_default_timezone_set('Asia/Kolkata');

try {
    $dsn = "mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4";
    $pdo = new PDO($dsn, $username, $password, $options);
    $pdo->exec("SET time_zone = '+05:30'");
} catch (PDOException $e) {
    // Return structured JSON error if database connection fails
    http_response_code(500);
    echo json_encode([
        'status' => 'error',
        'connected' => false,
        'message' => 'MySQL Database connection error: ' . $e->getMessage(),
        'hint' => 'Ensure MySQL server is running in XAMPP or Windows services and o2_gym_db is imported.'
    ]);
    exit;
}

// Session initiation for authentication state
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
?>
