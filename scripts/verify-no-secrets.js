#!/usr/bin/env node
/**
 * Automated Secret Scanner & Git Pre-Commit Guard
 * Prevents LINE Tokens, Secrets, Telegram Tokens, and .env files from being committed to Git.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');

// Regex patterns that must NEVER be committed
const SENSITIVE_PATTERNS = [
  {
    name: 'LINE Channel Access Token Assignment',
    regex: /(?:LINE_CHANNEL_ACCESS_TOKEN|channelAccessToken)\s*[:=]\s*['"]([a-zA-Z0-9+/=_-]{40,})['"]/gi,
    validator: (match, captured) => {
      const val = (captured || match).toLowerCase();
      if (val.includes('your_channel_access_token') || val.includes('dummy') || val.includes('mock') || val.includes('process.env')) {
        return false;
      }
      return true;
    }
  },
  {
    name: 'LINE Channel Secret Assignment',
    regex: /(?:LINE_CHANNEL_SECRET|channelSecret)\s*[:=]\s*['"]([a-f0-9]{32})['"]/gi,
    validator: (match, captured) => {
      const val = (captured || match).toLowerCase();
      if (val.includes('your_channel_secret') || val.includes('00000000') || val.includes('process.env')) {
        return false;
      }
      return true;
    }
  },
  {
    name: 'Hardcoded Telegram Bot Token',
    regex: /(?:TELEGRAM_BOT_TOKEN|botToken)\s*[:=]\s*['"](\d{8,12}:[A-Za-z0-9_-]{35})['"]/gi,
    validator: (match, captured) => {
      const val = (captured || match).toLowerCase();
      if (val.includes('your_telegram') || val.includes('123456789:abcdef') || val.includes('process.env')) {
        return false;
      }
      return true;
    }
  },
  {
    name: 'Standalone Telegram Bot Token',
    regex: /\b\d{9,11}:[A-Za-z0-9_-]{35}\b/g,
    validator: (match) => {
      if (match.startsWith('123456789:ABCdefGhI')) return false; // documentation sample
      return true;
    }
  },
  {
    name: 'Private Key Header',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g,
    validator: () => true
  }
];

// Blocked filenames that must NEVER be committed or staged
const FORBIDDEN_FILE_PATTERNS = [
  /^\.env$/i,
  /\.env$/i,
  /\.env\.(local|development|production|test)$/i,
  /storageState\.json$/i,
  /credentials\.json$/i,
  /client_secret.*\.json$/i,
  /id_rsa/i,
  /\.pem$/i
];

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.wav', '.ogg', '.mp4', '.mov', '.avi',
  '.pdf', '.zip', '.tar', '.gz', '.7z'
]);

function getStagedFiles() {
  try {
    const out = execSync('git diff --cached --name-only', { cwd: ROOT_DIR, encoding: 'utf-8' });
    return out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  } catch (err) {
    console.error('Failed to get staged files:', err.message);
    return [];
  }
}

function main() {
  const args = process.argv.slice(2);
  const scanAll = args.includes('--all');

  let filesToScan = [];

  if (scanAll) {
    console.log('[SECURITY SCAN] Scanning all tracked files in repository...');
    try {
      const out = execSync('git ls-files', { cwd: ROOT_DIR, encoding: 'utf-8' });
      filesToScan = out.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    } catch (err) {
      console.error('Failed to list git files:', err.message);
      process.exit(1);
    }
  } else {
    filesToScan = getStagedFiles();
    if (filesToScan.length === 0) {
      console.log('✔ [SECURITY GUARD] No staged files to check.');
      process.exit(0);
    }
  }

  console.log(`[SECURITY GUARD] Verifying ${filesToScan.length} file(s) for sensitive keys & credentials...`);

  let violations = [];

  for (const relPath of filesToScan) {
    const fullPath = path.join(ROOT_DIR, relPath);

    // 1. Check forbidden file names
    for (const pattern of FORBIDDEN_FILE_PATTERNS) {
      if (pattern.test(relPath) || pattern.test(path.basename(relPath))) {
        violations.push({
          file: relPath,
          rule: 'FORBIDDEN_FILE',
          message: `ไฟล์คอนฟิก/ความลับ '${relPath}' กำลังจะถูกนำขึ้น Git! ห้าม commit ไฟล์นี้เด็ดขาด!`
        });
      }
    }

    if (!fs.existsSync(fullPath)) continue;

    // Skip binary files
    const ext = path.extname(relPath).toLowerCase();
    if (BINARY_EXTENSIONS.has(ext)) {
      continue;
    }

    // 2. Check file content
    try {
      const content = fs.readFileSync(fullPath, 'utf-8');

      for (const pattern of SENSITIVE_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(content)) !== null) {
          const matchedStr = match[0];
          const capturedStr = match[1] || matchedStr;
          if (pattern.validator && pattern.validator(matchedStr, capturedStr)) {
            const linesUpToMatch = content.slice(0, match.index).split('\n');
            const lineNumber = linesUpToMatch.length;
            violations.push({
              file: relPath,
              line: lineNumber,
              rule: pattern.name,
              message: `ตรวจพบลักษณะคีย์ความลับ: ${pattern.name} ที่บรรทัด ${lineNumber}`
            });
            break;
          }
        }
      }
    } catch (err) {
      // Ignore unreadable files
    }
  }

  if (violations.length > 0) {
    console.error('\n====================================================================');
    console.error('  ❌ [SECURITY VIOLATION] ปฏิเสธการ COMMIT / PUSH ข้อมูลขึ้น GIT!');
    console.error('====================================================================');
    console.error('  ระบบตรวจพบความลับหรือไฟล์สำคัญที่อาจหลุดขึ้น GitHub:\n');
    for (const v of violations) {
      console.error(`  • [${v.rule}] ${v.file}${v.line ? ` (บรรทัด ${v.line})` : ''}`);
      console.error(`    -> ${v.message}`);
    }
    console.error('\n  💡 วิธีแก้ไข:');
    console.error('  1. ให้เก็บคีย์ความลับทั้งหมดไว้ในไฟล์ bot-service/.env เท่านั้น');
    console.error('  2. อย่ากรอกคีย์จริงลงใน .env.example หรือไฟล์โค้ดสคริปต์เด็ดขาด');
    console.error('  3. สั่ง git reset HEAD <file> เพื่อยกเลิกการ stage ไฟล์ดังกล่าว\n');
    console.error('====================================================================\n');
    process.exit(1);
  }

  console.log('✔ [SECURITY GUARD PASS] ไม่พบคีย์หรือข้อมูลความลับในไฟล์ที่ตรวจสอบ ปลอดภัย 100% ✨\n');
  process.exit(0);
}

main();
