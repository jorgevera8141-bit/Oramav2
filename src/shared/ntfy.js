const https = require('https');

function postJson(urlString, body) {
  return new Promise((resolve) => {
    let url;
    try { url = new URL(urlString); } catch { resolve({ ok: false, statusCode: 0 }); return; }
    const data = JSON.stringify(body);
    const request = https.request({ hostname: url.hostname, path: `${url.pathname}${url.search}`, method: 'POST', headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) } }, (response) => {
      response.resume();
      response.on('end', () => resolve({ ok: response.statusCode >= 200 && response.statusCode < 300, statusCode: response.statusCode }));
    });
    request.setTimeout(5_000, () => request.destroy());
    request.on('error', () => resolve({ ok: false, statusCode: 0 }));
    request.end(data);
  });
}

async function notify(topic, message, title = 'Orama v2') {
  if (!topic || !message) return { ok: false, statusCode: 0 };
  const baseUrl = (process.env.NTFY_BASE_URL || 'https://ntfy.sh').replace(/\/$/, '');
  return postJson(`${baseUrl}/${encodeURIComponent(topic)}`, { topic, message, title, priority: 3 });
}

module.exports = { notify };