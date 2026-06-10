-- ============================================================
-- SOCIAL MEDIA API — Supabase (PostgreSQL) Schema
-- ============================================================
-- Jalankan di SQL Editor Supabase Dashboard
-- ============================================================

-- Required extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================================
-- ENUM types
-- ============================================================
CREATE TYPE user_role AS ENUM ('user', 'moderator', 'admin');
CREATE TYPE content_status AS ENUM ('active', 'hidden', 'removed');
CREATE TYPE story_status AS ENUM ('active', 'expired', 'archived');
CREATE TYPE report_reason AS ENUM ('spam', 'harassment', 'hate_speech', 'misinformation', 'nudity', 'other');
CREATE TYPE report_status AS ENUM ('pending', 'reviewed', 'resolved', 'dismissed');
CREATE TYPE notif_type AS ENUM ('like', 'comment', 'follow', 'bookmark', 'reply');

-- ============================================================
-- USERS
-- ============================================================
CREATE TABLE users (
  id          BIGSERIAL PRIMARY KEY,
  uuid        UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  username    VARCHAR(50) NOT NULL UNIQUE,
  email       VARCHAR(100) NOT NULL UNIQUE,
  password    VARCHAR(255) NOT NULL,
  full_name   VARCHAR(100),
  bio         TEXT,
  avatar      VARCHAR(255) DEFAULT NULL,
  role        user_role NOT NULL DEFAULT 'user',
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  is_banned   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- POSTS
-- ============================================================
CREATE TABLE posts (
  id          BIGSERIAL PRIMARY KEY,
  uuid        UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  caption     TEXT,
  image       VARCHAR(255) DEFAULT NULL,
  status      content_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- COMMENTS
-- ============================================================
CREATE TABLE comments (
  id          BIGSERIAL PRIMARY KEY,
  post_id     BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  parent_id   BIGINT DEFAULT NULL REFERENCES comments(id) ON DELETE CASCADE,
  content     TEXT NOT NULL,
  status      content_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- LIKES
-- ============================================================
CREATE TABLE likes (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id     BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);

-- ============================================================
-- BOOKMARKS
-- ============================================================
CREATE TABLE bookmarks (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id     BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, post_id)
);

-- ============================================================
-- FOLLOWS
-- ============================================================
CREATE TABLE follows (
  id            BIGSERIAL PRIMARY KEY,
  follower_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  following_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (follower_id, following_id)
);

-- ============================================================
-- REPORTS
-- ============================================================
CREATE TABLE reports (
  id            BIGSERIAL PRIMARY KEY,
  reporter_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  post_id       BIGINT DEFAULT NULL REFERENCES posts(id) ON DELETE SET NULL,
  comment_id    BIGINT DEFAULT NULL REFERENCES comments(id) ON DELETE SET NULL,
  reason        report_reason NOT NULL,
  description   TEXT,
  status        report_status NOT NULL DEFAULT 'pending',
  reviewed_by   BIGINT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ DEFAULT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- ACTIVITY LOGS
-- ============================================================
CREATE TABLE activity_logs (
  id          BIGSERIAL PRIMARY KEY,
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  action      VARCHAR(100) NOT NULL,
  entity_type VARCHAR(50),
  entity_id   BIGINT,
  ip_address  VARCHAR(45),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- HASHTAGS
-- ============================================================
CREATE TABLE hashtags (
  id          BIGSERIAL PRIMARY KEY,
  name        VARCHAR(100) NOT NULL UNIQUE,
  usage_count INT NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- POST_HASHTAGS (junction)
-- ============================================================
CREATE TABLE post_hashtags (
  id          BIGSERIAL PRIMARY KEY,
  post_id     BIGINT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
  hashtag_id  BIGINT NOT NULL REFERENCES hashtags(id) ON DELETE CASCADE,
  UNIQUE (post_id, hashtag_id)
);

-- ============================================================
-- STORIES
-- ============================================================
CREATE TABLE stories (
  id          BIGSERIAL PRIMARY KEY,
  uuid        UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id     BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  media       VARCHAR(255) NOT NULL,
  caption     VARCHAR(255) DEFAULT NULL,
  expires_at  TIMESTAMPTZ NOT NULL,
  status      story_status NOT NULL DEFAULT 'active',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- STORY VIEWS
-- ============================================================
CREATE TABLE story_views (
  id          BIGSERIAL PRIMARY KEY,
  story_id    BIGINT NOT NULL REFERENCES stories(id) ON DELETE CASCADE,
  viewer_id   BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  viewed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (story_id, viewer_id)
);

-- ============================================================
-- CONVERSATIONS (chat)
-- ============================================================
CREATE TABLE conversations (
  id              BIGSERIAL PRIMARY KEY,
  uuid            UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  last_message    TEXT DEFAULT NULL,
  last_sender_id  BIGINT DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
  last_activity   TIMESTAMPTZ DEFAULT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- CONVERSATION PARTICIPANTS (junction)
-- ============================================================
CREATE TABLE conversation_participants (
  id                BIGSERIAL PRIMARY KEY,
  conversation_id   BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  user_id           BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (conversation_id, user_id)
);

-- ============================================================
-- MESSAGES
-- ============================================================
CREATE TABLE messages (
  id                BIGSERIAL PRIMARY KEY,
  uuid              UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  conversation_id   BIGINT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender_id         BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  content           TEXT NOT NULL,
  media             VARCHAR(255) DEFAULT NULL,
  is_read           BOOLEAN NOT NULL DEFAULT FALSE,
  read_at           TIMESTAMPTZ DEFAULT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- NOTIFICATIONS
-- ============================================================
CREATE TABLE notifications (
  id            BIGSERIAL PRIMARY KEY,
  uuid          UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  user_id       BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  actor_id      BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type          notif_type NOT NULL,
  post_id       BIGINT DEFAULT NULL REFERENCES posts(id) ON DELETE SET NULL,
  comment_id    BIGINT DEFAULT NULL REFERENCES comments(id) ON DELETE SET NULL,
  message       VARCHAR(255) NOT NULL,
  is_read       BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX idx_posts_user     ON posts(user_id);
CREATE INDEX idx_posts_status   ON posts(status);
CREATE INDEX idx_posts_created  ON posts(created_at DESC);
CREATE INDEX idx_comments_post  ON comments(post_id);
CREATE INDEX idx_likes_post     ON likes(post_id);
CREATE INDEX idx_follows_follower   ON follows(follower_id);
CREATE INDEX idx_follows_following  ON follows(following_id);
CREATE INDEX idx_reports_status ON reports(status);
CREATE INDEX idx_activity_user  ON activity_logs(user_id);
CREATE INDEX idx_hashtags_name        ON hashtags(name);
CREATE INDEX idx_post_hashtags_post   ON post_hashtags(post_id);
CREATE INDEX idx_post_hashtags_tag    ON post_hashtags(hashtag_id);
CREATE INDEX idx_stories_user     ON stories(user_id);
CREATE INDEX idx_stories_status   ON stories(status);
CREATE INDEX idx_stories_expires  ON stories(expires_at);
CREATE INDEX idx_story_views_story   ON story_views(story_id);
CREATE INDEX idx_story_views_viewer  ON story_views(viewer_id);
CREATE INDEX idx_conv_participant_user     ON conversation_participants(user_id);
CREATE INDEX idx_messages_conversation     ON messages(conversation_id);
CREATE INDEX idx_messages_sender           ON messages(sender_id);
CREATE INDEX idx_messages_created          ON messages(created_at ASC);
CREATE INDEX idx_messages_unread           ON messages(conversation_id, is_read);
CREATE INDEX idx_notif_user       ON notifications(user_id);
CREATE INDEX idx_notif_user_read  ON notifications(user_id, is_read);
CREATE INDEX idx_notif_created    ON notifications(created_at DESC);

-- ============================================================
-- AUTO-UPDATE updated_at TRIGGER (for tables with updated_at)
-- ============================================================
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_users
  BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_posts
  BEFORE UPDATE ON posts FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_comments
  BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_stories
  BEFORE UPDATE ON stories FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

CREATE TRIGGER set_updated_at_conversations
  BEFORE UPDATE ON conversations FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ============================================================
-- SEED DATA
-- ============================================================
-- Password: Admin@123 (bcrypt hash)
INSERT INTO users (uuid, username, email, password, full_name, role)
VALUES (
  gen_random_uuid(),
  'admin',
  'admin@socialmedia.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uUVa',
  'Super Admin',
  'admin'
);

-- Password: Moderator@123 (bcrypt hash)
INSERT INTO users (uuid, username, email, password, full_name, role)
VALUES (
  gen_random_uuid(),
  'moderator',
  'moderator@socialmedia.com',
  '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj/RK.s5uUVa',
  'Moderator Satu',
  'moderator'
);
