-- Tabel Notifications — notifikasi untuk like, comment, follow, bookmark

CREATE TABLE IF NOT EXISTS notifications (
  id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid          VARCHAR(36) NOT NULL UNIQUE,
  user_id       INT UNSIGNED NOT NULL,
  actor_id      INT UNSIGNED NOT NULL,
  type          ENUM('like','comment','follow','bookmark','reply') NOT NULL,
  post_id       INT UNSIGNED DEFAULT NULL,
  comment_id    INT UNSIGNED DEFAULT NULL,
  message       VARCHAR(255) NOT NULL,
  is_read       TINYINT(1) NOT NULL DEFAULT 0,
  created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id)   REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (actor_id)  REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (post_id)   REFERENCES posts(id) ON DELETE SET NULL,
  FOREIGN KEY (comment_id) REFERENCES comments(id) ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_notif_user       ON notifications(user_id);
CREATE INDEX idx_notif_user_read  ON notifications(user_id, is_read);
CREATE INDEX idx_notif_created    ON notifications(created_at DESC);
