import { state, config, showToast, navigateTo } from '../../state.js';
import { availabilityManager } from './availability-manager.js';
import { zoneCalculator } from './zone-calculator.js';
import { recoveryMetrics } from './recovery-metrics.js';
import { adaptiveScheduler } from './adaptive-scheduler.js';

let localPlannedWorkouts = [];
let localSlots = [];
let localExceptions = [];

export function initTrainingPage() {
  const container = document.getElementById('section-training');
  if (!container) return;

  container.innerHTML = `
    <div class="training-dashboard-container">
      <div class="training-header">
        <div>
          <h1 class="training-title">Trainings Center</h1>
          <p class="training-subtitle">Periodisering & Adaptieve Coaching</p>
        </div>
        <div class="d-flex gap-12">
          <button class="btn btn-primary btn-sm" id="btn-sync-workouts">
            <i data-lucide="refresh-cw" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Synchroniseer Ritten
          </button>
          <button class="btn btn-secondary btn-sm" id="btn-edit-slots">
            <i data-lucide="settings" style="width:14px;height:14px;display:inline-block;vertical-align:middle;margin-right:4px;"></i> Beschikbaarheid
          </button>
        </div>
      </div>

      <!-- Overviews Panel (3 cards) -->
      <div class="training-grid-stats">
        <div class="training-stat-card">
          <div class="training-card-label">Chronic Training Load (CTL)</div>
          <div class="training-card-value" id="training-ctl-val">0</div>
          <div class="training-card-sub text-success">Fitheid (42-dagen gemiddelde)</div>
        </div>
        <div class="training-stat-card">
          <div class="training-card-label">Acute Training Load (ATL)</div>
          <div class="training-card-value text-accent" id="training-atl-val">0</div>
          <div class="training-card-sub text-muted">Vermoeidheid (7-dagen gemiddelde)</div>
        </div>
        <div class="training-stat-card">
          <div class="training-card-label">Training Stress Balance (TSB)</div>
          <div class="training-card-value" id="training-tsb-val">0</div>
          <div class="training-card-sub" id="training-tsb-desc">Vorm (CTL - ATL)</div>
        </div>
      </div>

      <!-- Wekelijkse Tijdlijn & Drag/Drop -->
      <div class="training-row mt-4">
        <div class="training-panel-col-8">
          <div class="training-panel-header">
            <h3>Wekelijkse Tijdlijn (ma - zo)</h3>
            <span class="text-muted" style="font-size:11px;" id="training-week-lbl">Actuele Week</span>
          </div>
          <div class="training-week-grid" id="training-week-timeline">
            <!-- Dynamische workout-kaarten -->
          </div>
        </div>

        <div class="training-panel-col-4">
          <div class="training-panel-header">
            <h3>Wekelijkse TSS</h3>
          </div>
          <div class="training-tss-chart-card" style="padding:16px;">
            <div id="tss-chart-container" style="height:160px;width:100%;">
              <!-- Custom SVG chart -->
            </div>
            <div class="d-flex justify-between mt-3 text-muted" style="font-size:11px;">
              <span>Doel: <strong id="tss-target-lbl" style="color:var(--text-primary)">0</strong> TSS</span>
              <span>Actueel: <strong id="tss-actual-lbl" style="color:var(--primary)">0</strong> TSS</span>
            </div>
            <div class="progress-bar-container mt-2" style="background:rgba(255,255,255,0.06);height:6px;border-radius:3px;">
              <div id="tss-weekly-progress" style="width:0%;height:100%;background:var(--primary);border-radius:3px;transition:width 0.4s;"></div>
            </div>
          </div>

          <!-- Fysiologische status info -->
          <div class="training-panel-header mt-4">
            <h3>HRV & Recovery Status</h3>
          </div>
          <div class="training-tss-chart-card" style="padding:16px;">
            <div class="d-flex align-center gap-12">
              <div id="hrv-status-indicator" style="width:12px;height:12px;border-radius:50%;background:#4caf50;"></div>
              <div>
                <div style="font-weight:700;font-size:14px;" id="hrv-readiness-val"> Readiness: 75%</div>
                <div style="font-size:11px;color:var(--text-muted);" id="hrv-readiness-desc">Fysiologische systemen in balans. Drempeltraining toegestaan.</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Performance Management Chart (PMC) -->
      <div class="training-row mt-4">
        <div class="training-panel-col-12">
          <div class="training-panel-header">
            <h3>Performance Management Chart (Fitness / Vermoeidheid / Vorm)</h3>
          </div>
          <div class="training-tss-chart-card" style="padding:20px;height:300px;width:100%;" id="pmc-chart-container">
            <!-- Custom SVG line chart -->
          </div>
        </div>
      </div>

      <!-- Trainingszones (Power & Heart Rate) -->
      <div class="training-row mt-4">
        <div class="training-panel-col-12">
          <div class="training-panel-header">
            <h3>Jouw Persoonlijke Trainingszones</h3>
          </div>
          <div class="zones-container" id="training-zones-container">
            <!-- Dynamische zones -->
          </div>
        </div>
      </div>
    </div>

    <!-- Modal: Edit Slots -->
    <div class="modal-overlay" id="slots-modal">
      <div class="modal-content glass-panel" style="max-width:480px; max-height: 90vh; overflow-y: auto;">
        <div class="modal-header">
          <h2 style="font-size:18px;">Wekelijkse Beschikbaarheid</h2>
          <button class="modal-close" id="btn-close-slots-modal">&times;</button>
        </div>
        <form id="form-edit-slots" style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
          <div style="display:grid; grid-template-columns:1fr 1fr; gap:10px;" id="slots-form-grid">
            <!-- Dynamic inputs -->
          </div>
          <button type="submit" class="btn btn-primary mt-3">Opslaan & Bereken</button>
        </form>

        <hr style="border:0; border-top:1px solid rgba(255,255,255,0.06); margin:16px 0;">
        <h3 style="font-size:14px; font-weight:800; color:var(--text-primary);">Uitzondering Toevoegen (bijv. Vakantie/Ziek)</h3>
        <form id="form-add-exception" style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">
          <div style="display:grid; grid-template-columns:1.2fr 1fr; gap:10px;">
            <div class="form-group">
              <label style="font-size:11px;">Datum</label>
              <input type="date" id="exception-date" class="form-control" required style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass);">
            </div>
            <div class="form-group">
              <label style="font-size:11px;">Status</label>
              <select id="exception-status" class="form-control" style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-glass);">
                <option value="unavailable">Niet beschikbaar</option>
                <option value="available">Beschikbaar</option>
              </select>
            </div>
          </div>
          <div class="form-group">
            <label style="font-size:11px;">Opmerking (optioneel)</label>
            <input type="text" id="exception-notes" class="form-control" placeholder="Bijv. Feestdag of Hersteldag" style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass);">
          </div>
          <button type="submit" class="btn btn-secondary btn-sm" style="align-self:flex-end;">Toevoegen</button>
        </form>

        <h3 style="font-size:13px; font-weight:800; color:var(--text-primary); margin-top:16px;">Actieve Uitzonderingen</h3>
        <div id="exceptions-list" style="max-height:120px; overflow-y:auto; margin-top:8px; display:flex; flex-direction:column; gap:6px;">
          <!-- Dynamische lijst -->
        </div>
      </div>
    </div>

    <!-- Modal: Add/Edit Workout -->
    <div class="modal-overlay" id="workout-modal">
      <div class="modal-content glass-panel" style="max-width:400px;">
        <div class="modal-header">
          <h2 style="font-size:18px;" id="workout-modal-title">Training Plannen</h2>
          <button class="modal-close" id="btn-close-workout-modal">&times;</button>
        </div>
        <form id="form-edit-workout" style="display:flex; flex-direction:column; gap:12px; margin-top:12px;">
          <input type="hidden" id="workout-id">
          <div class="form-group">
            <label>Datum</label>
            <input type="date" id="workout-date" class="form-control" required style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass);">
          </div>
          <div class="form-group">
            <label>Titel</label>
            <input type="text" id="workout-title" class="form-control" placeholder="Bijv. Sweet Spot Intervallen" required style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass);">
          </div>
          <div class="form-group">
            <label>Type</label>
            <select id="workout-type" class="form-control" required style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-glass);">
              <option value="Recovery">Recovery</option>
              <option value="Endurance">Endurance</option>
              <option value="Tempo">Tempo</option>
              <option value="Threshold">Threshold</option>
              <option value="VO2 Max">VO2 Max</option>
              <option value="Anaerobic">Anaerobic</option>
            </select>
          </div>
          <div class="form-group">
            <label>Duur (minuten)</label>
            <input type="number" id="workout-duration" class="form-control" min="10" max="600" value="60" required style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass);">
          </div>
          <div class="form-group">
            <label>Doel TSS</label>
            <input type="number" id="workout-tss" class="form-control" min="5" max="500" value="50" required style="background:rgba(0,0,0,0.2); border:1px solid var(--border-glass);">
          </div>
          <div class="form-group">
            <label>Status</label>
            <select id="workout-status" class="form-control" style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-glass);">
              <option value="planned">Gepland</option>
              <option value="completed">Voltooid</option>
            </select>
          </div>
          
          <div style="display:flex; gap:10px; margin-top:12px;">
            <button type="button" class="btn btn-secondary" id="btn-delete-workout" style="display:none; background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.3); color:#ef4444; flex:1;">Verwijderen</button>
            <button type="submit" class="btn btn-primary" style="flex:2;">Opslaan</button>
          </div>
        </form>
      </div>
    </div>
  `;

  // Bind modal triggers
  const editBtn = document.getElementById('btn-edit-slots');
  const slotsModal = document.getElementById('slots-modal');
  const closeSlotsBtn = document.getElementById('btn-close-slots-modal');
  const formSlots = document.getElementById('form-edit-slots');

  if (editBtn && slotsModal) editBtn.addEventListener('click', () => {
    slotsModal.classList.add('active');
    renderSlotsModalForm();
    renderExceptionsList();
  });
  if (closeSlotsBtn && slotsModal) closeSlotsBtn.addEventListener('click', () => slotsModal.classList.remove('active'));
  if (formSlots) formSlots.addEventListener('submit', handleSaveSlots);

  // Bind exceptions
  const formException = document.getElementById('form-add-exception');
  if (formException) formException.addEventListener('submit', handleAddException);

  // Bind workout modal
  const workoutModal = document.getElementById('workout-modal');
  const closeWorkoutBtn = document.getElementById('btn-close-workout-modal');
  if (closeWorkoutBtn && workoutModal) {
    closeWorkoutBtn.addEventListener('click', () => workoutModal.classList.remove('active'));
  }
  const formWorkout = document.getElementById('form-edit-workout');
  if (formWorkout) formWorkout.addEventListener('submit', handleSaveWorkout);
  const deleteWorkoutBtn = document.getElementById('btn-delete-workout');
  if (deleteWorkoutBtn) deleteWorkoutBtn.addEventListener('click', handleDeleteWorkout);

  // Sync workouts button
  const syncBtn = document.getElementById('btn-sync-workouts');
  if (syncBtn) syncBtn.addEventListener('click', syncActivitiesToWorkouts);
}

