import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const adminId = process.env.ADMIN_LINE_USER_ID || process.env.LINE_ADMIN_USER_ID || '';

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '3333', 10),
  BASE_URL: process.env.BASE_URL || 'http://localhost:3333',
  LINE_CHANNEL_ACCESS_TOKEN: process.env.LINE_CHANNEL_ACCESS_TOKEN || '',
  LINE_CHANNEL_SECRET: process.env.LINE_CHANNEL_SECRET || '',
  LINE_ADMIN_USER_ID: adminId,
  ADMIN_LINE_USER_ID: adminId,
  ADMIN_API_KEY: process.env.ADMIN_API_KEY || '',
  
  // URL เว็บไซต์โปรโมทสลาก N3 และทำนายฝัน AI
  DREAM_PREDICTION_URL: process.env.DREAM_PREDICTION_URL || 'https://promote-glon-3.vercel.app/',

  // โดเมนที่ปลอดภัยสำหรับระบบจำหน่ายสลาก (เฉพาะทางการของกองสลากและเป๋าตังกรุงไทยเท่านั้น)
  ALLOWED_DOMAINS: [
    'n3.glolotteryshop.com',
    'glolotteryshop.com',
    'krungthai.com',
    'ktb.co.th',
    'paotang-auth.krungthai.com'
  ],

  // ข้อมูลระบบจำหน่ายสลาก N3
  N3_LOGIN_URL: 'https://n3.glolotteryshop.com/login/',
  SESSION_STORAGE_PATH: path.join(__dirname, '../data/storageState.json'),
  QR_OUTPUT_DIR: path.join(__dirname, '../../public/qrcodes'),

  // การจัดการโควต้า 2,000 ใบ
  DEFAULT_MAX_QUOTA: 2000,
  QUOTA_FILE_PATH: path.join(__dirname, '../data/quota.json'),

  // ระเบียบเวลาจำหน่ายสลากกินแบ่งรัฐบาลตัวเลขสามหลัก (N3)
  SALES_HOURS: {
    NORMAL_OPEN: 6,      // 06:00 น.
    NORMAL_CLOSE: 23,    // 23:00 น.
    DRAW_DAY_CLOSE: 14,  // วันออกรางวัล ปิด 14:00 น.
    DRAW_DATES: [1, 16]  // วันที่ 1 และ 16 ของทุกเดือน
  }
};
