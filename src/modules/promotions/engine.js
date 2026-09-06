const PROMOTION_TIPOS = ['precio_fijo', 'descuento_porcentaje', 'compra_x_lleva_y'];

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

// pg returns DATE columns as JS Date objects (not strings) once they pass through pool.query()
// directly, before res.json() serializes them. Comparing a Date to a 'YYYY-MM-DD' string with
// </> silently coerces to NaN (always false both ways), so every date must be normalized to a
// plain string first — this makes the engine correct regardless of whether it's fed a raw DB row
// or a plain test fixture.
function toDateString(value) {
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

function isWithinWindow(promo, now) {
  const today = now.toISOString().slice(0, 10);
  const fechaInicio = toDateString(promo.fecha_inicio);
  const fechaFin = toDateString(promo.fecha_fin);
  if (today < fechaInicio || today > fechaFin) return false;
  const time = now.toISOString().slice(11, 19);
  if (promo.hora_inicio && time < promo.hora_inicio) return false;
  if (promo.hora_fin && time > promo.hora_fin) return false;
  return true;
}

function hasWindowStarted(promo, now) {
  const today = now.toISOString().slice(0, 10);
  const time = now.toISOString().slice(11, 19);
  const fechaInicio = toDateString(promo.fecha_inicio);
  if (fechaInicio < today) return true;
  if (fechaInicio > today) return false;
  return !promo.hora_inicio || promo.hora_inicio <= time;
}

function isPromotionEligible(promo, now, redemptionCounts) {
  if (promo.estado !== 'ACTIVE') return false;
  if (!isWithinWindow(promo, now)) return false;
  if (promo.limite_unidades != null && (redemptionCounts[promo.id] || 0) >= promo.limite_unidades) return false;
  return true;
}

function matchesScope(promo, item) {
  if (Array.isArray(promo.producto_ids) && promo.producto_ids.length) {
    return promo.producto_ids.includes(item.menu_item_id);
  }
  if (promo.categoria) return item.categoria === promo.categoria;
  return false;
}

function specificity(promo) {
  return Array.isArray(promo.producto_ids) && promo.producto_ids.length ? 0 : 1;
}

function splitLine(line, discountedQty, descuentoUnitario, promo) {
  const result = [];
  if (discountedQty > 0) {
    result.push({
      menu_item_id: line.menu_item_id,
      nombre: line.nombre,
      precio_unitario: Number(line.precio),
      cantidad: discountedQty,
      descuento_unitario: descuentoUnitario,
      promocion_id: promo.id,
      promocion_nombre: promo.nombre
    });
  }
  return result;
}

/**
 * Applies eligible promotions to order line items. A single unit of a single product
 * can receive at most one promotional discount (tracked via `unclaimed`) — this is what
 * makes non-stacking the safe default. `apilable` is stored on the promotion record and
 * surfaced in the UI per spec, but same-unit multi-promotion stacking math is not
 * implemented in this version: every unit still receives at most one discount regardless
 * of `apilable`. This is the conservative direction (never an unexpected extra discount),
 * so it's a safe scope boundary, not a silent gap — see final report for the explicit
 * limitation note.
 */
function applyPromotions({ items, promotions, now = new Date(), redemptionCounts = {} }) {
  const working = items.map((item) => ({ ...item, unclaimed: item.cantidad }));
  const eligible = promotions
    .filter((promo) => isPromotionEligible(promo, now, redemptionCounts))
    .slice()
    .sort((a, b) => specificity(a) - specificity(b) || a.id - b.id);

  const outputLines = [];
  const aplicadas = [];

  for (const promo of eligible) {
    if (promo.tipo === 'precio_fijo') {
      const scopeIds = Array.isArray(promo.producto_ids) ? promo.producto_ids : [];
      if (!scopeIds.length) continue;
      const targets = scopeIds.map((id) => working.find((l) => l.menu_item_id === id));
      if (targets.some((l) => !l || l.unclaimed < 1)) continue;
      const regularSum = round2(targets.reduce((sum, l) => sum + Number(l.precio), 0));
      const promoPrice = Number(promo.precio_promocional);
      if (!(promoPrice < regularSum)) continue;
      const totalDiscount = round2(regularSum - promoPrice);
      let remaining = totalDiscount;
      targets.forEach((l, idx) => {
        const share = idx === targets.length - 1 ? remaining : round2((Number(l.precio) / regularSum) * totalDiscount);
        remaining = round2(remaining - share);
        outputLines.push(...splitLine(l, 1, share, promo));
        l.unclaimed -= 1;
      });
      aplicadas.push({ promocion_id: promo.id, nombre: promo.nombre, descuento: totalDiscount });
    } else if (promo.tipo === 'descuento_porcentaje') {
      const matches = working.filter((l) => matchesScope(promo, l) && l.unclaimed > 0);
      if (!matches.length) continue;
      let promoDiscountTotal = 0;
      matches.forEach((l) => {
        const qty = l.unclaimed;
        const descuentoUnitario = round2(Number(l.precio) * (Number(promo.porcentaje_descuento) / 100));
        outputLines.push(...splitLine(l, qty, descuentoUnitario, promo));
        promoDiscountTotal = round2(promoDiscountTotal + descuentoUnitario * qty);
        l.unclaimed -= qty;
      });
      aplicadas.push({ promocion_id: promo.id, nombre: promo.nombre, descuento: promoDiscountTotal });
    } else if (promo.tipo === 'compra_x_lleva_y') {
      const scopeIds = Array.isArray(promo.producto_ids) ? promo.producto_ids : [];
      const buyQty = working.filter((l) => scopeIds.includes(l.menu_item_id)).reduce((sum, l) => sum + l.unclaimed, 0);
      const sets = Math.floor(buyQty / promo.compra_cantidad);
      if (sets < 1) continue;
      const getQtyEligible = sets * promo.lleva_cantidad;
      const getLine = working.find((l) => l.menu_item_id === promo.lleva_producto_id);
      if (!getLine || getLine.unclaimed < 1) continue;
      const qtyToDiscount = Math.min(getQtyEligible, getLine.unclaimed);
      if (qtyToDiscount < 1) continue;
      const descuentoUnitario = round2(Number(getLine.precio) * (Number(promo.lleva_descuento_pct) / 100));
      outputLines.push(...splitLine(getLine, qtyToDiscount, descuentoUnitario, promo));
      getLine.unclaimed -= qtyToDiscount;
      aplicadas.push({ promocion_id: promo.id, nombre: promo.nombre, descuento: round2(descuentoUnitario * qtyToDiscount) });
    }
  }

  working.forEach((l) => {
    if (l.unclaimed > 0) {
      outputLines.push({
        menu_item_id: l.menu_item_id,
        nombre: l.nombre,
        precio_unitario: Number(l.precio),
        cantidad: l.unclaimed,
        descuento_unitario: 0,
        promocion_id: null,
        promocion_nombre: null
      });
    }
  });

  const subtotal = round2(items.reduce((sum, i) => sum + Number(i.precio) * i.cantidad, 0));
  const descuentoTotal = round2(aplicadas.reduce((sum, a) => sum + a.descuento, 0));
  const total = round2(subtotal - descuentoTotal);

  return { lineas: outputLines, subtotal, descuento_total: descuentoTotal, total, promociones_aplicadas: aplicadas };
}

module.exports = { PROMOTION_TIPOS, round2, toDateString, isWithinWindow, hasWindowStarted, isPromotionEligible, matchesScope, applyPromotions };
