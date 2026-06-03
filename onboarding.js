// Cyclo — Onboarding Wizard & App Tour
// Stap-voor-stap setup voor nieuwe gebruikers + interactieve tour
import { state, config, showToast } from './state.js';
import { renderEquipmentSection, openEquipmentModal } from './equipment.js';

const KEY_ONBOARDING = 'cyclo_onboarding_done';
const KEY_TOUR       = 'cyclo_tour_done';

// ─── Onboarding check (na login) ─────────────────────────────────────────────

export function checkOnboarding() {
  const done = localStorage.getItem(KEY_ONBOARDING);
  if (done) return;

  // Nieuwe gebruiker = geen naam ingesteld of geen activiteiten
  const isNew = !state.user?.full_name || state.user?.full_name === '';
  if (isNew || (state.activities || []).length === 0) {
    // Kleine vertraging zodat de UI volledig geladen is
    setTimeout(() => startOnboardingWizard(), 800);
  }
}

// ─── Wizard ──────────────────────────────────────────────────────────────────

let _wizardStep = 1;
const TOTAL_STEPS = 4;

export function startOnboardingWizard() {
  document.getElementById('onboarding-overlay')?.remove();

  const overlay = document.createElement('div');
  overlay.id = 'onboarding-overlay';
  overlay.innerHTML = `
    <div class="ob-backdrop"></div>
    <div class="ob-wizard" role="dialog" aria-modal="true">
      <div class="ob-progress">
        ${Array.from({length: TOTAL_STEPS}, (_, i) =>
          `<div class="ob-dot ${i === 0 ? 'active' : ''}" data-step="${i+1}"></div>`
        ).join('')}
      </div>
      <div class="ob-content" id="ob-content"></div>
      <div class="ob-footer">
        <button class="ob-btn-skip" id="ob-skip">Overslaan</button>
        <button class="ob-btn-next" id="ob-next">Volgende →</button>
      </div>
    </div>
  `;

  document.body.appendChild(overlay);
  _wizardStep = 1;
  renderWizardStep(1);

  document.getElementById('ob-next').addEventListener('click', () => {
    handleStepNext(_wizardStep);
  });
  document.getElementById('ob-skip').addEventListener('click', () => {
    finishOnboarding();
  });
}

function renderWizardStep(step) {
  _wizardStep = step;

  // Progress dots
  document.querySelectorAll('.ob-dot').forEach((dot, i) => {
    dot.classList.toggle('active', i < step);
    dot.classList.toggle('current', i === step - 1);
  });

  const nextBtn = document.getElementById('ob-next');
  nextBtn.textContent = step === TOTAL_STEPS ? '🚀 Starten!' : 'Volgende →';

  const content = document.getElementById('ob-content');

  const steps = {
    1: stepWelcome,
    2: stepProfile,
    3: stepFirstRide,
    4: stepClubMembers,
  };

  content.innerHTML = '';
  content.style.opacity = '0';
  content.style.transform = 'translateX(20px)';

  const stepFn = steps[step];
  if (stepFn) stepFn(content);

  // Animeer in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      content.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
      content.style.opacity = '1';
      content.style.transform = 'translateX(0)';
    });
  });
}

