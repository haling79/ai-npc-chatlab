import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Log where we are looking for .env and try a few sensible locations
const cwd = process.cwd();
const moduleDir = path.dirname(fileURLToPath(import.meta.url)); // .../server/src
const candidates = [
  path.resolve(cwd, '.env'),                 // current working dir
  path.resolve(moduleDir, '../.env'),        // server/.env (when importing from src)
  path.resolve(cwd, 'server/.env'),          // projectRoot/server/.env (if started from project root)
  path.resolve(moduleDir, '../../.env'),     // projectRoot/.env (one level above server)
];

let loadedFrom: string | null = null;
let loadedKeys: string[] = [];

for (const p of candidates) {
  try {
    const exists = fs.existsSync(p);
    if (!exists) {
      continue;
    }
    const result = dotenv.config({ path: p });
    if (!result.error) {
      loadedFrom = p;
      loadedKeys = result.parsed ? Object.keys(result.parsed) : [];
      break;
    }
  } catch {
    // ignore and try next
  }
}

// Fallback to default resolution if nothing loaded yet
if (!loadedFrom) {
  const result = dotenv.config();
  if (!result.error) {
    loadedFrom = path.resolve(cwd, '.env');
    loadedKeys = result.parsed ? Object.keys(result.parsed) : [];
  }
}

// Emit diagnostic logs without leaking secrets
try {
  // Only print once on startup
  // Note: do not print values; keys only
  console.log('[ENV] process.cwd =', cwd);
  console.log('[ENV] moduleDir =', moduleDir);
  console.log('[ENV] NODE_ENV =', process.env.NODE_ENV || '(not set)');
  console.log('[ENV] .env candidates =', candidates);
  if (loadedFrom) {
    console.log('[ENV] Loaded .env from:', loadedFrom);
    console.log('[ENV] Loaded keys:', loadedKeys);
  } else {
    console.log('[ENV] No .env file loaded by dotenv');
  }
} catch {
  // avoid crashing on logging errors
}

export const ENV = {
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'npc_chatlab',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  PORT: Number(process.env.PORT || 4000),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
};