import { sql } from './_lib/db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).end();

  const { hwid } = req.query;
  if (!hwid || hwid.length < 8) {
    return res.status(400).json({ error: 'missing hwid' });
  }

  const rows = await sql`
    SELECT key_code, expires_at FROM keys
    WHERE hwid = ${hwid}
      AND key_type = 'free'
      AND status != 'revoked'
      AND expires_at > NOW()
    ORDER BY id DESC LIMIT 1
  `;

  if (rows.length === 0) return res.json({ found: false });

  return res.json({
    found: true,
    key: rows[0].key_code,
    expires_at: rows[0].expires_at
  });
}
