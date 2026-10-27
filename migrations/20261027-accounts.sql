-- Run once as a database administrator in the dedicated fusion_accounts DB.
-- The runtime user needs only SELECT, INSERT, UPDATE and DELETE in this DB.
CREATE TABLE IF NOT EXISTS account_users (
  id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  email VARCHAR(254) CHARACTER SET ascii COLLATE ascii_bin NOT NULL UNIQUE,
  display_name VARCHAR(240) NOT NULL,
  password_hash VARCHAR(255) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  auth_version INT UNSIGNED NOT NULL DEFAULT 0,
  created_at BIGINT UNSIGNED NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS account_sessions (
  token_hash CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  auth_version INT UNSIGNED NOT NULL,
  persistent TINYINT UNSIGNED NOT NULL,
  created_at BIGINT UNSIGNED NOT NULL,
  last_seen_at BIGINT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  INDEX account_sessions_user (user_id, created_at),
  INDEX account_sessions_expiry (expires_at),
  CONSTRAINT account_sessions_user_fk FOREIGN KEY (user_id) REFERENCES account_users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS account_states (
  user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  version INT UNSIGNED NOT NULL DEFAULT 0,
  data MEDIUMTEXT NOT NULL,
  updated_at BIGINT UNSIGNED NOT NULL,
  CONSTRAINT account_states_user_fk FOREIGN KEY (user_id) REFERENCES account_users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

CREATE TABLE IF NOT EXISTS account_rate_limits (
  rate_key CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  window_start BIGINT UNSIGNED NOT NULL,
  hits INT UNSIGNED NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL,
  INDEX account_rate_expiry (expires_at)
) ENGINE=InnoDB;
