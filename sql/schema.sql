CREATE DATABASE IF NOT EXISTS npc_chatlab CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE npc_chatlab;

CREATE TABLE IF NOT EXISTS characters (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  persona TEXT,
  style_guide JSON,
  tags JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS prompts (
  id CHAR(36) PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  system TEXT,
  user_template TEXT,
  notes TEXT,
  version_tag VARCHAR(20),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS sessions (
  id CHAR(36) PRIMARY KEY,
  character_id CHAR(36),
  prompt_id CHAR(36),
  title VARCHAR(200),
  summary TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (character_id) REFERENCES characters(id),
  FOREIGN KEY (prompt_id) REFERENCES prompts(id)
);

CREATE TABLE IF NOT EXISTS messages (
  id CHAR(36) PRIMARY KEY,
  session_id CHAR(36),
  role ENUM('user','npc') NOT NULL,
  content TEXT,
  meta JSON,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (session_id) REFERENCES sessions(id)
);

CREATE TABLE IF NOT EXISTS feedback (
  id CHAR(36) PRIMARY KEY,
  message_id CHAR(36),
  rating INT,
  comment TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (message_id) REFERENCES messages(id)
);