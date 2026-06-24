// Cyclo - Authentication & Profile Manager Module
import { state, elements, config, showToast, navigateTo, MOCK_PROFILES } from './state.js';

export function translateBikeType(type) {
  const mapping = {
    'Road': 'Racefiets',
    'Gravel': 'Gravelbike',
    'MTB': 'Mountainbike',
    'E-Bike': 'Elektrische Fiets'
  };
  return mapping[type] || type || 'Racefiets';
}

function updatePhysicalWidget(profile) {
  const container = document.getElementById('widget-user-physical');
  if (!container) return;

  const genderEl = document.getElementById('widget-physical-gender');
  const ageEl = document.getElementById('widget-physical-age');
  const heightEl = document.getElementById('widget-physical-height');
  const weightEl = document.getElementById('widget-physical-weight');

  let hasAny = false;

  // Gender
  if (profile.gender) {
    const genderMap = { 'Male': '♂ Man', 'Female': '♀ Vrouw', 'Other': '⚧ Anders' };
    genderEl.textContent = genderMap[profile.gender] || profile.gender;
    genderEl.style.display = 'inline';
    hasAny = true;
  } else {
    genderEl.style.display = 'none';
  }

  // Age from birthdate
  if (profile.birthdate) {
    const birth = new Date(profile.birthdate);
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    const m = now.getMonth() - birth.getMonth();
    if (m < 0 || (m === 0 && now.getDate() < birth.getDate())) age--;
    if (!isNaN(age)) {
      ageEl.textContent = `${age} jaar`;
      ageEl.style.display = 'inline';
      hasAny = true;
    } else {
      ageEl.style.display = 'none';
    }
  } else {
    ageEl.style.display = 'none';
  }

  // Height
  if (profile.height) {
    heightEl.textContent = `${profile.height} cm`;
    heightEl.style.display = 'inline';
    hasAny = true;
  } else {
    heightEl.style.display = 'none';
  }

  // Weight
  if (profile.weight) {
    weightEl.textContent = `${profile.weight} kg`;
    weightEl.style.display = 'inline';
    hasAny = true;
  } else {
    weightEl.style.display = 'none';
  }

  container.style.display = hasAny ? 'block' : 'none';
}

export function setUser(userProfile, setUserCallback) {
  state.user = userProfile;
  
  if (userProfile) {
    // Update navbar
    elements.navAuthItem.innerHTML = `<a href="#" class="nav-link" id="nav-btn-logout-link">${userProfile.full_name} (${userProfile.username})</a>`;
    
    // Bind logout link event
    document.getElementById('nav-btn-logout-link').addEventListener('click', (e) => {
      e.preventDefault();
      handleLogout(setUserCallback);
    });
    
    // Update sidebar widget info
    elements.widgetUserName.textContent = userProfile.full_name;
    elements.widgetUserUsername.textContent = `@${userProfile.username}`;
    elements.widgetUserAvatar.src = userProfile.avatar_url;
    elements.widgetUserBiketype.textContent = translateBikeType(userProfile.bike_type);
    
    // Update fyzieke gegevens widget
    updatePhysicalWidget(userProfile);
    
    if (userProfile.rider_score) {
      if (elements.widgetUserScoreVal) elements.widgetUserScoreVal.textContent = userProfile.rider_score;
      if (elements.widgetUserScoreContainer) elements.widgetUserScoreContainer.style.display = 'flex';
      // Ook in Mijn Ritten sidebar
      const rideScorePanel = document.getElementById('rides-score-panel');
      const rideScoreVal = document.getElementById('rides-score-val');
      if (rideScorePanel) { rideScorePanel.style.display = 'block'; }
      if (rideScoreVal) rideScoreVal.textContent = userProfile.rider_score;
    } else {
      if (elements.widgetUserScoreContainer) elements.widgetUserScoreContainer.style.display = 'none';
    }
    
    // Toon auth-only items
    document.querySelectorAll('.auth-only').forEach(el => el.style.display = '');
    
    // Toon profiel avatar in nav, verberg login knop
    const navProfItem = document.getElementById('nav-profile-item');
    const navAvatar   = document.getElementById('nav-avatar-img');
    const navLabel    = document.getElementById('nav-username-label');
    if (navProfItem) navProfItem.style.display = 'flex';
    if (navAvatar && userProfile?.avatar_url)  navAvatar.src = userProfile.avatar_url;
    if (navLabel  && userProfile?.full_name)   navLabel.textContent = userProfile.full_name.split(' ')[0];
    if (elements.navAuthItem) elements.navAuthItem.style.display = 'none';

    // Toon ? help knop
    const helpItem = document.getElementById('nav-help-item');
    if (helpItem) helpItem.style.display = '';

    // Ga naar sociale feed (Home) na inloggen
    navigateTo('feed', setUserCallback);

    // Onboarding check (na feed laden)
    setTimeout(() => {
      try {
        if (window._checkOnboarding) window._checkOnboarding();
        if (window._initHelpButton) window._initHelpButton();
      } catch(e) { console.warn('Onboarding:', e); }
    }, 1200);
  } else {
    // Uitgelogd
    elements.navAuthItem.innerHTML = `<a href="#" class="btn btn-primary btn-sm" id="btn-login-nav">Inloggen</a>`;
    elements.navAuthItem.style.display = '';
    const navProfItem = document.getElementById('nav-profile-item');
    if (navProfItem) navProfItem.style.display = 'none';
    document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'none');
    navigateTo('home');
  }
}

