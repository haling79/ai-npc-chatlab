import mysql from 'mysql2/promise';
import { ENV } from './env.js';

let pool: mysql.Pool | null = null;

export async function initDB(): Promise<mysql.Pool> {
  pool = mysql.createPool({
    host: ENV.DB_HOST,
    user: ENV.DB_USER,
    password: ENV.DB_PASSWORD,
    database: ENV.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
  });
  return pool;
}

export function getPool(): mysql.Pool {
  if (!pool) throw new Error('DB pool not initialized');
  return pool!;
}