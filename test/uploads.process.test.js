const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const sharp = require('sharp');

// Point the module at a throwaway directory before it is loaded.
const uploadDir = fs.mkdtempSync(path.join(os.tmpdir(), 'orama-uploads-'));
process.env.UPLOAD_DIR = uploadDir;
const { processImageToJpeg } = require('../src/modules/uploads/process');

const png = (width, height) => sharp({ create: { width, height, channels: 3, background: '#2a9d8f' } }).png().toBuffer();
const filesInDir = () => fs.readdirSync(uploadDir);

test.afterEach(() => {
  delete process.env.UPLOADS_MAX_BYTES;
  for (const name of filesInDir()) fs.rmSync(path.join(uploadDir, name), { force: true });
});

test('processImageToJpeg re-encodes a normal image as a capped JPEG in the upload directory', async () => {
  const saved = await processImageToJpeg(await png(2400, 1200));
  assert.match(saved.url, /^\/uploads\/[0-9a-f-]+\.jpg$/);
  assert.equal(saved.width, 1600);
  assert.equal(filesInDir().length, 1);
});

test('processImageToJpeg rejects an image whose pixel count would exhaust memory', async () => {
  const hugeButTiny = await png(8000, 6000); // 48 MP: a few KB on the wire, hundreds of MB decoded
  await assert.rejects(() => processImageToJpeg(hugeButTiny), /pixel limit/i);
  assert.equal(filesInDir().length, 0, 'nothing may be written for a rejected image');
});

test('processImageToJpeg rejects bytes that are not an image', async () => {
  await assert.rejects(() => processImageToJpeg(Buffer.from('<script>alert(1)</script>')));
  assert.equal(filesInDir().length, 0);
});

test('processImageToJpeg refuses new files with 507 once the upload directory is over its quota', async () => {
  fs.writeFileSync(path.join(uploadDir, 'existing.jpg'), Buffer.alloc(500));
  process.env.UPLOADS_MAX_BYTES = '100';
  const tiny = await png(50, 50);
  await assert.rejects(() => processImageToJpeg(tiny), (error) => error.statusCode === 507);
  assert.deepEqual(filesInDir(), ['existing.jpg']);
});

test('processImageToJpeg keeps accepting files while the directory is under its quota', async () => {
  process.env.UPLOADS_MAX_BYTES = String(10 * 1024 * 1024);
  await processImageToJpeg(await png(50, 50));
  assert.equal(filesInDir().length, 1);
});