export async function checkUserSession(setUserCallback) {
  if (config.isDemoMode) {
    const savedUser = localStorage.getItem('cyclo_demo_user');
    if (savedUser) {
      loginMockUser(savedUser, setUserCallback);
    }
    return;
  }
  
  try {
    const { data: { session } } = await config.supabaseClient.auth.getSession();
    if (session) {
      const { data: profile, error } = await config.supabaseClient
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .single();
        
      if (error) throw error;
      
      setUser(profile, setUserCallback);
    } else {
      const savedUser = localStorage.getItem('cyclo_demo_user');
      if (savedUser) {
        config.isDemoMode = true;
        loginMockUser(savedUser, setUserCallback);
      } else {
        setUser(null, setUserCallback);
      }
    }
  } catch (e) {
    console.error("Fout bij controleren van sessie:", e);
    config.isDemoMode = true;
    const savedUser = localStorage.getItem('cyclo_demo_user');
    if (savedUser) loginMockUser(savedUser, setUserCallback);
  }
}

export async function handleLogin(e, setUserCallback) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  
  if (config.isDemoMode) {
    const found = state.profiles.find(p => p.username === email || email.includes(p.username));
    const userId = found ? found.id : 'demo-user-id';
    loginMockUser(userId, setUserCallback);
    showToast("Mock ingelogd in Demo Modus!", "success");
    return;
  }
  
  try {
    const { data, error } = await config.supabaseClient.auth.signInWithPassword({ email, password });
    if (error) throw error;
    
    const { data: profile, error: pError } = await config.supabaseClient
      .from('profiles')
      .select('*')
      .eq('id', data.user.id)
      .single();
      
    if (pError) throw pError;
    
    setUser(profile, setUserCallback);
    showToast(`Welkom terug, ${profile.full_name}!`, "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

export async function handleRegister(e, setUserCallback) {
  e.preventDefault();
  const username = document.getElementById('register-username').value.trim();
  const fullname = document.getElementById('register-fullname').value.trim();
  const email    = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;

  if (!username || !fullname || !email || !password) {
    showToast('Vul alle velden in.', 'error');
    return;
  }

  // ── Demo mode ──────────────────────────────────────────────────────────
  if (config.isDemoMode) {
    const newId = `user-${Date.now()}`;
    const newProfile = {
      id: newId,
      username: username.toLowerCase().replace(/\s+/g, ''),
      full_name: fullname,
      avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
      rider_score: 100,
      bike_type: 'Road'
    };
    let savedMockProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
    savedMockProfiles.push(newProfile);
    localStorage.setItem('cyclo_mock_profiles', JSON.stringify(savedMockProfiles));
    state.profiles.push(newProfile);
    loginMockUser(newId, setUserCallback);
    showToast('Account aangemaakt in Demo modus!', 'success');
    return;
  }

  // ── Live Supabase ──────────────────────────────────────────────────────
  const submitBtn = e.target?.querySelector('button[type="submit"]');
  if (submitBtn) { submitBtn.disabled = true; submitBtn.textContent = 'Bezig...'; }

  try {
    const { data, error } = await config.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.toLowerCase().replace(/\s+/g, ''),
          full_name: fullname,
          avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`
        }
      }
    });

    if (error) throw error;

    // Supabase kan twee scenario's hebben:
    // A) Email-verificatie AAN → user.identities = [], sessie = null → toon bevestigingsbericht
    // B) Email-verificatie UIT → direct ingelogd → wacht op onAuthStateChange

    // Email bevestiging nodig als: geen sessie, OF user.identities leeg (al geregistreerd maar niet bevestigd)
    const needsConfirmation = !data.session || (data.user && !data.user.email_confirmed_at && data.user.identities && data.user.identities.length === 0);
    if (needsConfirmation) {
      // Toon bevestigingspagina
      showRegistrationConfirmation(email);
      showToast('Registratie succesvol! Bevestig je e-mailadres.', 'success');
    } else {
      // Direct ingelogd (email confirm uitgeschakeld in Supabase)
      // Wacht even zodat Supabase de profile trigger kan uitvoeren
      // Extra veiligheid: als account niet bevestigd is maar Supabase toch een sessie geeft
      if (data.session && data.user && !data.user.email_confirmed_at) {
        await config.supabaseClient.auth.signOut();
        showRegistrationConfirmation(email);
        showToast('Bevestig je e-mailadres om in te loggen.', 'info');
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Registreren'; }
        return;
      }
      showToast('Account aangemaakt! Even geduld...', 'info');
      await new Promise(r => setTimeout(r, 1500));

      // Haal profiel op met de verse sessie
      const userId = data.session.user.id;
      let profile = null;

      // Probeer het profiel op te halen (kan even duren als trigger async is)
      for (let attempt = 0; attempt < 5; attempt++) {
        const { data: p } = await config.supabaseClient
          .from('profiles')
          .select('*')
          .eq('id', userId)
          .single();
        if (p) { profile = p; break; }
        await new Promise(r => setTimeout(r, 800));
      }

      if (profile) {
        setUser(profile, setUserCallback);
        showToast(`Welkom, ${profile.full_name}!`, 'success');
      } else {
        // Profiel nog niet aangemaakt door trigger — maak het handmatig aan
        const newProfile = {
          id: userId,
          username: username.toLowerCase().replace(/\s+/g, ''),
          full_name: fullname,
          avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`,
          rider_score: 0,
          bike_type: 'Road'
        };
        await config.supabaseClient.from('profiles').upsert([newProfile]);
        setUser(newProfile, setUserCallback);
        showToast(`Welkom, ${fullname}!`, 'success');
      }
    }
  } catch (err) {
    showToast(err.message, 'error');
  } finally {
    if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = 'Registreren'; }
  }
}

