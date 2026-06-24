// Cyclo — Equipment Module
// Fiets + componenten registratie, km-teller, onderhoudswaarschuwingen
import { state, config, showToast } from './state.js';
import { fetchWeatherForDate } from './rides.js';

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

  if (!data.id) {
    record.chain_wear_km = 0;
    record.brakepads_wear_km = 0;
    record.sealant_last_replaced = new Date().toISOString().split('T')[0];
  }

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
      warnings.push({ id: item.id, name: item.name, message: `Algemeen onderhoud nodig voor ${item.name}`, level: 'danger' });
    } else if (pct >= 0.8) {
      warnings.push({ id: item.id, name: item.name, message: `Algemeen onderhoud bijna nodig voor ${item.name}`, level: 'warning' });
    }

    // Ketting
    const chainPct = (item.chain_wear_km || 0) / 5000;
    if (chainPct >= 0.9) {
      warnings.push({ id: item.id, name: item.name, component: 'chain', message: `Ketting versleten op ${item.name} (${Math.round(item.chain_wear_km)}km)`, level: 'danger' });
    }

    // Remblokken
    const brakepadsPct = (item.brakepads_wear_km || 0) / 4000;
    if (brakepadsPct >= 0.9) {
      warnings.push({ id: item.id, name: item.name, component: 'brakepads', message: `Remblokken versleten op ${item.name} (${Math.round(item.brakepads_wear_km)}km)`, level: 'danger' });
    }

    // Sealant
    let daysElapsed = 120;
    if (item.sealant_last_replaced) {
      daysElapsed = Math.floor((new Date() - new Date(item.sealant_last_replaced)) / (1000 * 60 * 60 * 24));
      if (isNaN(daysElapsed)) daysElapsed = 120;
    }
    const sealantPct = daysElapsed / 120;
    if (sealantPct >= 0.9) {
      warnings.push({ id: item.id, name: item.name, component: 'sealant', message: `Tubeless sealant verouderd op ${item.name} (${daysElapsed} dagen)`, level: 'danger' });
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
    const itemWarnings = warnings.filter(w => w.id === item.id);
    
    // Genereer badges op basis van alle actieve waarschuwingen voor deze fiets
    const badgesHtml = itemWarnings.map(w => {
      let label = '';
      if (w.component === 'chain') label = '⛓️ Ketting';
      else if (w.component === 'brakepads') label = '🛑 Remblokken';
      else if (w.component === 'sealant') label = '💧 Sealant';
      else label = w.level === 'danger' ? '🔴 Onderhoud' : '🟡 Onderhoud';
      return `<span class="eq-warn-badge ${w.level}" title="${w.message}">${label}</span>`;
    }).join(' ');

    const generalWarn  = itemWarnings.find(w => !w.component);
    const barColor = generalWarn?.level === 'danger'  ? '#f87171'
                   : generalWarn?.level === 'warning' ? '#fb923c'
                   : 'var(--primary)';

    const typeIcons = { road: '🚴', gravel: '🏕️', mtb: '🏔️', other: '🚲' };
    const typeIcon  = typeIcons[item.type] || '🚲';

    // Component-specifieke wear percentages berekenen
    const chainPct = Math.min(1, (item.chain_wear_km || 0) / 5000);
    const chainColor = chainPct >= 0.9 ? '#f87171' : chainPct >= 0.8 ? '#fb923c' : 'var(--primary)';

    const brakepadsPct = Math.min(1, (item.brakepads_wear_km || 0) / 4000);
    const brakepadsColor = brakepadsPct >= 0.9 ? '#f87171' : brakepadsPct >= 0.8 ? '#fb923c' : 'var(--primary)';

    let daysElapsed = 120;
    if (item.sealant_last_replaced) {
      daysElapsed = Math.floor((new Date() - new Date(item.sealant_last_replaced)) / (1000 * 60 * 60 * 24));
      if (isNaN(daysElapsed)) daysElapsed = 120;
    }
    const sealantPct = Math.min(1, daysElapsed / 120);
    const sealantColor = sealantPct >= 0.9 ? '#f87171' : sealantPct >= 0.8 ? '#fb923c' : 'var(--primary)';

    const card = document.createElement('div');
    card.className = 'equipment-card';
    card.dataset.equipmentId = item.id;
    card.innerHTML = `
      <div class="eq-header">
        <div class="eq-name-row" style="display: flex; flex-wrap: wrap; gap: 6px; align-items: center;">
          <span class="eq-type-icon">${typeIcon}</span>
          <span class="eq-name" style="font-weight:700;">${item.name}</span>
          ${item.is_default ? '<span class="eq-default-badge">Standaard</span>' : ''}
          ${badgesHtml}
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

      ${generalWarn ? `<button class="eq-service-done-btn" data-id="${item.id}">✅ Algemeen onderhoud gedaan</button>` : ''}

      <!-- Component Wear Progress Bars -->
      <div class="eq-components-wear" style="margin-top: 15px; padding-top: 15px; border-top: 1px solid var(--border-color, #374151); display: flex; flex-direction: column; gap: 10px;">
        <h4 style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; margin: 0; color: var(--text-color, #f3f4f6); font-weight: 700;">Onderdelen Status</h4>
        
        <!-- Chain -->
        <div class="component-wear-row" style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; align-items: center;">
            <span style="color: var(--text-muted, #9ca3af);">⛓️ Ketting (${Math.round(item.chain_wear_km || 0)} / 5000 km)</span>
            <button class="eq-reset-btn" data-id="${item.id}" data-type="chain" style="background: none; border: none; color: var(--primary, #a3e635); cursor: pointer; padding: 0; font-size: 10px; text-decoration: underline;">Reset</button>
          </div>
          <div class="eq-service-bar-wrap" style="margin: 0; display: flex; align-items: center; gap: 8px;">
            <div class="eq-service-bar" style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
              <div class="eq-service-fill" style="width:${Math.round(chainPct*100)}%;background:${chainColor}; height: 100%;"></div>
            </div>
            <span class="eq-service-pct" style="color:${chainColor}; font-size: 10px; font-weight: 600; min-width: 25px; text-align: right;">${Math.round(chainPct*100)}%</span>
          </div>
        </div>

        <!-- Brake Pads -->
        <div class="component-wear-row" style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; align-items: center;">
            <span style="color: var(--text-muted, #9ca3af);">🛑 Remblokken (${Math.round(item.brakepads_wear_km || 0)} / 4000 km)</span>
            <button class="eq-reset-btn" data-id="${item.id}" data-type="brakepads" style="background: none; border: none; color: var(--primary, #a3e635); cursor: pointer; padding: 0; font-size: 10px; text-decoration: underline;">Reset</button>
          </div>
          <div class="eq-service-bar-wrap" style="margin: 0; display: flex; align-items: center; gap: 8px;">
            <div class="eq-service-bar" style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
              <div class="eq-service-fill" style="width:${Math.round(brakepadsPct*100)}%;background:${brakepadsColor}; height: 100%;"></div>
            </div>
            <span class="eq-service-pct" style="color:${brakepadsColor}; font-size: 10px; font-weight: 600; min-width: 25px; text-align: right;">${Math.round(brakepadsPct*100)}%</span>
          </div>
        </div>

        <!-- Sealant -->
        <div class="component-wear-row" style="display: flex; flex-direction: column; gap: 4px;">
          <div style="display: flex; justify-content: space-between; font-size: 11px; align-items: center;">
            <span style="color: var(--text-muted, #9ca3af);">💧 Sealant (${daysElapsed} / 120 dagen)</span>
            <button class="eq-reset-btn" data-id="${item.id}" data-type="sealant" style="background: none; border: none; color: var(--primary, #a3e635); cursor: pointer; padding: 0; font-size: 10px; text-decoration: underline;">Reset</button>
          </div>
          <div class="eq-service-bar-wrap" style="margin: 0; display: flex; align-items: center; gap: 8px;">
            <div class="eq-service-bar" style="flex: 1; height: 6px; background: rgba(255,255,255,0.1); border-radius: 3px; overflow: hidden;">
              <div class="eq-service-fill" style="width:${Math.round(sealantPct*100)}%;background:${sealantColor}; height: 100%;"></div>
            </div>
            <span class="eq-service-pct" style="color:${sealantColor}; font-size: 10px; font-weight: 600; min-width: 25px; text-align: right;">${Math.round(sealantPct*100)}%</span>
          </div>
        </div>
      </div>

      ${item.notes ? `<div class="eq-notes" style="margin-top:10px;">${item.notes}</div>` : ''}
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
    card.querySelectorAll('.eq-reset-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        const type = e.target.dataset.type;
        const id = e.target.dataset.id;
        await resetComponentWear(id, type);
        renderEquipmentSection();
      });
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

// ─── Weather-adjusted wear tracking & maintenance resets ─────────────────────

export async function updateEquipmentWearForRide(distanceKm, dateStr, bikeId = null) {
  const equipment = await loadEquipment();
  if (equipment.length === 0) return;

  let bike = null;
  if (bikeId) {
    bike = equipment.find(e => e.id === bikeId);
  }
  if (!bike) {
    bike = equipment.find(e => e.is_default) || equipment[0];
  }
  if (!bike) return;

  let C_weather = 1.0;
  if (bike.type === 'gravel' || bike.type === 'mtb') {
    C_weather = 3.0;
  } else {
    try {
      const weather = await fetchWeatherForDate(dateStr.substring(0, 10));
      if (weather) {
        const isRainy = (weather.code >= 51 && weather.code <= 67) || 
                        (weather.code >= 80 && weather.code <= 86) || 
                        (weather.precip > 30);
        if (isRainy) {
          C_weather = 2.0;
        }
      }
    } catch (err) {
      console.warn('Weather fetch mislukt voor wear-coefficient, fallback naar 1.0:', err);
    }
  }

  const addedWear = parseFloat(distanceKm || 0) * C_weather;
  const updates = {
    chain_wear_km: (parseFloat(bike.chain_wear_km) || 0) + addedWear,
    brakepads_wear_km: (parseFloat(bike.brakepads_wear_km) || 0) + addedWear,
    total_km: (parseFloat(bike.total_km) || 0) + parseFloat(distanceKm || 0)
  };

  if (config.isDemoMode) {
    const list = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
    const idx = list.findIndex(e => e.id === bike.id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates };
      localStorage.setItem(DEMO_KEY, JSON.stringify(list));
    }
  } else {
    try {
      await config.supabaseClient
        .from('equipment')
        .update(updates)
        .eq('id', bike.id)
        .eq('user_id', state.user.id);
    } catch (err) {
      console.warn('Equipment wear opslaan mislukt:', err);
    }
  }
}

export async function resetComponentWear(id, componentType) {
  const updates = {};
  if (componentType === 'chain') {
    updates.chain_wear_km = 0;
  } else if (componentType === 'brakepads') {
    updates.brakepads_wear_km = 0;
  } else if (componentType === 'sealant') {
    updates.sealant_last_replaced = new Date().toISOString().split('T')[0];
  }

  if (config.isDemoMode) {
    const list = JSON.parse(localStorage.getItem(DEMO_KEY) || '[]');
    const idx = list.findIndex(e => e.id === id);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...updates };
      localStorage.setItem(DEMO_KEY, JSON.stringify(list));
      showToast(`${componentType === 'chain' ? 'Ketting' : componentType === 'brakepads' ? 'Remblokken' : 'Sealant'} gereset!`, 'success');
      return list;
    }
    return null;
  }

  try {
    const { error } = await config.supabaseClient
      .from('equipment')
      .update(updates)
      .eq('id', id)
      .eq('user_id', state.user.id);
    if (error) throw error;
    showToast(`${componentType === 'chain' ? 'Ketting' : componentType === 'brakepads' ? 'Remblokken' : 'Sealant'} gereset!`, 'success');
    return await loadEquipment();
  } catch (err) {
    showToast('Reset mislukt: ' + err.message, 'error');
    return null;
  }
}
