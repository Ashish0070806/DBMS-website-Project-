<?php
/**
 * O₂ FITNESS - Real-Time Reactive Database Change Stream & Event Gateway
 * Listens to MySQL Triggers and pushes live notifications to the Frontend via SSE / Polling.
 */

require_once __DIR__ . '/db.php';

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-User-Role, X-User-Identifier');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(200);
    exit;
}

$isStream = isset($_GET['stream']) && $_GET['stream'] === '1';

if ($isStream) {
    // SSE Stream Mode
    header('Content-Type: text/event-stream');
    header('Cache-Control: no-cache');
    header('Connection: keep-alive');
    header('X-Accel-Buffering: no'); // Disable buffering in Nginx/Apache

    // Prevent PHP timeout
    set_time_limit(0);
    ob_end_clean();

    $lastId = intval($_GET['last_id'] ?? 0);
    $iterations = 0;

    while ($iterations < 30) { // Limit continuous connection loop to prevent zombie processes
        try {
            $stmt = $pdo->prepare("SELECT id, event_type, table_name, record_id, message, created_at FROM db_events WHERE id > :lid ORDER BY id ASC LIMIT 10");
            $stmt->execute([':lid' => $lastId]);
            $events = $stmt->fetchAll();

            if (!empty($events)) {
                foreach ($events as $ev) {
                    echo "id: {$ev['id']}\n";
                    echo "event: db_change\n";
                    echo "data: " . json_encode($ev) . "\n\n";
                    $lastId = max($lastId, intval($ev['id']));
                }
                flush();
            } else {
                // Heartbeat to keep connection open
                echo ": heartbeat\n\n";
                flush();
            }
        } catch (Exception $e) {
            echo "event: error\ndata: " . json_encode(['error' => $e->getMessage()]) . "\n\n";
            flush();
            break;
        }

        sleep(1);
        $iterations++;
    }
    exit;
}

// Standard Snapshot / Polling Mode
try {
    // Total trigger events count
    $eventCount = $pdo->query("SELECT COUNT(*) FROM db_events")->fetchColumn();
    $maxId = $pdo->query("SELECT COALESCE(MAX(id), 0) FROM db_events")->fetchColumn();

    // Fetch last 10 trigger events
    $stmt = $pdo->query("SELECT id, event_type, table_name, record_id, message, created_at FROM db_events ORDER BY id DESC LIMIT 10");
    $recentEvents = $stmt->fetchAll();

    // System revision based on max event id and latest audit log
    $maxAudit = $pdo->query("SELECT COALESCE(MAX(id), 0) FROM audit_logs")->fetchColumn();
    $revision = intval($maxId) + intval($maxAudit);

    echo json_encode([
        'status' => 'success',
        'revision' => $revision,
        'event_count' => intval($eventCount),
        'latest_event' => $recentEvents[0] ?? null,
        'recent_events' => $recentEvents,
        'timestamp' => date('Y-m-d H:i:s')
    ]);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['status' => 'error', 'message' => $e->getMessage()]);
}
