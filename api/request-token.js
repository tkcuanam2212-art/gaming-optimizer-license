import { sql } from './_lib/db.js';
import { generateToken, getClientIp } from './_lib/utils.js';

const SHRINKME_API_KEY = process.env.SHRINKME_API_KEY;
const BASE_URL = process.env.BASE_URL;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();

  const { hwid } = req.body || {};
  if (!hwid || hwid.length < 8 || hwid.length > 128) {
    return res.status(400).json({ error: 'HWID khong hop le' });
  }

  const token = generateToken();
  const ip = getClientIp(req);

  await sql`
    INSERT INTO tokens (token, hwid, ip, used, created_at)
    VALUES (${token}, ${hwid}, ${ip}, false, NOW())
  `;
  await sql`DELETE FROM tokens WHERE created_at < NOW() - INTERVAL '1 hour'`;

  const callbackUrl = `${BASE_URL}/api/callback?token=${token}`;

  // Gọi ShrinkMe API tạo short link động
  const apiUrl = `https://shrinkme.io/api?api=${SHRINKME_API_KEY}&url=${encodeURIComponent(callbackUrl)}&format=text`;

  try {
    const response = await fetch(apiUrl);
    const shortUrl = (await response.text()).trim();

    if (!shortUrl || !shortUrl.startsWith('http')) {
      console.error('ShrinkMe API response:', shortUrl);
      return res.status(500).json({
        error: 'ShrinkMe API failed',
        detail: shortUrl.substring(0, 200)
      });
    }

    return res.json({ url: shortUrl });
  } catch (err) {
    console.error('Fetch error:', err);
    return res.status(500).json({ error: 'Server error: ' + err.message });
  }
}
