(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHoverPrecisely = window.matchMedia('(pointer: fine)').matches;

  const AUTO_RISE_SELECTOR = '.glass-card, .panel, .mesa-card, .order-card, .menu-item-card';
  // .mesa-card/.order-card use a colored border-left as a status indicator
  // (occupied/urgent) — fx-border-glow's transparent border shorthand would
  // wipe that out, so they're excluded here and only get tilt/sheen below.
  const AUTO_GLOW_SELECTOR = '.glass-card, .panel, .menu-item-card';
  // .panel can span the full content width (data tables, long sections);
  // a continuous pointer-follow tilt there fights with reading its content,
  // so tilt is reserved for compact, card-sized surfaces.
  const AUTO_TILT_SELECTOR = '.glass-card, .mesa-card, .order-card, .menu-item-card';

  /**
   * Wires a pointer-follow 3D tilt onto `el` (pairs with the .fx-tilt CSS
   * class). No-ops under reduced-motion or coarse pointers since the effect
   * only reads as intentional with a mouse.
   * @param {HTMLElement} el
   * @param {{max?: number}} [options]
   */
  function tilt(el, { max = 8 } = {}) {
    if (!el || el.dataset.fxTiltWired || prefersReducedMotion || !canHoverPrecisely) return;
    el.dataset.fxTiltWired = 'true';
    el.addEventListener('pointermove', (event) => {
      const rect = el.getBoundingClientRect();
      const px = (event.clientX - rect.left) / rect.width - 0.5;
      const py = (event.clientY - rect.top) / rect.height - 0.5;
      el.style.transform = `perspective(1400px) rotateY(${(px * max).toFixed(2)}deg) rotateX(${(py * -max).toFixed(2)}deg)`;
    });
    el.addEventListener('pointerleave', () => { el.style.transform = ''; });
  }

  /**
   * Plays the one-shot sheen sweep (`.fx-sheen.is-sheening` in
   * orama-pro.css) on `el`, cleaning the class up after the animation ends.
   * @param {HTMLElement} el
   */
  function sheen(el) {
    if (!el || prefersReducedMotion) return;
    requestAnimationFrame(() => el.classList.add('is-sheening'));
    el.addEventListener('animationend', (event) => {
      if (event.animationName === 'fx-sheen-sweep') el.classList.remove('is-sheening');
    }, { once: true });
  }

  /**
   * Tracks the pointer into --mx/--my for the magnetic cursor-glow effect
   * baked into `.button`/`.fx-magnetic` in orama-pro.css. Delegated once at
   * the document level so SPA route renders never need to re-wire it.
   */
  function initMagnetic() {
    if (document.body.dataset.fxMagneticWired || prefersReducedMotion || !canHoverPrecisely) return;
    document.body.dataset.fxMagneticWired = 'true';
    document.addEventListener('pointermove', (event) => {
      const target = event.target.closest('.button, .fx-magnetic');
      if (!target) return;
      const rect = target.getBoundingClientRect();
      target.style.setProperty('--mx', `${event.clientX - rect.left}px`);
      target.style.setProperty('--my', `${event.clientY - rect.top}px`);
    });
  }

  /**
   * Assigns a staggered `--i` index (DOM order) to every `.fx-rise`
   * candidate under `root`, including the standard card surfaces that get
   * it automatically so views don't need to hand-annotate every card.
   * @param {ParentNode} [root]
   */
  function stagger(root = document) {
    root.querySelectorAll(AUTO_RISE_SELECTOR).forEach((el) => el.classList.add('fx-rise'));
    root.querySelectorAll('.fx-rise').forEach((el, index) => el.style.setProperty('--i', index));
  }

  /**
   * Adds the .fx-border-glow gradient-border treatment to every standard
   * card/panel surface under `root` (see AUTO_GLOW_SELECTOR for exclusions).
   * @param {ParentNode} [root]
   */
  function glow(root = document) {
    root.querySelectorAll(AUTO_GLOW_SELECTOR).forEach((el) => el.classList.add('fx-border-glow'));
  }

  /**
   * Wires sheen (hover) on every element in `elements` that hasn't already
   * been wired, matching the opt-in behavior `data-fx~="sheen"` gets below.
   * @param {Iterable<HTMLElement>} elements
   */
  function wireSheen(elements) {
    elements.forEach((el) => {
      sheen(el);
      if (canHoverPrecisely && !el.dataset.fxSheenHoverWired) {
        el.dataset.fxSheenHoverWired = 'true';
        el.addEventListener('pointerenter', () => sheen(el));
      }
    });
  }

  /**
   * Auto-wires every fx-enabled element under `root`: the crystal-card
   * treatment (glow/tilt/sheen) on the standard card surfaces, plus any
   * one-off `[data-fx~="tilt"]` / `[data-fx~="sheen"]` opt-ins, and
   * staggered entrance. Safe to call repeatedly — re-run after any DOM
   * swap (SPA route render, innerHTML replace) to wire newly-inserted
   * elements; already-wired elements are skipped.
   * @param {ParentNode} [root]
   */
  function init(root = document) {
    initMagnetic();
    glow(root);
    root.querySelectorAll(AUTO_TILT_SELECTOR).forEach((el) => tilt(el));
    root.querySelectorAll('[data-fx~="tilt"]').forEach((el) => tilt(el));
    wireSheen(root.querySelectorAll(AUTO_RISE_SELECTOR));
    wireSheen(root.querySelectorAll('[data-fx~="sheen"]'));
    stagger(root);
  }

  window.OramaFx = { tilt, sheen, stagger, init };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
})();
