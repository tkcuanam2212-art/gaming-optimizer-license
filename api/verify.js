// api/verify.js — v2.0 Redis + JWT + Rate limit
import { Redis } from '@upstash/redis';
import { Ratelimit } from '@upstash/ratelimit';
import jwt from 'jsonwebtoken';
import { sql } from './_lib/db.js';

// ─── Init Redis ───
const redis = Redis.fromEnv();

// ─── Init Rate limit (10 req/phút/IP) ───
const ratelimit = new Ratelimit({
  redis,
  limiter: Ratelimit.slidingWindow(10, '1 m'),
  analytics: false,
  prefix: 'ratelimit:verify',
});

// ─── JWT config ───
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_TTL = '2h';        // Token sống 2 giờ
const CACHE_TTL = 300;       // Redis cache 5 phút
const NOT_FOUND_TTL = 60;    // Cache not-found 60 giây

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();

  // Validate env
  if (!JWT_SECRET) {
    console.error('JWT_SECRET not set');
    return res.status(500).json({ valid: false, reason: 'server_error' });
  }

  const { key, hwid } = req.body || {};
  if (!key || !hwid) {
    return res.json({ valid: false, reason: 'missing' });
  }

  // ─── Rate limit ───
  const ip = (req.headers['x-forwarded-for'] || 'unknown').split(',')[0].trim();
  try {
    const { success } = await ratelimit.limit(ip);
    if (!success) {
      return res.status(429).json({ valid: false, reason: 'rate_limited' });
    }
  } catch (e) {
    console.warn('Rate limit error:', e.message);
    // Không block khách nếu Redis lỗi
  }

  try {
    // ─── BƯỚC 1: Check Redis cache ───
    const cacheKey = `license:${key}`;
    let k = await redis.get(cacheKey);

    // ─── BƯỚC 2: Cache miss → Query Neon ───
    if (!k) {
      const rows = await sql`SELECT * FROM keys WHERE key_code = ${key} LIMIT 1`;

      if (rows.length === 0) {
        await redis.set(cacheKey, 'NOT_FOUND', { ex: NOT_FOUND_TTL });
        return res.json({ valid: false, reason: 'not_found' });
      }

      k = rows[0];

      // Lưu cache 5 phút
      await redis.set(cacheKey, JSON.stringify(k), { ex: CACHE_TTL });
    } else if (typeof k === 'string') {
      if (k === 'NOT_FOUND') {
        return res.json({ valid: false, reason: 'not_found' });
      }
      try {
        k = JSON.parse(k);
      } catch (e) {
        await redis.del(cacheKey);
        return res.json({ valid: false, reason: 'cache_error' });
      }
    }

    // ─── BƯỚC 3: Verify ───
    if (k.status === 'revoked') {
      return res.json({ valid: false, reason: 'revoked' });
    }

    if (k.hwid && k.hwid !== hwid) {
      return res.json({ valid: false, reason: 'hwid_mismatch' });
    }

    if (k.expires_at && new Date(k.expires_at) < new Date()) {
      return res.json({ valid: false, reason: 'expired' });
    }

    // ─── BƯỚC 4: Bind HWID lần đầu (nếu chưa có) ───
    if (!k.hwid) {
      await sql`UPDATE keys SET hwid = ${hwid}, activated_at = NOW() WHERE id = ${k.id}`;
      // Update cache
      k.hwid = hwid;
      k.activated_at = new Date().toISOString();
      await redis.set(cacheKey, JSON.stringify(k), { ex: CACHE_TTL });
    }

    // ─── BƯỚC 5: Tạo JWT token (2h) ───
    const token = jwt.sign(
      {
        key_code: key,
        hwid: hwid,
        key_type: k.key_type,
      },
      JWT_SECRET,
      { expiresIn: JWT_TTL }
    );

    // ─── BƯỚC 6: Trả response ───
    return res.json({
      valid: true,
      type: k.key_type,
      expires_at: k.expires_at,
      token: token,           // ★ Token mới — client lưu lại
      token_ttl: 7200,        // 2 giờ (giây)
    });

  } catch (error) {
    console.error('Verify error:', error);
    return res.status(500).json({ valid: false, reason: 'server_error' });
  }
}
