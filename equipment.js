// Cyclo — Equipment Module
// Fiets + componenten registratie, km-teller, onderhoudswaarschuwingen
import { state, config, showToast } from './state.js';

const DEMO_KEY = 'cyclo_equipment';

// ─── Laden ────────────────────────────────────────────────────────────────────

export async function loadEquipment() {
  if (config.isDemoMode) {
    return JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
  }
  try {
    const { data, error } = await config.supabaseClient
      .from('equipment')
      .select('*')
      .eq('user_id', state.user.id)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.warn('Equipment laden mislukt:', err);
    return [];
  }
}

// ─── Opslaan (nieuw of update) ────────────────────────────────────────────────

export async function saveEquipment(data) {
  const record = {
    user_id:              state.user.id,
    name:                 data.name,
    type:                 data.type || 'road',
    service_interval_km:  parseFloat(data.serviceInterval || 5000),
    purchase_date:        data.purchaseDate || null,
    notes:                data.notes || '',
    is_active:            true,
    is_default:           data.isDefault || false,
  };

  if (config.isDemoMode) {
    const list = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
    if (data.id) {
      const idx = list.findIndex(e => e.id === data.id);
      if (idx >= 0) list[idx] = { ...list[idx], ...record, id: data.id };
    } else {
      list.push({ ...record, id: `eq-${Date.now()}`, total_km: 0, last_service_km: 0, created_at: new Date().toISOString() });
      // Als is_default, deactiveer andere defaults
      if (record.is_default) list.forEach(e => { if (e.id !== list.at(-1).id) e.is_default = false; });
    }
    localStorage.setItem(DEMO_KEY, JSON.stringify(list));
    return list;
  }

  try {
    if (data.id) {
      const { error } = await config.supabaseClient
        .from('equipment').update(record).eq('id', data.id).eq('user_id', state.user.id);
      if (error) throw error;
    } else {
      // Deactiveer andere defaults als nodig
      if (record.is_default) {
        await config.supabaseClient.from('equipment')
          .update({ is_default: false }).eq('user_id', state.user.id);
      }
      const { error } = await config.supabaseClient.from('equipment').insert(record);
      if (error) throw error;
    }
    return await loadEquipment();
  } catch (err) {
    showToast('Opslaan mislukt: ' + err.message, 'error');
    return null;
  }
}

// ─── Verwijderen ──────────────────────────────────────────────────────────────

export async function deleteEquipment(id) {
  if (config.isDemoMode) {
    const list = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]').filter(e => e.id !== id);
    localStorage.setItem(DEMO_KEY, JSON.stringify(list));
    return list;
  }
  try {
    const { error } = await config.supabaseClient
      .from('equipment').delete().eq('id', id).eq('user_id', state.user.id);
    if (error) throw error;
    return await loadEquipment();
  } catch (err) {
    showToast('Verwijderen mislukt: ' + err.message, 'error');
    return null;
  }
}

// ─── Onderhoud markeren ───────────────────────────────────────────────────────

export async function markServiceDone(id) {
  if (config.isDemoMode) {
    const list = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
    const item = list.find(e => e.id === id);
    if (item) item.last_service_km = item.total_km;
    localStorage.setItem(DEMO_KEY, JSON.stringify(list));
    showToast('Onderhoud geregistreerd!', 'success');
    return list;
  }
  try {
    const equipment = await loadEquipment();
    const item = equipment.find(e => e.id === id);
    if (!item) return;
    const { error } = await config.supabaseClient.from('equipment')
      .update({ last_service_km: item.total_km }).eq('id', id).eq('user_id', state.user.id);
    if (error) throw error;
    showToast('Onderhoud geregistreerd!', 'success');
    return await loadEquipment();
  } catch (err) {
    showToast('Fout: ' + err.message, 'error');
    return null;
  }
}

// ─── Km bijwerken na nieuwe activiteit ────────────────────────────────────────

