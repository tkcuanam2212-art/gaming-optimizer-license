import { sql } from './_lib/db.js';
import { generateKey, getVNMidnightTomorrow } from './_lib/utils.js';

export default async function handler(req, res) {
  const { token } = req.query;
  if (!token) return htmlErr(res, 'Thieu token');

  const rows = await sql`SELECT * FROM tokens WHERE token = ${token} LIMIT 1`;
  if (rows.length === 0) return htmlErr(res, 'Token khong ton tai');

  const t = rows[0];
  if (t.used) return htmlErr(res, 'Token da su dung');

  const existing = await sql`
    SELECT key_code, expires_at FROM keys
    WHERE hwid = ${t.hwid}
      AND key_type = 'free'
      AND status != 'revoked'
      AND expires_at > NOW()
    ORDER BY id DESC LIMIT 1
  `;

  let keyCode, expiresAt;
  if (existing.length > 0) {
    keyCode   = existing[0].key_code;
    expiresAt = existing[0].expires_at;
  } else {
    keyCode   = generateKey('GO-FREE');
    expiresAt = getVNMidnightTomorrow();
    await sql`
      INSERT INTO keys (key_code, key_type, hwid, ip_created, status, expires_at, created_at)
      VALUES (${keyCode}, 'free', ${t.hwid}, ${t.ip}, 'active', ${expiresAt}, NOW())
    `;
  }
  await sql`UPDATE tokens SET used = true WHERE id = ${t.id}`;
  return res.send(htmlKey(keyCode, expiresAt));
}

function htmlKey(key, exp) {
  const expVN = new Date(exp).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' });
  return `<!DOCTYPE html><html><head><meta charset="UTF-8">
<title>Key cua ban</title>
<style>
body{font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:40px;max-width:600px;margin:auto;text-align:center}
h1{color:#38bdf8}
.key{font-family:monospace;font-size:24px;background:#1e293b;padding:24px;border-radius:8px;border:2px solid #38bdf8;user-select:all;margin:24px 0;color:#38bdf8;letter-spacing:2px}
.copy{background:#38bdf8;color:#0f172a;border:none;padding:14px 28px;border-radius:6px;font-size:15px;font-weight:600;cursor:pointer}
.info{color:#94a3b8;font-size:14px;margin-top:20px;line-height:1.7}
</style></head>
<body>
  <h1>Key cua ban</h1>
  <div class="key" id="k">${key}</div>
  <p class="info">Het han luc <strong>0h00 ngay mai (gio VN)</strong><br>${expVN}</p>
  <button class="copy" onclick="navigator.clipboard.writeText('${key}');this.textContent='Da copy!'">Copy key</button>
  <p class="info" style="margin-top:30px">Dan key vao app <strong>Gaming Optimizer</strong>.</p>
  <script>setTimeout(()=>navigator.clipboard.writeText('${key}').catch(()=>{}),300)</script>
</body></html>`;
}

function htmlErr(res, msg) {
  return res.status(400).send(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Loi</title>
<style>body{font-family:system-ui;background:#0f172a;color:#e2e8f0;padding:60px;text-align:center}h1{color:#f87171}</style></head>
<body><h1>${msg}</h1><a href="/" style="color:#38bdf8">Ve trang chu</a></body></html>`);
}