import { sql } from './_lib/db.js';
import { generateToken, getClientIp } from './_lib/utils.js';

const SHRINKME_API_KEY = process.env.SHRINKME_API_KEY;
const BASE_URL = process.env.BASE_URL;

// ── RATE LIMIT CONFIG ─────────────────────────────────────
const MAX_PER_HWID_5MIN = 3;    // tối đa 3 link / 5 phút / thiết bị
const MAX_PER_HWID_DAY  = 20;   // tối đa 20 link / 24h / thiết bị
const MAX_PER_IP_10MIN  = 10;   // tối đa 10 link / 10 phút / IP
const MAX_PER_IP_DAY    = 50;   // tối đa 50 link / 24h / IP
// ──────────────────────────────────────────────────────────

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { hwid } = req.body || {};
  if (!hwid || hwid.length < 8 || hwid.length > 128) {
    return res.status(400).json({ error: 'HWID khong hop le' });
  }

  const ip = getClientIp(req);

  // ── RATE LIMIT CHECKS ────────────────────────────────────
  try {
    // 1. HWID trong 5 phút
    const hwid5 = await sql`
      SELECT COUNT(*)::int AS c FROM tokens
      WHERE hwid = ${hwid}
        AND created_at > NOW() - INTERVAL '5 minutes'
    `;
    if (hwid5[0].c >= MAX_PER_HWID_5MIN) {
      return res.status(429).json({
        error: `Ban da tao ${MAX_PER_HWID_5MIN} link trong 5 phut. Vui long doi 5 phut roi thu lai.`
      });
    }

    // 2. HWID trong 24h
    const hwidDay = await sql`
      SELECT COUNT(*)::int AS c FROM tokens
      WHERE hwid = ${hwid}
        AND created_at > NOW() - INTERVAL '24 hours'
    `;
    if (hwidDay[0].c >= MAX_PER_HWID_DAY) {
      return res.status(429).json({
        error: `Ban da dat gioi han ${MAX_PER_HWID_DAY} link/ngay. Thu lai sau.`
      });
    }

    // 3. IP trong 10 phút (chặn bot / VPN spam)
    const ip10 = await sql`
      SELECT COUNT(*)::int AS c FROM tokens
      WHERE ip = ${ip}
        AND created_at > NOW() - INTERVAL '10 minutes'
    `;
    if (ip10[0].c >= MAX_PER_IP_10MIN) {
      return res.status(429).json({
        error: `Qua nhieu yeu cau tu IP nay. Thu lai sau 10 phut.`
      });
    }

    // 4. IP trong 24h
    const ipDay = await sql`
      SELECT COUNT(*)::int AS c FROM tokens
      WHERE ip = ${ip}
        AND created_at > NOW() - INTERVAL '24 hours'
    `;
    if (ipDay[0].c >= MAX_PER_IP_DAY) {
      return res.status(429).json({
        error: `IP nay da dat gioi han ${MAX_PER_IP_DAY} link/ngay.`
      });
    }
  } catch (err) {
    console.error('Rate limit check error:', err);
    // Fail-open: nếu DB lỗi thì vẫn cho user tạo link (không chặn oan)
  }
  // ──────────────────────────────────────────────────────────

  // ── XOÁ TOKEN CŨ CỦA CÙNG HWID (chỉ giữ link mới nhất) ───
  await sql`
    DELETE FROM tokens 
    WHERE hwid = ${hwid} AND used = false
  `;

  // ── DỌN DB: xoá token cũ hơn 1 giờ ───────────────────────
  await sql`DELETE FROM tokens WHERE created_at < NOW() - INTERVAL '1 hour'`;

  // ── TẠO TOKEN MỚI ────────────────────────────────────────
  const token = generateToken();

  await sql`
    INSERT INTO tokens (token, hwid, ip, used, created_at)
    VALUES (${token}, ${hwid}, ${ip}, false, NOW())
  `;

  // ── GỌI SHRINKME ─────────────────────────────────────────
  const callbackUrl = `${BASE_URL}/api/callback?token=${token}`;
  const apiUrl = `https://shrinkme.io/api?api=${SHRINKME_API_KEY}&url=${encodeURIComponent(callbackUrl)}&format=text`;

  try {
    const response = await fetch(apiUrl);
    const shortUrl = (await response.text()).trim();

    if (!shortUrl || !shortUrl.startsWith('http')) {
      console.error('ShrinkMe API response:', shortUrl);
      // Xoá token vừa tạo vì không lấy được link
      await sql`DELETE FROM tokens WHERE token = ${token}`;
      return res.status(500).json({
        error: 'Khong the tao link. Vui long thu lai.',
        detail: shortUrl.substring(0, 200)
      });
    }

    return res.json({ url: shortUrl });
  } catch (err) {
    console.error('Fetch error:', err);
    await sql`DELETE FROM tokens WHERE token = ${token}`;
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
