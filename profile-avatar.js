// profile-avatar.js — Profielpagina avatar editor
// Volledig zelfstandig, importeer en roep initProfileAvatarEditor() aan

import { state, config, showToast } from './state.js';

// Avatar bouw-state
const av = {
  bg: 'transparent',
  skin: 'f2d3b1',
  haircolor: '6a4e35',
  hair: 'short01',
  eyes: 'variant01',
  mouth: 'variant01',
  customUrl: null  // Ingesteld bij preset/foto
};

function buildUrl() {
  if (av.customUrl) return av.customUrl;
  const seed = `cyclo_${av.skin}_${av.hair}_${av.eyes}_${av.mouth}`;
  let url = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
  if (av.bg !== 'transparent') url += `&backgroundColor=${av.bg}`;
  url += `&skinColor=${av.skin}&hairColor=${av.haircolor}&hair=${av.hair}&eyes=${av.eyes}&mouth=${av.mouth}`;
  return url;
}

function updatePreview() {
  const el = document.getElementById('profile-page-preview-avatar');
  if (el) el.src = buildUrl();
}

export function initProfileAvatarEditor() {
  // Laad huidige avatar als startwaarde
  if (state.user?.avatar_url) {
    av.customUrl = null;
    const preview = document.getElementById('profile-page-preview-avatar');
    if (preview) preview.src = state.user.avatar_url;
  }

  // ── Swatches (bg, skin, haircolor) ──────────────────────────────────
  document.querySelectorAll(
    '#profile-swatches-bg .swatch-circle, ' +
    '#profile-swatches-skin .swatch-circle, ' +
    '#profile-swatches-haircolor .swatch-circle'
  ).forEach(sw => {
    sw.style.cursor = 'pointer';
    sw.addEventListener('click', () => {
      av.customUrl = null;  // reset preset
      const prop = sw.dataset.prop;
      const val  = sw.dataset.val;
      if (prop === 'bg')        av.bg        = val;
      if (prop === 'skin')      av.skin      = val;
      if (prop === 'haircolor') av.haircolor = val;

      // Actieve swatch markeren
      sw.closest('.avatar-swatches')
        ?.querySelectorAll('.swatch-circle')
        .forEach(s => s.style.outline = '');
      sw.style.outline = '2px solid var(--primary)';
      sw.style.outlineOffset = '2px';

      updatePreview();
    });
  });

  // ── Chips (hair, eyes, mouth) ────────────────────────────────────────
  document.querySelectorAll('.profile-page-chip').forEach(chip => {
    chip.style.cursor = 'pointer';
    chip.addEventListener('click', () => {
      av.customUrl = null;
      const prop = chip.dataset.prop;
      const val  = chip.dataset.val;
      if (prop in av) av[prop] = val;

      chip.closest('.choice-chips-grid')
        ?.querySelectorAll('.choice-chip')
        .forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      updatePreview();
    });
  });

  // ── Presets ──────────────────────────────────────────────────────────
  document.querySelectorAll('.profile-page-preset').forEach(preset => {
    preset.style.cursor = 'pointer';
    preset.addEventListener('click', () => {
      const seed = preset.dataset.seed;
      av.customUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;

      // Markeer actief
      document.querySelectorAll('.profile-page-preset img').forEach(img => {
        img.style.border = '2px solid transparent';
      });
      preset.querySelector('img').style.border = '2px solid var(--primary)';

      updatePreview();
    });
  });

  // ── Willekeurig ──────────────────────────────────────────────────────
  document.getElementById('btn-profile-randomize')?.addEventListener('click', () => {
    av.customUrl = null;
    av.skin      = ['f2d3b1','ecad80','d08b5b','9e5622','763900'][Math.floor(Math.random()*5)];
    av.haircolor = ['0e0e0e','6a4e35','e5d7a3','ab2a18','afafaf','d4ff00'][Math.floor(Math.random()*6)];
    av.hair      = ['short01','short05','long01','long03','none'][Math.floor(Math.random()*5)];
    av.eyes      = ['variant01','variant03','variant11','variant15'][Math.floor(Math.random()*4)];
    av.mouth     = ['variant01','variant05','variant10'][Math.floor(Math.random()*3)];
    av.bg        = ['transparent','b6e3f4','d4ff00','00f0ff','ff6b9d','0f1420'][Math.floor(Math.random()*6)];
    updatePreview();
  });

  // ── Opslaan ──────────────────────────────────────────────────────────
  document.getElementById('btn-profile-save-avatar')?.addEventListener('click', async () => {
    const url = buildUrl();
    if (!url) return;

    const btn = document.getElementById('btn-profile-save-avatar');
    if (btn) { btn.disabled = true; btn.textContent = 'Opslaan...'; }

    try {
      if (config.isDemoMode) {
        state.user.avatar_url = url;
        localStorage.setItem('cyclo_demo_avatar', url);
        showToast('✓ Avatar opgeslagen!', 'success');
      } else {
        const { error } = await config.supabaseClient
          .from('profiles')
          .update({ avatar_url: url })
          .eq('id', state.user.id);
        if (error) throw error;
        state.user.avatar_url = url;
        showToast('✓ Avatar opgeslagen!', 'success');
      }

      // Update alle avatar-weergaven
      document.querySelectorAll('#profile-page-avatar, #nav-avatar-img').forEach(img => {
        if (img) img.src = url;
      });
    } catch (err) {
      showToast('Fout bij opslaan: ' + err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.innerHTML = '<i data-lucide="save" style="width:12px;height:12px;"></i> Opslaan'; }
      if (typeof lucide !== 'undefined') lucide.createIcons();
    }
  });
}
