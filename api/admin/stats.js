import { sql } from '../_lib/db.js';
import { requireAdmin } from '../_lib/utils.js';

export default async function handler(req, res) {
  try { requireAdmin(req); } catch { return res.status(401).json({ error: 'Unauthorized' }); }

  const [total]  = await sql`SELECT COUNT(*)::int n FROM keys`;
  const [vip]    = await sql`SELECT COUNT(*)::int n FROM keys WHERE key_type='vip'`;
  const [free]   = await sql`SELECT COUNT(*)::int n FROM keys WHERE key_type='free'`;
  const [active] = await sql`SELECT COUNT(*)::int n FROM keys WHERE status='active' AND (expires_at IS NULL OR expires_at > NOW())`;
  const [claims] = await sql`SELECT COUNT(*)::int n FROM tokens WHERE used=true AND created_at > NOW() - INTERVAL '24 hours'`;
  const [today]  = await sql`SELECT COUNT(*)::int n FROM keys WHERE key_type='free' AND created_at > NOW() - INTERVAL '24 hours'`;

  return res.json({
    total_keys: total.n, vip_keys: vip.n, free_keys: free.n,
    active_keys: active.n, daily_claims: claims.n, free_today: today.n
  });
}