// ── Bevestigingsscherm na registratie ──────────────────────────────────
function showRegistrationConfirmation(email) {
  // Verberg inlog/registreer formulieren, toon bevestigingspanel
  const loginSection = document.getElementById('section-login');
  if (!loginSection) return;

  // Verwijder bestaand bevestigingspanel
  document.getElementById('register-confirm-panel')?.remove();

  const panel = document.createElement('div');
  panel.id = 'register-confirm-panel';
  panel.style.cssText = 'max-width:440px;margin:80px auto;text-align:center;padding:0 20px;';
  panel.innerHTML = `
    <div class="glass-panel" style="padding:40px 32px;">
      <div style="font-size:48px;margin-bottom:16px;">📧</div>
      <h2 style="font-size:20px;font-weight:800;margin-bottom:8px;">Controleer je e-mail</h2>
      <p style="color:var(--text-muted);font-size:13px;line-height:1.6;margin-bottom:20px;">
        We hebben een bevestigingslink gestuurd naar<br>
        <strong style="color:var(--primary);">${email}</strong><br><br>
        Klik op de link in je e-mail om je account te activeren en in te loggen.
      </p>
      <p style="font-size:11px;color:var(--text-muted);">Geen e-mail ontvangen? Controleer je spam-map.</p>
      <button class="btn btn-secondary btn-sm" style="margin-top:16px;" onclick="document.getElementById('register-confirm-panel').remove();">
        Terug naar inloggen
      </button>
    </div>
  `;

  loginSection.appendChild(panel);
}

