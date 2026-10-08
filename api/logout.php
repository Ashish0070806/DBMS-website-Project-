<?php
/**
 * O2 GYM OS - Logout Endpoint
 */
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}
$_SESSION = [];
session_destroy();

header('Content-Type: application/json');
header('Access-Control-Allow-Origin: *');
echo json_encode(['status' => 'success', 'message' => 'Logged out successfully']);
?>
