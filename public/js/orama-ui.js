(function () {
  function ensureToastRoot() {
    let root = document.getElementById('orama-toast-root');
    if (!root) { root = document.createElement('div'); root.id = 'orama-toast-root'; document.body.appendChild(root); }
    return root;
  }

  function toast(message, type = 'info') {
    const root = ensureToastRoot();
    const el = document.createElement('div');
    el.className = `orama-toast orama-toast--${type}`;
    el.setAttribute('role', 'status');
    el.textContent = message;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
      el.classList.remove('is-visible');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, 3200);
  }

  function dialog({ message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, input = null }) {
    return new Promise((resolve) => {
      const overlay = document.createElement('div');
      overlay.className = 'orama-overlay';
      overlay.innerHTML = `<div class="orama-modal" role="${input ? 'none' : 'alertdialog'}" aria-modal="true">` +
        `<p class="orama-modal-message">${escapeHtml(message)}</p>` +
        (input ? `<input type="text" class="search orama-modal-input" placeholder="${escapeHtml(input.placeholder || '')}" value="${escapeHtml(input.value || '')}">` : '') +
        `<div class="orama-modal-actions">` +
        `<button type="button" class="button" data-ui="cancel">${escapeHtml(cancelText)}</button>` +
        `<button type="button" class="button ${danger ? 'danger' : ''}" data-ui="confirm">${escapeHtml(confirmText)}</button>` +
        `</div></div>`;
      document.body.appendChild(overlay);
      const inputEl = overlay.querySelector('.orama-modal-input');
      if (inputEl) inputEl.focus(); else overlay.querySelector('[data-ui="confirm"]').focus();
      const onKey = (event) => { if (event.key === 'Escape') close(input ? null : false); };
      function close(value) {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(value);
      }
      overlay.querySelector('[data-ui="cancel"]').addEventListener('click', () => close(input ? null : false));
      overlay.querySelector('[data-ui="confirm"]').addEventListener('click', () => close(input ? (inputEl.value || '') : true));
      overlay.addEventListener('click', (event) => { if (event.target === overlay) close(input ? null : false); });
      document.addEventListener('keydown', onKey);
    });
  }

  Orama.toast = toast;
  Orama.confirm = (message, options = {}) => dialog({ message, danger: !!options.danger, confirmText: options.okText || 'Confirmar', cancelText: options.cancelText || 'Cancelar' });
  Orama.prompt = (message, options = {}) => dialog({ message, input: { placeholder: options.placeholder || '', value: options.value || '' } });
})();
