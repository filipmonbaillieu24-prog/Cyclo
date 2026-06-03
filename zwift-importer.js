// Cyclo - Zwift Auto-Importer
// Gebruikt de File System Access API om lokale Zwift FIT-bestanden te importeren.
// Geen API key of server nodig — alles gebeurt lokaal in de browser.
import { showToast } from './state.js';

const ZWIFT_IMPORTED_KEY = 'cyclo_zwift_imported'; // Set van al geïmporteerde bestandsnamen

// ──────────────────────────────────────────────────────
//  Hulpfuncties
// ──────────────────────────────────────────────────────

function getImportedSet() {
  try {
    return new Set(JSON.parse(localStorage.getItem(ZWIFT_IMPORTED_KEY) || '[]'));
  } catch (_) { return new Set(); }
}

function markAsImported(filename) {
  const set = getImportedSet();
  set.add(filename);
  localStorage.setItem(ZWIFT_IMPORTED_KEY, JSON.stringify([...set]));
}

function zwiftDateFromFilename(name) {
  // Zwift bestandsnamen: "2024-06-03-10-30-00.fit" of "Activity_20240603103000.fit"
  const iso = name.match(/(\d{4}-\d{2}-\d{2})/);
  if (iso) return iso[1];
  const compact = name.match(/(\d{4})(\d{2})(\d{2})/);
  if (compact) return `${compact[1]}-${compact[2]}-${compact[3]}`;
  return null;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ──────────────────────────────────────────────────────
//  UI state management
// ──────────────────────────────────────────────────────

function showStep(step) {
  ['select', 'scanning', 'results'].forEach(s => {
    const el = document.getElementById(`zwift-step-${s}`);
    if (el) el.style.display = s === step ? 'block' : 'none';
  });
}

function updateProgress(current, total, label) {
  const wrap = document.getElementById('zwift-progress-wrap');
  const bar  = document.getElementById('zwift-progress-bar');
  const pct  = document.getElementById('zwift-progress-pct');
  const lbl  = document.getElementById('zwift-progress-label');
  if (!wrap) return;
  wrap.style.display = 'block';
  const p = total > 0 ? Math.round(current / total * 100) : 0;
  if (bar) bar.style.width = `${p}%`;
  if (pct) pct.textContent = `${p}%`;
  if (lbl) lbl.textContent = label || 'Importeren...';
}

function hideProgress() {
  const wrap = document.getElementById('zwift-progress-wrap');
  if (wrap) wrap.style.display = 'none';
}

// ──────────────────────────────────────────────────────
//  Map scannen voor FIT bestanden
// ──────────────────────────────────────────────────────

async function scanDirectory(dirHandle, files = []) {
  for await (const entry of dirHandle.values()) {
    if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.fit')) {
      files.push(entry);
    } else if (entry.kind === 'directory') {
      await scanDirectory(entry, files); // recursief
    }
  }
  return files;
}

// ──────────────────────────────────────────────────────
//  Bestandenlijst renderen
// ──────────────────────────────────────────────────────

