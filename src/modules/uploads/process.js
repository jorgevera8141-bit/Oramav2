const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const sharp = require('sharp');

// In production this path is a mounted Railway Volume so processed images survive
// redeploys. Created on boot either way.
const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;

// Single image pipeline shared by the multipart upload route and the AI
// image-generation module: honor EXIF orientation, cap the longest side, strip
// metadata, re-encode as JPEG. Returns the public path plus final dimensions.
async function processImageToJpeg(buffer) {
  const filename = `${crypto.randomUUID()}.jpg`;
  const outputPath = path.join(UPLOAD_DIR, filename);
  // sharp's toFile() resolves with the info object directly (not { info }).
  const info = await sharp(buffer)
    .rotate()
    .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toFile(outputPath);
  return { url: `/uploads/${filename}`, width: info.width, height: info.height, bytes: info.size };
}

module.exports = { processImageToJpeg, UPLOAD_DIR, MAX_DIMENSION, JPEG_QUALITY };
