import crypto from 'crypto';
import jwt from 'jsonwebtoken';

export function generateKey(prefix = 'GO') {
  const p = () => crypto.randomBytes(3).toString('hex').toUpperCase();
  return `${prefix}-${p()}-${p()}-${p()}`;
}
export function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}
export function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || '').split(',')[0].trim()
      || req.socket?.remoteAddress || 'unknown';
}
export function signToken(payload) {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}
export function verifyToken(token) {
  try { return jwt.verify(token, process.env.JWT_SECRET); }
  catch { return null; }
}
export function requireAdmin(req) {
  const t = (req.headers.authorization || '').replace('Bearer ', '');
  const d = verifyToken(t);
  if (!d || d.role !== 'admin') throw new Error('UNAUTHORIZED');
  return d;
}
export function getVNMidnightTomorrow() {
  const now = new Date();
  const vnMs = now.getTime() + (7 * 60 * 60 * 1000);
  const vn = new Date(vnMs);
  vn.setUTCHours(0, 0, 0, 0);
  vn.setUTCDate(vn.getUTCDate() + 1);
  const utcMs = vn.getTime() - (7 * 60 * 60 * 1000);
  return new Date(utcMs).toISOString();
}