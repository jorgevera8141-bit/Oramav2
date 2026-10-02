const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

// In production this path is a mounted Railway Volume so processed images survive
// redeploys. Created on boot either way. UPLOAD_DIR overrides it (tests, other hosts).
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(__dirname, '..', '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

// A few KB of PNG can decode to hundreds of MB of pixels (a decompression bomb), and the
// 8 MB upload cap says nothing about that. 40 MP covers any phone photo.
const MAX_INPUT_PIXELS = 40_000_000;

// The upload route is reachable without a login, so the directory is capped: once the
// stored images pass this size, new uploads are refused instead of filling the volume.
const DEFAULT_QUOTA_BYTES = 500 * 1024 * 1024;

function uploadQuotaBytes() {
  const configured = Number(process.env.UPLOADS_MAX_BYTES);
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_QUOTA_BYTES;
}

async function usedBytes() {
  const names = await fs.promises.readdir(UPLOAD_DIR);
  const sizes = await Promise.all(names.map(async (name) => {
    try {
      const stats = await fs.promises.stat(path.join(UPLOAD_DIR, name));
      return stats.isFile() ? stats.size : 0;
    } catch {
      return 0; // removed between readdir and stat
    }
  }));
  return sizes.reduce((sum, size) => sum + size, 0);
}

async function assertUnderQuota() {
  if (await usedBytes() >= uploadQuotaBytes()) {
    throw Object.assign(new Error('El almacenamiento de imágenes está lleno. Avisa al administrador.'), { statusCode: 507 });
  }
}

// Single image pipeline shared by the multipart upload route and the AI
// image-generation module: honor EXIF orientation, cap the longest side, strip
// metadata, re-encode as JPEG. Returns the public path plus final dimensions.
async function processImageToJpeg(buffer) {
  await assertUnderQuota();
  const filename = `${crypto.randomUUID()}.jpg`;
  const outputPath = path.join(UPLOAD_DIR, filename);
  // sharp's toFile() resolves with the info object directly (not { info }).
  const info = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(outputPath);
  return { url: `/uploads/${filename}`, width: info.width, height: info.height, bytes: info.size };
}

module.exports = { processImageToJpeg, UPLOAD_DIR, MAX_DIMENSION, JPEG_QUALITY, MAX_INPUT_PIXELS };
