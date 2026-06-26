// Cyclo — Onboarding Wizard & App Tour
// Stap-voor-stap setup voor nieuwe gebruikers + interactieve tour per pagina
import { state, config, showToast } from './state.js';

const KEY_ONBOARDING    = 'cyclo_onboarding_done';
const KEY_TOUR_NAV      = 'cyclo_tour_nav';
const KEY_TOUR_PREFIX   = 'cyclo_tour_page_'; // + pagename

// ─── Onboarding check (na login) ─────────────────────────────────────────────

export function checkOnboarding() {
  if (localStorage.getItem(KEY_ONBOARDING)) return;
  const isNew = !state.user?.full_name || state.user?.full_name === '';
  if (isNew || (state.activities || []).length === 0) {
    setTimeout(() => startOnboardingWizard(), 800);
  } else {
    localStorage.setItem(KEY_ONBOARDING, '1');
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
          `<div class="ob-dot ${i === 0 ? 'active current' : ''}" data-step="${i+1}"></div>`
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
  document.getElementById('ob-next').addEventListener('click', () => handleStepNext(_wizardStep));
  document.getElementById('ob-skip').addEventListener('click', () => finishOnboarding());
}

function renderWizardStep(step) {
  _wizardStep = step;
  document.querySelectorAll('.ob-dot').forEach((dot, i) => {
    dot.classList.toggle('active',  i < step);
    dot.classList.toggle('current', i === step - 1);
  });
  document.getElementById('ob-next').textContent = step === TOTAL_STEPS ? '🚀 Starten!' : 'Volgende →';

  const content = document.getElementById('ob-content');
  content.innerHTML = '';
  content.style.opacity = '0';
  content.style.transform = 'translateX(20px)';
  ({ 1: stepWelcome, 2: stepProfile, 3: stepFirstRide, 4: stepClubMembers })[step]?.(content);
  requestAnimationFrame(() => requestAnimationFrame(() => {
    content.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
    content.style.opacity = '1';
    content.style.transform = 'translateX(0)';
  }));
}

function stepWelcome(el) {
  el.innerHTML = `
    <div class="ob-step">
      <div class="ob-hero-emoji">🚴‍♂️</div>
      <h2 class="ob-title">Welkom bij Cyclo!</h2>
      <p class="ob-desc">Cyclo is jouw clubplatform voor wielrenners. Plan groepsritten, volg je conditie en vergelijk je met clubgenoten.</p>
      <div class="ob-feature-list">
        <div class="ob-feature"><span class="ob-feature-icon">🗓️</span><div><strong>Planner</strong><span>Plan groepsritten en zie wie er meerijdt</span></div></div>
        <div class="ob-feature"><span class="ob-feature-icon">📊</span><div><strong>Statistieken</strong><span>Upload .fit bestanden en volg je CTL/ATL/TSB, PR's en meer</span></div></div>
        <div class="ob-feature"><span class="ob-feature-icon">🏆</span><div><strong>Club Leaderboard</strong><span>Vergelijk je met andere leden via Rider Score</span></div></div>
        <div class="ob-feature"><span class="ob-feature-icon">❤️</span><div><strong>Sociale Feed</strong><span>Like en commenteer op ritten van clubgenoten</span></div></div>
      </div>
    </div>`;
}

function stepProfile(el) {
  const user = state.user || {};
  el.innerHTML = `
    <div class="ob-step">
      <div class="ob-hero-emoji">👤</div>
      <h2 class="ob-title">Stel je profiel in</h2>
      <p class="ob-desc">Je naam en gewicht helpen Cyclo je stats correct te berekenen (VO₂max, W/kg).</p>
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
        <label class="ob-label" style="display:flex; align-items:center; gap:8px; margin-top:14px; cursor:pointer; font-weight:normal;">
          <input id="ob-audio-consent" type="checkbox" checked style="width:auto; cursor:pointer; margin:0;">
          <span>Activeer audio Directeur Sportif (gesproken coaching)</span>
        </label>
      </div>
    </div>`;
}

function stepFirstRide(el) {
  el.innerHTML = `
    <div class="ob-step">
      <div class="ob-hero-emoji">⬆️</div>
      <h2 class="ob-title">Upload je eerste rit</h2>
      <p class="ob-desc">Sleep een <strong>.fit</strong>, <strong>.tcx</strong> of <strong>.gpx</strong> bestand — Cyclo berekent automatisch je stats, zones en Rider Score.</p>
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
    </div>`;

  const zone   = el.querySelector('#ob-upload-zone');
  const input  = el.querySelector('#ob-file-input');
  const status = el.querySelector('#ob-upload-status');
  zone.addEventListener('click', () => input.click());
  zone.addEventListener('dragover',  e => { e.preventDefault(); zone.classList.add('dragover'); });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragover'));
  zone.addEventListener('drop', e => { e.preventDefault(); zone.classList.remove('dragover'); if (e.dataTransfer.files[0]) handleOnboardingUpload(e.dataTransfer.files[0], status, zone); });
  input.addEventListener('change', () => { if (input.files[0]) handleOnboardingUpload(input.files[0], status, zone); });
}

async function handleOnboardingUpload(file, statusEl, zoneEl) {
  statusEl.textContent = `⏳ "${file.name}" wordt verwerkt...`;
  zoneEl.style.opacity = '0.5';
  try {
    const result = await window.ActivityParser.parseActivity(file);
    statusEl.innerHTML = `<span style="color:var(--primary);">✅ Rit geladen! ${result.distanceKm?.toFixed(1)} km · ${result.durationFormatted} · Score: ${result.riderScore}</span>`;
    zoneEl.style.opacity = '1';
    if (window._saveActivityFromOnboarding) await window._saveActivityFromOnboarding(result, file.name);
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
      <div class="ob-members-list">
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
      <p style="margin-top:12px;font-size:11px;color:var(--text-muted);text-align:center;">Je kunt later altijd leden volgen via hun profiel.</p>
    </div>`;
}

async function handleStepNext(step) {
  if (step === 2) {
    const name     = document.getElementById('ob-name')?.value.trim();
    const weight   = document.getElementById('ob-weight')?.value;
    const bikeType = document.getElementById('ob-biketype')?.value;
    if (name && !config.isDemoMode) {
      try {
        await config.supabaseClient.from('profiles').update({ full_name: name, weight: weight ? parseFloat(weight) : null, bike_type: bikeType }).eq('id', state.user.id);
        state.user.full_name = name;
        state.user.weight    = weight ? parseFloat(weight) : null;
        state.user.bike_type = bikeType;
      } catch(e) { console.warn('Profiel update mislukt:', e); }
    } else if (name && config.isDemoMode) { state.user.full_name = name; }

    const audioConsent = document.getElementById('ob-audio-consent')?.checked;
    if (audioConsent) {
      if ('speechSynthesis' in window) {
        const u = new SpeechSynthesisUtterance(' ');
        window.speechSynthesis.speak(u);
      }
      import('./src/audio/audio-controller.js').then(({ audioController }) => {
        audioController.initAudio();
        audioController.unmute();
        audioController.speak("Welkom bij Cyclo. Jouw audio Directeur Sportif is nu actief.", "critical");
      }).catch(e => console.warn(e));
    }
  }
  step < TOTAL_STEPS ? renderWizardStep(step + 1) : finishOnboarding();
}

function finishOnboarding() {
  localStorage.setItem(KEY_ONBOARDING, '1');
  const overlay = document.getElementById('onboarding-overlay');
  if (overlay) {
    overlay.style.opacity = '0';
    overlay.style.transition = 'opacity 0.4s ease';
    setTimeout(() => overlay.remove(), 400);
  }
  // Na wizard: start nav tour als eerste keer
  if (!localStorage.getItem(KEY_TOUR_NAV)) setTimeout(() => startTour(), 600);
}

// ═══════════════════════════════════════════════════════════════════════════════
//  GENERIEKE TOUR ENGINE (MET REACTIEVE POSITIONERING & HYDRATATIE VAN HUIDIGE STATE)
// ═══════════════════════════════════════════════════════════════════════════════

let _activeTourSteps  = [];
let _activeTourIdx    = 0;
let _activeTourFinish = null;
let _tourAnimationFrame = null;
let _forcedStyles     = [];

function forceStyle(el, prop, val) {
  if (!el) return;
  _forcedStyles.push({ el, prop, original: el.style[prop] });
  el.style[prop] = val;
}

function restoreForcedStyles() {
  _forcedStyles.forEach(x => {
    if (x.el) x.el.style[x.prop] = x.original;
  });
  _forcedStyles = [];
}

/**
 * Start een tour met een willekeurige array van stappen.
 * @param {Array}    steps    Array van { targetId, mobileTargetId, title, desc, beforeShow }
 * @param {Function} onFinish Callback als tour klaar/overgeslagen is
 */
function runTour(steps, onFinish) {
  _activeTourSteps  = steps;
  _activeTourIdx    = 0;
  _activeTourFinish = onFinish || (() => {});
  showStep(0);
}

function showStep(i) {
  cleanupTourUI();
  if (i >= _activeTourSteps.length) { _activeTourFinish(); return; }

  const step     = _activeTourSteps[i];
  const isMobile = window.innerWidth <= 768;
  const targetId = isMobile ? (step.mobileTargetId || step.targetId) : step.targetId;

  // Voer eventuele beforeShow hook uit (bijv. openen tab, tijdelijk tonen van element)
  if (step.beforeShow) {
    try {
      step.beforeShow();
    } catch (e) {
      console.warn("Fout in beforeShow hook:", e);
    }
  }

  const target = document.getElementById(targetId);

  // Fallback als element niet bestaat
  if (!target) {
    console.warn(`Tour element #${targetId} niet gevonden. Sla stap over.`);
    showStep(i + 1);
    return;
  }

  // Donkere overlay (klik buiten = volgende)
  const overlay = document.createElement('div');
  overlay.id = 'tour-overlay';
  overlay.style.cssText = 'position:fixed;inset:0;z-index:9997;';
  overlay.addEventListener('click', e => { if (e.target === overlay) showStep(i + 1); });
  document.body.appendChild(overlay);

  // Scroll element rustig in beeld
  target.scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  // Spotlight aanmaken (zonder initiële positie, tracking loop vult dit in)
  const spotlight = document.createElement('div');
  spotlight.className = 'tour-spotlight';
  spotlight.style.cssText = `
    position:fixed;
    border-radius:12px;
    box-shadow:0 0 0 9999px rgba(0,0,0,0.72);
    z-index:9998;
    pointer-events:none;
    border:2px solid rgba(212,255,0,0.7);
    animation:tourPulse 1.8s ease-in-out infinite;
    display:none; /* Eerst onzichtbaar tot eerste frame berekend is */
  `;
  document.body.appendChild(spotlight);

  // Tooltip aanmaken
  const isLast = i === _activeTourSteps.length - 1;
  const tip = document.createElement('div');
  tip.className = 'tour-tooltip';
  tip.style.cssText = `
    position:fixed;
    z-index:9999;
    width:270px;
    display:none; /* Eerst onzichtbaar tot eerste frame berekend is */
  `;
  tip.innerHTML = `
    <div class="tour-tip-content">
      <div class="tour-tip-title">${step.title}</div>
      <div class="tour-tip-desc">${step.desc}</div>
      ${step.tip ? `<div class="tour-tip-pro">💡 ${step.tip}</div>` : ''}
      <div class="tour-tip-footer">
        <span class="tour-step-count">${i + 1} / ${_activeTourSteps.length}</span>
        <div class="tour-tip-actions">
          <button class="tour-btn-skip"  id="tour-skip">Overslaan</button>
          <button class="tour-btn-next"  id="tour-next">${isLast ? 'Klaar ✓' : 'Volgende →'}</button>
        </div>
      </div>
    </div>`;
  document.body.appendChild(tip);

  document.getElementById('tour-next').addEventListener('click', () => showStep(i + 1));
  document.getElementById('tour-skip').addEventListener('click', () => { cleanupTourUI(); _activeTourFinish(); });

  // Start tracking loop die spotlight & tooltip verplaatst op basis van scroll/resize/animaties
  startTracking(target, spotlight, tip);
}

function startTracking(target, spotlight, tip) {
  if (_tourAnimationFrame) {
    cancelAnimationFrame(_tourAnimationFrame);
  }

  function update() {
    if (!document.body.contains(spotlight) || !document.body.contains(tip)) {
      _tourAnimationFrame = null;
      return;
    }

    // Check of target in de DOM zit en een breedte/hoogte heeft (indien verborgen, verberg tour UI tijdelijk)
    if (!target || !target.isConnected || target.offsetWidth === 0 || target.offsetHeight === 0) {
      spotlight.style.display = 'none';
      tip.style.display = 'none';
      _tourAnimationFrame = requestAnimationFrame(update);
      return;
    }

    const rect = target.getBoundingClientRect();

    // Update Spotlight positie en afmetingen
    spotlight.style.display = 'block';
    spotlight.style.top = `${rect.top - 8}px`;
    spotlight.style.left = `${rect.left - 8}px`;
    spotlight.style.width = `${rect.width + 16}px`;
    spotlight.style.height = `${rect.height + 16}px`;

    // Update Tooltip positie
    tip.style.display = 'block';
    const margin = 14;
    const tipW = tip.offsetWidth || 270;
    const tipH = tip.offsetHeight || 150;
    const vpW = window.innerWidth;
    const vpH = window.innerHeight;

    let tipTop, tipLeft;
    
    // Positioneringsalgoritme dat rekening houdt met randen van het scherm
    if (rect.bottom + margin + tipH < vpH) {
      // Onder het element
      tipTop = rect.bottom + margin;
      tipLeft = Math.min(Math.max(rect.left, margin), vpW - tipW - margin);
    } else if (rect.top - margin - tipH > 0) {
      // Boven het element
      tipTop = rect.top - margin - tipH;
      tipLeft = Math.min(Math.max(rect.left, margin), vpW - tipW - margin);
    } else {
      // Past noch boven, noch onder: probeer rechts of links, anders centreer op scherm
      tipTop = Math.max(margin, Math.min(rect.top, vpH - tipH - margin));
      if (rect.right + margin + tipW < vpW) {
        tipLeft = rect.right + margin;
      } else if (rect.left - margin - tipW > 0) {
        tipLeft = rect.left - margin - tipW;
      } else {
        // Fallback: Centreer
        tipLeft = Math.max(margin, (vpW - tipW) / 2);
        tipTop = Math.max(margin, (vpH - tipH) / 2);
      }
    }

    tip.style.top = `${tipTop}px`;
    tip.style.left = `${tipLeft}px`;

    _tourAnimationFrame = requestAnimationFrame(update);
  }

  _tourAnimationFrame = requestAnimationFrame(update);
}

function cleanupTourUI() {
  if (_tourAnimationFrame) {
    cancelAnimationFrame(_tourAnimationFrame);
    _tourAnimationFrame = null;
  }
  restoreForcedStyles();
  document.getElementById('tour-overlay')?.remove();
  document.querySelector('.tour-spotlight')?.remove();
  document.querySelector('.tour-tooltip')?.remove();
}

// ═══════════════════════════════════════════════════════════════════════════════
//  NAV TOUR (globaal — toont de 4 navigatie-items)
// ═══════════════════════════════════════════════════════════════════════════════

const NAV_TOUR_STEPS = [
  { targetId: 'link-home',      mobileTargetId: 'mob-link-home',    title: '📰 Feed',       desc: 'Hier zie je ritten van je clubgenoten. Geef kudos en laat reacties achter.', tip: 'Klik op een rit om details te zien en te reageren.' },
  { targetId: 'link-dashboard', mobileTargetId: 'mob-link-planner', title: '🗓️ Planner',    desc: 'Plan groepsritten, check het weer en zie wie er beschikbaar is.',            tip: 'Klik op een dag in de kalender om je beschikbaarheid in te stellen.' },
  { targetId: 'link-rides',     mobileTargetId: 'mob-link-rides',   title: '🚴 Mijn Ritten', desc: 'Upload .fit, .tcx of .gpx bestanden. Bekijk je routes, zones en trainingsstructuur.', tip: 'Elke pagina heeft zijn eigen rondleiding via de ? knop.' },
  { targetId: 'btn-nav-profile',mobileTargetId: 'mob-link-profile', title: '👤 Profiel',     desc: 'Badges, VO₂max, vermogenscurve, seizoensvergelijking en je materiaal.',     tip: 'Klik op ? op elke pagina voor een gerichte uitleg.' },
];

export function startTour() {
  runTour(NAV_TOUR_STEPS, () => {
    localStorage.setItem(KEY_TOUR_NAV, '1');
    showToast('Navigatietour klaar! Klik ? op elke pagina voor meer uitleg. 🎉', 'success');
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
//  PAGINA-SPECIFIEKE TOURS
// ═══════════════════════════════════════════════════════════════════════════════

const PAGE_TOURS = {

  // ─── Feed ──────────────────────────────────────────────────────────────────
  feed: {
    label: 'Feed',
    emoji: '📰',
    steps: [
      {
        targetId: 'feed-main-column',
        title: '📰 Activiteitenfeed',
        desc: 'Hier verschijnen de ritten van jou en je clubgenoten, gesorteerd op datum.',
        tip: 'Volg meer leden via de suggesties rechts om meer ritten te zien.',
      },
      {
        targetId: 'feed-suggestions-list',
        mobileTargetId: 'feed-suggestions-list',
        title: '👥 Clubgenoten volgen',
        desc: 'Klik op "Volgen" om ritten van andere leden in je feed te zien.',
        tip: 'Je kunt altijd iemand ontvolgen via hun profiel.',
      },
      {
        targetId: 'leaderboard-list',
        title: '🏆 Leaderboard',
        desc: 'De Rider Score wordt berekend op basis van afstand, hoogtemeters en snelheid van al je ritten.',
        tip: 'Upload meer ritten om hoger op het leaderboard te klimmen.',
      },
    ],
  },

  // ─── Planner ───────────────────────────────────────────────────────────────
  dashboard: {
    label: 'Planner',
    emoji: '🗓️',
    steps: [
      {
        targetId: 'calendar-days-grid',
        title: '📅 Kalender',
        desc: 'Klik op een dag om je beschikbaarheid in te stellen: ✅ Beschikbaar, ⚠️ Misschien of ❌ Niet beschikbaar.',
        tip: 'Groene randen op een dag betekenen dat er een rit gepland staat.',
      },
      {
        targetId: 'btn-prev-month',
        title: '◀ Maand wisselen',
        desc: 'Navigeer door de maanden om toekomstige ritten te bekijken of te plannen.',
      },
      {
        targetId: 'btn-plan-ride',
        title: '+ Rit plannen',
        desc: 'Klik hier om een nieuwe groepsrit aan te maken met datum, route, en beschrijving.',
        tip: 'De app toont automatisch het weerbericht voor de geplande dag.',
      },
      {
        targetId: 'rides-list-container',
        title: '🚴 Geplande ritten',
        desc: 'Hier zie je alle geplande groepsritten. Klik op een rit voor details en RSVP.',
        tip: 'Je kunt een rit exporteren naar je agenda via de .ics knop.',
      },
    ],
  },

  // ─── Mijn Ritten ───────────────────────────────────────────────────────────
  rides: {
    label: 'Mijn Ritten',
    emoji: '🚴',
    steps: [
      {
        targetId: 'tcx-dropzone',
        title: '⬆️ Rit uploaden',
        desc: 'Sleep een .fit, .tcx of .gpx bestand in dit vak — of klik om te bladeren.',
        tip: 'Zwift bestanden vind je in "Documents > Zwift > Activities" als .fit bestand.',
        beforeShow: () => {
          document.getElementById('tab-my-rides')?.click();
        }
      },
      {
        targetId: 'tcx-result-panel',
        title: '📊 Resultaten',
        desc: 'Na het uploaden zie je hier je afstand, duur, hoogte, snelheid, hartslag en vermogen.',
        tip: 'De Rider Score (10–1000) wordt automatisch berekend op basis van je prestaties.',
        beforeShow: () => {
          document.getElementById('tab-my-rides')?.click();
          const panel = document.getElementById('tcx-result-panel');
          if (panel && window.getComputedStyle(panel).display === 'none') {
            forceStyle(panel, 'display', 'block');
          }
        }
      },
      {
        targetId: 'activities-list-container',
        title: '📋 Activiteitenlijst',
        desc: 'Al je geüploade ritten staan hier. Elke kaart toont een gekleurde trainingsstructuur.',
        tip: 'De balk toont warmup → hoofdblok → cooldown op basis van je vermogenszones.',
        beforeShow: () => {
          document.getElementById('tab-my-rides')?.click();
        }
      },
    ],
  },

  // ─── Profiel ───────────────────────────────────────────────────────────────
  profile: {
    label: 'Profiel',
    emoji: '👤',
    steps: [
      {
        targetId: 'activity-heatmap',
        title: '🗺️ Activiteitsheatmap',
        desc: 'Een GitHub-stijl overzicht van al je ritten dit jaar. Donkerder = meer km op die dag.',
        tip: 'Hover over een cel om de details van die dag te zien.',
      },
      {
        targetId: 'pr-tracker-grid',
        title: '🥇 Persoonlijke Records',
        desc: 'Je beste prestaties per afstandscategorie: snelheid, vermogen en hoogte per bucket.',
        tip: 'Upload meer ritten om je PR\'s te verbeteren.',
      },
      {
        targetId: 'fitness-chart',
        title: '📈 Conditiegrafiek (CTL/ATL/TSB)',
        desc: 'CTL = langetermijncondition, ATL = vermoeidheid, TSB = vorm. Positieve TSB = goede vorm.',
        tip: 'Gebaseerd op je Training Stress Score (TSS) per rit.',
      },
      {
        targetId: 'vo2max-card-container',
        title: '🫁 VO₂max Schatting',
        desc: 'Automatisch berekend op basis van je vermogen en gewicht. Hoe hoger, hoe beter je uithoudingsvermogen.',
        tip: 'Zorg dat je gewicht in je profiel staat voor een nauwkeurigere schatting.',
      },
      {
        targetId: 'mmp-section',
        title: '⚡ Vermogenscurve (MMP)',
        desc: 'Je maximale vermogen per tijdsduur: van 5 seconden sprint tot 60 minuten drempel.',
        tip: 'Stippellijnen zijn schattingen op basis van FTP. Upload meer ritten voor echte meetwaarden.',
        beforeShow: () => {
          const mmp = document.getElementById('mmp-section');
          if (mmp && window.getComputedStyle(mmp).display === 'none') {
            forceStyle(mmp, 'display', 'block');
          }
        }
      },
      {
        targetId: 'season-chart',
        title: '📊 Seizoensvergelijking',
        desc: 'Vergelijk dit jaar (groen) met vorig jaar (grijs). Cumulatief per week.',
        tip: 'Klik "Ritten" om het aantal ritten te vergelijken in plaats van km.',
      },
      {
        targetId: 'badge-wall',
        title: '🏅 Badges & Achievements',
        desc: 'Verdien badges door mijlpalen te bereiken: 100km rit, 1000 km totaal, 10 ritten/maand...',
        tip: 'Grijze badges zijn nog niet verdiend. Hover voor de vereisten.',
      },
      {
        targetId: 'equipment-list',
        title: '🚲 Materiaalregistratie',
        desc: 'Registreer je fiets(en) en houd de km bij. Je krijgt een waarschuwing als onderhoud nodig is.',
        tip: 'Stel de standaard fiets in — km worden dan automatisch bijgeteld na elke rit.',
      },
    ],
  },
};

// ─── Pagina-tour starten ──────────────────────────────────────────────────────

export function startPageTour(page) {
  const tourDef = PAGE_TOURS[page];
  if (!tourDef) return;

  runTour(tourDef.steps, () => {
    localStorage.setItem(KEY_TOUR_PREFIX + page, '1');
    showToast(`${tourDef.emoji} ${tourDef.label} tour klaar!`, 'success');
  });
}

/**
 * Automatisch de pagina-tour starten als de gebruiker er voor de eerste keer naartoe gaat.
 * Aanroepen vanuit app.js bij navigatie.
 */
export function triggerPageTourIfNew(page) {
  if (localStorage.getItem(KEY_TOUR_PREFIX + page)) return; // al gezien
  if (!localStorage.getItem(KEY_ONBOARDING)) return;        // wizard nog niet klaar
  setTimeout(() => startPageTour(page), 900);
}

// ─── ? Help knop (context-aware) ─────────────────────────────────────────────

let _currentPage = 'feed';

export function setCurrentPage(page) { _currentPage = page; }

export function initHelpButton() {
  const btn = document.getElementById('btn-help-tour');
  if (!btn || btn._helpBound) return;
  btn._helpBound = true;

  btn.addEventListener('click', () => {
    // Toon keuze-menu: nav-tour of pagina-tour
    showTourMenu();
  });
}

function showTourMenu() {
  document.getElementById('tour-menu')?.remove();

  const pageDef = PAGE_TOURS[_currentPage];
  const menu = document.createElement('div');
  menu.id = 'tour-menu';
  menu.style.cssText = `
    position:fixed; z-index:10001;
    top:64px; right:16px;
    background:rgba(10,14,25,0.98);
    border:1px solid rgba(212,255,0,0.25);
    border-radius:14px;
    padding:10px 8px;
    min-width:220px;
    box-shadow:0 16px 40px rgba(0,0,0,0.6);
    animation:obSlideUp 0.25s cubic-bezier(0.16,1,0.3,1);
  `;
  menu.innerHTML = `
    <div style="font-size:10px;font-weight:700;color:var(--text-muted);padding:4px 8px 8px;text-transform:uppercase;letter-spacing:.06em;">Rondleiding starten</div>
    ${pageDef ? `
      <button class="tour-menu-btn" id="tour-menu-page">
        <span>${pageDef.emoji} ${pageDef.label} tour</span>
        <span class="tour-menu-badge">deze pagina</span>
      </button>` : ''}
    <button class="tour-menu-btn" id="tour-menu-nav">
      <span>🧭 Navigatietour</span>
      <span class="tour-menu-badge">alle pagina's</span>
    </button>
    <button class="tour-menu-btn" id="tour-menu-wizard" style="margin-top:4px;border-top:1px solid rgba(255,255,255,0.06);padding-top:10px;">
      <span>🚀 Opnieuw beginnen</span>
      <span class="tour-menu-badge">wizard</span>
    </button>
  `;

  document.body.appendChild(menu);

  // Sluit menu bij klik buiten
  const closeMenu = (e) => { if (!menu.contains(e.target) && e.target.id !== 'btn-help-tour') { menu.remove(); document.removeEventListener('click', closeMenu); } };
  setTimeout(() => document.addEventListener('click', closeMenu), 100);

  menu.querySelector('#tour-menu-page')?.addEventListener('click', () => { menu.remove(); startPageTour(_currentPage); });
  menu.querySelector('#tour-menu-nav')?.addEventListener('click',  () => { menu.remove(); startTour(); });
  menu.querySelector('#tour-menu-wizard')?.addEventListener('click', () => {
    menu.remove();
    localStorage.removeItem(KEY_ONBOARDING);
    startOnboardingWizard();
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
    </div>`;
  if (ctaText && ctaAction) container.querySelector('#empty-cta-btn')?.addEventListener('click', ctaAction);
}
