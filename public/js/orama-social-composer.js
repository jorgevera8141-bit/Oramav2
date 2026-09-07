// Social post composer — opened from a promotion's "Crear publicación" action in
// orama-promociones.js. Split modal: form on the left, live Instagram/Facebook-style
// preview on the right. Manages its own overlay; orama-promociones calls
// Orama.closeSocialComposer() from its route cleanup.
(function () {
  let activeOverlay = null;

  const PLATAFORMAS = [
    { value: 'instagram', label: 'Instagram' },
    { value: 'facebook', label: 'Facebook' }
  ];

  function close() {
    if (activeOverlay) { activeOverlay.remove(); activeOverlay = null; }
  }

  function fieldVal(id) {
    return document.getElementById(id)?.value.trim() || '';
  }

  function readForm() {
    const plataformas = PLATAFORMAS
      .filter((p) => document.getElementById(`sc-plat-${p.value}`)?.checked)
      .map((p) => p.value);
    return {
      titular: fieldVal('sc-titular') || undefined,
      caption: fieldVal('sc-caption') || undefined,
      cta: fieldVal('sc-cta') || undefined,
      hashtags: fieldVal('sc-hashtags') || undefined,
      imagen_url: fieldVal('sc-imagen-url') || undefined,
      plataformas,
      programado_para: fieldVal('sc-programado') || undefined,
      creado_por: fieldVal('sc-creado-por')
    };
  }

  function renderPreview() {
    const data = readForm();
    const preview = document.getElementById('sc-preview-body');
    if (!preview) return;
    const captionText = [data.titular, data.caption, data.cta, data.hashtags].filter(Boolean).join('\n\n');
    preview.innerHTML = `
      <div class="sc-preview-card">
        <div class="sc-preview-head"><span class="sc-preview-avatar">CR</span><span>caferosinal</span></div>
        ${data.imagen_url
          ? `<div class="sc-preview-image" style="background-image:url('${escapeHtml(data.imagen_url)}')"></div>`
          : '<div class="sc-preview-image sc-preview-image--empty">Sin imagen</div>'}
        <div class="sc-preview-caption">${captionText ? escapeHtml(captionText).replace(/\n/g, '<br>') : '<span class="subtle">La vista previa aparece aquí…</span>'}</div>
        <div class="sc-preview-platforms">${data.plataformas.map((p) => `<span class="badge-estado neutral">${p}</span>`).join('') || '<span class="subtle">Sin plataformas seleccionadas</span>'}</div>
      </div>`;
  }

  async function uploadImage(file) {
    const body = new FormData();
    body.append('image', file);
    const response = await fetch('/api/uploads/image', { method: 'POST', body });
    const payload = await response.json();
    if (!response.ok || payload.success === false) throw new Error(payload.message || 'No se pudo subir la imagen');
    return payload.url;
  }

  function open({ promo, staffList = [], existingPost = null, onSaved }) {
    close();
    const seed = existingPost || {
      titular: promo?.nombre || '',
      caption: promo?.descripcion || promo?.condiciones || '',
      imagen_url: promo?.imagen_url || '',
      plataformas: ['instagram'],
      cta: '', hashtags: '', programado_para: ''
    };
    const platSet = new Set(seed.plataformas || []);

    const overlay = document.createElement('div');
    overlay.className = 'orama-overlay';
    overlay.innerHTML = `<div class="orama-modal split-view social-composer" role="none" aria-modal="true">
      <p class="orama-modal-message">${existingPost ? 'Editar publicación' : 'Crear publicación'} · ${escapeHtml(promo?.nombre || '')}</p>
      <div class="sc-grid">
        <div class="sc-form">
          <div class="sc-ai-row">
            <button type="button" class="button sc-ai-btn" data-ai="draft">✨ Generar texto</button>
            <button type="button" class="button sc-ai-btn" data-ai="image">✨ Generar imagen</button>
            <input class="search sc-ai-pin" id="sc-ai-pin" type="password" inputmode="numeric" maxlength="10" placeholder="PIN para IA" aria-label="PIN para generar con IA">
          </div>
          <div class="field-group"><label for="sc-ai-contexto">Contexto / referencia para la IA (opcional)</label>
            <textarea class="search" id="sc-ai-contexto" rows="2" maxlength="1000" placeholder="Pega un post de referencia, hashtags habituales, el tono deseado o un ángulo de temporada…"></textarea>
          </div>
          <div class="field-group"><label for="sc-titular">Titular</label><input class="search" id="sc-titular" maxlength="120" value="${escapeHtml(seed.titular || '')}"></div>
          <div class="field-group"><label for="sc-caption">Texto de la publicación</label><textarea class="search" id="sc-caption" rows="4" maxlength="2200">${escapeHtml(seed.caption || '')}</textarea></div>
          <div class="field-group"><label for="sc-cta">Llamado a la acción</label><input class="search" id="sc-cta" maxlength="80" value="${escapeHtml(seed.cta || '')}"></div>
          <div class="field-group"><label for="sc-hashtags">Hashtags</label><input class="search" id="sc-hashtags" maxlength="500" value="${escapeHtml(seed.hashtags || '')}" placeholder="#cafe #promo"></div>
          <div class="field-group"><label>Plataformas</label>
            <div class="sc-checks">${PLATAFORMAS.map((p) => `<label class="sc-check"><input type="checkbox" id="sc-plat-${p.value}" ${platSet.has(p.value) ? 'checked' : ''}> ${p.label}</label>`).join('')}</div>
          </div>
          <div class="field-group"><label for="sc-programado">Programar para (opcional)</label><input class="search" id="sc-programado" type="datetime-local" value="${escapeHtml((seed.programado_para || '').slice(0, 16))}"></div>
          <div class="field-group"><label for="sc-image-file">Imagen</label>
            <input class="search" id="sc-image-file" type="file" accept="image/*">
            <input type="hidden" id="sc-imagen-url" value="${escapeHtml(seed.imagen_url || '')}">
            <p class="subtle sc-upload-status" id="sc-upload-status">${seed.imagen_url ? 'Imagen actual cargada' : 'Se optimiza automáticamente al subir'}</p>
          </div>
          <div class="field-group"><label for="sc-creado-por">Creada por</label>
            <select class="search" id="sc-creado-por">${staffList.map((s) => `<option value="${escapeHtml(s.nombre)}" ${seed.creado_por === s.nombre ? 'selected' : ''}>${escapeHtml(s.nombre)}</option>`).join('')}</select>
          </div>
        </div>
        <div class="sc-preview"><p class="eyebrow">Vista previa</p><div id="sc-preview-body"></div></div>
      </div>
      <div class="orama-modal-actions">
        <button type="button" class="button" data-ui="cancel">Cancelar</button>
        <button type="button" class="button" data-ui="confirm">${existingPost ? 'Guardar cambios' : 'Guardar borrador'}</button>
      </div>
    </div>`;
    document.body.appendChild(overlay);
    activeOverlay = overlay;
    renderPreview();

    async function runAi(kind, btn) {
      const actorNombre = fieldVal('sc-creado-por');
      const actorPin = fieldVal('sc-ai-pin');
      if (!promo || !promo.id) { Orama.toast('Abre el compositor desde una promoción', 'error'); return; }
      if (!actorNombre) { Orama.toast('Selecciona quién genera', 'error'); return; }
      if (!actorPin) { Orama.toast('Ingresa tu PIN para usar IA', 'error'); return; }
      const buttons = overlay.querySelectorAll('[data-ai]');
      const original = btn.textContent;
      buttons.forEach((b) => { b.disabled = true; });
      btn.textContent = kind === 'image' ? 'Generando imagen…' : 'Generando texto…';
      try {
        const base = { promocion_id: promo.id, actor_nombre: actorNombre, actor_pin: actorPin };
        if (kind === 'draft') {
          const contexto = fieldVal('sc-ai-contexto');
          const data = await api('/api/social-posts/ai/draft', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...base, contexto: contexto || undefined })
          });
          document.getElementById('sc-titular').value = data.titular || '';
          document.getElementById('sc-caption').value = data.caption || '';
          document.getElementById('sc-cta').value = data.cta || '';
          document.getElementById('sc-hashtags').value = data.hashtags || '';
          Orama.toast('Texto generado — revísalo antes de guardar', 'success');
        } else {
          const data = await api('/api/social-posts/ai/image', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(base)
          });
          document.getElementById('sc-imagen-url').value = data.url;
          document.getElementById('sc-upload-status').textContent = 'Imagen generada con IA';
        }
        renderPreview();
      } catch (error) {
        Orama.toast(error.message, 'error');
      } finally {
        buttons.forEach((b) => { b.disabled = false; });
        btn.textContent = original;
      }
    }

    overlay.querySelectorAll('[data-ai]').forEach((btn) => {
      btn.addEventListener('click', () => runAi(btn.dataset.ai, btn));
    });
    overlay.addEventListener('input', renderPreview);
    overlay.addEventListener('click', (event) => { if (event.target === overlay) close(); });
    overlay.querySelector('[data-ui="cancel"]').addEventListener('click', close);

    overlay.querySelector('#sc-image-file').addEventListener('change', async (event) => {
      const file = event.target.files && event.target.files[0];
      if (!file) return;
      const status = document.getElementById('sc-upload-status');
      status.textContent = 'Subiendo y optimizando…';
      try {
        const url = await uploadImage(file);
        document.getElementById('sc-imagen-url').value = url;
        status.textContent = 'Imagen optimizada y lista';
        renderPreview();
      } catch (error) {
        status.textContent = error.message;
        Orama.toast(error.message, 'error');
      }
    });

    overlay.querySelector('[data-ui="confirm"]').addEventListener('click', async () => {
      const payload = readForm();
      if (!payload.plataformas.length) { Orama.toast('Elige al menos una plataforma', 'error'); return; }
      if (!payload.titular && !payload.caption) { Orama.toast('Agrega un titular o un texto', 'error'); return; }
      if (!payload.creado_por) { Orama.toast('Selecciona quién la crea', 'error'); return; }
      try {
        if (existingPost) {
          await api(`/api/social-posts/${existingPost.id}`, {
            method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload)
          });
          Orama.toast('Publicación actualizada', 'success');
        } else {
          await api('/api/social-posts', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, promocion_id: promo.id })
          });
          Orama.toast('Publicación guardada como borrador', 'success');
        }
        close();
        if (typeof onSaved === 'function') await onSaved();
      } catch (error) {
        Orama.toast(error.message, 'error');
      }
    });
  }

  Orama.openSocialComposer = open;
  Orama.closeSocialComposer = close;
})();