export async function loadTrainingPage() {
  if (!state.user) {
    showToast("Log eerst in.", "error");
    navigateTo('auth');
    return;
  }

  // Ophalen data
  localSlots = await availabilityManager.fetchSlots();
  localExceptions = await availabilityManager.fetchExceptions();

  if (config.isDemoMode) {
    const storedWorkouts = localStorage.getItem('cyclo_planned_workouts');
    localPlannedWorkouts = storedWorkouts ? JSON.parse(storedWorkouts) : generateMockWorkouts();
  } else {
    try {
      const { data, error } = await config.supabaseClient
        .from('planned_workouts')
        .select('*')
        .eq('user_id', state.user.id);
      if (!error && data) {
        localPlannedWorkouts = data;
      } else {
        localPlannedWorkouts = [];
      }
    } catch(e) {
      console.warn("Fout bij laden planned workouts:", e);
      localPlannedWorkouts = [];
    }
  }

  // Bereken CTL/ATL/TSB en render UI
  renderTrainingDashboard();
}

function renderTrainingDashboard() {
  // Recalculate PMC data
  const activities = state.activities || [];
  const pmc = adaptiveScheduler.recalculatePMC(activities, 30);
  const latestPMC = pmc[pmc.length - 1] || { ctl: 0, atl: 0, tsb: 0 };

  // Update stat cards
  const ctlEl = document.getElementById('training-ctl-val');
  const atlEl = document.getElementById('training-atl-val');
  const tsbEl = document.getElementById('training-tsb-val');
  const tsbDesc = document.getElementById('training-tsb-desc');

  if (ctlEl) ctlEl.textContent = Math.round(latestPMC.ctl);
  if (atlEl) atlEl.textContent = Math.round(latestPMC.atl);
  if (tsbEl) {
    tsbEl.textContent = Math.round(latestPMC.tsb);
    if (latestPMC.tsb > 15) {
      tsbEl.className = "training-card-value text-success";
      if (tsbDesc) tsbDesc.textContent = "Vorm optimaal (Uitgerust)";
    } else if (latestPMC.tsb < -25) {
      tsbEl.className = "training-card-value text-danger";
      if (tsbDesc) tsbDesc.textContent = "Vermoeid (Overreach)";
    } else {
      tsbEl.className = "training-card-value text-primary";
      if (tsbDesc) tsbDesc.textContent = "Vorm neutraal (In training)";
    }
  }

  // Update HRV info
  const hrvIndicator = document.getElementById('hrv-status-indicator');
  const hrvVal = document.getElementById('hrv-readiness-val');
  const hrvDesc = document.getElementById('hrv-readiness-desc');
  const readiness = state.user?.readiness_score || 72;

  if (hrvVal) hrvVal.textContent = ` Readiness: ${readiness}%`;
  if (hrvIndicator && hrvDesc) {
    if (readiness < 50) {
      hrvIndicator.style.background = '#e53935';
      hrvDesc.textContent = "Waarschuwing: Lage HRV. Zware intervallen worden automatisch teruggeschroefd naar Herstel/Endurance.";
    } else if (readiness < 65) {
      hrvIndicator.style.background = '#fb8c00';
      hrvDesc.textContent = "Balans redelijk. Voorkom overbelasting vandaag.";
    } else {
      hrvIndicator.style.background = '#4caf50';
      hrvDesc.textContent = "Fysiologische systemen in balans. Drempeltraining toegestaan.";
    }
  }

  // Render Week Timeline
  renderWeekTimeline();

  // Render PMC line chart
  renderPMCChart(pmc);

  // Render Trainingszones
  renderTrainingZones();
}

