-- =============================================================================
-- MIGRACION 005: Suscripciones Web Push
-- Tabla: push_subscriptions
-- =============================================================================

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id INT AUTO_INCREMENT PRIMARY KEY,
  usuario_nombre VARCHAR(255) NOT NULL,
  usuario_dept VARCHAR(100) DEFAULT NULL,
  endpoint TEXT NOT NULL,
  auth VARCHAR(255) NOT NULL,
  p256dh VARCHAR(255) NOT NULL,
  user_agent VARCHAR(500) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_endpoint (endpoint(255))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
