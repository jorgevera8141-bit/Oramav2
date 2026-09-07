const { processImageToJpeg } = require('../uploads/process');

// When NINEROUTER_URL is set, images come from a 9Router gateway
// (POST /v1/images/generations, OpenAI shape). Otherwise fal.ai FLUX directly.
const NINEROUTER_URL = (process.env.NINEROUTER_URL || '').replace(/\/$/, '');
const VIA_9ROUTER = !!NINEROUTER_URL;

const FAL_DIRECT_MODEL = process.env.FAL_IMAGE_MODEL || 'fal-ai/flux/schnell';
const NINEROUTER_IMAGE_MODEL = process.env.NINEROUTER_IMAGE_MODEL || 'fal-ai/flux/schnell';
const IMAGE_MODEL = VIA_9ROUTER ? NINEROUTER_IMAGE_MODEL : FAL_DIRECT_MODEL;
const IMAGE_BACKEND = VIA_9ROUTER ? '9router' : 'fal';

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

async function fetchWithTimeout(url, options) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (error) {
    if (error.name === 'AbortError') throw apiError('La generación de la imagen tardó demasiado. Intenta de nuevo.', 504);
    if (error.statusCode) throw error;
    throw apiError('No se pudo contactar al generador de imágenes.', 502);
  } finally {
    clearTimeout(timer);
  }
}

async function bufferFromUrl(url) {
  const res = await fetch(url);
  if (!res.ok) throw apiError('No se pudo descargar la imagen generada.', 502);
  return Buffer.from(await res.arrayBuffer());
}

async function generateViaNineRouter(prompt) {
  const headers = { 'Content-Type': 'application/json' };
  if (process.env.NINEROUTER_KEY) headers.Authorization = `Bearer ${process.env.NINEROUTER_KEY}`;
  // Send only { model, prompt }; several providers (Cloudflare FLUX) 400 on
  // size/width/height. Opt a size back in with NINEROUTER_IMAGE_SIZE.
  const body = { model: NINEROUTER_IMAGE_MODEL, prompt };
  if (process.env.NINEROUTER_IMAGE_SIZE) body.size = process.env.NINEROUTER_IMAGE_SIZE;
  // ?response_format=binary makes the gateway stream raw image bytes back.
  const response = await fetchWithTimeout(`${NINEROUTER_URL}/v1/images/generations?response_format=binary`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok || contentType.includes('application/json')) {
    const json = await response.json().catch(() => ({}));
    throw apiError(json.error?.message || json.message || `9Router respondió ${response.status}`, 502);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function generateViaFal(prompt) {
  if (!process.env.FAL_KEY) {
    throw apiError('La generación de imágenes con IA no está configurada (define NINEROUTER_URL o FAL_KEY).', 503);
  }
  const response = await fetchWithTimeout(`https://fal.run/${FAL_DIRECT_MODEL}`, {
    method: 'POST',
    headers: { Authorization: `Key ${process.env.FAL_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, image_size: 'square_hd', num_images: 1, enable_safety_checker: true })
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw apiError(json.detail || json.message || `fal.ai respondió ${response.status}`, 502);
  }
  const image = (json.images || [])[0];
  if (!image || !image.url) throw apiError('fal.ai no devolvió ninguna imagen.', 502);
  return bufferFromUrl(image.url);
}

async function generateImage(promo, extraPrompt) {
  const prompt = buildImagePrompt(promo, extraPrompt);
  const buffer = VIA_9ROUTER ? await generateViaNineRouter(prompt) : await generateViaFal(prompt);
  const saved = await processImageToJpeg(buffer);
  return { ...saved, prompt };
}

module.exports = { generateImage, buildImagePrompt, IMAGE_MODEL, IMAGE_BACKEND };
