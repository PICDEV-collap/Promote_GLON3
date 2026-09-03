import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export const CONFIG = {
  PORT: process.env.PORT || 3000,
  BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
  
  // N3 Official Dealer Portal & Paotang OAuth
  N3_LOGIN_URL: process.env.N3_LOGIN_URL || 'https://n3.glolotteryshop.com/login/',
  ALLOWED_DOMAINS: [
    'n3.glolotteryshop.com',
    'glolotteryshop.com',
    '*.glolotteryshop.com',
    'paotang-pass.devops.krungthai.com',
    'paotang-auth.krungthai.com',
    '*.krungthai.com',
    '*.devops.krungthai.com'
  ],

  // Quota Management (2,000 ใบ)
  DEFAULT_MAX_QUOTA: 2000,
  QUOTA_FILE_PATH: path.join(__dirname, '../data/quota.json'),

  // LINE Messaging API
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET || '',
  ADMIN_LINE_USER_ID: process.env.ADMIN_LINE_USER_ID || '',

  // Storage
  QR_OUTPUT_DIR: path.join(__dirname, '../../public/qrcodes'),
  SESSION_STORAGE_PATH: path.join(__dirname, '../data/storageState.json')
};
