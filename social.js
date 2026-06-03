// Cyclo - Social Feed Module
import { state, config, showToast } from './state.js';

// ─── Load Social Feed ─────────────────────────────
// Loads activities from followed users + own activities, sorted by date desc
export async function loadSocialFeed() {
  if (config.isDemoMode) {
    // Demo: return all activities from all mock profiles
    return (state.activities || []).sort((a, b) => new Date(b.date) - new Date(a.date));
  }
  
  try {
    // Get list of users I follow
    const { data: follows } = await config.supabaseClient
      .from('follows')
      .select('following_id')
      .eq('follower_id', state.user.id);
    
    const followedIds = (follows || []).map(f => f.following_id);
    followedIds.push(state.user.id); // Include own activities
    
    // Get activities from followed users
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

// ─── Follow / Unfollow ────────────────────────────
export async function followUser(userId) {
  if (config.isDemoMode) {
    showToast('Volgen werkt niet in demo modus.', 'error');
    return false;
  }
  try {
    const { error } = await config.supabaseClient
      .from('follows')
      .insert({ follower_id: state.user.id, following_id: userId });
    if (error) throw error;
    showToast('Je volgt nu deze gebruiker!', 'success');
    return true;
  } catch (err) {
    showToast('Kon niet volgen: ' + err.message, 'error');
    return false;
  }
}

export async function unfollowUser(userId) {
  if (config.isDemoMode) return false;
  try {
    const { error } = await config.supabaseClient
      .from('follows')
      .delete()
      .eq('follower_id', state.user.id)
      .eq('following_id', userId);
    if (error) throw error;
    showToast('Je volgt deze gebruiker niet meer.', 'info');
    return true;
  } catch (err) {
    return false;
  }
}

export async function getFollowStatus(userId) {
  if (config.isDemoMode || !state.user) return false;
  try {
    const { data } = await config.supabaseClient
      .from('follows')
      .select('follower_id')
      .eq('follower_id', state.user.id)
      .eq('following_id', userId)
      .maybeSingle();
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

// ─── Search Users ─────────────────────────────────
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
    const { data, error } = await config.supabaseClient
      .from('profiles')
      .select('*')
      .or(`full_name.ilike.%${q}%,username.ilike.%${q}%`)
      .neq('id', state.user?.id)
      .limit(10);
    if (error) throw error;
    return data || [];
  } catch (err) {
    console.error('Search error:', err);
    return [];
  }
}

// ─── Render Feed Card ─────────────────────────────
export function renderFeedCard(act, profileData) {
  const profile = profileData || state.profiles.find(p => p.id === act.user_id) || {};
  const name    = profile.full_name || profile.name || 'Onbekend';
  const avatar  = profile.avatar_url || `https://api.dicebear.com/7.x/adventurer/svg?seed=${act.user_id}`;
  const username = profile.username || '';
  const score   = act.rider_score || 0;
  const isOwnActivity = act.user_id === state.user?.id;
  
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
  card.dataset.userId = act.user_id;
  
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
    
    ${!isOwnActivity ? `
    <div class="feed-actions">
      <button class="btn-follow" data-user-id="${act.user_id}" data-following="false">
        <i data-lucide="user-plus" style="width:12px;height:12px;"></i>
        Volgen
      </button>
    </div>` : ''}
  `;
  
  return card;
}
