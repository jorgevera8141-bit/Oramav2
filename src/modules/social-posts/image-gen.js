const { processImageToJpeg } = require('../uploads/process');

// FLUX schnell: fast (~2s) and cheap, good enough for a promo photo. Override with
// FAL_IMAGE_MODEL (e.g. fal-ai/flux/dev for higher fidelity).
const FAL_MODEL = process.env.FAL_IMAGE_MODEL || 'fal-ai/flux/schnell';
const FAL_ENDPOINT = `https://fal.run/${FAL_MODEL}`;
const TIMEOUT_MS = 90_000;

function apiError(message, statusCode) {
  return Object.assign(new Error(message), { statusCode });
}

function buildImagePrompt(promo, extra) {
  const subject = promo.categoria
    ? `productos de la categoría "${promo.categoria}" de una cafetería`
    : 'productos de cafetería (café, repostería)';
  const base = [
    `Fotografía publicitaria apetitosa de ${subject}, para la promoción "${promo.nombre}".`,
    'Luz cálida natural, fondo desenfocado, estilo café acogedor, encuadre cuadrado, alta calidad.',
    'Deja espacio libre para superponer texto. Sin texto ni letras dentro de la imagen. Sin marcas de agua.'
  ].join(' ');
  return extra ? `${base} ${extra}` : base;
}

async function generateImage(promo, extraPrompt) {
  if (!process.env.FAL_KEY) {
    throw apiError('La generación de imágenes con IA no está configurada (falta FAL_KEY).', 503);
  }
  const prompt = buildImagePrompt(promo, extraPrompt);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let falJson;
  try {
    const response = await fetch(FAL_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt, image_size: 'square_hd', num_images: 1, enable_safety_checker: true }),
      signal: controller.signal
    });
    falJson = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw apiError(falJson.detail || falJson.message || `fal.ai respondió ${response.status}`, 502);
    }
  } catch (error) {
    if (error.name === 'AbortError') {
      throw apiError('La generación de la imagen tardó demasiado. Intenta de nuevo.', 504);
    }
    if (error.statusCode) throw error;
    throw apiError('No se pudo contactar al generador de imágenes.', 502);
  } finally {
    clearTimeout(timer);
  }

  const image = (falJson.images || [])[0];
  if (!image || !image.url) throw apiError('fal.ai no devolvió ninguna imagen.', 502);

  const imageResponse = await fetch(image.url);
  if (!imageResponse.ok) throw apiError('No se pudo descargar la imagen generada.', 502);
  const buffer = Buffer.from(await imageResponse.arrayBuffer());

  const saved = await processImageToJpeg(buffer);
  return { ...saved, prompt };
}

module.exports = { generateImage, buildImagePrompt, FAL_MODEL };
