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
    
    if (userProfile.rider_score) {
      elements.widgetUserScoreVal.textContent = userProfile.rider_score;
      elements.widgetUserScoreContainer.style.display = 'flex';
    } else {
      elements.widgetUserScoreContainer.style.display = 'none';
    }
    
    // Toon rittenlink
    document.querySelectorAll('.auth-only').forEach(el => el.style.display = 'block');
    
    // Ga naar dashboard
    navigateTo('dashboard', setUserCallback);
  } else {
    // Uitgelogd
    elements.navAuthItem.innerHTML = `<a href="#" class="btn btn-primary btn-sm" id="btn-login-nav">Inloggen</a>`;
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
  const email = document.getElementById('register-email').value.trim();
  const password = document.getElementById('register-password').value;
  
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
    
    // Voeg toe aan lopende profiles
    state.profiles.push(newProfile);
    
    loginMockUser(newId, setUserCallback);
    showToast("Account aangemaakt in Demo modus!", "success");
    return;
  }
  
  try {
    const { data, error } = await config.supabaseClient.auth.signUp({
      email,
      password,
      options: {
        data: {
          username: username.toLowerCase(),
          full_name: fullname,
          avatar_url: `https://api.dicebear.com/7.x/adventurer/svg?seed=${username}`
        }
      }
    });
    
    if (error) throw error;
    
    showToast("Registratie succesvol! Controleer je e-mail voor de activatie.", "success");
    
    if (data.user) {
      setTimeout(async () => {
        const { data: profile } = await config.supabaseClient.from('profiles').select('*').eq('id', data.user.id).single();
        if (profile) setUser(profile, setUserCallback);
      }, 1000);
    }
  } catch (err) {
    showToast(err.message, "error");
  }
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
  
  let seed = '';
  if (state.user.avatar_url) {
    if (state.user.avatar_url.includes('seed=')) {
      const parts = state.user.avatar_url.split('seed=');
      if (parts.length > 1) {
        seed = parts[1].split('&')[0];
      }
    }
  }
  elements.profileModalAvatar.value = seed;

  // Live preview afbeelding updaten
  const previewImg = document.getElementById('profile-modal-preview-avatar');
  if (previewImg) {
    previewImg.src = state.user.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${state.user.username}`;
  }

  // Checken of we custom URL parameters hebben
  if (state.user.avatar_url && state.user.avatar_url.includes('seed=custom')) {
    try {
      const url = new URL(state.user.avatar_url);
      const skinColor = url.searchParams.get('skinColor') || 'f5c096';
      const hair = url.searchParams.get('hair') || 'short01';
      const hairColor = url.searchParams.get('hairColor') || '090807';
      const eyes = url.searchParams.get('eyes') || 'normal';
      const mouth = url.searchParams.get('mouth') || 'smile';
      const features = url.searchParams.get('features') || 'none';
      
      document.getElementById('custom-avatar-skin').value = skinColor;
      document.getElementById('custom-avatar-hair').value = hair;
      document.getElementById('custom-avatar-haircolor').value = hairColor;
      document.getElementById('custom-avatar-eyes').value = eyes;
      document.getElementById('custom-avatar-mouth').value = mouth;
      document.getElementById('custom-avatar-features').value = features;
      
      document.getElementById('avatar-customizer-options').style.display = 'block';
    } catch (err) {
      console.error("Fout bij laden van custom avatar params:", err);
    }
  } else {
    document.getElementById('avatar-customizer-options').style.display = 'none';
  }

  // Actieve preset chip highlighten
  document.querySelectorAll('.avatar-preset-chip').forEach(chip => {
    if (chip.dataset.seed === seed) {
      chip.classList.add('active');
    } else {
      chip.classList.remove('active');
    }
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
  const avatarSeed = elements.profileModalAvatar.value.trim();

  if (username.length < 3) {
    showToast("Gebruikersnaam moet minimaal 3 tekens zijn.", "error");
    return;
  }

  let avatarUrl = '';
  if (avatarSeed === 'custom') {
    const skinColor = document.getElementById('custom-avatar-skin').value;
    const hair = document.getElementById('custom-avatar-hair').value;
    const hairColor = document.getElementById('custom-avatar-haircolor').value;
    const eyes = document.getElementById('custom-avatar-eyes').value;
    const mouth = document.getElementById('custom-avatar-mouth').value;
    const features = document.getElementById('custom-avatar-features').value;
    
    avatarUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=custom&skinColor=${skinColor}&hair=${hair}&hairColor=${hairColor}&eyes=${eyes}&mouth=${mouth}&features=${features}`;
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
      avatar_url: avatarUrl
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
        avatar_url: avatarUrl
      })
      .eq('id', state.user.id);

    if (error) throw error;

    // Direct in local state updaten
    state.user.full_name = fullName;
    state.user.username = username;
    state.user.bike_type = bikeType;
    state.user.avatar_url = avatarUrl;
    
    const pIdx = state.profiles.findIndex(p => p.id === state.user.id);
    if (pIdx !== -1) {
      state.profiles[pIdx].full_name = fullName;
      state.profiles[pIdx].username = username;
      state.profiles[pIdx].bike_type = bikeType;
      state.profiles[pIdx].avatar_url = avatarUrl;
    }

    showToast("Profiel succesvol bijgewerkt!", "success");
    closeEditProfileModal();
    if (typeof onProfileUpdatedCallback === 'function') onProfileUpdatedCallback();
  } catch (err) {
    showToast("Fout bij bijwerken profiel: " + err.message, "error");
  }
}

