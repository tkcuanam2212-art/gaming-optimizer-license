import bcrypt from 'bcryptjs';
import { sql } from '../_lib/db.js';
import { signToken } from '../_lib/utils.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { username, password } = req.body || {};
  if (!username || !password) return res.status(400).json({ error: 'missing' });

  const rows = await sql`SELECT * FROM admins WHERE username = ${username} LIMIT 1`;
  if (rows.length === 0) return res.status(401).json({ error: 'Sai tai khoan' });

  const ok = await bcrypt.compare(password, rows[0].password_hash);
  if (!ok) return res.status(401).json({ error: 'Sai mat khau' });

  return res.json({ token: signToken({ role: 'admin', username, id: rows[0].id }) });
}