-- Run this in your Supabase project SQL editor

-- Users
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  nickname TEXT NOT NULL,
  password TEXT NOT NULL,
  space_id TEXT NOT NULL,
  is_creator BOOLEAN DEFAULT FALSE,
  profile_photo TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS users_nickname_idx ON users(nickname);

-- Couple settings
CREATE TABLE IF NOT EXISTS couple_settings (
  space_id TEXT PRIMARY KEY,
  anniversary DATE,
  wheel_options JSONB DEFAULT '[]'::jsonb
);

-- Events
CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  start_time TEXT NOT NULL,
  end_time TEXT NOT NULL,
  notes TEXT DEFAULT '',
  created_by TEXT NOT NULL,
  notified_1day BOOLEAN DEFAULT FALSE,
  notified_5hours BOOLEAN DEFAULT FALSE,
  notified_1hour BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Media
CREATE TABLE IF NOT EXISTS media (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  type TEXT NOT NULL,
  file_path TEXT NOT NULL,
  mime_type TEXT DEFAULT '',
  caption TEXT DEFAULT '',
  uploaded_by TEXT NOT NULL,
  likes JSONB DEFAULT '[]'::jsonb,
  comments JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Love notes
CREATE TABLE IF NOT EXISTS love_notes (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  from_user_id TEXT NOT NULL,
  to_user_id TEXT NOT NULL,
  title TEXT DEFAULT 'Untitled',
  content TEXT NOT NULL,
  unlock_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Date checklist
CREATE TABLE IF NOT EXISTS date_checklist (
  id TEXT PRIMARY KEY,
  space_id TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT DEFAULT '',
  is_done BOOLEAN DEFAULT FALSE,
  done_by TEXT,
  done_at TIMESTAMPTZ,
  evidence_file_path TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by TEXT NOT NULL
);
