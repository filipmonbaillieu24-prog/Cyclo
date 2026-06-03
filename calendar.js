// Cyclo - Calendar & Availability Module
import { state, elements, config, showToast } from './state.js';

// Multi-selectie state (lokaal in deze module)
let selectedDates = []; // array van dateStr strings

export function changeMonth(direction, loadDashboardDataCallback) {
  state.currentDate.setMonth(state.currentDate.getMonth() + direction);
  selectedDates = [];
  updateBulkBanner();
  renderCalendar();
  if (typeof loadDashboardDataCallback === 'function') {
    loadDashboardDataCallback();
  }
}

export function renderCalendar() {
  const year = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  
  const monthNames = [
    "Januari", "Februari", "Maart", "April", "Mei", "Juni", 
    "Juli", "Augustus", "September", "Oktober", "November", "December"
  ];
  elements.calendarMonthYear.textContent = `${monthNames[month]} ${year}`;
  
  elements.calendarDaysGrid.innerHTML = '';
  
  const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Zondag
  const totalDays = new Date(year, month + 1, 0).getDate();
  
  // Maandag t/m Zondag EU weergave
  let startOffset = firstDayIndex - 1;
  if (startOffset < 0) startOffset = 6;
  
  // Dagen vorige maand (grijs)
  const prevMonthTotalDays = new Date(year, month, 0).getDate();
  for (let i = startOffset - 1; i >= 0; i--) {
    const dayVal = prevMonthTotalDays - i;
    const prevMonthDate = new Date(year, month - 1, dayVal);
    createCalendarDayCell(dayVal, prevMonthDate, true);
  }
  
  // Dagen huidige maand
  for (let i = 1; i <= totalDays; i++) {
    const cellDate = new Date(year, month, i);
    createCalendarDayCell(i, cellDate, false);
  }
  
  // Dagen volgende maand (grijs)
  const currentGridCells = startOffset + totalDays;
  const nextMonthCellsNeeded = 42 - currentGridCells;
  
  for (let i = 1; i <= nextMonthCellsNeeded; i++) {
    const nextMonthDate = new Date(year, month + 1, i);
    createCalendarDayCell(i, nextMonthDate, true);
  }

  // Herstel visuele multi-selectie
  refreshMultiSelectVisuals();
}

export function createCalendarDayCell(dayNumber, date, isOtherMonth) {
  const cell = document.createElement('div');
  cell.classList.add('calendar-day');
  
  const dateStr = date.toISOString().split('T')[0];
  cell.dataset.date = dateStr;
  
  if (isOtherMonth) {
    cell.classList.add('other-month');
  }
  
  const todayStr = new Date().toISOString().split('T')[0];
  if (dateStr === todayStr) {
    cell.classList.add('today');
  }
  
  const selectedStr = state.selectedDate.toISOString().split('T')[0];
  if (dateStr === selectedStr) {
    cell.classList.add('selected');
  }
  
  const numberEl = document.createElement('div');
  numberEl.classList.add('day-number');
  numberEl.textContent = dayNumber;
  cell.appendChild(numberEl);
  
  const dayAvails = state.availabilities.filter(a => a.date === dateStr);

  // Bouw een gecombineerde lijst: eigen beschikbaarheid + vrienden
  const allAvailsToShow = [];

  if (state.user) {
    const myAvail = dayAvails.find(a => a.user_id === state.user.id);
    if (myAvail) {
      allAvailsToShow.push({ avail: myAvail, isMe: true });
    }
  }

  // Vrienden: alleen tonen als ze 'available' zijn (niet tentative/unavailable)
  const friendAvails = state.user
    ? dayAvails.filter(a => a.user_id !== state.user.id && a.status === 'available')
    : dayAvails.filter(a => a.status === 'available');

  friendAvails.forEach(avail => allAvailsToShow.push({ avail, isMe: false }));

  if (allAvailsToShow.length > 0) {
    const avatarList = document.createElement('div');
    avatarList.classList.add('avatar-list');

    allAvailsToShow.slice(0, 4).forEach(({ avail, isMe }) => {
      const profile = state.profiles.find(p => p.id === avail.user_id)
        || (isMe ? state.user : null);
      if (!profile) return;

      const img = document.createElement('img');
      img.src = profile.avatar_url;
      img.alt = profile.full_name;
      img.className = 'avatar cal-avatar';

      const ringColor = avail.status === 'available'
        ? 'var(--status-available)'
        : avail.status === 'tentative'
          ? 'var(--status-tentative)'
          : 'var(--status-unavailable)';
      img.style.outline = `2px solid ${ringColor}`;
      img.style.outlineOffset = '1px';

      const statusLabel = avail.status === 'available' ? 'Kan'
        : avail.status === 'tentative' ? 'Misschien' : 'Kan niet';
      const meLabel = isMe ? ' (jij)' : '';
      img.title = `${profile.full_name}${meLabel} — ${statusLabel}${avail.notes ? ': ' + avail.notes : ''}`;

      avatarList.appendChild(img);
    });

    if (allAvailsToShow.length > 4) {
      const moreCount = document.createElement('div');
      moreCount.className = 'cal-avatar-more';
      moreCount.textContent = `+${allAvailsToShow.length - 4}`;
      avatarList.appendChild(moreCount);
    }

    cell.appendChild(avatarList);
  }

  // ─── Klik handler met Shift+klik multi-selectie ───
  cell.addEventListener('click', (e) => {
    if (isOtherMonth) return; // Andere maand: negeren

    if (e.shiftKey && selectedDates.length > 0) {
      // Shift+klik: voeg toe of verwijder uit selectie
      const idx = selectedDates.indexOf(dateStr);
      if (idx === -1) {
        selectedDates.push(dateStr);
      } else {
        selectedDates.splice(idx, 1);
      }
    } else if (e.shiftKey && selectedDates.length === 0) {
      // Eerste shift+klik: start selectie
      selectedDates = [dateStr];
    } else {
      // Normale klik: selecteer één dag
      selectedDates = [dateStr];
      state.selectedDate = new Date(dateStr);
    }

    refreshMultiSelectVisuals();
    updateBulkBanner();

    if (selectedDates.length === 1) {
      // Eén dag geselecteerd: toon beschikbaarheidseditor
      state.selectedDate = new Date(dateStr);
      updateAvailabilityEditor();
    }
  });

  elements.calendarDaysGrid.appendChild(cell);
}

