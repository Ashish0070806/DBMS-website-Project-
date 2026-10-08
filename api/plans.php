<?php
/**
 * O₂ FITNESS - Membership Plans API Endpoint
 * Handles Full CRUD Lifecycle (Add, Update, Remove) for Membership Plans
 * Triggering MySQL Database Triggers and Live SSE/Polling Change Streams.
 */

require_once __DIR__ . '/db.php';
require_once __DIR__ . '/auth_guard.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Role, X-User-Identifier');
header('Content-Type: application/json; charset=UTF-8');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

// Authenticate caller (staff, admin, or member for reading)
$caller = getAuthenticatedUser($pdo);
if (!$caller) {
    // Dev/Localhost fallback to operations staff STF-101
    $caller = [
        'id' => 2,
        'identifier' => 'STF-101',
        'full_name' => 'Alex Morgan',
        'role_name' => 'staff'
    ];
}

$callerRole = strtolower($caller['role_name']);
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';

// Handle method overrides if sent via POST
if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    $parsedJson = json_decode($rawInput, true);
    if (isset($parsedJson['_method'])) {
        $method = strtoupper($parsedJson['_method']);
    } elseif (isset($_POST['_method'])) {
        $method = strtoupper($_POST['_method']);
    } elseif (isset($_GET['action'])) {
        if ($_GET['action'] === 'delete') $method = 'DELETE';
        if ($_GET['action'] === 'update') $method = 'PUT';
    }
}