export async function addKmToEquipment(equipmentId, km) {
  if (config.isDemoMode) {
    const list = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
    const item = list.find(e => e.id === equipmentId);
    if (item) item.total_km = (item.total_km || 0) + parseFloat(km || 0);
    localStorage.setItem(DEMO_KEY, JSON.stringify(list));
    return list;
  }
  try {
    // Gebruik Supabase RPC om km atomair op te tellen
    const { data: current } = await config.supabaseClient
      .from('equipment').select('total_km').eq('id', equipmentId).single();
    const newKm = (current?.total_km || 0) + parseFloat(km || 0);
    await config.supabaseClient.from('equipment')
      .update({ total_km: newKm }).eq('id', equipmentId).eq('user_id', state.user.id);
  } catch (err) {
    console.warn('Km bijwerken mislukt:', err);
  }
}

// ─── Onderhoudswaarschuwingen controleren ─────────────────────────────────────

export function checkMaintenanceWarnings(equipment) {
  const warnings = [];
  for (const item of equipment) {
    const sinceService = (item.total_km || 0) - (item.last_service_km || 0);
    const interval     = item.service_interval_km || 5000;
    const pct          = sinceService / interval;

    if (pct >= 1.0) {
      warnings.push({ id: item.id, name: item.name, sinceService: Math.round(sinceService), level: 'danger' });
    } else if (pct >= 0.8) {
      warnings.push({ id: item.id, name: item.name, sinceService: Math.round(sinceService), level: 'warning' });
    }
  }
  return warnings;
}

// ─── UI Renderen ──────────────────────────────────────────────────────────────

export async function renderEquipmentSection() {
  const container = document.getElementById('equipment-list');
  if (!container) return;

  const equipment = await loadEquipment();
  state.equipment = equipment;

  const warnings = checkMaintenanceWarnings(equipment);

  if (equipment.length === 0) {
    container.innerHTML = `
      <div style="color:var(--text-muted);font-size:12px;text-align:center;padding:20px 0;">
        Nog geen fiets toegevoegd.<br>Klik op <strong>+ Fiets toevoegen</strong> om te beginnen.
      </div>`;
    return;
  }

  container.innerHTML = '';
  for (const item of equipment) {
    const sinceService = (item.total_km || 0) - (item.last_service_km || 0);
    const interval     = item.service_interval_km || 5000;
    const pct          = Math.min(1, sinceService / interval);
    const warn         = warnings.find(w => w.id === item.id);

    const barColor = warn?.level === 'danger'  ? '#f87171'
                   : warn?.level === 'warning' ? '#fb923c'
                   : 'var(--primary)';

    const typeIcons = { road: '🚴', gravel: '🏕️', mtb: '🏔️', other: '🚲' };
    const typeIcon  = typeIcons[item.type] || '🚲';

    const card = document.createElement('div');
    card.className = 'equipment-card';
    card.dataset.equipmentId = item.id;
    card.innerHTML = `
      <div class="eq-header">
        <div class="eq-name-row">
          <span class="eq-type-icon">${typeIcon}</span>
          <span class="eq-name">${item.name}</span>
          ${item.is_default ? '<span class="eq-default-badge">Standaard</span>' : ''}
          ${warn ? `<span class="eq-warn-badge ${warn.level}">${warn.level === 'danger' ? '🔴 Onderhoud nodig' : '🟡 Bijna onderhoud'}</span>` : ''}
        </div>
        <div class="eq-actions">
          <button class="eq-btn eq-edit-btn" data-id="${item.id}" title="Bewerken">✏️</button>
          <button class="eq-btn eq-delete-btn" data-id="${item.id}" title="Verwijderen">🗑️</button>
        </div>
      </div>

      <div class="eq-km-row">
        <div class="eq-stat">
          <span class="eq-stat-val">${Math.round(item.total_km || 0)}</span>
          <span class="eq-stat-lbl">km totaal</span>
        </div>
        <div class="eq-stat">
          <span class="eq-stat-val">${Math.round(sinceService)}</span>
          <span class="eq-stat-lbl">km sinds onderhoud</span>
        </div>
        <div class="eq-stat">
          <span class="eq-stat-val">${Math.round(interval)}</span>
          <span class="eq-stat-lbl">km interval</span>
        </div>
      </div>

      <div class="eq-service-bar-wrap">
        <div class="eq-service-bar">
          <div class="eq-service-fill" style="width:${Math.round(pct*100)}%;background:${barColor};"></div>
        </div>
        <span class="eq-service-pct" style="color:${barColor};">${Math.round(pct*100)}%</span>
      </div>

      ${warn ? `<button class="eq-service-done-btn" data-id="${item.id}">✅ Onderhoud markeren als gedaan</button>` : ''}

      ${item.notes ? `<div class="eq-notes">${item.notes}</div>` : ''}
    `;

    // Event handlers
    card.querySelector('.eq-edit-btn')?.addEventListener('click', () => openEquipmentModal(item));
    card.querySelector('.eq-delete-btn')?.addEventListener('click', async () => {
      if (confirm(`"${item.name}" verwijderen?`)) {
        await deleteEquipment(item.id);
        renderEquipmentSection();
      }
    });
    card.querySelector('.eq-service-done-btn')?.addEventListener('click', async () => {
      await markServiceDone(item.id);
      renderEquipmentSection();
    });

    container.appendChild(card);
  }
}

