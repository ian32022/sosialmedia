-- Tabel Hashtags — tagar pada post

CREATE TABLE IF NOT EXISTS hashtags (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  usage_count INT UNSIGNED NOT NULL DEFAULT 1,
  created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE IF NOT EXISTS post_hashtags (
  id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  post_id     INT UNSIGNED NOT NULL,
  hashtag_id  INT UNSIGNED NOT NULL,
  UNIQUE KEY uq_post_hashtag (post_id, hashtag_id),
  FOREIGN KEY (post_id)   REFERENCES posts(id) ON DELETE CASCADE,
  FOREIGN KEY (hashtag_id) REFERENCES hashtags(id) ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_hashtags_name        ON hashtags(name);
CREATE INDEX idx_post_hashtags_post   ON post_hashtags(post_id);
CREATE INDEX idx_post_hashtags_tag    ON post_hashtags(hashtag_id);