function renderFilesList(fileHandles, importedSet) {
  const container = document.getElementById('zwift-files-list');
  const summary   = document.getElementById('zwift-results-summary');
  if (!container) return;

  const newFiles    = fileHandles.filter(fh => !importedSet.has(fh.name));
  const doneFiles   = fileHandles.filter(fh =>  importedSet.has(fh.name));

  if (summary) {
    summary.textContent = `${newFiles.length} nieuw${newFiles.length !== 1 ? 'e' : ''} rit${newFiles.length !== 1 ? 'ten' : ''} gevonden`;
    if (doneFiles.length > 0) {
      summary.textContent += ` · ${doneFiles.length} al geïmporteerd`;
    }
  }

  container.innerHTML = '';

  if (newFiles.length === 0 && doneFiles.length === 0) {
    container.innerHTML = '<div class="empty-state" style="padding:12px;">Geen FIT-bestanden gevonden in deze map.</div>';
    return;
  }

  if (newFiles.length === 0) {
    container.innerHTML = `
      <div class="zwift-all-done">
        <span style="font-size:22px;">✅</span>
        <div>Alle ${doneFiles.length} ritten zijn al geïmporteerd!</div>
      </div>`;
    return;
  }

  // Nieuwe bestanden als checklist
  newFiles.forEach(fh => {
    const dateStr = zwiftDateFromFilename(fh.name);
    const dateLabel = dateStr
      ? new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
          .format(new Date(dateStr))
      : fh.name;

    const row = document.createElement('label');
    row.className = 'zwift-file-row';
    row.setAttribute('data-filename', fh.name);
    row.innerHTML = `
      <input type="checkbox" class="zwift-file-check" data-filename="${fh.name}" checked>
      <div class="zwift-file-info">
        <div class="zwift-file-name">${dateLabel}</div>
        <div class="zwift-file-meta">${fh.name}</div>
      </div>
      <span class="zwift-file-badge zwift-badge-new">Nieuw</span>
    `;
    container.appendChild(row);
  });

  // Al geïmporteerde bestanden (ingeklapt)
  if (doneFiles.length > 0) {
    const sep = document.createElement('div');
    sep.style.cssText = 'font-size:10px;color:var(--text-muted);margin:10px 0 6px;text-transform:uppercase;letter-spacing:.06em;';
    sep.textContent = `Al geïmporteerd (${doneFiles.length})`;
    container.appendChild(sep);

    doneFiles.slice(0, 5).forEach(fh => {
      const dateStr   = zwiftDateFromFilename(fh.name);
      const dateLabel = dateStr
        ? new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
            .format(new Date(dateStr))
        : fh.name;

      const row = document.createElement('div');
      row.className = 'zwift-file-row zwift-file-done';
      row.innerHTML = `
        <div class="zwift-file-info">
          <div class="zwift-file-name" style="opacity:.5;">${dateLabel}</div>
          <div class="zwift-file-meta">${fh.name}</div>
        </div>
        <span class="zwift-file-badge zwift-badge-done">✓ Klaar</span>
      `;
      container.appendChild(row);
    });

    if (doneFiles.length > 5) {
      const more = document.createElement('div');
      more.style.cssText = 'font-size:10px;color:var(--text-muted);padding:4px 0;';
      more.textContent = `... en ${doneFiles.length - 5} andere`;
      container.appendChild(more);
    }
  }
}

// ──────────────────────────────────────────────────────
//  Import uitvoeren
// ──────────────────────────────────────────────────────