export async function handleLogout(setUserCallback) {
  localStorage.removeItem('cyclo_demo_user');
  
  const wasDemo = config.isDemoMode;
  if (config.supabaseClient) {
    config.isDemoMode = false;
  }
  
  if (wasDemo) {
    setUser(null, setUserCallback);
    showToast("Uitgelogd uit demo modus.", "info");
    return;
  }
  
  try {
    const { error } = await config.supabaseClient.auth.signOut();
    if (error) throw error;
    
    setUser(null, setUserCallback);
    showToast("Succesvol uitgelogd.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

export function loginMockUser(userId, setUserCallback) {
  let profiles = [...MOCK_PROFILES];
  const extraProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
  
  extraProfiles.forEach(extra => {
    const idx = profiles.findIndex(p => p.id === extra.id);
    if (idx !== -1) {
      profiles[idx] = extra;
    } else {
      profiles.push(extra);
    }
  });
  
  const user = profiles.find(p => p.id === userId) || profiles[0];
  localStorage.setItem('cyclo_demo_user', user.id);
  
  state.profiles = profiles;
  setUser(user, setUserCallback);
}

export function openEditProfileModal() {
  if (!state.user) return;
  elements.profileModalFullname.value = state.user.full_name || '';
  elements.profileModalUsername.value = state.user.username || '';
  elements.profileModalBiketype.value = state.user.bike_type || 'Road';
  
  // Fysieke gegevens inladen
  document.getElementById('profile-modal-gender').value = state.user.gender || '';
  document.getElementById('profile-modal-birthdate').value = state.user.birthdate || '';
  document.getElementById('profile-modal-height').value = state.user.height || '';
  document.getElementById('profile-modal-weight').value = state.user.weight || '';
  
  // Reset tabs to Algemeen
  document.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === 'tab-profile-general');
  });
  document.querySelectorAll('.modal-tab-content').forEach(content => {
    content.style.display = content.id === 'tab-profile-general' ? 'block' : 'none';
  });

  const previewImg = document.getElementById('profile-modal-preview-avatar');
  const avatarInput = document.getElementById('profile-modal-avatar');
  
  if (previewImg) {
    previewImg.src = state.user.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${state.user.username}`;
    previewImg.dataset.uploadedPhoto = '';
  }

  // Actieve state initialiseren
  let isCustom = false;
  let isBase64 = false;
  let seed = '';

  if (state.user.avatar_url) {
    if (state.user.avatar_url.startsWith('data:image/')) {
      isBase64 = true;
      if (previewImg) previewImg.dataset.uploadedPhoto = state.user.avatar_url;
      if (avatarInput) avatarInput.value = 'base64';
    } else if (state.user.avatar_url.includes('seed=custom')) {
      isCustom = true;
      if (avatarInput) avatarInput.value = 'custom';
      try {
        const url = new URL(state.user.avatar_url);
        customizerState.bg = url.searchParams.get('backgroundColor') || 'transparent';
        customizerState.skin = url.searchParams.get('skinColor') || 'f2d3b1';
        customizerState.hair = url.searchParams.get('hair') || 'short01';
        customizerState.haircolor = url.searchParams.get('hairColor') || '0e0e0e';
        customizerState.eyebrows = url.searchParams.get('eyebrows') || 'variant01';
        customizerState.eyes = url.searchParams.get('eyes') || 'variant01';
        customizerState.mouth = url.searchParams.get('mouth') || 'variant01';
        
        // Parse hairProbability
        const hairProb = url.searchParams.get('hairProbability');
        if (hairProb === '0') {
          customizerState.hair = 'none';
        }
        
        // Parse features
        const glassesProb = url.searchParams.get('glassesProbability');
        const featuresParam = url.searchParams.get('features') || '';
        const featuresProb = url.searchParams.get('featuresProbability');
        
        if (glassesProb === '100') {
          customizerState.features = 'glasses';
        } else if (featuresProb === '100' && featuresParam.includes('mustache')) {
          customizerState.features = 'mustache';
        } else {
          customizerState.features = 'none';
        }
      } catch (err) {
        console.error("Fout bij parsen avatar URL:", err);
      }
    } else if (state.user.avatar_url.includes('seed=')) {
      const parts = state.user.avatar_url.split('seed=');
      if (parts.length > 1) {
        seed = parts[1].split('&')[0];
      }
      if (avatarInput) avatarInput.value = seed;
    }
  }

  // Highlight visual elements
  if (isCustom) {
    highlightVisualCustomizer(customizerState);
  } else {
    // Standaard customizer initialiseren met default waardes
    customizerState.bg = 'transparent';
    customizerState.skin = 'f2d3b1';
    customizerState.hair = 'short01';
    customizerState.haircolor = '0e0e0e';
    customizerState.eyebrows = 'variant01';
    customizerState.eyes = 'variant01';
    customizerState.mouth = 'variant01';
    customizerState.features = 'none';
    highlightVisualCustomizer(customizerState);
  }

  // Highlight presets
  document.querySelectorAll('.avatar-preset-chip').forEach(chip => {
    chip.classList.toggle('active', chip.dataset.seed === seed && !isCustom && !isBase64);
  });

  elements.profileModal.classList.add('active');
}

export function closeEditProfileModal() {
  elements.profileModal.classList.remove('active');
}

export async function saveProfileUpdate(e, onProfileUpdatedCallback) {
  e.preventDefault();
  const fullName = elements.profileModalFullname.value.trim();
  const username = elements.profileModalUsername.value.trim().toLowerCase();
  const bikeType = elements.profileModalBiketype.value;
  const avatarInput = document.getElementById('profile-modal-avatar');
  const avatarSeed = avatarInput ? avatarInput.value.trim() : '';

  // Fysieke gegevens uitlezen
  const gender = document.getElementById('profile-modal-gender').value || null;
  const birthdate = document.getElementById('profile-modal-birthdate').value || null;
  const heightVal = document.getElementById('profile-modal-height').value;
  const weightVal = document.getElementById('profile-modal-weight').value;
  
  const height = heightVal ? parseInt(heightVal) : null;
  const weight = weightVal ? parseFloat(weightVal) : null;

  if (username.length < 3) {
    showToast("Gebruikersnaam moet minimaal 3 tekens zijn.", "error");
    return;
  }

  let avatarUrl = '';
  const previewImg = document.getElementById('profile-modal-preview-avatar');

  if (avatarSeed === 'base64') {
    avatarUrl = previewImg.dataset.uploadedPhoto || state.user.avatar_url;
  } else if (avatarSeed === 'custom') {
    avatarUrl = buildCustomAvatarUrl(customizerState);
  } else {
    avatarUrl = avatarSeed ? 
      `https://api.dicebear.com/7.x/adventurer/svg?seed=${avatarSeed}` : 
      (state.user.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`);
  }

  if (config.isDemoMode) {
    let savedMockProfiles = JSON.parse(localStorage.getItem('cyclo_mock_profiles') || '[]');
    const idx = savedMockProfiles.findIndex(p => p.id === state.user.id);
    const updatedProfile = {
      ...state.user,
      full_name: fullName,
      username: username,
      bike_type: bikeType,
      avatar_url: avatarUrl,
      gender: gender,
      birthdate: birthdate,
      height: height,
      weight: weight
    };

    if (idx !== -1) {
      savedMockProfiles[idx] = updatedProfile;
    } else {
      savedMockProfiles.push(updatedProfile);
    }
    localStorage.setItem('cyclo_mock_profiles', JSON.stringify(savedMockProfiles));

    state.user = updatedProfile;
    const pIdx = state.profiles.findIndex(p => p.id === state.user.id);
    if (pIdx !== -1) {
      state.profiles[pIdx] = updatedProfile;
    } else {
      state.profiles.push(updatedProfile);
    }

    // Update sidebar direct
    elements.widgetUserName.textContent = fullName;
    elements.widgetUserUsername.textContent = `@${username}`;
    elements.widgetUserAvatar.src = avatarUrl;
    elements.widgetUserBiketype.textContent = translateBikeType(bikeType);
    updatePhysicalWidget(updatedProfile);

    showToast("Profiel lokaal bijgewerkt!", "success");
    closeEditProfileModal();
    if (typeof onProfileUpdatedCallback === 'function') onProfileUpdatedCallback();
    return;
  }

  try {
    const { error } = await config.supabaseClient
      .from('profiles')
      .update({
        full_name: fullName,
        username: username,
        bike_type: bikeType,
        avatar_url: avatarUrl,
        gender: gender,
        birthdate: birthdate,
        height: height,
        weight: weight
      })
      .eq('id', state.user.id);

    if (error) throw error;

    state.user.full_name = fullName;
    state.user.username = username;
    state.user.bike_type = bikeType;
    state.user.avatar_url = avatarUrl;
    state.user.gender = gender;
    state.user.birthdate = birthdate;
    state.user.height = height;
    state.user.weight = weight;
    
    const pIdx = state.profiles.findIndex(p => p.id === state.user.id);
    if (pIdx !== -1) {
      state.profiles[pIdx].full_name = fullName;
      state.profiles[pIdx].username = username;
      state.profiles[pIdx].bike_type = bikeType;
      state.profiles[pIdx].avatar_url = avatarUrl;
      state.profiles[pIdx].gender = gender;
      state.profiles[pIdx].birthdate = birthdate;
      state.profiles[pIdx].height = height;
      state.profiles[pIdx].weight = weight;
    }

    // Update sidebar direct
    elements.widgetUserName.textContent = fullName;
    elements.widgetUserUsername.textContent = `@${username}`;
    elements.widgetUserAvatar.src = avatarUrl;
    elements.widgetUserBiketype.textContent = translateBikeType(bikeType);
    updatePhysicalWidget(state.user);

    showToast("Profiel succesvol bijgewerkt!", "success");
    closeEditProfileModal();
    if (typeof onProfileUpdatedCallback === 'function') onProfileUpdatedCallback();
  } catch (err) {
    showToast("Fout bij bijwerken profiel: " + err.message, "error");
  }
}

// --- Visual Avatar Editor & Custom Photo Uploader States ---
const customizerState = {
  bg: 'transparent',
  skin: 'f2d3b1',
  hair: 'short01',
  haircolor: '0e0e0e',
  eyebrows: 'variant01',
  eyes: 'variant01',
  mouth: 'variant01',
  features: 'none'
};

function buildCustomAvatarUrl(stateObj) {
  let url = `https://api.dicebear.com/7.x/adventurer/svg?seed=custom&skinColor=${stateObj.skin}&hairColor=${stateObj.haircolor}&eyes=${stateObj.eyes}&mouth=${stateObj.mouth}&eyebrows=${stateObj.eyebrows}`;
  
  if (stateObj.bg !== 'transparent') {
    url += `&backgroundColor=${stateObj.bg}`;
  }
  
  if (stateObj.hair === 'none') {
    url += `&hairProbability=0`;
  } else {
    url += `&hairProbability=100&hair=${stateObj.hair}`;
  }
  
  if (stateObj.features === 'glasses') {
    url += `&glassesProbability=100&glasses=variant01&featuresProbability=0`;
  } else if (stateObj.features === 'mustache') {
    url += `&glassesProbability=0&features=mustache&featuresProbability=100`;
  } else {
    url += `&glassesProbability=0&featuresProbability=0`;
  }
  
  return url;
}

function updateCustomAvatarFromVisualOptions() {
  const customUrl = buildCustomAvatarUrl(customizerState);
  
  const previewImg = document.getElementById('profile-modal-preview-avatar');
  if (previewImg) {
    previewImg.src = customUrl;
    previewImg.dataset.uploadedPhoto = ''; // Clear uploaded photo when visual editor is used
  }
  
  const avatarInput = document.getElementById('profile-modal-avatar');
  if (avatarInput) avatarInput.value = 'custom';
  
  // Deselect presets
  document.querySelectorAll('.avatar-preset-chip').forEach(c => c.classList.remove('active'));
}

function highlightVisualCustomizer(stateObj) {
  // Background
  document.querySelectorAll('#swatches-bg .swatch-circle').forEach(el => {
    el.classList.toggle('active', el.dataset.val === stateObj.bg);
  });
  // Skin
  document.querySelectorAll('#swatches-skin .swatch-circle').forEach(el => {
    el.classList.toggle('active', el.dataset.val === stateObj.skin);
  });
  // Hair color
  document.querySelectorAll('#swatches-haircolor .swatch-circle').forEach(el => {
    el.classList.toggle('active', el.dataset.val === stateObj.haircolor);
  });
  // Hair style
  document.querySelectorAll('#chips-hair .choice-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.val === stateObj.hair);
  });
  // Eyebrows
  document.querySelectorAll('#chips-eyebrows .choice-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.val === stateObj.eyebrows);
  });
  // Eyes
  document.querySelectorAll('#chips-eyes .choice-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.val === stateObj.eyes);
  });
  // Mouth
  document.querySelectorAll('#chips-mouth .choice-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.val === stateObj.mouth);
  });
  // Features
  document.querySelectorAll('#chips-features .choice-chip').forEach(el => {
    el.classList.toggle('active', el.dataset.val === stateObj.features);
  });
}

