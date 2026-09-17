(function () {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const canHoverPrecisely = window.matchMedia('(pointer: fine)').matches;

  const AUTO_RISE_SELECTOR = '.glass-card, .panel, .mesa-card, .order-card';

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
      el.style.transform = `rotateY(${(px * max).toFixed(2)}deg) rotateX(${(py * -max).toFixed(2)}deg)`;
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
   * Auto-wires every fx-enabled element under `root`: tilt/sheen targets
   * (`[data-fx~="tilt"]` / `[data-fx~="sheen"]`, combinable on one element)
   * and staggered entrance. Safe to call repeatedly — re-run after any DOM
   * swap (SPA route render, innerHTML replace) to wire newly-inserted
   * elements; already-wired elements are skipped.
   * @param {ParentNode} [root]
   */
  function init(root = document) {
    initMagnetic();
    root.querySelectorAll('[data-fx~="tilt"]').forEach((el) => tilt(el));
    root.querySelectorAll('[data-fx~="sheen"]').forEach((el) => {
      sheen(el);
      if (canHoverPrecisely && !el.dataset.fxSheenHoverWired) {
        el.dataset.fxSheenHoverWired = 'true';
        el.addEventListener('pointerenter', () => sheen(el));
      }
    });
    stagger(root);
  }

  window.OramaFx = { tilt, sheen, stagger, init };
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => init());
  } else {
    init();
  }
})();
