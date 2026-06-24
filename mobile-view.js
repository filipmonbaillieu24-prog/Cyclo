// Cyclo - Mobile View Manager (ES6 Module)
import { state, config } from './state.js';

export function initMobileView() {
  console.log("[View] Mobile View geïnitialiseerd.");
  
  // Toon mobiele bottom nav bar
  const mobileNav = document.getElementById('mobile-bottom-nav');
  if (mobileNav) {
    mobileNav.style.display = 'flex';
  }
  
  // Injecteer "Start Rit" in het midden van de mobiele navigatie
  if (mobileNav && !document.getElementById('mob-link-start-ride')) {
    const startRideBtn = document.createElement('a');
    startRideBtn.href = '#';
    startRideBtn.id = 'mob-link-start-ride';
    startRideBtn.className = 'mobile-nav-item mobile-start-ride-btn';
    startRideBtn.innerHTML = `
      <div class="mobile-start-ride-circle">
        <i data-lucide="play" style="width:18px;height:18px;stroke-width:3px;fill:var(--text-on-primary);"></i>
      </div>
      <span class="nav-label">Start Rit</span>
    `;
    
    // Voeg toe na de "Planner" (2e knop)
    const plannerEl = document.getElementById('mob-link-planner');
    if (plannerEl) {
      plannerEl.after(startRideBtn);
    } else {
      mobileNav.appendChild(startRideBtn);
    }
    
    // Bind click event
    startRideBtn.addEventListener('click', (e) => {
      e.preventDefault();
      
      // Schakel over naar de fullscreen fietscomputer modus
      import('./mode-bikecomputer.js').then(module => {
        module.startBikeComputerMode();
      });
    });
    
    // Render iconen
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
  }
}