export function setupAvatarEventListeners() {
  const previewImg = document.getElementById('profile-modal-preview-avatar');
  const btnRandom = document.getElementById('btn-randomize-avatar');
  const presetsContainer = document.getElementById('avatar-presets-container');
  const avatarInput = document.getElementById('profile-modal-avatar');

  // --- 1. TABS SWITCHING ---
  document.querySelectorAll('.modal-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.tab;
      
      // Update active button state
      document.querySelectorAll('.modal-tab-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      // Show/Hide tab content
      document.querySelectorAll('.modal-tab-content').forEach(content => {
        content.style.display = content.id === targetId ? 'block' : 'none';
      });
    });
  });

  // --- 1.2. HAIR STYLE FILTERING ---
  const hairFilterBtns = document.querySelectorAll('#hair-filter-buttons button');
  if (hairFilterBtns.length) {
    hairFilterBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        // Update active filter button state
        hairFilterBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const filter = btn.dataset.filter;
        document.querySelectorAll('#chips-hair .choice-chip').forEach(chip => {
          const val = chip.dataset.val;
          if (filter === 'all' || val === 'none') {
            chip.style.display = 'block';
          } else if (filter === 'short') {
            chip.style.display = val.startsWith('short') ? 'block' : 'none';
          } else if (filter === 'long') {
            chip.style.display = val.startsWith('long') ? 'block' : 'none';
          }
        });
      });
    });
  }

  // --- 2. FILE UPLOADER (BASE64) ---
  const dropzone = document.getElementById('avatar-photo-dropzone');
  const fileInput = document.getElementById('avatar-photo-file-input');

  if (dropzone && fileInput) {
    dropzone.addEventListener('click', () => fileInput.click());

    dropzone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropzone.classList.add('dragover');
    });

    ['dragleave', 'drop'].forEach(eventName => {
      dropzone.addEventListener(eventName, () => dropzone.classList.remove('dragover'));
    });

    dropzone.addEventListener('drop', (e) => {
      e.preventDefault();
      if (e.dataTransfer.files.length) {
        handleFileSelect(e.dataTransfer.files[0]);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length) {
        handleFileSelect(e.target.files[0]);
      }
    });
  }

  function handleFileSelect(file) {
    if (!file.type.match('image.*')) {
      showToast("Selecteer a.u.b. een afbeelding (PNG of JPG).", "error");
      return;
    }

    // Check size (limiteer tot ~2MB voor localStorage performance)
    if (file.size > 2 * 1024 * 1024) {
      showToast("Afbeelding is te groot. Maximaal 2MB.", "error");
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const base64Url = e.target.result;
      if (previewImg) {
        previewImg.src = base64Url;
        previewImg.dataset.uploadedPhoto = base64Url;
      }
      if (avatarInput) avatarInput.value = 'base64';

      // Reset presets & swatches active class
      document.querySelectorAll('.avatar-preset-chip, .swatch-circle, .choice-chip').forEach(el => el.classList.remove('active'));
      
      showToast("Foto succesvol geladen!", "success");
    };
    reader.readAsDataURL(file);
  }

  // --- 3. SWATCHES & CHIPS LISTENERS ---
  const visualOptions = document.querySelectorAll('.swatch-circle, .choice-chip');
  visualOptions.forEach(opt => {
    opt.addEventListener('click', () => {
      const prop = opt.dataset.prop;
      const val = opt.dataset.val;

      // Update state
      customizerState[prop] = val;

      // Highlight in DOM (enkel binnen dezelfde groep)
      const siblings = opt.parentElement.querySelectorAll(opt.tagName.toLowerCase());
      siblings.forEach(s => s.classList.remove('active'));
      opt.classList.add('active');

      // Update live preview
      updateCustomAvatarFromVisualOptions();
    });
  });

  // --- 4. PRESETS (WIELERHELDEN) ---
  if (presetsContainer && previewImg && avatarInput) {
    presetsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.avatar-preset-chip');
      if (!chip) return;

      const seed = chip.dataset.seed;
      avatarInput.value = seed;
      previewImg.src = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
      previewImg.dataset.uploadedPhoto = '';

      // Reset preset highlight & swatches highlight
      document.querySelectorAll('.avatar-preset-chip, .swatch-circle, .choice-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      showToast(`Held ${chip.title || seed} geselecteerd!`, "success");
    });
  }

  // --- 5. RANDOMIZER (🎲 VERRAS ME) ---
  if (btnRandom && previewImg && avatarInput) {
    btnRandom.addEventListener('click', () => {
      const bgOptions = ['transparent', 'b6e3f4', 'd4ff00', '00f0ff', '0f1420'];
      const skinOptions = ['f2d3b1', 'ecad80', '9e5622', '763900'];
      const hairOptions = ['short01', 'long01', 'short05', 'long03', 'none'];
      const hairColorOptions = ['0e0e0e', '6a4e35', 'e5d7a3', 'ab2a18', 'afafaf'];
      const eyebrowsOptions = ['variant01', 'variant05', 'variant09', 'variant10'];
      const eyesOptions = ['variant01', 'variant03', 'variant11', 'variant15'];
      const mouthOptions = ['variant01', 'variant05', 'variant10'];
      const featureOptions = ['none', 'glasses', 'mustache'];

      const getRandom = (arr) => arr[Math.floor(Math.random() * arr.length)];

      customizerState.bg = getRandom(bgOptions);
      customizerState.skin = getRandom(skinOptions);
      customizerState.hair = getRandom(hairOptions);
      customizerState.haircolor = getRandom(hairColorOptions);
      customizerState.eyebrows = getRandom(eyebrowsOptions);
      customizerState.eyes = getRandom(eyesOptions);
      customizerState.mouth = getRandom(mouthOptions);
      customizerState.features = getRandom(featureOptions);

      highlightVisualCustomizer(customizerState);
      updateCustomAvatarFromVisualOptions();

      showToast("Nieuwe custom avatar gegenereerd!", "info");
    });
  }
}

