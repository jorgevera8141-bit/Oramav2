const express = require('express');
const multer = require('multer');
const { processImageToJpeg } = require('./process');

const MAX_BYTES = 8 * 1024 * 1024;
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
    const saved = await processImageToJpeg(req.file.buffer);
    res.status(201).json({ success: true, ...saved });
  } catch (error) {
    next(Object.assign(new Error('La imagen está dañada o no se pudo procesar.'), { statusCode: 400, cause: error }));
  }
});

module.exports = router;
