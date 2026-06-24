// Cyclo - Desktop View Manager (ES6 Module)

export function initDesktopView() {
  console.log("[View] Desktop View geïnitialiseerd.");
  
  // Zorg dat de mobiele bottom nav verborgen is
  const mobileNav = document.getElementById('mobile-bottom-nav');
  if (mobileNav) {
    mobileNav.style.display = 'none';
  }
  
  // Eventuele desktop-specifieke widescreen-layout aanpassingen
}