function stepWelcome(el) {
  el.innerHTML = `
    <div class="ob-step">
      <div class="ob-hero-emoji">🚴‍♂️</div>
      <h2 class="ob-title">Welkom bij Cyclo!</h2>
      <p class="ob-desc">Cyclo is jouw clubplatform voor wielrenners. Hier plan je groepsritten, volg je je conditie en vergelijk je jezelf met clubgenoten.</p>

      <div class="ob-feature-list">
        <div class="ob-feature">
          <span class="ob-feature-icon">🗓️</span>
          <div>
            <strong>Planner</strong>
            <span>Plan groepsritten en zie wie er meerijdt</span>
          </div>
        </div>
        <div class="ob-feature">
          <span class="ob-feature-icon">📊</span>
          <div>
            <strong>Statistieken</strong>
            <span>Upload .fit bestanden en volg je CTL/ATL/TSB, PR's en meer</span>
          </div>
        </div>
        <div class="ob-feature">
          <span class="ob-feature-icon">🏆</span>
          <div>
            <strong>Club Leaderboard</strong>
            <span>Vergelijk je met andere leden via Rider Score</span>
          </div>
        </div>
        <div class="ob-feature">
          <span class="ob-feature-icon">❤️</span>
          <div>
            <strong>Sociale Feed</strong>
            <span>Like en commenteer op ritten van clubgenoten</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function stepProfile(el) {
  const user = state.user || {};
  el.innerHTML = `
    <div class="ob-step">
      <div class="ob-hero-emoji">👤</div>
      <h2 class="ob-title">Stel je profiel in</h2>
      <p class="ob-desc">Je naam en gewicht helpen Cyclo om je stats correct te berekenen (VO₂max, W/kg).</p>

      <div class="ob-form">
        <label class="ob-label">Naam
          <input id="ob-name" class="ob-input" type="text" placeholder="bijv. Thomas Declercq" value="${user.full_name || ''}">
        </label>
        <label class="ob-label">Gewicht (kg)
          <input id="ob-weight" class="ob-input" type="number" min="40" max="150" step="0.5" placeholder="bijv. 72" value="${user.weight || ''}">
        </label>
        <label class="ob-label">Type fiets
          <select id="ob-biketype" class="ob-input">
            <option value="Road"   ${user.bike_type==='Road'   ?'selected':''}>🚴 Racefiets</option>
            <option value="Gravel" ${user.bike_type==='Gravel' ?'selected':''}>🏕️ Gravel</option>
            <option value="MTB"    ${user.bike_type==='MTB'    ?'selected':''}>🏔️ MTB</option>
          </select>
        </label>
      </div>
    </div>
  `;
}

function stepFirstRide(el) {
  el.innerHTML = `
    <div class="ob-step">
      <div class="ob-hero-emoji">⬆️</div>
      <h2 class="ob-title">Upload je eerste rit</h2>
      <p class="ob-desc">Sleep een <strong>.fit</strong>, <strong>.tcx</strong> of <strong>.gpx</strong> bestand hieronder — Cyclo berekent automatisch je stats, zones en Rider Score.</p>

      <div class="ob-upload-zone" id="ob-upload-zone">
        <div class="ob-upload-icon">📁</div>
        <p>Sleep je bestand hier</p>
        <p style="font-size:11px;color:var(--text-muted);">of klik om te bladeren</p>
        <input type="file" id="ob-file-input" accept=".fit,.tcx,.gpx" style="display:none;">
      </div>
      <div id="ob-upload-status" style="margin-top:10px;font-size:12px;color:var(--text-muted);text-align:center;"></div>

      <p style="margin-top:12px;font-size:11px;color:var(--text-muted);text-align:center;">
        Geen bestand? Dat kan ook later via <strong>Mijn Ritten</strong>.
      </p>
    </div>
  `;

  const zone  = el.querySelector('#ob-upload-zone');
  const input = el.querySelector('#ob-file-input');
  const status = el.querySelector('#ob-upload-status');

  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => {
    e.preventDefault();
    zone.classList.remove('dragover');
    if (e.dataTransfer.files[0]) handleOnboardingUpload(e.dataTransfer.files[0], status, zone);
  });
  input.addEventListener('change', () => {
    if (input.files[0]) handleOnboardingUpload(input.files[0], status, zone);
  });
}

async function handleOnboardingUpload(file, statusEl, zoneEl) {
  statusEl.textContent = `⏳ "${file.name}" wordt verwerkt...`;
  zoneEl.style.opacity = '0.5';

  try {
    // Gebruik de globale parser (geladen als script tag)
    const result = await window.ActivityParser.parseActivity(file);
    statusEl.innerHTML = `<span style="color:var(--primary);">✅ Rit geladen! ${result.distanceKm?.toFixed(1)} km · ${result.durationFormatted} · Score: ${result.riderScore}</span>`;
    zoneEl.style.opacity = '1';

    // Sla op via de bestaande save functie
    if (window._saveActivityFromOnboarding) {
      await window._saveActivityFromOnboarding(result, file.name);
    }
  } catch (err) {
    statusEl.innerHTML = `<span style="color:#f87171;">❌ ${err.message || 'Bestand kon niet verwerkt worden.'}</span>`;
    zoneEl.style.opacity = '1';
  }
}

function stepClubMembers(el) {
  const members = (state.profiles || []).filter(p => p.id !== state.user?.id).slice(0, 6);

  el.innerHTML = `
    <div class="ob-step">
      <div class="ob-hero-emoji">👥</div>
      <h2 class="ob-title">Vind clubgenoten</h2>
      <p class="ob-desc">Volg je clubgenoten om hun ritten te zien in de Feed.</p>

      <div class="ob-members-list" id="ob-members-list">
        ${members.length === 0
          ? '<p style="color:var(--text-muted);font-size:12px;text-align:center;">Nog geen andere leden gevonden.</p>'
          : members.map(p => `
            <div class="ob-member-row">
              <img src="${p.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${p.id}`}" class="ob-member-avatar" alt="${p.full_name}">
              <div class="ob-member-info">
                <div class="ob-member-name">${p.full_name || p.username || 'Lid'}</div>
                <div class="ob-member-meta">${p.bike_type || 'Wielrenner'} · 🏆 ${p.rider_score || 0} pts</div>
              </div>
            </div>`).join('')
        }
      </div>

      <p style="margin-top:12px;font-size:11px;color:var(--text-muted);text-align:center;">
        Je kunt later altijd leden volgen via hun profiel.
      </p>
    </div>
  `;
}

async function handleStepNext(step) {
  if (step === 2) {
    // Sla profieldata op
    const name     = document.getElementById('ob-name')?.value.trim();
    const weight   = document.getElementById('ob-weight')?.value;
    const bikeType = document.getElementById('ob-biketype')?.value;

    if (name && !config.isDemoMode) {
      try {
        await config.supabaseClient.from('profiles').update({
          full_name: name,
          weight: weight ? parseFloat(weight) : null,
          bike_type: bikeType,
        }).eq('id', state.user.id);
        state.user.full_name = name;
        state.user.weight    = weight ? parseFloat(weight) : null;
        state.user.bike_type = bikeType;
      } catch (e) { console.warn('Profiel update mislukt:', e); }
    } else if (name && config.isDemoMode) {
      state.user.full_name = name;
    }
  }

  if (step < TOTAL_STEPS) {
    renderWizardStep(step + 1);
  } else {
    finishOnboarding();
  }
}

function finishOnboarding() {
  localStorage.setItem(KEY_ONBOARDING, '1');
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.4s ease';
    setTimeout(() => overlay.remove(), 400);
  }

  // Automatisch tour starten
  if (!localStorage.getItem(KEY_TOUR)) {
    setTimeout(() => startTour(), 600);
  }
}

