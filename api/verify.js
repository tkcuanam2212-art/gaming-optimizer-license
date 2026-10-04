import { sql } from './_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'POST') return res.status(405).end();

  const { key, hwid } = req.body || {};
  if (!key || !hwid) return res.json({ valid: false, reason: 'missing' });

  const rows = await sql`SELECT * FROM keys WHERE key_code = ${key} LIMIT 1`;
  if (rows.length === 0) return res.json({ valid: false, reason: 'not_found' });

  const k = rows[0];
  if (k.status === 'revoked')    return res.json({ valid: false, reason: 'revoked' });
  if (k.hwid && k.hwid !== hwid) return res.json({ valid: false, reason: 'hwid_mismatch' });
  if (k.expires_at && new Date(k.expires_at) < new Date())
    return res.json({ valid: false, reason: 'expired' });

  if (!k.hwid) {
    await sql`UPDATE keys SET hwid = ${hwid}, activated_at = NOW() WHERE id = ${k.id}`;
  }

  return res.json({ valid: true, type: k.key_type, expires_at: k.expires_at });
}