const https = require('https');

function postJson(urlString, body) {
  return new Promise((resolve) => {
    try {
      const url = new URL(urlString);
      const data = JSON.stringify(body);
      const req = https.request(
        {
          hostname: url.hostname,
          path: url.pathname + url.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(data)
          }
        },
        (res) => {
          let chunks = '';
          res.on('data', (c) => {
            chunks += c.toString();
          });
          res.on('end', () => resolve({ ok: res.statusCode >= 200 && res.statusCode < 300, statusCode: res.statusCode, body: chunks }));
        }
      );
      req.on('error', () => resolve({ ok: false }));
      req.write(data);
      req.end();
    } catch {
      resolve({ ok: false });
    }
  });
}

async function notify(topic, message, title) {
  const base = process.env.NTFY_BASE_URL || 'https://ntfy.sh';
  const url = `${base.replace(/\/$/, '')}/${encodeURIComponent(topic)}`;
  return postJson(url, {
    topic,
    message,
    title: title || 'Orama v2',
    priority: 3
  });
}

module.exports = { notify };