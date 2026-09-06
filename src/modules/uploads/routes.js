const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const multer = require('multer');
const sharp = require('sharp');

// Ephemeral on a bare container; in production this path is a mounted Railway
// Volume so processed images survive redeploys. Created on boot either way.
const UPLOAD_DIR = path.join(__dirname, '..', '..', '..', 'public', 'uploads');
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const MAX_BYTES = 8 * 1024 * 1024;
const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 82;
const ACCEPTED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_BYTES, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (ACCEPTED_MIME.has(file.mimetype)) return cb(null, true);
    cb(Object.assign(new Error('Formato de imagen no soportado. Usa JPG, PNG, WEBP o AVIF.'), { statusCode: 400 }));
  }
});

const router = express.Router();

router.post('/uploads/image', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'La imagen supera el tamaño máximo de 8 MB.'
        : err.message || 'No se pudo procesar la imagen.';
      return res.status(err.statusCode || 400).json({ success: false, message });
    }
    if (!req.file) return res.status(400).json({ success: false, message: 'No se recibió ninguna imagen (campo "image").' });
    next();
  });
}, async (req, res, next) => {
  try {
    const filename = `${crypto.randomUUID()}.jpg`;
    const outputPath = path.join(UPLOAD_DIR, filename);
    // sharp's toFile() resolves with the info object directly (not { info }).
    const info = await sharp(req.file.buffer)
      .rotate() // honor EXIF orientation before stripping metadata
      .resize(MAX_DIMENSION, MAX_DIMENSION, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
      .toFile(outputPath);
    res.status(201).json({
      success: true,
      url: `/uploads/${filename}`,
      width: info.width,
      height: info.height,
      bytes: info.size
    });
  } catch (error) {
    next(Object.assign(new Error('La imagen está dañada o no se pudo procesar.'), { statusCode: 400, cause: error }));
  }
});

module.exports = router;
