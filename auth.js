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