export function setupAvatarEventListeners() {
  const previewImg = document.getElementById('profile-modal-preview-avatar');
  const btnRandom = document.getElementById('btn-randomize-avatar');
  const presetsContainer = document.getElementById('avatar-presets-container');
  const btnToggle = document.getElementById('btn-toggle-customizer');
  const customizerOptions = document.getElementById('avatar-customizer-options');
  
  function updateCustomAvatarFromDropdowns() {
    const skinColor = document.getElementById('custom-avatar-skin').value;
    const hair = document.getElementById('custom-avatar-hair').value;
    const hairColor = document.getElementById('custom-avatar-haircolor').value;
    const eyes = document.getElementById('custom-avatar-eyes').value;
    const mouth = document.getElementById('custom-avatar-mouth').value;
    const features = document.getElementById('custom-avatar-features').value;
    
    const customUrl = `https://api.dicebear.com/7.x/adventurer/svg?seed=custom&skinColor=${skinColor}&hair=${hair}&hairColor=${hairColor}&eyes=${eyes}&mouth=${mouth}&features=${features}`;
    
    if (previewImg) previewImg.src = customUrl;
    elements.profileModalAvatar.value = 'custom';
    
    document.querySelectorAll('.avatar-preset-chip').forEach(c => c.classList.remove('active'));
  }

  if (btnToggle && customizerOptions) {
    btnToggle.addEventListener('click', () => {
      const isHidden = customizerOptions.style.display === 'none';
      customizerOptions.style.display = isHidden ? 'block' : 'none';
      if (isHidden) {
        updateCustomAvatarFromDropdowns();
      }
    });
  }

  const customSelects = [
    'custom-avatar-skin',
    'custom-avatar-hair',
    'custom-avatar-haircolor',
    'custom-avatar-eyes',
    'custom-avatar-mouth',
    'custom-avatar-features'
  ];
  customSelects.forEach(id => {
    const select = document.getElementById(id);
    if (select) {
      select.addEventListener('change', updateCustomAvatarFromDropdowns);
    }
  });
  
  if (elements.profileModalAvatar && previewImg) {
    // Live preview bijwerken als gebruiker typt
    elements.profileModalAvatar.addEventListener('input', (e) => {
      const seed = e.target.value.trim();
      
      // Indien handmatig getypt en niet 'custom', sluit customizer details panel
      if (seed !== 'custom' && customizerOptions) {
        customizerOptions.style.display = 'none';
      }

      const url = seed ? 
        `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}` : 
        (state.user ? state.user.avatar_url : `https://api.dicebear.com/7.x/adventurer/svg?seed=demo`);
      previewImg.src = url;
      
      // Update actieve presets highlight
      document.querySelectorAll('.avatar-preset-chip').forEach(chip => {
        if (chip.dataset.seed === seed) {
          chip.classList.add('active');
        } else {
          chip.classList.remove('active');
        }
      });
    });
  }

  if (btnRandom && previewImg && elements.profileModalAvatar) {
    // Willekeurige avatar genereren
    btnRandom.addEventListener('click', () => {
      if (customizerOptions) customizerOptions.style.display = 'none';
      
      const randomSeed = Math.random().toString(36).substring(2, 10);
      elements.profileModalAvatar.value = randomSeed;
      
      previewImg.src = `https://api.dicebear.com/7.x/adventurer/svg?seed=${randomSeed}`;
      document.querySelectorAll('.avatar-preset-chip').forEach(c => c.classList.remove('active'));
      
      showToast("Nieuwe avatar gegenereerd!", "info");
    });
  }

  if (presetsContainer && previewImg && elements.profileModalAvatar) {
    // Preset wielerheld selecteren
    presetsContainer.addEventListener('click', (e) => {
      const chip = e.target.closest('.avatar-preset-chip');
      if (!chip) return;
      
      if (customizerOptions) customizerOptions.style.display = 'none';
      
      const seed = chip.dataset.seed;
      elements.profileModalAvatar.value = seed;
      
      previewImg.src = `https://api.dicebear.com/7.x/adventurer/svg?seed=${seed}`;
      
      document.querySelectorAll('.avatar-preset-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      
      showToast(`Held ${chip.title || seed} geselecteerd!`, "success");
    });
  }
}

