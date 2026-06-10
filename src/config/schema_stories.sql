-- Tabel Stories — upload foto/video singkat, expired otomatis setelah 24 jam

CREATE TABLE IF NOT EXISTS stories (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  uuid        VARCHAR(36) NOT NULL UNIQUE,
  user_id     INT UNSIGNED NOT NULL,
  media       VARCHAR(255) NOT NULL,
  caption     VARCHAR(255) DEFAULT NULL,
  expires_at  DATETIME NOT NULL,
  status      ENUM('active', 'expired', 'archived') NOT NULL DEFAULT 'active',
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at  DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS story_views (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  story_id    INT UNSIGNED NOT NULL,
  viewer_id   INT UNSIGNED NOT NULL,
  viewed_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_story_viewer (story_id, viewer_id),
  FOREIGN KEY (story_id) REFERENCES stories(id) ON DELETE CASCADE,
  FOREIGN KEY (viewer_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_stories_user     ON stories(user_id);
CREATE INDEX idx_stories_status   ON stories(status);
CREATE INDEX idx_stories_expires  ON stories(expires_at);
CREATE INDEX idx_story_views_story   ON story_views(story_id);
CREATE INDEX idx_story_views_viewer  ON story_views(viewer_id);
