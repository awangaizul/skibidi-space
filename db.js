const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

const DB_PATH = path.join(__dirname, 'data.json');

function genId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/* ===== Local JSON fallback (when Supabase not configured) ===== */
const local = {
  init() {
    if (!fs.existsSync(DB_PATH)) {
      const data = {
        users: [],
        events: [],
        media: [],
        love_notes: [],
        date_checklist: [],
        couple_settings: {}
      };
      fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
      return data;
    }
    const data = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
    if (!data.couple_settings) data.couple_settings = {};
    if (!data.love_notes) data.love_notes = [];
    if (!data.date_checklist) data.date_checklist = [];
    return data;
  },
  save(d) { try { fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2)); } catch {} }
};

const store = (() => {
  try { return local.init(); }
  catch { return { users: [], events: [], media: [], love_notes: [], date_checklist: [], couple_settings: {} }; }
})();

/* ===== Public URL helper ===== */
function publicUrl(path) {
  if (!path) return null;
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'couple-app';
  const base = process.env.SUPABASE_URL;
  if (base) return `${base}/storage/v1/object/public/${bucket}/${path}`;
  return null;
}

/* ===== Decide which backend to use ===== */
const useSupabase = !!supabase;

/* ===== DB API ===== */
const db = {
  /* ===================== Users ===================== */
  async getUserByNickname(nickname) {
    if (useSupabase) {
      const { data } = await supabase.from('users').select('*').ilike('nickname', nickname).maybeSingle();
      return data || null;
    }
    return store.users.find(u => u.nickname.toLowerCase() === nickname.toLowerCase()) || null;
  },

  async getUserById(id) {
    if (useSupabase) {
      const { data } = await supabase.from('users').select('*').eq('id', id).single();
      return data || null;
    }
    return store.users.find(u => u.id === id) || null;
  },

  async getUsersBySpace(spaceId) {
    if (useSupabase) {
      const { data } = await supabase.from('users').select('*').eq('space_id', spaceId);
      return data || [];
    }
    return store.users.filter(u => u.space_id === spaceId);
  },

  async createUser(nickname, hash, spaceId, isCreator) {
    const user = {
      id: genId(),
      nickname,
      password: hash,
      space_id: spaceId,
      is_creator: isCreator ? 1 : 0,
      profile_photo: null,
      created_at: new Date().toISOString()
    };
    if (useSupabase) {
      await supabase.from('users').insert(user);
      return { ...user, is_creator: isCreator ? 1 : 0 };
    }
    store.users.push(user);
    local.save(store);
    return user;
  },

  async updateUserNickname(id, nickname) {
    if (useSupabase) {
      await supabase.from('users').update({ nickname }).eq('id', id);
      return true;
    }
    const user = store.users.find(u => u.id === id);
    if (user) { user.nickname = nickname; local.save(store); return true; }
    return false;
  },

  async updateUserProfilePhoto(id, filename) {
    if (useSupabase) {
      // filename is full storage path like profiles/file
      await supabase.from('users').update({ profile_photo: filename }).eq('id', id);
      return true;
    }
    const user = store.users.find(u => u.id === id);
    if (user) { user.profile_photo = filename; local.save(store); return true; }
    return false;
  },

  async getUserProfilePhoto(id) {
    if (useSupabase) {
      const { data } = await supabase.from('users').select('profile_photo').eq('id', id).single();
      return data?.profile_photo || null;
    }
    const user = store.users.find(u => u.id === id);
    return user ? user.profile_photo : null;
  },

  async spaceExists(spaceId) {
    if (useSupabase) {
      const { data } = await supabase.from('users').select('id').eq('space_id', spaceId).limit(1);
      return (data || []).length > 0;
    }
    return store.users.some(u => u.space_id === spaceId);
  },

  /* ===================== Couple settings ===================== */
  async getCoupleSettings(spaceId) {
    if (useSupabase) {
      const { data } = await supabase.from('couple_settings').select('*').eq('space_id', spaceId).single();
      return data || {};
    }
    return store.couple_settings[spaceId] || {};
  },

  async setAnniversary(spaceId, date) {
    if (useSupabase) {
      await supabase.from('couple_settings').upsert(
        { space_id: spaceId, anniversary: date },
        { onConflict: 'space_id' }
      );
      return { anniversary: date };
    }
    if (!store.couple_settings[spaceId]) store.couple_settings[spaceId] = {};
    store.couple_settings[spaceId].anniversary = date;
    local.save(store);
    return store.couple_settings[spaceId];
  },

  async setWheelOptions(spaceId, options) {
    if (useSupabase) {
      await supabase.from('couple_settings').upsert(
        { space_id: spaceId, wheel_options: options },
        { onConflict: 'space_id' }
      );
      return { wheelOptions: options };
    }
    if (!store.couple_settings[spaceId]) store.couple_settings[spaceId] = {};
    store.couple_settings[spaceId].wheel_options = options;
    local.save(store);
    return store.couple_settings[spaceId];
  },

  /* ===================== Events ===================== */
  async getEvents(spaceId) {
    if (useSupabase) {
      const { data } = await supabase
        .from('events')
        .select('*')
        .eq('space_id', spaceId)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });
      return data || [];
    }
    return store.events.filter(e => e.space_id === spaceId)
      .sort((a, b) => (a.date + 'T' + a.start_time).localeCompare(b.date + 'T' + b.start_time));
  },

  async addEvent(spaceId, data) {
    const event = {
      id: genId(),
      space_id: spaceId,
      title: data.title,
      date: data.date,
      start_time: data.startTime,
      end_time: data.endTime,
      notes: data.notes || '',
      created_by: data.createdBy,
      notified_1day: 0,
      notified_5hours: 0,
      notified_1hour: 0,
      created_at: new Date().toISOString()
    };
    if (useSupabase) {
      await supabase.from('events').insert(event);
      return event;
    }
    store.events.push(event);
    local.save(store);
    return event;
  },

  async updateEvent(spaceId, eventId, updates) {
    if (useSupabase) {
      const mapped = {};
      if (updates.notified_1day !== undefined) mapped.notified_1day = updates.notified_1day;
      if (updates.notified_5hours !== undefined) mapped.notified_5hours = updates.notified_5hours;
      if (updates.notified_1hour !== undefined) mapped.notified_1hour = updates.notified_1hour;
      const { error } = await supabase.from('events').update(mapped).eq('id', eventId).eq('space_id', spaceId);
      return !error;
    }
    const event = store.events.find(e => e.id === eventId && e.space_id === spaceId);
    if (!event) return false;
    Object.assign(event, updates);
    local.save(store);
    return true;
  },

  async deleteEvent(spaceId, eventId) {
    if (useSupabase) {
      const { error } = await supabase.from('events').delete().eq('id', eventId).eq('space_id', spaceId);
      return !error;
    }
    const idx = store.events.findIndex(e => e.id === eventId && e.space_id === spaceId);
    if (idx === -1) return false;
    store.events.splice(idx, 1);
    local.save(store);
    return true;
  },

  /* ===================== Media ===================== */
  async getMedia(spaceId) {
    if (useSupabase) {
      const { data } = await supabase
        .from('media')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });
      return data || [];
    }
    return store.media.filter(m => m.space_id === spaceId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async addMedia(spaceId, data) {
    const media = {
      id: genId(),
      space_id: spaceId,
      type: data.type,
      file_path: data.filePath,
      mime_type: data.mimeType || '',
      caption: data.caption || '',
      uploaded_by: data.uploadedBy,
      likes: [],
      comments: [],
      created_at: new Date().toISOString()
    };
    if (useSupabase) {
      await supabase.from('media').insert(media);
      return media;
    }
    store.media.push(media);
    local.save(store);
    return media;
  },

  async getMediaById(spaceId, mediaId) {
    if (useSupabase) {
      const { data } = await supabase.from('media').select('*').eq('id', mediaId).eq('space_id', spaceId).single();
      return data || null;
    }
    return store.media.find(m => m.id === mediaId && m.space_id === spaceId) || null;
  },

  async deleteMedia(spaceId, mediaId) {
    if (useSupabase) {
      const { data } = await supabase.from('media').select('file_path').eq('id', mediaId).eq('space_id', spaceId).single();
      if (data) {
        await supabase.from('media').delete().eq('id', mediaId).eq('space_id', spaceId);
        return data;
      }
      return null;
    }
    const idx = store.media.findIndex(m => m.id === mediaId && m.space_id === spaceId);
    if (idx === -1) return null;
    const media = store.media[idx];
    store.media.splice(idx, 1);
    local.save(store);
    return media;
  },

  async toggleLike(spaceId, mediaId, userId) {
    if (useSupabase) {
      const { data: media } = await supabase.from('media').select('likes').eq('id', mediaId).eq('space_id', spaceId).single();
      if (!media) return null;
      const likes = media.likes || [];
      const idx = likes.indexOf(userId);
      if (idx === -1) likes.push(userId);
      else likes.splice(idx, 1);
      await supabase.from('media').update({ likes }).eq('id', mediaId);
      return { liked: idx === -1, count: likes.length };
    }
    const media = store.media.find(m => m.id === mediaId && m.space_id === spaceId);
    if (!media) return null;
    if (!Array.isArray(media.likes)) media.likes = [];
    const idx = media.likes.indexOf(userId);
    if (idx === -1) media.likes.push(userId);
    else media.likes.splice(idx, 1);
    local.save(store);
    return { liked: idx === -1, count: media.likes.length };
  },

  async addComment(spaceId, mediaId, userId, nickname, text) {
    if (useSupabase) {
      const { data: media } = await supabase.from('media').select('comments').eq('id', mediaId).eq('space_id', spaceId).single();
      if (!media) return null;
      const comment = {
        id: genId(),
        user_id: userId,
        nickname,
        text: text.trim(),
        created_at: new Date().toISOString()
      };
      const comments = [...(media.comments || []), comment];
      await supabase.from('media').update({ comments }).eq('id', mediaId);
      return comment;
    }
    const media = store.media.find(m => m.id === mediaId && m.space_id === spaceId);
    if (!media) return null;
    if (!Array.isArray(media.comments)) media.comments = [];
    const comment = {
      id: genId(),
      user_id: userId,
      nickname,
      text: text.trim(),
      created_at: new Date().toISOString()
    };
    media.comments.push(comment);
    local.save(store);
    return comment;
  },

  async deleteComment(spaceId, mediaId, commentId, userId) {
    if (useSupabase) {
      const { data: media } = await supabase.from('media').select('comments').eq('id', mediaId).eq('space_id', spaceId).single();
      if (!media || !Array.isArray(media.comments)) return null;
      const idx = media.comments.findIndex(c => c.id === commentId && c.user_id === userId);
      if (idx === -1) return null;
      const comment = media.comments[idx];
      const comments = media.comments.filter((_, i) => i !== idx);
      await supabase.from('media').update({ comments }).eq('id', mediaId);
      return comment;
    }
    const media = store.media.find(m => m.id === mediaId && m.space_id === spaceId);
    if (!media || !Array.isArray(media.comments)) return null;
    const idx = media.comments.findIndex(c => c.id === commentId && c.user_id === userId);
    if (idx === -1) return null;
    const comment = media.comments[idx];
    media.comments.splice(idx, 1);
    local.save(store);
    return comment;
  },

  /* ===================== Love notes ===================== */
  async getLoveNotes(spaceId) {
    if (useSupabase) {
      const { data } = await supabase
        .from('love_notes')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });
      return data || [];
    }
    return store.love_notes.filter(n => n.space_id === spaceId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async addLoveNote(spaceId, data) {
    const note = {
      id: genId(),
      space_id: spaceId,
      from_user_id: data.fromUserId,
      to_user_id: data.toUserId,
      title: (data.title || 'Untitled').trim(),
      content: data.content.trim(),
      unlock_at: data.unlockAt,
      created_at: new Date().toISOString()
    };
    if (useSupabase) {
      await supabase.from('love_notes').insert(note);
      return note;
    }
    store.love_notes.push(note);
    local.save(store);
    return note;
  },

  async getLoveNoteById(spaceId, noteId) {
    if (useSupabase) {
      const { data } = await supabase.from('love_notes').select('*').eq('id', noteId).eq('space_id', spaceId).single();
      return data || null;
    }
    return store.love_notes.find(n => n.id === noteId && n.space_id === spaceId) || null;
  },

  async deleteLoveNote(spaceId, noteId, userId) {
    if (useSupabase) {
      const { error } = await supabase.from('love_notes').delete().eq('id', noteId).eq('space_id', spaceId).eq('from_user_id', userId);
      return !error;
    }
    const idx = store.love_notes.findIndex(n => n.id === noteId && n.space_id === spaceId && n.from_user_id === userId);
    if (idx === -1) return false;
    store.love_notes.splice(idx, 1);
    local.save(store);
    return true;
  },

  /* ===================== Date Checklist ===================== */
  async getDateChecklist(spaceId) {
    if (useSupabase) {
      const { data } = await supabase
        .from('date_checklist')
        .select('*')
        .eq('space_id', spaceId)
        .order('created_at', { ascending: false });
      return data || [];
    }
    return (store.date_checklist || [])
      .filter(d => d.space_id === spaceId)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  },

  async addDateChecklist(spaceId, data) {
    const item = {
      id: genId(),
      space_id: spaceId,
      title: data.title.trim(),
      description: (data.description || '').trim(),
      is_done: false,
      done_by: null,
      done_at: null,
      evidence_file_path: null,
      created_at: new Date().toISOString(),
      created_by: data.createdBy
    };
    if (useSupabase) {
      await supabase.from('date_checklist').insert(item);
      return item;
    }
    if (!store.date_checklist) store.date_checklist = [];
    store.date_checklist.push(item);
    local.save(store);
    return item;
  },

  async updateDateChecklist(spaceId, itemId, updates) {
    if (useSupabase) {
      const { error } = await supabase.from('date_checklist').update(updates).eq('id', itemId).eq('space_id', spaceId);
      return !error;
    }
    const item = (store.date_checklist || []).find(d => d.id === itemId && d.space_id === spaceId);
    if (!item) return false;
    Object.assign(item, updates);
    local.save(store);
    return true;
  },

  async deleteDateChecklist(spaceId, itemId) {
    if (useSupabase) {
      const { data } = await supabase.from('date_checklist').select('evidence_file_path').eq('id', itemId).eq('space_id', spaceId).single();
      if (data) await supabase.from('date_checklist').delete().eq('id', itemId).eq('space_id', spaceId);
      return data || {};
    }
    const idx = (store.date_checklist || []).findIndex(d => d.id === itemId && d.space_id === spaceId);
    if (idx === -1) return null;
    const item = store.date_checklist[idx];
    store.date_checklist.splice(idx, 1);
    local.save(store);
    return item;
  },

  /* ===================== Helpers ===================== */
  getMediaUrl(filename) {
    return publicUrl(filename) || (filename ? '/uploads/' + filename : null);
  },

  getProfilePhotoUrl(filename) {
    return publicUrl(filename) || (filename ? '/uploads/profiles/' + filename : null);
  },

  getStorageInfo(spaceId) {
    return {
      events: store.events.filter(e => e.space_id === spaceId).length,
      media: store.media.filter(m => m.space_id === spaceId).length
    };
  }
};

module.exports = db;
