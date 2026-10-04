import { sql } from './_lib/db.js';
import { generateToken, getClientIp } from './_lib/utils.js';

const LINK4M_URL = process.env.LINK4M_URL;
const BASE_URL   = process.env.BASE_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
  const { hwid } = req.body || {};
  if (!hwid || hwid.length < 8 || hwid.length > 128)
    return res.status(400).json({ error: 'HWID khong hop le' });

  const token = generateToken();
  const ip = getClientIp(req);

  await sql`
    INSERT INTO tokens (token, hwid, ip, used, created_at)
    VALUES (${token}, ${hwid}, ${ip}, false, NOW())
  `;
  await sql`DELETE FROM tokens WHERE created_at < NOW() - INTERVAL '1 hour'`;

  const callbackUrl = `${BASE_URL}/api/callback?token=${token}`;
  const url = `${LINK4M_URL}?sub_id=${token}&redirect=${encodeURIComponent(callbackUrl)}`;
  return res.json({ url });
}