async function importSelectedFiles(fileHandles, processTcxFile, loadDashboardDataCallback) {
  const checks = document.querySelectorAll('.zwift-file-check:checked');
  const selectedNames = new Set([...checks].map(c => c.dataset.filename));
  const toImport = fileHandles.filter(fh => selectedNames.has(fh.name));

  if (toImport.length === 0) {
    showToast('Geen bestanden geselecteerd.', 'error');
    return;
  }

  // Knoppen uitschakelen
  const btnAll    = document.getElementById('btn-zwift-import-all');
  const btnRescan = document.getElementById('btn-zwift-rescan');
  if (btnAll)    { btnAll.disabled    = true; btnAll.textContent    = 'Bezig...'; }
  if (btnRescan) { btnRescan.disabled = true; }

  let imported = 0;
  let errors   = 0;

  for (let i = 0; i < toImport.length; i++) {
    const fh = toImport[i];
    updateProgress(i, toImport.length, `${fh.name} (${i + 1}/${toImport.length})`);

    try {
      const file = await fh.getFile();

      // Gebruik een Promise wrapper zodat we kunnen await-en op de async verwerking
      await new Promise((resolve, reject) => {
        const originalToast = window._cycloToastCallback;
        // Verwerk het bestand via de bestaande parser
        processTcxFile(file, () => {
          markAsImported(fh.name);
          imported++;
          resolve();
        });
        // Timeout fallback (max 15 sec per bestand)
        setTimeout(() => {
          markAsImported(fh.name);
          imported++;
          resolve();
        }, 15000);
      });

      // Markeer rij als klaar
      const row = document.querySelector(`label[data-filename="${fh.name}"]`);
      if (row) {
        row.classList.add('zwift-file-done');
        const badge = row.querySelector('.zwift-file-badge');
        if (badge) { badge.textContent = '✓ Klaar'; badge.className = 'zwift-file-badge zwift-badge-done'; }
      }
    } catch (err) {
      console.error(`Fout bij importeren ${fh.name}:`, err);
      errors++;
    }

    // Kleine pauze om UI te laten bijwerken
    await new Promise(r => setTimeout(r, 100));
  }

  updateProgress(toImport.length, toImport.length, 'Klaar!');

  if (btnAll) {
    btnAll.disabled    = false;
    btnAll.innerHTML   = '<i data-lucide="check-circle" style="width:11px;height:11px;"></i> Geïmporteerd!';
  }
  if (btnRescan) btnRescan.disabled = false;

  if (imported > 0 && typeof loadDashboardDataCallback === 'function') {
    loadDashboardDataCallback();
  }

  const msg = errors === 0
    ? `✅ ${imported} rit${imported !== 1 ? 'ten' : ''} succesvol geïmporteerd!`
    : `${imported} geïmporteerd, ${errors} mislukt.`;
  showToast(msg, errors === 0 ? 'success' : 'error');

  setTimeout(hideProgress, 3000);
  if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ──────────────────────────────────────────────────────
//  Setup (call this from app.js)
// ──────────────────────────────────────────────────────

export function setupZwiftImporter(processTcxFile, loadDashboardDataCallback) {
  // Browser-support check
  const supported = 'showDirectoryPicker' in window;
  const warning = document.getElementById('zwift-browser-warning');
  if (!supported && warning) warning.style.display = 'inline';

  let currentFileHandles = [];

  async function startScan(e) {
    if (e) e.preventDefault();
    if (!supported) {
      showToast('Zwift import vereist Chrome of Edge browser.', 'error');
      return;
    }

    let dirHandle;
    try {
      dirHandle = await window.showDirectoryPicker({ mode: 'read' });
    } catch (err) {
      if (err.name !== 'AbortError') {
        showToast('Kon map niet openen: ' + err.message, 'error');
      }
      return;
    }

    showStep('scanning');
    const statusEl = document.getElementById('zwift-scan-status');

    let found = 0;
    const allHandles = [];

    // Scan met live teller
    async function scanWithStatus(handle) {
      for await (const entry of handle.values()) {
        if (entry.kind === 'file' && entry.name.toLowerCase().endsWith('.fit')) {
          allHandles.push(entry);
          found++;
          if (statusEl) statusEl.textContent = `${found} FIT-bestand${found !== 1 ? 'en' : ''} gevonden...`;
        } else if (entry.kind === 'directory') {
          await scanWithStatus(entry);
        }
      }
    }

    try {
      await scanWithStatus(dirHandle);
    } catch (err) {
      showToast('Fout bij scannen: ' + err.message, 'error');
      showStep('select');
      return;
    }

    currentFileHandles = allHandles.sort((a, b) => b.name.localeCompare(a.name)); // nieuwste eerst
    const importedSet  = getImportedSet();

    showStep('results');
    renderFilesList(currentFileHandles, importedSet);
    if (typeof lucide !== 'undefined') lucide.createIcons();
  }

  // Event listeners
  const btnScan   = document.getElementById('btn-zwift-scan');
  const btnRescan = document.getElementById('btn-zwift-rescan');
  const btnImport = document.getElementById('btn-zwift-import-all');

  if (btnScan)   btnScan.addEventListener('click',   startScan);
  if (btnRescan) btnRescan.addEventListener('click',  startScan);
  if (btnImport) btnImport.addEventListener('click', () => {
    importSelectedFiles(currentFileHandles, processTcxFile, loadDashboardDataCallback);
  });
}
