// Vercel Serverless Function: Check LINE Membership (100% Free - 0 Message Credits Consumed)
// GET / POST /api/check-line-member?userId=U...

module.exports = async function handler(req, res) {
  // 1. Enable Full Cross-Origin Resource Sharing (CORS)
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-api-key');
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const rawUserId = req.query.userId || (req.body && req.body.userId);
  const userId = Array.isArray(rawUserId) ? rawUserId[0] : (rawUserId || '');

  if (!userId || typeof userId !== 'string' || !userId.startsWith('U')) {
    return res.status(400).json({
      success: false,
      isMember: false,
      error: 'รูปแบบ LINE User ID ไม่ถูกต้อง (ต้องขึ้นต้นด้วย U...)'
    });
  }

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!channelAccessToken) {
    console.warn('[CHECK MEMBER] LINE_CHANNEL_ACCESS_TOKEN is not set in environment.');
    // Graceful fallback: return member true if token is missing in staging
    return res.json({
      success: true,
      isMember: true,
      userId,
      displayName: 'ผู้ใช้งาน LINE'
    });
  }

  try {
    // 2. Query LINE Messaging API Profile endpoint (Free 100% - Read-only metadata query)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const lineRes = await fetch(`https://api.line.me/v2/bot/profile/${encodeURIComponent(userId)}`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${channelAccessToken}`
      },
      signal: controller.signal
    });
    clearTimeout(timeout);

    if (lineRes.status === 200) {
      const profile = await lineRes.json();
      return res.status(200).json({
        success: true,
        isMember: true,
        userId: profile.userId,
        displayName: profile.displayName,
        pictureUrl: profile.pictureUrl
      });
    }

    if (lineRes.status === 404) {
      // 404: User is not following or blocked the LINE OA
      return res.status(200).json({
        success: true,
        isMember: false,
        reason: 'not_friend',
        message: 'ยังไม่ได้เพิ่มเพื่อนใน LINE @586xxhlx'
      });
    }

    // Other statuses (rate limit, etc.)
    return res.status(200).json({
      success: true,
      isMember: false,
      reason: 'unknown',
      status: lineRes.status
    });
  } catch (err) {
    console.error('[CHECK LINE MEMBER ERROR]:', err && err.message);
    return res.status(500).json({
      success: false,
      isMember: false,
      error: 'เกิดข้อผิดพลาดในการตรวจสอบสถานะสมาชิก'
    });
  }
};
