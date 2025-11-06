import dotenv from 'dotenv';
dotenv.config();

export const ENV = {
  DB_HOST: process.env.DB_HOST || 'localhost',
  DB_USER: process.env.DB_USER || 'root',
  DB_PASSWORD: process.env.DB_PASSWORD || '',
  DB_NAME: process.env.DB_NAME || 'npc_chatlab',
  GOOGLE_API_KEY: process.env.GOOGLE_API_KEY || '',
  PORT: Number(process.env.PORT || 4000),
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*'
};