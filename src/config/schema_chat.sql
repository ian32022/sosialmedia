-- Tabel Chat / Messages — private messaging antar user

CREATE TABLE IF NOT EXISTS conversations (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          VARCHAR(36) NOT NULL UNIQUE,
  last_message  TEXT DEFAULT NULL,
  last_sender_id INT UNSIGNED DEFAULT NULL,
  last_activity DATETIME DEFAULT NULL,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS conversation_participants (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  conversation_id   INT UNSIGNED NOT NULL,
  user_id           INT UNSIGNED NOT NULL,
  joined_at         DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_conv_user (conversation_id, user_id),
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS messages (
  id                INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid              VARCHAR(36) NOT NULL UNIQUE,
  conversation_id   INT UNSIGNED NOT NULL,
  sender_id         INT UNSIGNED NOT NULL,
  content           TEXT NOT NULL,
  media             VARCHAR(255) DEFAULT NULL,
  is_read           TINYINT(1) NOT NULL DEFAULT 0,
  read_at           DATETIME DEFAULT NULL,
  created_at        DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE,
  FOREIGN KEY (sender_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_conv_participant_user     ON conversation_participants(user_id);
CREATE INDEX idx_messages_conversation     ON messages(conversation_id);
CREATE INDEX idx_messages_sender           ON messages(sender_id);
CREATE INDEX idx_messages_created          ON messages(created_at ASC);
CREATE INDEX idx_messages_unread           ON messages(conversation_id, is_read);
