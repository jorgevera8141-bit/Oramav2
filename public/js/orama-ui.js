(function () {
  let dialogSequence = 0;
  function ensureToastRoot() {
    let root = document.getElementById('orama-toast-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'orama-toast-root';
      document.body.appendChild(root);
    }
    return root;
  }

  function toast(message, type = 'info') {
    const root = ensureToastRoot();
    const el = document.createElement('div');
    const icon = type === 'success' ? '✓' : (type === 'error' ? '⚠' : '●');
    el.className = `orama-toast crystal-card orama-toast--${type}`;
    el.setAttribute('role', 'status');
    el.innerHTML = `<span class="orama-toast-icon" aria-hidden="true">${icon}</span><span>${escapeHtml(message)}</span>`;
    root.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-visible'));
    setTimeout(() => {
      el.classList.remove('is-visible');
      el.addEventListener('transitionend', () => el.remove(), { once: true });
    }, 3200);
  }

  function dialog({ title = 'Confirmación', message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false, input = null }) {
    if (document.querySelector('.orama-overlay')) return Promise.resolve(input ? null : false);
    return new Promise((resolve) => {
      dialogSequence += 1;
      const idSuffix = `${Date.now()}-${dialogSequence}`;
      const titleId = `orama-modal-title-${idSuffix}`;
      const messageId = `orama-modal-message-${idSuffix}`;
      const overlay = document.createElement('div');
      overlay.className = 'orama-overlay';
      overlay.innerHTML = `<div class="orama-modal crystal-card" role="dialog" aria-modal="true" aria-labelledby="${titleId}" aria-describedby="${messageId}">`
        + `<div class="orama-modal-head"><p class="orama-modal-title" id="${titleId}">${escapeHtml(title)}</p></div>`
        + `<p class="orama-modal-message" id="${messageId}">${escapeHtml(message)}</p>`
        + (input ? `<input type="text" class="search orama-modal-input" placeholder="${escapeHtml(input.placeholder || '')}" value="${escapeHtml(input.value || '')}">` : '')
        + `<div class="orama-modal-actions">`
        + `<button type="button" class="button" data-ui="cancel">${escapeHtml(cancelText)}</button>`
        + `<button type="button" class="button ${danger ? 'danger' : ''}" data-ui="confirm">${escapeHtml(confirmText)}</button>`
        + '</div></div>';
      document.body.appendChild(overlay);

      const inputEl = overlay.querySelector('.orama-modal-input');
      if (inputEl) inputEl.focus();
      else overlay.querySelector('[data-ui="confirm"]').focus();

      const onKey = (event) => {
        if (event.key === 'Tab') {
          const focusables = Array.from(overlay.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])'))
            .filter((el) => !el.disabled && !el.hasAttribute('hidden') && el.tabIndex >= 0 && el.getClientRects().length > 0);
          if (!focusables.length) return;
          const first = focusables[0];
          const last = focusables[focusables.length - 1];
          if (!overlay.contains(document.activeElement)) {
            event.preventDefault();
            (event.shiftKey ? last : first).focus();
            return;
          }
          if (event.shiftKey && document.activeElement === first) {
            event.preventDefault();
            last.focus();
            return;
          }
          if (!event.shiftKey && document.activeElement === last) {
            event.preventDefault();
            first.focus();
            return;
          }
        }
        if (event.key === 'Escape') close(input ? null : false);
      };

      function close(value) {
        document.removeEventListener('keydown', onKey);
        overlay.remove();
        resolve(value);
      }

      overlay.querySelector('[data-ui="cancel"]').addEventListener('click', () => close(input ? null : false));
      overlay.querySelector('[data-ui="confirm"]').addEventListener('click', () => close(input ? (inputEl.value || '') : true));
      overlay.addEventListener('click', (event) => {
        if (event.target === overlay) close(input ? null : false);
      });
      document.addEventListener('keydown', onKey);
    });
  }

  Orama.toast = toast;
  Orama.confirm = (message, options = {}) => dialog({
    title: options.title || (options.danger ? 'Acción delicada' : 'Confirmación'),
    message,
    danger: !!options.danger,
    confirmText: options.okText || 'Confirmar',
    cancelText: options.cancelText || 'Cancelar'
  });
  Orama.prompt = (message, options = {}) => dialog({
    title: options.title || 'Ingresa la información',
    message,
    input: { placeholder: options.placeholder || '', value: options.value || '' },
    confirmText: options.okText || 'Aceptar',
    cancelText: options.cancelText || 'Cancelar'
  });
})();
