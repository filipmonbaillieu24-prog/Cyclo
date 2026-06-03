// Cyclo - Calendar & Availability Module
import { state, elements, config, showToast } from './state.js';

export function changeMonth(direction, loadDashboardDataCallback) {
  state.currentDate.setMonth(state.currentDate.getMonth() + direction);
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
  
  // Dagen vorige maand
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
  
  // Dagen volgende maand vullen tot 42 cellen
  const currentGridCells = startOffset + totalDays;
  const nextMonthCellsNeeded = 42 - currentGridCells;
  
  for (let i = 1; i <= nextMonthCellsNeeded; i++) {
    const nextMonthDate = new Date(year, month + 1, i);
    createCalendarDayCell(i, nextMonthDate, true);
  }
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
      // Eigen beschikbaarheid altijd als eerste
      allAvailsToShow.push({ avail: myAvail, isMe: true });
    }
  }

  // Vrienden die beschikbaar of misschien zijn
  const friendAvails = state.user
    ? dayAvails.filter(a => a.user_id !== state.user.id && (a.status === 'available' || a.status === 'tentative'))
    : dayAvails;

  friendAvails.forEach(avail => allAvailsToShow.push({ avail, isMe: false }));

  if (allAvailsToShow.length > 0) {
    const avatarList = document.createElement('div');
    avatarList.classList.add('avatar-list');

    // Max 4 avatars tonen
    allAvailsToShow.slice(0, 4).forEach(({ avail, isMe }) => {
      const profile = state.profiles.find(p => p.id === avail.user_id)
        || (isMe ? state.user : null);
      if (!profile) return;

      const img = document.createElement('img');
      img.src = profile.avatar_url;
      img.alt = profile.full_name;
      img.className = 'avatar cal-avatar';

      // Kleurring op basis van status
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

    // +N indicator als er meer zijn
    if (allAvailsToShow.length > 4) {
      const moreCount = document.createElement('div');
      moreCount.className = 'cal-avatar-more';
      moreCount.textContent = `+${allAvailsToShow.length - 4}`;
      avatarList.appendChild(moreCount);
    }

    cell.appendChild(avatarList);
  }

  cell.addEventListener('click', () => {
    document.querySelectorAll('.calendar-day').forEach(c => c.classList.remove('selected'));
    cell.classList.add('selected');
    state.selectedDate = new Date(dateStr);
    updateAvailabilityEditor();
  });

  elements.calendarDaysGrid.appendChild(cell);
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