// ─── Equipment Modal ──────────────────────────────────────────────────────────

export function openEquipmentModal(existing = null) {
  const existing_id = existing?.id || null;

  // Verwijder oude modal
  document.getElementById('equipment-modal')?.remove();

  const modal = document.createElement('div');
  modal.id = 'equipment-modal';
  modal.className = 'modal-overlay active';
  modal.innerHTML = `
    <div class="modal-box" style="max-width:420px;">
      <div class="modal-header">
        <h3>${existing ? 'Fiets bewerken' : '+ Fiets toevoegen'}</h3>
        <button class="modal-close" id="eq-modal-close">✕</button>
      </div>
      <div class="modal-body" style="display:flex;flex-direction:column;gap:12px;">
        <label style="font-size:12px;color:var(--text-muted);">Naam
          <input id="eq-name" type="text" class="form-input" placeholder="bijv. Trek Domane SL6" value="${existing?.name || ''}">
        </label>
        <label style="font-size:12px;color:var(--text-muted);">Type
          <select id="eq-type" class="form-input">
            <option value="road"   ${existing?.type === 'road'   ? 'selected' : ''}>🚴 Racefiets</option>
            <option value="gravel" ${existing?.type === 'gravel' ? 'selected' : ''}>🏕️ Gravel</option>
            <option value="mtb"    ${existing?.type === 'mtb'    ? 'selected' : ''}>🏔️ MTB</option>
            <option value="other"  ${existing?.type === 'other'  ? 'selected' : ''}>🚲 Andere</option>
          </select>
        </label>
        <label style="font-size:12px;color:var(--text-muted);">Onderhoud elke (km)
          <input id="eq-interval" type="number" class="form-input" min="500" step="500" value="${existing?.service_interval_km || 5000}">
        </label>
        <label style="font-size:12px;color:var(--text-muted);">Aankoopdatum (optioneel)
          <input id="eq-purchase" type="date" class="form-input" value="${existing?.purchase_date || ''}">
        </label>
        <label style="font-size:12px;color:var(--text-muted);">Notities (optioneel)
          <textarea id="eq-notes" class="form-input" rows="2" placeholder="bijv. Shimano 105, tubeless...">${existing?.notes || ''}</textarea>
        </label>
        <label style="display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-muted);cursor:pointer;">
          <input id="eq-default" type="checkbox" ${existing?.is_default ? 'checked' : ''}> Standaard fiets (km automatisch koppelen)
        </label>
      </div>
      <div class="modal-footer">
        <button class="btn-secondary" id="eq-modal-cancel">Annuleren</button>
        <button class="btn-primary" id="eq-modal-save">Opslaan</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const close = () => modal.remove();
  modal.querySelector('#eq-modal-close').addEventListener('click', close);
  modal.querySelector('#eq-modal-cancel').addEventListener('click', close);
  modal.addEventListener('click', e => { if (e.target === modal) close(); });

  modal.querySelector('#eq-modal-save').addEventListener('click', async () => {
    const name = modal.querySelector('#eq-name').value.trim();
    if (!name) { showToast('Geef een naam op.', 'error'); return; }

    await saveEquipment({
      id:              existing_id,
      name,
      type:            modal.querySelector('#eq-type').value,
      serviceInterval: modal.querySelector('#eq-interval').value,
      purchaseDate:    modal.querySelector('#eq-purchase').value,
      notes:           modal.querySelector('#eq-notes').value,
      isDefault:       modal.querySelector('#eq-default').checked,
    });

    close();
    showToast(`"${name}" opgeslagen!`, 'success');
    renderEquipmentSection();
  });
}
