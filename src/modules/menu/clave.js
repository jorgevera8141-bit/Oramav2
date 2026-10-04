// Automatic clave for a new menu item. Existing claves are a letter prefix plus a number (CGR01..CGR26,
// R03..R50, TMA01..). A category that clearly uses one prefix keeps it; a mixed catch-all category
// (Boutique) names the prefix from the product, the way PV01 is PORTA VASOS. Numbers continue the prefix's
// sequence across every category (C is shared by three), so a clave is never reused.
const CLAVE_PATTERN = /^([A-Za-z]+)(\d+)$/;
const MIN_DIGITS = 2;
// A category owns a prefix only when it is used often, by a real share of the category, and clearly ahead of
// the next one. Catch-all categories (Boutique, Tes) fail this and are named from the product instead.
const MIN_PREFIX_COUNT = 4;
const MIN_PREFIX_SHARE = 0.25;
const MIN_LEAD = 1.5;
// One-off claves far beyond a sequence (a stray C311 after C60) are not where the sequence continues.
const MAX_SEQUENCE_GAP = 50;
const FALLBACK_PREFIX = 'X';
const SMALL_WORDS = new Set(['DE', 'DEL', 'LA', 'EL', 'LOS', 'LAS', 'CON', 'Y', 'EN', 'PARA', 'A', 'AL', 'SIN', 'POR']);

const plain = (text) => String(text || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();

function parseClave(clave) {
  const match = CLAVE_PATTERN.exec(String(clave || ''));
  return match ? { prefix: match[1].toUpperCase(), number: Number(match[2]), digits: match[2].length } : null;
}

// The prefix most of the category's patterned claves share, when it is clearly the category's own.
function dominantPrefix(categoria, existing) {
  const counts = new Map();
  let patterned = 0;
  for (const item of existing) {
    if (item.categoria !== categoria) continue;
    const parsed = parseClave(item.clave);
    if (!parsed) continue;
    patterned += 1;
    counts.set(parsed.prefix, (counts.get(parsed.prefix) || 0) + 1);
  }
  const [[prefix, count] = [], [, runnerUp = 0] = []] = [...counts].sort((a, b) => b[1] - a[1]);
  const owns = prefix && count >= MIN_PREFIX_COUNT && count / patterned >= MIN_PREFIX_SHARE && count >= MIN_LEAD * runnerUp;
  return owns ? prefix : null;
}

function prefixFromText(text) {
  const words = plain(text).split(/[^A-Z]+/).filter((word) => word && !SMALL_WORDS.has(word));
  if (!words.length) return '';
  return words.length === 1 ? words[0].slice(0, 3) : words[0][0] + words[1][0];
}

// The last number of the sequence that starts the prefix, stopping at the first jump bigger than MAX_SEQUENCE_GAP.
function endOfSequence(numbers) {
  const sorted = [...numbers].sort((a, b) => a - b);
  let end = sorted[0] || 0;
  for (const number of sorted) {
    if (number - end > MAX_SEQUENCE_GAP) break;
    end = number;
  }
  return end;
}

function nextClave({ nombre, categoria }, existing) {
  const prefix = dominantPrefix(categoria, existing) || prefixFromText(nombre) || prefixFromText(categoria) || FALLBACK_PREFIX;
  const numbers = [];
  const taken = new Set();
  for (const item of existing) {
    if (item.clave) taken.add(String(item.clave).toUpperCase());
    const parsed = parseClave(item.clave);
    if (!parsed || parsed.prefix !== prefix) continue;
    numbers.push(parsed.number);
  }
  const highest = endOfSequence(numbers);
  const digits = Math.max(MIN_DIGITS, String(highest).length);
  let number = highest + 1;
  let clave = `${prefix}${String(number).padStart(digits, '0')}`;
  while (taken.has(clave)) {
    number += 1;
    clave = `${prefix}${String(number).padStart(digits, '0')}`;
  }
  return clave;
}

module.exports = { nextClave };
