<?php
// Copy this file to db.php and fill in your credentials
$host = '127.0.0.1';
$port = '3308';         // Change to your MariaDB port
$dbname = 'o2_gym_db';
$username = 'YOUR_DB_USER';
$password = 'YOUR_DB_PASSWORD';

try {
    $pdo = new PDO("mysql:host=$host;port=$port;dbname=$dbname;charset=utf8mb4", $username, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
    $pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => 'Database connection failed']);
    exit;
}