// ─── Visuele multi-selectie bijwerken ──────────────────
function refreshMultiSelectVisuals() {
  document.querySelectorAll('.calendar-day').forEach(cell => {
    const ds = cell.dataset.date;
    cell.classList.remove('selected', 'multi-selected');
    
    if (selectedDates.includes(ds)) {
      if (selectedDates.length === 1) {
        cell.classList.add('selected');
      } else {
        cell.classList.add('multi-selected');
      }
    }
  });
}

// ─── Bulk banner tonen/verbergen ───────────────────────
function updateBulkBanner() {
  const banner = document.getElementById('bulk-availability-banner');
  const label  = document.getElementById('bulk-days-label');
  if (!banner) return;

  if (selectedDates.length > 1) {
    banner.style.display = 'flex';
    const dateLabels = selectedDates.map(ds => {
      const d = new Date(ds);
      return new Intl.DateTimeFormat('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' }).format(d);
    }).join(', ');
    if (label) label.textContent = `${selectedDates.length} dagen: ${dateLabels}`;
  } else {
    banner.style.display = 'none';
  }
}

// ─── Weekendknop: selecteer alle ZA+ZO in de maand ─────
export function selectWeekends() {
  const year  = state.currentDate.getFullYear();
  const month = state.currentDate.getMonth();
  const total = new Date(year, month + 1, 0).getDate();
  selectedDates = [];

  for (let i = 1; i <= total; i++) {
    const d = new Date(year, month, i);
    const dow = d.getDay(); // 0=zo, 6=za
    if (dow === 0 || dow === 6) {
      selectedDates.push(d.toISOString().split('T')[0]);
    }
  }

  refreshMultiSelectVisuals();
  updateBulkBanner();
}

// ─── Selectie wissen ────────────────────────────────────
export function clearCalendarSelection() {
  selectedDates = [];
  refreshMultiSelectVisuals();
  updateBulkBanner();
}

