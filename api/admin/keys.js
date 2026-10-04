import { sql } from '../_lib/db.js';
import { requireAdmin, generateKey } from '../_lib/utils.js';

export default async function handler(req, res) {
  try { requireAdmin(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  if (req.method === 'GET') {
    const { type } = req.query;
    const rows = type
      ? await sql`SELECT * FROM keys WHERE key_type = ${type} ORDER BY id DESC LIMIT 300`
      : await sql`SELECT * FROM keys ORDER BY id DESC LIMIT 300`;
    return res.json({ keys: rows });
  }

  if (req.method === 'POST') {
    const { count = 1, days = null } = req.body || {};
    const created = [];
    for (let i = 0; i < Math.min(count, 100); i++) {
      const code = generateKey('GO-VIP');
      const exp = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
      const r = await sql`
        INSERT INTO keys (key_code, key_type, hwid, status, expires_at, created_at)
        VALUES (${code}, 'vip', NULL, 'unused', ${exp}, NOW())
        RETURNING *
      `;
      created.push(r[0]);
    }
    return res.json({ created });
  }

  if (req.method === 'PATCH') {
    const { id, action } = req.body || {};
    if (action === 'revoke') {
      await sql`UPDATE keys SET status = 'revoked' WHERE id = ${id}`;
      return res.json({ success: true });
    }
    if (action === 'reset_hwid') {
      await sql`UPDATE keys SET hwid = NULL, status = 'unused' WHERE id = ${id}`;
      return res.json({ success: true });
    }
  }
  return res.status(405).end();
}