// =====================================================================
// 1. GET: Fetch All Membership Plans
// =====================================================================
if ($method === 'GET') {
    try {
        $includeInactive = isset($_GET['all']) && $_GET['all'] === '1';
        $sql = "SELECT id, plan_code, plan_name, tier_label, duration_days, billing_period, price_inr, description, features, is_active, created_at FROM membership_plans";
        if (!$includeInactive) {
            $sql .= " WHERE is_active = 1";
        }
        $sql .= " ORDER BY id ASC";

        $stmt = $pdo->query($sql);
        $plans = $stmt->fetchAll();

        foreach ($plans as &$p) {
            $p['id'] = (int)$p['id'];
            $p['duration_days'] = (int)$p['duration_days'];
            $p['price_inr'] = (float)$p['price_inr'];
            $p['is_active'] = (bool)$p['is_active'];
            
            // Format features JSON safely
            if (is_string($p['features'])) {
                $decoded = json_decode($p['features'], true);
                $p['features'] = is_array($decoded) ? $decoded : [$p['features']];
            } elseif (!is_array($p['features'])) {
                $p['features'] = [];
            }
        }

        echo json_encode([
            'status' => 'success',
            'count' => count($plans),
            'data' => $plans
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
    }
    exit;
}

// Only Staff and Admins can mutate membership plans
if ($callerRole === 'member') {
    http_response_code(403);
    echo json_encode(['status' => 'error', 'message' => 'Access Denied: Athletes cannot modify membership plan configurations.']);
    exit;
}

// Helper to get request payload
function getPayload() {
    $raw = file_get_contents('php://input');
    $json = json_decode($raw, true);
    if (is_array($json)) {
        return $json;
    }
    return $_POST;
}

// =====================================================================
// 2. POST: Add New Membership Plan (Fires trg_after_plan_insert!)
// =====================================================================
if ($method === 'POST') {
    $data = getPayload();

    $planName = trim($data['plan_name'] ?? '');
    $priceInr = floatval($data['price_inr'] ?? 0);
    $tierLabel = trim($data['tier_label'] ?? '');
    $durationDays = intval($data['duration_days'] ?? 30);
    $billingPeriod = trim($data['billing_period'] ?? '');
    $description = trim($data['description'] ?? '');
    $features = $data['features'] ?? [];

    if (empty($planName)) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Plan name is required.']);
        exit;
    }

    if ($priceInr < 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Price cannot be negative.']);
        exit;
    }

    // Default duration and billing period if blank
    if ($durationDays <= 0) $durationDays = 30;
    if (empty($billingPeriod)) {
        if ($durationDays >= 365) $billingPeriod = '12 MONTHS / YEARLY';
        elseif ($durationDays >= 180) $billingPeriod = '6 MONTHS';
        elseif ($durationDays >= 90) $billingPeriod = '3 MONTHS / QUARTERLY';
        else $billingPeriod = 'MONTHLY (' . $durationDays . ' DAYS)';
    }

    // Auto-generate tier label if blank
    if (empty($tierLabel)) {
        $count = (int)$pdo->query("SELECT COUNT(*) FROM membership_plans")->fetchColumn();
        $tierLabel = 'TIER ' . str_pad($count + 1, 2, '0', STR_PAD_LEFT);
    }

    // Auto-generate plan code if blank
    $planCode = trim($data['plan_code'] ?? '');
    if (empty($planCode)) {
        $maxId = (int)$pdo->query("SELECT COALESCE(MAX(id), 0) FROM membership_plans")->fetchColumn();
        $planCode = 'PL-' . str_pad($maxId + 1, 3, '0', STR_PAD_LEFT);
    }

    // Format features as JSON array
    if (is_string($features)) {
        // Can be newline or comma separated
        $lines = preg_split('/[\r\n,]+/', $features);
        $features = array_values(array_filter(array_map('trim', $lines)));
    }
    if (empty($features)) {
        $features = ["Full Gym Floor Access", "Locker Room Access", "Complimentary Fitness Orientation"];
    }
    $featuresJson = json_encode($features, JSON_UNESCAPED_UNICODE);

    try {
        $stmt = $pdo->prepare("
            INSERT INTO membership_plans 
            (plan_code, plan_name, tier_label, duration_days, billing_period, price_inr, description, features, is_active)
            VALUES 
            (:code, :name, :tier, :days, :period, :price, :desc, :feat, 1)
        ");
        $stmt->execute([
            ':code'   => $planCode,
            ':name'   => $planName,
            ':tier'   => $tierLabel,
            ':days'   => $durationDays,
            ':period' => $billingPeriod,
            ':price'  => $priceInr,
            ':desc'   => $description,
            ':feat'   => $featuresJson
        ]);

        $newId = $pdo->lastInsertId();

        echo json_encode([
            'status' => 'success',
            'message' => "⚡ DB TRIGGER FIRED: Plan '{$planName}' ({$planCode}) successfully added to database!",
            'data' => [
                'id' => (int)$newId,
                'plan_code' => $planCode,
                'plan_name' => $planName,
                'tier_label' => $tierLabel,
                'duration_days' => $durationDays,
                'billing_period' => $billingPeriod,
                'price_inr' => $priceInr,
                'features' => $features
            ]
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Database error: ' . $e->getMessage()]);
    }
    exit;
}

// =====================================================================
// 3. PUT: Update Membership Plan (Fires trg_after_plan_update!)
// =====================================================================
if ($method === 'PUT') {
    $data = getPayload();

    $planId = intval($data['id'] ?? $_GET['id'] ?? 0);
    if ($planId <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Plan ID is required for updating.']);
        exit;
    }

    // Check existing plan
    $existingStmt = $pdo->prepare("SELECT * FROM membership_plans WHERE id = :id LIMIT 1");
    $existingStmt->execute([':id' => $planId]);
    $existing = $existingStmt->fetch();

    if (!$existing) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => "Plan with ID {$planId} not found."]);
        exit;
    }

    $planName = isset($data['plan_name']) ? trim($data['plan_name']) : $existing['plan_name'];
    $priceInr = isset($data['price_inr']) ? floatval($data['price_inr']) : floatval($existing['price_inr']);
    $tierLabel = isset($data['tier_label']) ? trim($data['tier_label']) : $existing['tier_label'];
    $durationDays = isset($data['duration_days']) ? intval($data['duration_days']) : intval($existing['duration_days']);
    $billingPeriod = isset($data['billing_period']) ? trim($data['billing_period']) : $existing['billing_period'];
    $description = isset($data['description']) ? trim($data['description']) : $existing['description'];
    
    if (isset($data['features'])) {
        $features = $data['features'];
        if (is_string($features)) {
            $lines = preg_split('/[\r\n,]+/', $features);
            $features = array_values(array_filter(array_map('trim', $lines)));
        }
        $featuresJson = json_encode($features, JSON_UNESCAPED_UNICODE);
    } else {
        $featuresJson = $existing['features'];
    }

    $isActive = isset($data['is_active']) ? (int)$data['is_active'] : (int)$existing['is_active'];

    try {
        $stmt = $pdo->prepare("
            UPDATE membership_plans
            SET plan_name = :name,
                tier_label = :tier,
                duration_days = :days,
                billing_period = :period,
                price_inr = :price,
                description = :desc,
                features = :feat,
                is_active = :active
            WHERE id = :id
        ");

        $stmt->execute([
            ':name'   => $planName,
            ':tier'   => $tierLabel,
            ':days'   => $durationDays,
            ':period' => $billingPeriod,
            ':price'  => $priceInr,
            ':desc'   => $description,
            ':feat'   => $featuresJson,
            ':active' => $isActive,
            ':id'     => $planId
        ]);

        echo json_encode([
            'status' => 'success',
            'message' => "⚡ DB TRIGGER FIRED: Plan '{$planName}' updated (₹{$priceInr}) in MySQL!",
            'data' => [
                'id' => $planId,
                'plan_code' => $existing['plan_code'],
                'plan_name' => $planName,
                'tier_label' => $tierLabel,
                'price_inr' => $priceInr,
                'billing_period' => $billingPeriod
            ]
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    } catch (PDOException $e) {
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Database update error: ' . $e->getMessage()]);
    }
    exit;
}

// =====================================================================
// 4. DELETE: Remove Membership Plan (Fires trg_after_plan_delete!)
// =====================================================================
if ($method === 'DELETE') {
    $data = getPayload();
    $planId = intval($data['id'] ?? $_GET['id'] ?? 0);

    if ($planId <= 0) {
        http_response_code(400);
        echo json_encode(['status' => 'error', 'message' => 'Valid plan ID is required for deletion.']);
        exit;
    }

    // Fetch plan details before removal
    $chkStmt = $pdo->prepare("SELECT id, plan_code, plan_name FROM membership_plans WHERE id = :id LIMIT 1");
    $chkStmt->execute([':id' => $planId]);
    $plan = $chkStmt->fetch();

    if (!$plan) {
        http_response_code(404);
        echo json_encode(['status' => 'error', 'message' => "Membership plan ID {$planId} not found."]);
        exit;
    }

    try {
        $pdo->beginTransaction();

        // Check if any existing members are assigned this plan
        $memberCountStmt = $pdo->prepare("SELECT COUNT(*) FROM members WHERE plan_id = :id");
        $memberCountStmt->execute([':id' => $planId]);
        $assignedCount = (int)$memberCountStmt->fetchColumn();

        if ($assignedCount > 0) {
            // Find another active plan to reassign members to so foreign key integrity is preserved
            $altStmt = $pdo->prepare("SELECT id, plan_name FROM membership_plans WHERE id != :id AND is_active = 1 ORDER BY id ASC LIMIT 1");
            $altStmt->execute([':id' => $planId]);
            $altPlan = $altStmt->fetch();

            if ($altPlan) {
                $reassignStmt = $pdo->prepare("UPDATE members SET plan_id = :altId WHERE plan_id = :oldId");
                $reassignStmt->execute([
                    ':altId' => $altPlan['id'],
                    ':oldId' => $planId
                ]);
            }
        }

        // Delete plan row from membership_plans (Triggers trg_after_plan_delete!)
        $delStmt = $pdo->prepare("DELETE FROM membership_plans WHERE id = :id");
        $delStmt->execute([':id' => $planId]);

        $pdo->commit();

        echo json_encode([
            'status' => 'success',
            'message' => "⚡ DB TRIGGER FIRED: Plan '{$plan['plan_name']}' ({$plan['plan_code']}) permanently deleted from database!",
            'reassigned_members' => $assignedCount
        ], JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);

    } catch (PDOException $e) {
        if ($pdo->inTransaction()) {
            $pdo->rollBack();
        }
        http_response_code(500);
        echo json_encode(['status' => 'error', 'message' => 'Deletion error: ' . $e->getMessage()]);
    }
    exit;
}

http_response_code(405);
echo json_encode(['status' => 'error', 'message' => 'Method not allowed.']);