// ─── Bulk beschikbaarheid opslaan ──────────────────────
export async function saveBulkAvailability(loadDashboardDataCallback) {
  const statusEl = document.getElementById('bulk-status-select');
  const status   = statusEl?.value || 'available';
  const notes    = elements.availabilityNotes?.value || '';

  if (selectedDates.length === 0) {
    showToast('Selecteer eerst meerdere dagen.', 'error');
    return;
  }

  if (config.isDemoMode) {
    let savedAvails = JSON.parse(localStorage.getItem('cyclo_mock_availabilities') || '[]');
    for (const dateStr of selectedDates) {
      const idx = savedAvails.findIndex(a => a.date === dateStr && a.user_id === state.user.id);
      const availData = {
        id: idx !== -1 ? savedAvails[idx].id : `a-${Date.now()}-${dateStr}`,
        user_id: state.user.id,
        date: dateStr,
        status,
        notes
      };
      if (idx !== -1) savedAvails[idx] = availData;
      else savedAvails.push(availData);
    }
    localStorage.setItem('cyclo_mock_availabilities', JSON.stringify(savedAvails));
    showToast(`Beschikbaarheid opgeslagen voor ${selectedDates.length} dagen!`, 'success');
    clearCalendarSelection();
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
    return;
  }

  try {
    // Upsert voor elke geselecteerde dag
    const records = selectedDates.map(dateStr => ({
      user_id: state.user.id,
      date: dateStr,
      status,
      notes
    }));

    // Gebruik upsert (insert of update op conflict)
    const { error } = await config.supabaseClient
      .from('availabilities')
      .upsert(records, { onConflict: 'user_id,date' });

    if (error) throw error;

    showToast(`✓ Beschikbaarheid opgeslagen voor ${selectedDates.length} dagen!`, 'success');
    clearCalendarSelection();
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
  } catch (err) {
    showToast('Fout bij opslaan: ' + err.message, 'error');
  }
}

export function updateAvailabilityEditor() {
  if (!state.user) return;
  const dateStr = state.selectedDate.toISOString().split('T')[0];
  
  const opt = { weekday: 'long', day: 'numeric', month: 'long' };
  const formatter = new Intl.DateTimeFormat('nl-NL', opt);
  elements.selectedDateStr.textContent = formatter.format(state.selectedDate);
  
  const myAvail = state.availabilities.find(a => a.date === dateStr && a.user_id === state.user.id);
  
  const btns = [elements.statusBtnAvail, elements.statusBtnTent, elements.statusBtnUnavail];
  btns.forEach(b => b.classList.remove('active'));
  
  if (myAvail) {
    state.selectedStatus = myAvail.status;
    const activeBtn = btns.find(b => b.dataset.status === myAvail.status);
    if (activeBtn) activeBtn.classList.add('active');
    elements.availabilityNotes.value = myAvail.notes || '';
  } else {
    state.selectedStatus = 'available';
    elements.statusBtnAvail.classList.add('active');
    elements.availabilityNotes.value = '';
  }
}

export async function saveAvailability(loadDashboardDataCallback) {
  const dateStr = state.selectedDate.toISOString().split('T')[0];
  const notes = elements.availabilityNotes.value;
  
  if (config.isDemoMode) {
    let savedAvails = JSON.parse(localStorage.getItem('cyclo_mock_availabilities') || '[]');
    const idx = savedAvails.findIndex(a => a.date === dateStr && a.user_id === state.user.id);
    
    if (state.selectedStatus === 'unavail') {
      if (idx !== -1) savedAvails.splice(idx, 1);
    } else {
      const availData = {
        id: idx !== -1 ? savedAvails[idx].id : `a-user-${Date.now()}`,
        user_id: state.user.id,
        date: dateStr,
        status: state.selectedStatus,
        notes: notes
      };
      
      if (idx !== -1) savedAvails[idx] = availData;
      else savedAvails.push(availData);
    }
    
    localStorage.setItem('cyclo_mock_availabilities', JSON.stringify(savedAvails));
    showToast("Beschikbaarheid lokaal opgeslagen!", "success");
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
    return;
  }
  
  try {
    const myAvail = state.availabilities.find(a => a.date === dateStr && a.user_id === state.user.id);
    
    if (state.selectedStatus === 'unavail') {
      if (myAvail) {
        const { error } = await config.supabaseClient
          .from('availabilities')
          .delete()
          .eq('id', myAvail.id);
        if (error) throw error;
      }
    } else {
      const record = {
        user_id: state.user.id,
        date: dateStr,
        status: state.selectedStatus,
        notes: notes
      };
      
      if (myAvail) {
        const { error } = await config.supabaseClient
          .from('availabilities')
          .update({ status: state.selectedStatus, notes: notes })
          .eq('id', myAvail.id);
        if (error) throw error;
      } else {
        const { error } = await config.supabaseClient
          .from('availabilities')
          .insert([record]);
        if (error) throw error;
      }
    }
    
    showToast("Beschikbaarheid bijgewerkt!", "success");
    if (typeof loadDashboardDataCallback === 'function') loadDashboardDataCallback();
  } catch (err) {
    showToast(err.message, "error");
  }
}
