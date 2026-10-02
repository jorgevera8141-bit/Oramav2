const express = require('express');
const multer = require('multer');
const { processImageToJpeg, MAX_INPUT_PIXELS } = require('./process');
const { createRateLimiter } = require('../../middleware/rate-limit');

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

// The endpoint has no login (staff attach images while composing promotions), so cap how
// fast one address can push files. Together with the pixel cap and the directory quota in
// process.js this bounds what an anonymous caller can cost.
const uploadLimiter = createRateLimiter({
  windowMs: 10 * 60_000, max: 20, message: 'Demasiadas imágenes subidas. Intenta de nuevo en unos minutos.'
});

const router = express.Router();

router.post('/uploads/image', uploadLimiter, (req, res, next) => {
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
    // The quota error (507) is the server's problem, not a bad image: pass it through.
    if (error.statusCode) return next(error);
    const tooLarge = /pixel limit/i.test(error.message || '');
    const message = tooLarge
      ? `La imagen es demasiado grande (máximo ${MAX_INPUT_PIXELS / 1_000_000} megapíxeles).`
      : 'La imagen está dañada o no se pudo procesar.';
    next(Object.assign(new Error(message), { statusCode: 400, cause: error }));
  }
});

module.exports = router;