function renderWeekTimeline() {
  const timeline = document.getElementById('training-week-timeline');
  if (!timeline) return;

  const today = new Date();
  const currentWeekRange = adaptiveScheduler.getWeekRange(today);
  const weekDays = [];
  const start = new Date(currentWeekRange.start);

  for (let i = 0; i < 7; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    weekDays.push(d);
  }

  const plannedWeekWorkouts = localPlannedWorkouts.filter(w => w.date >= currentWeekRange.start && w.date <= currentWeekRange.end);

  // Filter en pas HRV readiness aan op de geplande workouts voor vandaag
  const readiness = state.user?.readiness_score || 72;
  const todayStr = today.toISOString().split('T')[0];

  const processedWorkouts = plannedWeekWorkouts.map(w => {
    if (w.date === todayStr && w.status === 'planned') {
      return recoveryMetrics.adjustWorkoutForHRV(w, readiness);
    }
    return w;
  });

  // Bereken wekelijkse TSS progressie
  const totalPlannedTSS = processedWorkouts.reduce((sum, w) => sum + (w.target_tss || 0), 0);
  const totalActualTSS = (state.activities || []).filter(a => {
    const aDate = new Date(a.date || a.startTime).toISOString().split('T')[0];
    return aDate >= currentWeekRange.start && aDate <= currentWeekRange.end;
  }).reduce((sum, a) => sum + (a.tss || 0), 0);

  // Update TSS widgets
  const targetTssEl = document.getElementById('tss-target-lbl');
  const actualTssEl = document.getElementById('tss-actual-lbl');
  const progressEl = document.getElementById('tss-weekly-progress');

  if (targetTssEl) targetTssEl.textContent = totalPlannedTSS;
  if (actualTssEl) actualTssEl.textContent = totalActualTSS;
  if (progressEl) {
    const pct = totalPlannedTSS > 0 ? Math.min(100, (totalActualTSS / totalPlannedTSS) * 100) : 0;
    progressEl.style.width = `${pct}%`;
  }

  // Render weekly columns
  timeline.innerHTML = weekDays.map((d, i) => {
    const dStr = d.toISOString().split('T')[0];
    const dayName = d.toLocaleDateString('nl-NL', { weekday: 'short' });
    const dayNum = d.getDate();
    const isToday = dStr === todayStr;

    // Haal de geplande slots op
    const dayOfWeekIdx = d.getDay() === 0 ? 7 : d.getDay();
    const slot = localSlots.find(s => s.day_of_week === dayOfWeekIdx);
    const maxDur = slot ? slot.max_duration_minutes : 90;

    // Check availability uitzondering
    const exc = localExceptions.find(e => e.date === dStr);
    const isUnavail = exc ? !exc.is_available : false;

    const dayWorkouts = processedWorkouts.filter(w => w.date === dStr);

    let dayClass = 'training-day-column';
    if (isToday) dayClass += ' active-day';
    if (isUnavail) dayClass += ' unavailable-day';

    return `
      <div class="${dayClass}" data-date="${dStr}">
        <div class="training-day-header">
          <span class="day-name">${dayName}</span>
          <span class="day-num">${dayNum}</span>
          <button class="btn-add-workout-day" data-date="${dStr}" title="Training toevoegen">+</button>
        </div>
        
        <div class="training-day-workouts-container" style="flex:1;min-height:80px;" id="timeline-${dStr}">
          ${dayWorkouts.map(w => {
            const isCompleted = w.status === 'completed';
            const cardClass = isCompleted ? 'workout-card completed' : (w.is_overloaded ? 'workout-card overloaded' : 'workout-card');
            
            return `
              <div class="${cardClass}" draggable="true" data-workout-id="${w.id}" style="cursor:pointer;">
                <div class="d-flex justify-between align-center">
                  <span class="workout-title">${w.title}</span>
                  ${w.is_overloaded ? `<span style="color:#ff9800;font-size:12px;" title="Beschikbaarheid overschreden! Geplande duur ${w.planned_duration_minutes}m > max ${maxDur}m">⚠️</span>` : ''}
                  ${isCompleted ? `<span style="color:var(--primary);font-weight:700;" title="Workout voltooid">✓</span>` : ''}
                </div>
                <div class="workout-details mt-1">
                  <span>⏱️ ${w.planned_duration_minutes}m</span>
                  <span>⚡ ${w.target_tss} TSS</span>
                </div>
                ${w.is_auto_adjusted ? `<div style="font-size:8px;color:var(--primary);margin-top:4px;font-style:italic;">Gecorrigeerd door coaching</div>` : ''}
              </div>
            `;
          }).join('')}
          ${dayWorkouts.length === 0 ? `<div style="font-size:10px;color:var(--text-muted);text-align:center;padding:12px 0;">Rustdag</div>` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Bind click event on add-workout buttons
  document.querySelectorAll('.btn-add-workout-day').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      openWorkoutModal(null, btn.dataset.date);
    });
  });

  // Bind click event on workout cards to edit
  document.querySelectorAll('.workout-card').forEach(card => {
    card.addEventListener('click', (e) => {
      e.stopPropagation();
      openWorkoutModal(card.dataset.workoutId);
    });
  });

  // Bind drag & drop events
  setupDragAndDropEvents();
}

function setupDragAndDropEvents() {
  const cards = document.querySelectorAll('.workout-card');
  const cols = document.querySelectorAll('.training-day-column');

  cards.forEach(card => {
    card.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', card.dataset.workoutId);
      card.classList.add('dragging');
    });

    card.addEventListener('dragend', () => {
      card.classList.remove('dragging');
    });
  });

  cols.forEach(col => {
    col.addEventListener('dragover', (e) => {
      e.preventDefault();
      col.classList.add('drag-over');
    });

    col.addEventListener('dragleave', () => {
      col.classList.remove('drag-over');
    });

    col.addEventListener('drop', async (e) => {
      e.preventDefault();
      col.classList.remove('drag-over');
      const workoutId = e.dataTransfer.getData('text/plain');
      const newDateStr = col.dataset.date;

      // Update de geplande workouts
      const originalWorkouts = [...localPlannedWorkouts];
      const updated = adaptiveScheduler.evaluateMove(
        localPlannedWorkouts,
        workoutId,
        newDateStr,
        localSlots,
        localExceptions
      );

      localPlannedWorkouts = updated;

      // Sla op
      if (config.isDemoMode) {
        localStorage.setItem('cyclo_planned_workouts', JSON.stringify(localPlannedWorkouts));
      } else {
        const movedW = localPlannedWorkouts.find(w => w.id === workoutId);
        try {
          await config.supabaseClient
            .from('planned_workouts')
            .update({ 
              date: movedW.date, 
              target_tss: movedW.target_tss, 
              planned_duration_minutes: movedW.planned_duration_minutes,
              is_overloaded: movedW.is_overloaded,
              is_auto_adjusted: movedW.is_auto_adjusted
            })
            .eq('id', workoutId);
        } catch(err) {
          console.warn("Fout bij verplaatsen geplande rit:", err.message);
        }
      }

      // Animatie effect (groene gloed) op de kolom
      col.style.boxShadow = '0 0 15px var(--primary)';
      col.style.transition = 'box-shadow 0.2s';
      setTimeout(() => {
        col.style.boxShadow = '';
      }, 800);

      showToast("Training verplaatst & schema herberekend!", "success");
      renderTrainingDashboard();
    });
  });
}

function renderSlotsModalForm() {
  const container = document.getElementById('slots-form-grid');
  if (!container) return;

  const daysText = {
    1: 'Maandag',
    2: 'Dinsdag',
    3: 'Woensdag',
    4: 'Donderdag',
    5: 'Vrijdag',
    6: 'Zaterdag',
    7: 'Zondag'
  };

  container.innerHTML = Object.entries(daysText).map(([dayNum, dayName]) => {
    const slot = localSlots.find(s => s.day_of_week === parseInt(dayNum));
    const val = slot ? slot.max_duration_minutes : 60;
    return `
      <div class="form-group">
        <label style="font-size:11px;">${dayName} (min)</label>
        <input type="number" name="slot-${dayNum}" class="form-control" min="0" max="600" value="${val}" required>
      </div>
    `;
  }).join('');
}

async function handleSaveSlots(e) {
  e.preventDefault();
  const formData = new FormData(e.target);

  try {
    for (let dayNum = 1; dayNum <= 7; dayNum++) {
      const val = parseInt(formData.get(`slot-${dayNum}`)) || 0;
      await availabilityManager.saveSlot(dayNum, val);
    }

    localSlots = await availabilityManager.fetchSlots();
    document.getElementById('slots-modal').classList.remove('active');
    showToast("Wekelijkse beschikbaarheid bijgewerkt!", "success");
    renderTrainingDashboard();
  } catch (err) {
    showToast("Kon slots niet opslaan: " + err.message, "error");
  }
}

async function syncActivitiesToWorkouts() {
  let matchedCount = 0;
  let updatedWorkouts = [...localPlannedWorkouts];

  (state.activities || []).forEach(act => {
    const before = updatedWorkouts.filter(w => w.status === 'completed').length;
    updatedWorkouts = adaptiveScheduler.matchActivityToWorkout(act, updatedWorkouts);
    const after = updatedWorkouts.filter(w => w.status === 'completed').length;
    if (after > before) matchedCount++;
  });

  if (matchedCount > 0) {
    localPlannedWorkouts = updatedWorkouts;
    if (config.isDemoMode) {
      localStorage.setItem('cyclo_planned_workouts', JSON.stringify(localPlannedWorkouts));
    } else {
      // Update in database voor alle gematchte workouts
      try {
        for (const w of localPlannedWorkouts) {
          if (w.status === 'completed' && w.associated_activity_id) {
            await config.supabaseClient
              .from('planned_workouts')
              .update({ status: 'completed', associated_activity_id: w.associated_activity_id })
              .eq('id', w.id);
          }
        }
      } catch(e) {
        console.warn("Fout bij synchroniseren workouts database:", e);
      }
    }
    showToast(`✓ ${matchedCount} geplande training(en) gematcht met inkomende ritten!`, "success");
    renderTrainingDashboard();
  } else {
    showToast("Geen nieuwe geplande ritten om te matchen.", "info");
  }
}

/**
 * Tekent een premium PMC grafiek als SVG
 */
function renderPMCChart(pmcData) {
  const container = document.getElementById('pmc-chart-container');
  if (!container || pmcData.length < 2) {
    if (container) container.innerHTML = '<div class="text-muted" style="text-align:center;line-height:260px;">Onvoldoende ritgeschiedenis om fitheidstrend te visualiseren.</div>';
    return;
  }

  const width = container.clientWidth || 600;
  const height = 260;
  const padding = 30;

  const dates = pmcData.map(d => d.date);
  const ctls = pmcData.map(d => d.ctl);
  const atls = pmcData.map(d => d.atl);
  const tsbs = pmcData.map(d => d.tsb);

  const maxVal = Math.max(...ctls, ...atls, 20);
  const minVal = Math.min(...tsbs, -10);

  const valRange = maxVal - minVal;

  const getX = (index) => padding + (index / (pmcData.length - 1)) * (width - 2 * padding);
  const getY = (val) => height - padding - ((val - minVal) / valRange) * (height - 2 * padding);

  let ctlPath = `M ${getX(0)} ${getY(ctls[0])}`;
  let atlPath = `M ${getX(0)} ${getY(atls[0])}`;
  let tsbPath = `M ${getX(0)} ${getY(tsbs[0])}`;

  for (let i = 1; i < pmcData.length; i++) {
    ctlPath += ` L ${getX(i)} ${getY(ctls[i])}`;
    atlPath += ` L ${getX(i)} ${getY(atls[i])}`;
    tsbPath += ` L ${getX(i)} ${getY(tsbs[i])}`;
  }

  // Grid en datum labels (elke week een label)
  let gridLines = '';
  let dateLabels = '';
  const labelInterval = Math.max(1, Math.floor(pmcData.length / 5));

  for (let i = 0; i < pmcData.length; i += labelInterval) {
    const x = getX(i);
    const dateFormatted = new Date(dates[i]).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' });
    gridLines += `<line x1="${x}" y1="${padding}" x2="${x}" y2="${height - padding}" stroke="rgba(255,255,255,0.05)" />`;
    dateLabels += `<text x="${x}" y="${height - 8}" fill="var(--text-muted)" font-size="8" text-anchor="middle">${dateFormatted}</text>`;
  }

  // Horizontale null-lijn voor TSB
  const zeroY = getY(0);
  const zeroLine = zeroY >= padding && zeroY <= height - padding
    ? `<line x1="${padding}" y1="${zeroY}" x2="${width - padding}" y2="${zeroY}" stroke="rgba(255,255,255,0.15)" stroke-dasharray="3,3" />`
    : '';

  container.innerHTML = `
    <svg width="100%" height="100%" viewBox="0 0 ${width} ${height}">
      <defs>
        <filter id="glow-ctl" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#00f0ff" flood-opacity="0.3"/>
        </filter>
        <filter id="glow-atl" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="3" flood-color="#fb923c" flood-opacity="0.3"/>
        </filter>
      </defs>
      
      <!-- Grid -->
      ${gridLines}
      ${zeroLine}
      
      <!-- Lijnen -->
      <path d="${ctlPath}" fill="none" stroke="#00f0ff" stroke-width="3" filter="url(#glow-ctl)" />
      <path d="${atlPath}" fill="none" stroke="#fb923c" stroke-width="2.5" filter="url(#glow-atl)" />
      <path d="${tsbPath}" fill="none" stroke="var(--primary)" stroke-width="2" stroke-dasharray="2,2" />
      
      <!-- Labels -->
      ${dateLabels}
      
      <!-- Legenda overlay -->
      <g transform="translate(40, 40)" font-family="Inter" font-size="9" fill="var(--text-primary)">
        <rect width="180" height="56" rx="6" fill="var(--bg-surface)" stroke="rgba(255,255,255,0.06)" />
        <circle cx="15" cy="15" r="4" fill="#00f0ff" />
        <text x="25" y="18" fill="var(--text-secondary)">Fitness (CTL)</text>
        
        <circle cx="15" cy="28" r="4" fill="#fb923c" />
        <text x="25" y="31" fill="var(--text-secondary)">Fatigue (ATL)</text>
        
        <circle cx="15" cy="41" r="4" fill="var(--primary)" />
        <text x="25" y="44" fill="var(--text-secondary)">Form (TSB)</text>
      </g>
    </svg>
  `;
}

function generateMockWorkouts() {
  const today = new Date();
  const currentWeekRange = adaptiveScheduler.getWeekRange(today);
  const monday = new Date(currentWeekRange.start);

  const getD = (offset) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + offset);
    return d.toISOString().split('T')[0];
  };

  return [
    { id: 'w-1', title: 'Base Recovery', type: 'Recovery', date: getD(0), planned_duration_minutes: 45, target_tss: 20, status: 'planned' },
    { id: 'w-2', title: 'VO2 Max Intervals', type: 'Interval', date: getD(1), planned_duration_minutes: 75, target_tss: 85, status: 'planned' },
    { id: 'w-3', title: 'Active Recovery', type: 'Recovery', date: getD(2), planned_duration_minutes: 40, target_tss: 18, status: 'planned' },
    { id: 'w-4', title: 'Sweet Spot Threshold', type: 'Threshold', date: getD(3), planned_duration_minutes: 90, target_tss: 95, status: 'planned' },
    { id: 'w-5', title: 'Z2 Aerobic Endurance', type: 'Endurance', date: getD(5), planned_duration_minutes: 180, target_tss: 120, status: 'planned' }
  ];
}

// ─── EXCEPTIONS MANAGEMENT ───────────────────────────────────────────

function renderExceptionsList() {
  const container = document.getElementById('exceptions-list');
  if (!container) return;

  if (localExceptions.length === 0) {
    container.innerHTML = `<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:12px 0;">Geen actieve uitzonderingen.</div>`;
    return;
  }

  container.innerHTML = localExceptions.map(exc => {
    const statusText = exc.is_available ? 'Beschikbaar' : 'Niet beschikbaar';
    const statusClass = exc.is_available ? 'text-success' : 'text-danger';
    return `
      <div style="display:flex; justify-content:space-between; align-items:center; background:rgba(255,255,255,0.02); border:1px solid var(--border-glass); border-radius:var(--radius-sm); padding:6px 10px; font-size:11px;">
        <div>
          <strong>${new Date(exc.date).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short' })}</strong>: 
          <span class="${statusClass}">${statusText}</span>
          ${exc.notes ? `<div style="font-size:9px;color:var(--text-muted);margin-top:2px;">${exc.notes}</div>` : ''}
        </div>
        <button type="button" class="btn btn-sm btn-secondary btn-delete-exception" data-date="${exc.date}" style="padding:2px 6px; font-size:9px; background:rgba(239,68,68,0.1); border-color:rgba(239,68,68,0.2); color:#ef4444;">
          Verwijder
        </button>
      </div>
    `;
  }).join('');

  // Bind delete buttons
  document.querySelectorAll('.btn-delete-exception').forEach(btn => {
    btn.addEventListener('click', () => handleDeleteException(btn.dataset.date));
  });
}

async function handleAddException(e) {
  e.preventDefault();
  const dateStr = document.getElementById('exception-date').value;
  const isAvailable = document.getElementById('exception-status').value === 'available';
  const notes = document.getElementById('exception-notes').value.trim();

  if (!dateStr) return;

  try {
    await availabilityManager.saveException(dateStr, isAvailable, notes);
    localExceptions = await availabilityManager.fetchExceptions();
    
    // Clear fields
    document.getElementById('exception-date').value = '';
    document.getElementById('exception-notes').value = '';
    
    showToast("Uitzondering toegevoegd!", "success");
    renderExceptionsList();
    renderTrainingDashboard();
  } catch (err) {
    showToast("Uitzondering toevoegen mislukt: " + err.message, "error");
  }
}

async function handleDeleteException(dateStr) {
  try {
    await availabilityManager.deleteException(dateStr);
    localExceptions = await availabilityManager.fetchExceptions();
    showToast("Uitzondering verwijderd!", "success");
    renderExceptionsList();
    renderTrainingDashboard();
  } catch (err) {
    showToast("Uitzondering verwijderen mislukt: " + err.message, "error");
  }
}

// ─── PLANNED WORKOUTS MANAGEMENT ─────────────────────────────────────

function openWorkoutModal(workoutId = null, dateStr = null) {
  const modal = document.getElementById('workout-modal');
  const titleEl = document.getElementById('workout-modal-title');
  const idEl = document.getElementById('workout-id');
  const dateEl = document.getElementById('workout-date');
  const titleInput = document.getElementById('workout-title');
  const typeEl = document.getElementById('workout-type');
  const durationEl = document.getElementById('workout-duration');
  const tssEl = document.getElementById('workout-tss');
  const statusEl = document.getElementById('workout-status');
  const deleteBtn = document.getElementById('btn-delete-workout');

  if (!modal) return;

  if (workoutId) {
    // Edit modus
    const w = localPlannedWorkouts.find(x => x.id === workoutId);
    if (!w) return;

    titleEl.textContent = "Training Aanpassen";
    idEl.value = w.id;
    dateEl.value = w.date;
    titleInput.value = w.title;
    typeEl.value = w.type;
    durationEl.value = w.planned_duration_minutes;
    tssEl.value = w.target_tss;
    statusEl.value = w.status || 'planned';
    deleteBtn.style.display = 'block';
  } else {
    // Add modus
    titleEl.textContent = "Training Plannen";
    idEl.value = "";
    dateEl.value = dateStr || new Date().toISOString().split('T')[0];
    titleInput.value = "";
    typeEl.value = "Recovery";
    durationEl.value = 60;
    tssEl.value = 40;
    statusEl.value = "planned";
    deleteBtn.style.display = 'none';
  }

  modal.classList.add('active');
}

async function handleSaveWorkout(e) {
  e.preventDefault();

  const id = document.getElementById('workout-id').value;
  const date = document.getElementById('workout-date').value;
  const title = document.getElementById('workout-title').value.trim();
  const type = document.getElementById('workout-type').value;
  const duration = parseInt(document.getElementById('workout-duration').value) || 60;
  const tss = parseInt(document.getElementById('workout-tss').value) || 40;
  const status = document.getElementById('workout-status').value;

  if (!date || !title) return;

  const workoutPayload = {
    user_id: state.user.id,
    date,
    title,
    type,
    planned_duration_minutes: duration,
    target_tss: tss,
    status
  };

  try {
    if (id) {
      // Update
      workoutPayload.id = id;
      if (config.isDemoMode) {
        const idx = localPlannedWorkouts.findIndex(x => x.id === id);
        if (idx !== -1) {
          localPlannedWorkouts[idx] = { ...localPlannedWorkouts[idx], ...workoutPayload };
        }
      } else {
        await config.supabaseClient
          .from('planned_workouts')
          .update(workoutPayload)
          .eq('id', id);
        // Sync lokaal
        const idx = localPlannedWorkouts.findIndex(x => x.id === id);
        if (idx !== -1) localPlannedWorkouts[idx] = { ...localPlannedWorkouts[idx], ...workoutPayload };
      }
      showToast("Training aangepast!", "success");
    } else {
      // Create
      const newId = `w-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      workoutPayload.id = newId;
      if (config.isDemoMode) {
        localPlannedWorkouts.push(workoutPayload);
      } else {
        const { data, error } = await config.supabaseClient
          .from('planned_workouts')
          .insert([workoutPayload])
          .select();
        if (error) throw error;
        if (data && data[0]) workoutPayload.id = data[0].id;
        localPlannedWorkouts.push(workoutPayload);
      }
      showToast("Training gepland!", "success");
    }

    if (config.isDemoMode) {
      localStorage.setItem('cyclo_planned_workouts', JSON.stringify(localPlannedWorkouts));
    }

    document.getElementById('workout-modal').classList.remove('active');
    renderTrainingDashboard();
  } catch (err) {
    showToast("Fout bij opslaan training: " + err.message, "error");
  }
}

async function handleDeleteWorkout() {
  const id = document.getElementById('workout-id').value;
  if (!id) return;

  try {
    if (config.isDemoMode) {
      localPlannedWorkouts = localPlannedWorkouts.filter(x => x.id !== id);
      localStorage.setItem('cyclo_planned_workouts', JSON.stringify(localPlannedWorkouts));
    } else {
      await config.supabaseClient
        .from('planned_workouts')
        .delete()
        .eq('id', id);
      localPlannedWorkouts = localPlannedWorkouts.filter(x => x.id !== id);
    }

    showToast("Training verwijderd!", "success");
    document.getElementById('workout-modal').classList.remove('active');
    renderTrainingDashboard();
  } catch (err) {
    showToast("Fout bij verwijderen training: " + err.message, "error");
  }
}

// ─── RENDER TRAINING ZONES ───────────────────────────────────────────

function renderTrainingZones() {
  const container = document.getElementById('training-zones-container');
  if (!container) return;

  const ftp = state.user?.ftp || 200;
  const lthr = state.user?.lthr || 160;

  const powerZones = zoneCalculator.getPowerZones(ftp);
  const hrZones = zoneCalculator.getHeartRateZones(lthr);

  container.innerHTML = `
    <!-- Power Zones Column -->
    <div class="zones-column">
      <div class="zones-header">
        <span>Vermogenszones (Coggan)</span>
        <span style="font-size:11px;color:var(--primary);">FTP: ${ftp} W</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z1">Z1</span>
        <span class="zone-name">${powerZones.z1.label}</span>
        <span class="zone-range">${powerZones.z1.min} - ${powerZones.z1.max} W</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z2">Z2</span>
        <span class="zone-name">${powerZones.z2.label}</span>
        <span class="zone-range">${powerZones.z2.min} - ${powerZones.z2.max} W</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z3">Z3</span>
        <span class="zone-name">${powerZones.z3.label}</span>
        <span class="zone-range">${powerZones.z3.min} - ${powerZones.z3.max} W</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z4">Z4</span>
        <span class="zone-name">${powerZones.z4.label}</span>
        <span class="zone-range">${powerZones.z4.min} - ${powerZones.z4.max} W</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z5">Z5</span>
        <span class="zone-name">${powerZones.z5.label}</span>
        <span class="zone-range">${powerZones.z5.min} - ${powerZones.z5.max} W</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z6">Z6</span>
        <span class="zone-name">${powerZones.z6.label}</span>
        <span class="zone-range">${powerZones.z6.min} - ${powerZones.z6.max} W</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z7">Z7</span>
        <span class="zone-name">${powerZones.z7.label}</span>
        <span class="zone-range">&gt; ${powerZones.z7.min} W</span>
      </div>
    </div>

    <!-- Heart Rate Zones Column -->
    <div class="zones-column">
      <div class="zones-header">
        <span>Hartslagzones (Friel)</span>
        <span style="font-size:11px;color:var(--primary);">LTHR: ${lthr} bpm</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z1">Z1</span>
        <span class="zone-name">${hrZones.z1.label}</span>
        <span class="zone-range">${hrZones.z1.min} - ${hrZones.z1.max} bpm</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z2">Z2</span>
        <span class="zone-name">${hrZones.z2.label}</span>
        <span class="zone-range">${hrZones.z2.min} - ${hrZones.z2.max} bpm</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z3">Z3</span>
        <span class="zone-name">${hrZones.z3.label}</span>
        <span class="zone-range">${hrZones.z3.min} - ${hrZones.z3.max} bpm</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z4">Z4</span>
        <span class="zone-name">${hrZones.z4.label}</span>
        <span class="zone-range">${hrZones.z4.min} - ${hrZones.z4.max} bpm</span>
      </div>
      <div class="zone-row">
        <span class="zone-badge zone-z5">Z5</span>
        <span class="zone-name">${hrZones.z5.label}</span>
        <span class="zone-range">${hrZones.z5.min} - ${hrZones.z5.max} bpm</span>
      </div>
    </div>
  `;
}