// ─── App Tour (spotlight tooltips) ───────────────────────────────────────────

const TOUR_STEPS = [
  {
    targetId: 'link-home',
    mobileTargetId: 'mob-link-home',
    title: '📰 Feed',
    desc: 'Hier zie je ritten van je clubgenoten. Geef kudos en laat reacties achter.',
    position: 'bottom',
  },
  {
    targetId: 'link-dashboard',
    mobileTargetId: 'mob-link-planner',
    title: '🗓️ Planner',
    desc: 'Plan groepsritten, check het weer en zie wie er beschikbaar is.',
    position: 'bottom',
  },
  {
    targetId: 'link-rides',
    mobileTargetId: 'mob-link-rides',
    title: '🚴 Mijn Ritten',
    desc: 'Upload .fit, .tcx of .gpx bestanden. Bekijk je routes, stats en trainingsstructuur.',
    position: 'bottom',
  },
  {
    targetId: 'btn-nav-profile',
    mobileTargetId: 'mob-link-profile',
    title: '👤 Profiel',
    desc: 'Badges, VO₂max, vermogenscurve, seizoensvergelijking en je materiaal.',
    position: 'bottom-left',
  },
];

let _tourStep = 0;
let _tourEl   = null;

export function startTour() {
  _tourStep = 0;
  showTourStep(_tourStep);
}

