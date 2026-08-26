(function () {
  const form = document.getElementById('room-form');
  const statusEl = document.getElementById('save-status');

  // ---------- Salvataggio campi ----------
  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const payload = {};

      form.querySelectorAll('[name^="f_"]').forEach((el) => {
        const name = el.name.slice(2); // rimuove "f_"
        const parts = name.split('__'); // es. "porte__colore" -> ["porte", "colore"]
        const key = parts[0];
        const sub = parts[1];

        if (sub) {
          payload[key] = payload[key] || {};
          payload[key][sub] = el.value;
        } else {
          payload[key] = el.value;
        }
      });

      statusEl.textContent = 'Salvataggio...';
      try {
        const res = await fetch(`/app/rooms/${window.ROOM_ID}/fields`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error('Errore salvataggio');
        statusEl.textContent = 'Salvato ✓';
        setTimeout(() => (statusEl.textContent = ''), 2500);
      } catch (err) {
        statusEl.textContent = 'Errore nel salvataggio';
      }
    });
  }

  // ---------- Picker di opzioni con immagine ----------
  document.querySelectorAll('.option-picker').forEach((picker) => {
    const hiddenInput = picker.querySelector('input[type="hidden"]');
    picker.querySelectorAll('.option-pick-card').forEach((card) => {
      card.addEventListener('click', () => {
        picker.querySelectorAll('.option-pick-card').forEach((c) => c.classList.remove('selected'));
        card.classList.add('selected');
        if (hiddenInput) hiddenInput.value = card.dataset.value;
      });
    });
  });

  // ---------- Textarea che si adattano al contenuto (note sempre visibili per intero) ----------
  function autosize(el) {
    el.style.height = 'auto';
    el.style.height = el.scrollHeight + 'px';
  }
  document.querySelectorAll('textarea.autosize').forEach((el) => {
    autosize(el);
    el.addEventListener('input', () => autosize(el));
  });

  // ---------- Upload di un singolo file (pdf legati a un campo) ----------
  document.querySelectorAll('.single-upload').forEach((input) => {
    input.addEventListener('change', async () => {
      if (!input.files || !input.files[0]) return;
      await uploadFile(input.files[0], input.dataset.key, input.dataset.kind || 'file');
      location.reload();
    });
  });

  // ---------- Upload multiplo (campo Allegati) ----------
  document.querySelectorAll('.multi-upload').forEach((input) => {
    input.addEventListener('change', async () => {
      if (!input.files || input.files.length === 0) return;
      for (const file of Array.from(input.files)) {
        await uploadFile(file, input.dataset.key, 'file');
      }
      location.reload();
    });
  });

  // ---------- Eliminazione allegati ----------
  document.querySelectorAll('.attachment-delete').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!confirm('Eliminare questo allegato?')) return;
      const id = btn.dataset.attachmentId;
      try {
        const res = await fetch(`/app/rooms/${window.ROOM_ID}/attachments/${id}/delete`, { method: 'POST' });
        if (!res.ok) throw new Error('Errore eliminazione');
        btn.closest('.attachment-row').remove();
      } catch (err) {
        alert('Errore durante l\'eliminazione dell\'allegato');
      }
    });
  });

  async function uploadFile(file, fieldKey, kind) {
    const fd = new FormData();
    fd.append('file', file);
    fd.append('field_key', fieldKey);
    fd.append('kind', kind);
    try {
      const res = await fetch(`/app/rooms/${window.ROOM_ID}/upload`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error('Errore upload');
    } catch (err) {
      alert('Errore durante il caricamento del file: ' + file.name);
    }
  }
})();
