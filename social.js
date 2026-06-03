// Cyclo - Social Feed Module
import { state, config, showToast } from './state.js';
import { renderZoneBar, buildElevationData } from './zones.js';

// ─── Load Social Feed ─────────────────────────────────────────────────────────
export async function loadSocialFeed() {
  if (config.isDemoMode) {
    return (state.activities || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  try {
    const { data: follows } = await config.supabaseClient
      .from('follows').select('following_id').eq('follower_id', state.user.id);
    const followedIds = (follows || []).map(f => f.following_id);
    followedIds.push(state.user.id);

    const { data: activities, error } = await config.supabaseClient
      .from('activities')
      .select('*, profiles(full_name, avatar_url, username, rider_score)')
      .in('user_id', followedIds)
      .order('date', { ascending: false })
      .limit(50);
    if (error) throw error;
    return activities || [];
  } catch (err) {
    console.error('Feed error:', err);
    return [];
  }
}

// ─── Follow / Unfollow ────────────────────────────────────────────────────────
export async function followUser(userId) {
  if (config.isDemoMode) { showToast('Volgen werkt niet in demo modus.', 'error'); return false; }
  try {
    const { error } = await config.supabaseClient
      .from('follows').insert({ follower_id: state.user.id, following_id: userId });
    if (error) throw error;
    showToast('Je volgt nu deze gebruiker!', 'success');
    return true;
  } catch (err) { showToast('Kon niet volgen: ' + err.message, 'error'); return false; }
}

export async function unfollowUser(userId) {
  if (config.isDemoMode) return false;
  try {
    const { error } = await config.supabaseClient
      .from('follows').delete().eq('follower_id', state.user.id).eq('following_id', userId);
    if (error) throw error;
    showToast('Je volgt deze gebruiker niet meer.', 'info');
    return true;
  } catch (err) { return false; }
}

export async function getFollowStatus(userId) {
  if (config.isDemoMode || !state.user) return false;
  try {
    const { data } = await config.supabaseClient.from('follows')
      .select('follower_id').eq('follower_id', state.user.id).eq('following_id', userId).maybeSingle();
    return !!data;
  } catch (_) { return false; }
}

export async function getFollowCounts(userId) {
  if (config.isDemoMode) return { followers: 0, following: 0 };
  try {
    const [frs, fng] = await Promise.all([
      config.supabaseClient.from('follows').select('follower_id', { count: 'exact', head: true }).eq('following_id', userId),
      config.supabaseClient.from('follows').select('following_id', { count: 'exact', head: true }).eq('follower_id', userId)
    ]);
    return { followers: frs.count || 0, following: fng.count || 0 };
  } catch (_) { return { followers: 0, following: 0 }; }
}

// ─── Search Users ─────────────────────────────────────────────────────────────
export async function searchUsers(query) {
  if (!query || query.trim().length < 2) return [];
  const q = query.trim().toLowerCase();
  if (config.isDemoMode) {
    return state.profiles.filter(p =>
      p.id !== state.user?.id &&
      (p.full_name?.toLowerCase().includes(q) || p.username?.toLowerCase().includes(q))
    );
  }
  try {
    const { data, error } = await config.supabaseClient.from('profiles')
      .select('*').or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
      .neq('id', state.user?.id).limit(10);
    if (error) throw error;
    return data || [];
  } catch (err) { return []; }
}

// ─── Kudos ────────────────────────────────────────────────────────────────────
export async function loadKudos(activityId) {
  if (config.isDemoMode) {
    const all = JSON.parse(localStorage.getItem('cyclo_kudos') || '{}');
    return all[activityId] || [];
  }
  try {
    const { data } = await config.supabaseClient.from('kudos')
      .select('user_id, profiles(full_name)').eq('activity_id', activityId);
    return data || [];
  } catch (_) { return []; }
}

export async function toggleKudo(activityId) {
  if (!state.user) return null;
  if (config.isDemoMode) {
    const all = JSON.parse(localStorage.getItem('cyclo_kudos') || '{}');
    if (!all[activityId]) all[activityId] = [];
    const idx = all[activityId].indexOf(state.user.id);
    if (idx >= 0) { all[activityId].splice(idx, 1); }
    else          { all[activityId].push(state.user.id); }
    localStorage.setItem('cyclo_kudos', JSON.stringify(all));
    return idx < 0; // true = nu actief
  }
  try {
    const { data: existing } = await config.supabaseClient.from('kudos')
      .select('user_id').eq('activity_id', activityId).eq('user_id', state.user.id).maybeSingle();
    if (existing) {
      await config.supabaseClient.from('kudos')
        .delete().eq('activity_id', activityId).eq('user_id', state.user.id);
      return false;
    } else {
      await config.supabaseClient.from('kudos')
        .insert({ activity_id: activityId, user_id: state.user.id });
      return true;
    }
  } catch (_) { return null; }
}

// ─── Comments ─────────────────────────────────────────────────────────────────
export async function loadComments(activityId) {
  if (config.isDemoMode) {
    const all = JSON.parse(localStorage.getItem('cyclo_comments') || '{}');
    return all[activityId] || [];
  }
  try {
    const { data } = await config.supabaseClient.from('comments')
      .select('*, profiles(full_name, avatar_url)')
      .eq('activity_id', activityId)
      .order('created_at', { ascending: true });
    return data || [];
  } catch (_) { return []; }
}

export async function postComment(activityId, content) {
  if (!content.trim()) return null;
  if (config.isDemoMode) {
    const all = JSON.parse(localStorage.getItem('cyclo_comments') || '{}');
    if (!all[activityId]) all[activityId] = [];
    const myProfile = state.profiles?.find(p => p.id === state.user?.id) || {};
    all[activityId].push({
      id: `c-${Date.now()}`,
      user_id: state.user?.id,
      content,
      created_at: new Date().toISOString(),
      profiles: { full_name: myProfile.full_name || 'Jij', avatar_url: myProfile.avatar_url }
    });
    localStorage.setItem('cyclo_comments', JSON.stringify(all));
    return all[activityId].at(-1);
  }
  try {
    const { data, error } = await config.supabaseClient.from('comments')
      .insert({ activity_id: activityId, user_id: state.user.id, content: content.trim() })
      .select('*, profiles(full_name, avatar_url)').single();
    if (error) throw error;
    return data;
  } catch (err) { showToast('Reageren mislukt: ' + err.message, 'error'); return null; }
}

// ─── Hoogteprofiel renderen (Chart.js) ────────────────────────────────────────
function renderElevationChart(container, coordinates) {
  if (!coordinates || coordinates.length < 5) return;
  const elevData = buildElevationData(coordinates);
  if (!elevData) return;

  const wrap = document.createElement('div');
  wrap.className = 'elevation-chart-wrap';
  wrap.innerHTML = `<div class="elevation-chart-label">⛰ Hoogteprofiel</div>`;

  const canvas = document.createElement('canvas');
  canvas.height = 60;
  wrap.appendChild(canvas);
  container.appendChild(wrap);

  if (typeof Chart === 'undefined') return;

  // Gradient fill
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0, 0, 0, 60);
  grad.addColorStop(0, 'rgba(212,255,0,0.35)');
  grad.addColorStop(1, 'rgba(212,255,0,0.02)');

  new Chart(canvas, {
    type: 'line',
    data: {
      labels: elevData.labels,
      datasets: [{
        data: elevData.elevs,
        borderColor: 'rgba(212,255,0,0.8)',
        borderWidth: 1.5,
        backgroundColor: grad,
        pointRadius: 0,
        fill: true,
        tension: 0.4,
      }]
    },
    options: {
      responsive: true,
      animation: false,
      plugins: { legend: { display: false }, tooltip: {
        callbacks: {
          label: ctx => `${Math.round(ctx.raw)}m hoogte`,
          title: ctx => `${ctx[0].label} km`
        }
      }},
      scales: {
        x: { display: false },
        y: {
          display: true,
          grid: { color: 'rgba(255,255,255,0.04)' },
          ticks: { color: 'rgba(255,255,255,0.3)', font: { size: 9 }, maxTicksLimit: 4 }
        }
      }
    }
  });
}

// ─── Render Feed Card ─────────────────────────────────────────────────────────
export function renderFeedCard(act, profileData) {
  const profile  = profileData || state.profiles.find(p => p.id === act.user_id) || {};
  const name     = profile.full_name || profile.name || 'Onbekend';
  const avatar   = profile.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${act.user_id}`;
  const username = profile.username || '';
  const score    = act.rider_score || 0;
  const isOwn    = act.user_id === state.user?.id;

  const dateStr = new Intl.DateTimeFormat('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date(act.date));

  const durSec = parseFloat(act.duration_secs || 0);
  const hours  = Math.floor(durSec / 3600);
  const mins   = Math.floor((durSec % 3600) / 60);
  const dur    = hours > 0 ? `${hours}u ${mins}m` : `${mins}m`;

  const card = document.createElement('div');
  card.className = 'feed-card';
  card.dataset.activityId = act.id;
  card.dataset.userId     = act.user_id;

  // Kudos teller uit demo-cache
  let kudosCount = 0;
  let myKudo     = false;
  if (config.isDemoMode) {
    const kmap = JSON.parse(localStorage.getItem('cyclo_kudos') || '{}');
    const kArr = kmap[act.id] || [];
    kudosCount = kArr.length;
    myKudo = kArr.includes(state.user?.id);
  }

  card.innerHTML = `
    <div class="feed-card-header">
      <div class="feed-user-info" data-user-id="${act.user_id}" style="cursor:pointer;">
        <img src="${avatar}" alt="${name}" class="feed-avatar">
        <div>
          <div class="feed-user-name">${name}</div>
          <div class="feed-meta">${username ? '@' + username + ' · ' : ''}${dateStr}</div>
        </div>
      </div>
      <div class="feed-score-pill">${score} pts</div>
    </div>

    <div class="feed-activity-title">${act.name || 'Rit'}</div>

    <div class="feed-stats">
      <div class="feed-stat">
        <div class="feed-stat-val color-dist">${parseFloat(act.distance_km || 0).toFixed(1)}</div>
        <div class="feed-stat-lbl">km</div>
      </div>
      <div class="feed-stat">
        <div class="feed-stat-val color-time">${dur}</div>
        <div class="feed-stat-lbl">Tijd</div>
      </div>
      <div class="feed-stat">
        <div class="feed-stat-val color-ascent">${act.ascent_m || 0}m</div>
        <div class="feed-stat-lbl">Hoogte</div>
      </div>
      <div class="feed-stat">
        <div class="feed-stat-val color-speed">${parseFloat(act.avg_speed_kmh || 0).toFixed(1)}</div>
        <div class="feed-stat-lbl">km/u</div>
      </div>
    </div>

    ${renderZoneBar(act)}

    <div class="feed-social-bar">
      <button class="btn-kudos${myKudo ? ' active' : ''}" data-activity-id="${act.id}">
        <span class="kudos-emoji">🔥</span>
        <span class="kudos-count">${kudosCount}</span>
      </button>
      <button class="btn-comment-toggle" data-activity-id="${act.id}">
        💬 Reageer
      </button>
      ${!isOwn ? `
      <button class="btn-follow" data-user-id="${act.user_id}" data-following="false" style="margin-left:auto;">
        <i data-lucide="user-plus" style="width:12px;height:12px;"></i> Volgen
      </button>` : ''}
    </div>

    <div class="comments-section" data-activity-id="${act.id}">
      <div class="comments-list"></div>
      ${state.user ? `
      <div class="comment-input-row">
        <input type="text" placeholder="Schrijf een reactie..." class="comment-input" maxlength="280">
        <button class="comment-submit-btn">Verstuur</button>
      </div>` : ''}
    </div>
  `;

  // ─── Hoogteprofiel (na innerHTML zodat we kunnen appenden)
  if (act.coordinates && act.coordinates.length > 5) {
    renderElevationChart(card, act.coordinates);
  }

  // ─── Kudos click
  const kudosBtn = card.querySelector('.btn-kudos');
  if (kudosBtn) {
    kudosBtn.addEventListener('click', async () => {
      if (!state.user) { showToast('Log in om kudos te geven.', 'error'); return; }
      kudosBtn.style.pointerEvents = 'none';
      const result = await toggleKudo(act.id);
      const countEl = kudosBtn.querySelector('.kudos-count');
      if (result === true)  { kudosBtn.classList.add('active');    if (countEl) countEl.textContent = parseInt(countEl.textContent) + 1; }
      if (result === false) { kudosBtn.classList.remove('active'); if (countEl) countEl.textContent = Math.max(0, parseInt(countEl.textContent) - 1); }
      kudosBtn.style.pointerEvents = '';
    });
  }

  // ─── Comments toggle
  const commentToggle = card.querySelector('.btn-comment-toggle');
  const commentSection = card.querySelector('.comments-section');
  if (commentToggle && commentSection) {
    commentToggle.addEventListener('click', async () => {
      const isOpen = commentSection.classList.toggle('open');
      if (isOpen && commentSection.querySelector('.comments-list').childElementCount === 0) {
        // Laad comments
        const comments = await loadComments(act.id);
        renderCommentsList(commentSection.querySelector('.comments-list'), comments);
      }
    });

    // Comment invoer
    const input  = card.querySelector('.comment-input');
    const submit = card.querySelector('.comment-submit-btn');
    if (input && submit) {
      const sendComment = async () => {
        if (!input.value.trim()) return;
        submit.disabled = true;
        const newComment = await postComment(act.id, input.value);
        if (newComment) {
          input.value = '';
          renderCommentsList(commentSection.querySelector('.comments-list'),
            [...commentSection.querySelector('.comments-list').querySelectorAll('.comment-item')].map(() => null), // dummy
            [newComment], true);
        }
        submit.disabled = false;
      };
      submit.addEventListener('click', sendComment);
      input.addEventListener('keydown', e => { if (e.key === 'Enter') sendComment(); });
    }
  }

  return card;
}

// ─── Comments lijst renderen ───────────────────────────────────────────────────
function renderCommentsList(container, comments, append = [], appendOnly = false) {
  if (!appendOnly) container.innerHTML = '';

  const toRender = appendOnly ? append : comments;
  for (const c of toRender) {
    if (!c) continue;
    const profile  = c.profiles || {};
    const avatar   = profile.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${c.user_id}`;
    const author   = profile.full_name || 'Gebruiker';
    const timeStr  = new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(new Date(c.created_at));

    const el = document.createElement('div');
    el.className = 'comment-item';
    el.innerHTML = `
      <img src="${avatar}" alt="${author}" class="comment-avatar">
      <div class="comment-body">
        <div class="comment-author">${author}</div>
        <div class="comment-text">${escHtml(c.content)}</div>
        <div class="comment-time">${timeStr}</div>
      </div>
    `;
    container.appendChild(el);
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
