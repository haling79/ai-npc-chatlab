export type UUID = string;

export interface CharacterRow {
  id: UUID;
  name: string;
  persona: string | null;
  style_guide: string | null; // JSON string
  tags: string | null;        // JSON string
  created_at: string;
  updated_at: string;
}

export interface PromptRow {
  id: UUID;
  name: string;
  system: string | null;
  user_template: string | null;
  notes: string | null;
  version_tag: string | null;
  created_at: string;
  updated_at: string;
}

export interface SessionRow {
  id: UUID;
  character_id: UUID;
  prompt_id: UUID;
  title: string | null;
  created_at: string;
}

export interface MessageRow {
  id: UUID;
  session_id: UUID;
  role: 'user' | 'npc';
  content: string | null;
  meta: string | null; // JSON string
  created_at: string;
}

export interface FeedbackRow {
  id: UUID;
  message_id: UUID;
  rating: number | null;
  comment: string | null;
  created_at: string;
}

export interface Metrics {
  length: number;
  forbiddenHits: string[];
  toneMatch: boolean | null;
}

export interface Meta {
  at?: number;
  model?: 'gemini';
  metrics?: Metrics;
  compare?: boolean;
}