function showTourStep(i) {
  cleanupTour();
  if (i >= TOUR_STEPS.length) {
    finishTour();
    return;
  }

  const step = TOUR_STEPS[i];
  const isMobile = window.innerWidth <= 768;
  const targetId = isMobile ? (step.mobileTargetId || step.targetId) : step.targetId;
  const target = document.getElementById(targetId);

  // Spotlight overlay
  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';
  overlay.innerHTML = `<div class="tour-backdrop"></div>`;
  document.body.appendChild(overlay);

  if (target) {
    const rect = target.getBoundingClientRect();
    // Spotlight cutout via box-shadow
    const spotlight = document.createElement('div');
    spotlight.className = 'tour-spotlight';
    spotlight.style.cssText = `
      position:fixed;
      top:${rect.top - 6}px;
      left:${rect.left - 6}px;
      width:${rect.width + 12}px;
      height:${rect.height + 12}px;
      border-radius:10px;
      box-shadow:0 0 0 9999px rgba(0,0,0,0.72);
      z-index:9998;
      pointer-events:none;
      border:2px solid rgba(212,255,0,0.6);
      animation: tourPulse 1.5s ease-in-out infinite;
    `;
    document.body.appendChild(spotlight);

    // Tooltip
    const tip = document.createElement('div');
    tip.className = 'tour-tooltip';
    const tipTop = isMobile
      ? (rect.top > 200 ? rect.top - 140 : rect.bottom + 14)
      : (rect.bottom + 14);
    tip.style.cssText = `
      position:fixed;
      top:${tipTop}px;
      left:${Math.min(Math.max(rect.left, 12), window.innerWidth - 260)}px;
      z-index:9999;
    `;
    tip.innerHTML = `
      <div class="tour-tip-content">
        <div class="tour-tip-title">${step.title}</div>
        <div class="tour-tip-desc">${step.desc}</div>
        <div class="tour-tip-footer">
          <span class="tour-step-count">${i + 1} / ${TOUR_STEPS.length}</span>
          <div class="tour-tip-actions">
            <button class="tour-btn-skip" id="tour-skip">Overslaan</button>
            <button class="tour-btn-next" id="tour-next">${i === TOUR_STEPS.length - 1 ? 'Klaar ✓' : 'Volgende →'}</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(tip);
    _tourEl = { overlay, spotlight, tip };

    document.getElementById('tour-next').addEventListener('click', () => showTourStep(i + 1));
    document.getElementById('tour-skip').addEventListener('click', () => finishTour());
  } else {
    // Target niet gevonden, sla over
    showTourStep(i + 1);
  }
}

function cleanupTour() {
  document.getElementById('tour-overlay')?.remove();
  document.querySelector('.tour-spotlight')?.remove();
  document.querySelector('.tour-tooltip')?.remove();
}

function finishTour() {
  cleanupTour();
  localStorage.setItem(KEY_TOUR, '1');
  showToast('Rondleiding voltooid! 🎉 Veel fietsplezier!', 'success');
}

// ─── ? Help knop ─────────────────────────────────────────────────────────────

export function initHelpButton() {
  const btn = document.getElementById('btn-help-tour');
  if (!btn) return;
  btn.addEventListener('click', () => {
    localStorage.removeItem(KEY_TOUR);
    startTour();
  });
}

// ─── Lege staten helper ───────────────────────────────────────────────────────

export function renderEmptyState(container, { emoji, title, desc, ctaText, ctaAction } = {}) {
  if (!container) return;
  container.innerHTML = `
    <div class="empty-state">
      <div class="empty-state-emoji">${emoji || '📭'}</div>
      <div class="empty-state-title">${title || 'Niets hier'}</div>
      <div class="empty-state-desc">${desc || ''}</div>
      ${ctaText ? `<button class="empty-state-cta" id="empty-cta-btn">${ctaText}</button>` : ''}
    </div>
  `;
  if (ctaText && ctaAction) {
    container.querySelector('#empty-cta-btn')?.addEventListener('click', ctaAction);
  }
}
