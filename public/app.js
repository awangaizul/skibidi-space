/* ===== API Client ===== */
const API = {
  token: localStorage.getItem('token'),

  async req(method, url, body) {
    const opts = { method, headers: {} };
    if (this.token) opts.headers.Authorization = 'Bearer ' + this.token;
    if (body && !(body instanceof FormData)) {
      opts.headers['Content-Type'] = 'application/json';
      opts.body = JSON.stringify(body);
    } else if (body instanceof FormData) {
      opts.body = body;
    }
    const res = await fetch(url, opts);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Something went wrong');
    return data;
  },

  get(url) { return this.req('GET', url); },
  post(url, b) { return this.req('POST', url, b); },
  put(url, b) { return this.req('PUT', url, b); },
  del(url) { return this.req('DELETE', url); },

  login(n, p) { return this.post('/api/auth/login', { nickname: n, password: p }); },
  register(n, p) { return this.post('/api/auth/register', { nickname: n, password: p }); },
  join(n, p, c) { return this.post('/api/couple/join', { nickname: n, password: p, inviteCode: c }); },
  getMe() { return this.get('/api/auth/me'); },
  updateNickname(n) { return this.put('/api/auth/nickname', { nickname: n }); },
  uploadProfilePhoto(file) { const f = new FormData(); f.append('photo', file); return this.post('/api/auth/profile-photo', f); },
  deleteProfilePhoto() { return this.del('/api/auth/profile-photo'); },
  getCouple() { return this.get('/api/couple'); },
  setAnniversary(date) { return this.put('/api/couple/anniversary', { date }); },
  setWheelOptions(options) { return this.put('/api/couple/wheel', { options }); },
  getEvents() { return this.get('/api/events'); },
  addEvent(d) { return this.post('/api/events', d); },
  deleteEvent(id) { return this.del('/api/events/' + id); },
  updateEventNotif(id, d) { return this.put('/api/events/' + id + '/notifications', d); },
  getMedia() { return this.get('/api/media'); },
  async uploadMedia(file, caption) {
    const f = new FormData();
    f.append('file', file);
    f.append('caption', caption);
    return this.post('/api/media', f);
  },
  deleteMedia(id) { return this.del('/api/media/' + id); },
  likeMedia(id) { return this.post('/api/media/' + id + '/like'); },
  addComment(id, text) { return this.post('/api/media/' + id + '/comments', { text }); },
  deleteComment(mediaId, commentId) { return this.del('/api/media/' + mediaId + '/comments/' + commentId); },

  getLoveNotes() { return this.get('/api/love-notes'); },
  addLoveNote(d) { return this.post('/api/love-notes', d); },
  deleteLoveNote(id) { return this.del('/api/love-notes/' + id); },

  getDates() { return this.get('/api/dates'); },
  addDate(d) { return this.post('/api/dates', d); },
  updateDate(id, formData) {
    if (this.token) formData.append('token', this.token);
    const opts = { method: 'PUT', headers: {} };
    if (this.token) opts.headers.Authorization = 'Bearer ' + this.token;
    opts.body = formData;
    return fetch('/api/dates/' + id, opts).then(r => r.json()).then(data => { if (data.error) throw new Error(data.error); return data; });
  },
  deleteDate(id) { return this.del('/api/dates/' + id); }
};

/* ===== Notifications ===== */
const Notifier = {
  async init() {
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') await Notification.requestPermission();
  },

  send(title, body, tag) {
    if (Notification.permission !== 'granted') return;
    try { new Notification(title, { body, tag, requireInteraction: true }); } catch {}
  },

  async check() {
    try {
      const events = await API.getEvents();
      const now = Date.now();
      for (const e of events) {
        const t = new Date(e.date + 'T' + e.startTime + ':00').getTime();
        const h = (t - now) / 3600000;
        if (h <= 0) continue;
        const up = {};
        if (h <= 24 && !e.notified1Day) { up.notified1Day = true; this.send(e.title + ' \u2764\ufe0f', e.title + ' is tomorrow! ' + e.startTime + '-' + e.endTime, e.id + '-1d'); }
        if (h <= 5 && !e.notified5Hours) { up.notified5Hours = true; this.send(e.title + ' \u2764\ufe0f', e.title + ' starts in 5 hours! ' + e.startTime + '-' + e.endTime, e.id + '-5h'); }
        if (h <= 1 && !e.notified1Hour) { up.notified1Hour = true; this.send(e.title + ' \u2764\ufe0f', e.title + ' starts in 1 hour! ' + e.startTime + '-' + e.endTime, e.id + '-1h'); }
        if (up.notified1Day || up.notified5Hours || up.notified1Hour) {
          await API.updateEventNotif(e.id, up);
        }
      }
    } catch {}
  },

  start() { this.check(); setInterval(() => this.check(), 30000); }
};

/* ===== Calendar ===== */
const Calendar = {
  year: new Date().getFullYear(),
  month: new Date().getMonth(),
  selected: '',

  init() {
    const now = new Date();
    this.year = now.getFullYear();
    this.month = now.getMonth();
    this.selected = now.toISOString().slice(0, 10);
    document.getElementById('cal-prev').onclick = () => { this.month--; if (this.month < 0) { this.month = 11; this.year--; } this.render(); };
    document.getElementById('cal-next').onclick = () => { this.month++; if (this.month > 11) { this.month = 0; this.year++; } this.render(); };
    this.render();
  },

  async render() {
    const names = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    document.getElementById('cal-month-year').textContent = names[this.month] + ' ' + this.year;
    const first = new Date(this.year, this.month, 1).getDay();
    const days = new Date(this.year, this.month + 1, 0).getDate();
    const prevDays = new Date(this.year, this.month, 0).getDate();
    const today = new Date().toISOString().slice(0, 10);
    let events;
    try { events = await API.getEvents(); } catch { events = []; }
    const eventDates = new Set(events.map(e => e.date));
    const grid = document.getElementById('cal-grid');
    let html = '';
    for (let i = first - 1; i >= 0; i--) html += '<div class="cal-cell other-month">' + (prevDays - i) + '</div>';
    for (let d = 1; d <= days; d++) {
      const ds = this.year + '-' + String(this.month + 1).padStart(2, '0') + '-' + String(d).padStart(2, '0');
      let cls = 'cal-cell';
      if (ds === today) cls += ' today';
      if (eventDates.has(ds)) cls += ' has-event';
      if (ds === this.selected) cls += ' selected';
      html += '<div class="' + cls + '" data-date="' + ds + '">' + d + '</div>';
    }
    grid.innerHTML = html;
    grid.querySelectorAll('.cal-cell:not(.other-month)').forEach(c => {
      c.onclick = () => { this.selected = c.dataset.date; this.render(); this.showDayEvents(); };
    });
    this.showDayEvents();
  },

  async showDayEvents() {
    const title = document.getElementById('day-events-title');
    const list = document.getElementById('day-events-list');
    if (this.selected) {
      const d = new Date(this.selected + 'T00:00:00');
      title.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    } else {
      title.textContent = 'Events';
    }
    try {
      const events = await API.getEvents();
      const dayEvents = events.filter(e => e.date === this.selected).sort((a, b) => a.startTime.localeCompare(b.startTime));
      const now = Date.now();
      if (!dayEvents.length) {
        list.innerHTML = '<p>No plans for this day</p>';
        return;
      }
      list.innerHTML = dayEvents.map(e => {
        const past = new Date(e.date + 'T' + e.startTime + ':00').getTime() < now;
        return '<div class="event-card ' + (past ? 'event-card-past' : '') + '">'
          + '<div class="event-info"><h4>' + e.title + '</h4>'
          + '<p>' + e.startTime + ' - ' + e.endTime + (e.notes ? ' \u2022 ' + e.notes : '') + '</p></div>'
          + '<div style="display:flex;align-items:center;gap:8px">'
          + '<span class="event-time-badge">' + (past ? 'Done' : e.startTime) + '</span>'
          + '<button class="btn-sm" style="background:#fee;color:var(--danger)" onclick="App.deleteEvent(\'' + e.id + '\')">&times;</button>'
          + '</div></div>';
      }).join('');
    } catch { list.innerHTML = '<p>Failed to load events</p>'; }
  }
};

/* ===== App ===== */
const App = {
  user: null,
  partnerName: '',
  photoCache: {},

  getPhotoUrl(filename) {
    if (!filename) return '';
    if (filename.startsWith('http://') || filename.startsWith('https://')) return filename;
    return '/uploads/profiles/' + filename;
  },

  async preloadPhoto(filename) {
    if (!filename || this.photoCache[filename]) return this.photoCache[filename] || null;
    const url = this.getPhotoUrl(filename);
    try {
      const res = await fetch(url);
      if (!res.ok) return url;
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      this.photoCache[filename] = blobUrl;
      return blobUrl;
    } catch {
      return url;
    }
  },

  setPhotoImg(img, filename) {
    if (!filename) {
      img.src = '';
      img.style.display = 'none';
      img.classList.remove('photo-loaded');
      return;
    }
    const cached = this.photoCache[filename];
    if (cached) {
      img.src = cached;
      img.style.display = 'inline-block';
      img.classList.add('photo-loaded');
      return;
    }
    img.style.display = 'none';
    img.classList.remove('photo-loaded');
    this.preloadPhoto(filename).then(blobUrl => {
      if (!blobUrl) return;
      img.src = blobUrl;
      img.style.display = 'inline-block';
      img.classList.add('photo-loaded');
    });
  },

  cacheUploadedPhoto(filename, file) {
    if (!filename || !file) return;
    try {
      const blobUrl = URL.createObjectURL(file);
      this.photoCache[filename] = blobUrl;
    } catch {}
  },

  async init() {
    await Notifier.init();
    document.getElementById('modal-overlay').onclick = () => this.closeModal();

    this.setupAuth();
    this.setupNav();
    this.setupUpload();
    this.setupEventForm();
    this.setupWheelEditor();
    this.setupLoveNotes();
    this.setupDateChecklist();

    document.getElementById('btn-save-nickname').onclick = () => this.saveNickname();
    document.getElementById('btn-save-anniversary').onclick = () => this.saveAnniversary();
    document.getElementById('btn-logout').onclick = () => this.logout();
    document.getElementById('btn-copy-code').onclick = () => this.copyInviteCode();
    document.getElementById('user-btn').onclick = () => this.showUserInfo();

    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') this.closeModal(); });

    if (API.token) {
      try {
        const data = await API.getMe();
        this.user = data;
        this.startApp();
        return;
      } catch {
        API.token = null;
        localStorage.removeItem('token');
      }
    }
    this.showAuth();
  },

  /* ---------- Auth ---------- */
  setupAuth() {
    document.getElementById('login-form').onsubmit = (e) => { e.preventDefault(); this.login(); };
    document.getElementById('create-form').onsubmit = (e) => { e.preventDefault(); this.register(); };
    document.getElementById('join-form').onsubmit = (e) => { e.preventDefault(); this.join(); };

    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.onclick = () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        document.getElementById(tab.dataset.tab + '-form').classList.add('active');
        this.clearAuthErrors();
      };
    });

    document.getElementById('btn-create-space').onclick = () => {
      document.getElementById('register-options').style.display = 'none';
      document.getElementById('create-form').style.display = 'block';
    };

    document.getElementById('btn-join-space').onclick = () => {
      document.getElementById('register-options').style.display = 'none';
      document.getElementById('join-form').style.display = 'block';
    };

    document.getElementById('reg-back').onclick = () => { document.getElementById('create-form').style.display = 'none'; document.getElementById('register-options').style.display = 'flex'; };
    document.getElementById('join-back').onclick = () => { document.getElementById('join-form').style.display = 'none'; document.getElementById('register-options').style.display = 'flex'; };
  },

  clearAuthErrors() {
    ['login-error', 'reg-error', 'join-error'].forEach(id => document.getElementById(id).textContent = '');
  },

  showAuthError(id, msg) {
    document.getElementById(id).textContent = msg;
  },

  showAuth() {
    document.getElementById('auth-screen').style.display = 'flex';
    document.getElementById('app').style.display = 'none';
  },

  async login() {
    const n = document.getElementById('login-nickname').value.trim();
    const p = document.getElementById('login-password').value;
    if (!n || !p) return;
    const btn = document.getElementById('login-btn');
    btn.disabled = true; btn.textContent = 'Logging in...';
    try {
      const data = await API.login(n, p);
      API.token = data.token;
      localStorage.setItem('token', data.token);
      this.user = data.user;
      this.startApp();
    } catch (e) { this.showAuthError('login-error', e.message); }
    btn.disabled = false; btn.textContent = 'Login';
  },

  async register() {
    const n = document.getElementById('reg-nickname').value.trim();
    const p = document.getElementById('reg-password').value;
    if (!n || !p) return;
    const btn = document.getElementById('reg-btn');
    btn.disabled = true; btn.textContent = 'Creating...';
    try {
      const data = await API.register(n, p);
      API.token = data.token;
      localStorage.setItem('token', data.token);
      this.user = data.user;
      this.startApp();
    } catch (e) { this.showAuthError('reg-error', e.message); }
    btn.disabled = false; btn.textContent = 'Create Space';
  },

  async join() {
    const n = document.getElementById('join-nickname').value.trim();
    const p = document.getElementById('join-password').value;
    const c = document.getElementById('join-code').value.trim();
    if (!n || !p || !c) return;
    const btn = document.getElementById('join-btn');
    btn.disabled = true; btn.textContent = 'Joining...';
    try {
      const data = await API.join(n, p, c);
      API.token = data.token;
      localStorage.setItem('token', data.token);
      this.user = data.user;
      this.startApp();
    } catch (e) { this.showAuthError('join-error', e.message); }
    btn.disabled = false; btn.textContent = 'Join Space';
  },

  logout() {
    if (!confirm('Logout?')) return;
    API.token = null;
    localStorage.removeItem('token');
    this.user = null;
    this.showAuth();
  },

  /* ---------- App Start ---------- */
  async startApp() {
    document.getElementById('auth-screen').style.display = 'none';
    document.getElementById('app').style.display = 'flex';
    Notifier.start();
    Calendar.init();
    await this.loadCoupleInfo();
    this.preloadProfilePhotos();
    this.updateUserBadge();
    this.setHomeSection(localStorage.getItem('homeSection') || 'wheel', true);
    await this.refresh();
    document.getElementById('settings-my-nickname').value = this.user.nickname;
    document.getElementById('event-date').value = new Date().toISOString().slice(0, 10);
    this.setupProfilePhoto();
  },

  async loadCoupleInfo() {
    try {
      const data = await API.getCouple();
      this.coupleUsers = data.users || [];
      const partner = data.users.find(u => u.id !== this.user.id);
      this.partnerName = partner ? partner.nickname : 'Waiting for partner...';
      this.partnerPfp = partner ? partner.profilePhoto : null;
      this.partnerPfpUrl = partner ? partner.profilePhotoUrl : null;
      this.partnerId = partner ? partner.id : null;
      this.anniversary = data.anniversary || null;
      this.wheelOptions = data.wheelOptions && data.wheelOptions.length ? data.wheelOptions : ['Movie', 'Dinner', 'Park', 'Cafe', 'Game Night', 'Walk'];
      document.getElementById('settings-partner-info').textContent = this.partnerName;
      if (document.getElementById('settings-anniversary')) {
        document.getElementById('settings-anniversary').value = this.anniversary || '';
      }

      const inviteSection = document.getElementById('invite-section');
      if (this.user.isCreator) {
        inviteSection.style.display = 'block';
        document.getElementById('settings-invite-code').value = this.user.spaceId;
      } else {
        inviteSection.style.display = 'none';
      }
    } catch {
      this.partnerName = 'Unknown';
      this.partnerPfp = null;
      this.anniversary = null;
      document.getElementById('settings-partner-info').textContent = 'Unknown';
    }
  },

  formatTogether() {
    if (!this.anniversary) return '';
    const start = new Date(this.anniversary + 'T00:00:00');
    const now = new Date();
    if (isNaN(start.getTime())) return '';
    let years = now.getFullYear() - start.getFullYear();
    let months = now.getMonth() - start.getMonth();
    let days = now.getDate() - start.getDate();
    if (days < 0) {
      months--;
      const prevMonth = new Date(now.getFullYear(), now.getMonth(), 0);
      days += prevMonth.getDate();
    }
    if (months < 0) {
      years--;
      months += 12;
    }
    const parts = [];
    if (years > 0) parts.push(years + ' year' + (years === 1 ? '' : 's'));
    if (months > 0) parts.push(months + ' month' + (months === 1 ? '' : 's'));
    if (days > 0 || (!years && !months)) parts.push(days + ' day' + (days === 1 ? '' : 's'));
    return 'Together for ' + parts.join(', ');
  },

  updateUserBadge() {
    const badge = document.getElementById('user-badge');
    const pfp = document.getElementById('header-pfp');
    badge.textContent = this.user ? this.user.nickname : 'Me';
    if (this.user && this.user.profilePhoto) {
      this.setPhotoImg(pfp, this.user.profilePhotoUrl || this.user.profilePhoto);
      badge.style.display = 'none';
    } else {
      this.setPhotoImg(pfp, null);
      badge.style.display = 'inline-block';
    }
  },

  showUserInfo() {
    App.toast('Logged in as ' + this.user.nickname + (this.partnerName && this.partnerName !== 'Waiting for partner...' ? ' \u2022 Partner: ' + this.partnerName : ''));
  },

  preloadProfilePhotos() {
    if (this.user && this.user.profilePhoto) this.preloadPhoto(this.user.profilePhotoUrl || this.user.profilePhoto);
    if (this.partnerPfp) this.preloadPhoto(this.partnerPfpUrl || this.partnerPfp);
  },

  /* ---------- Profile Photo ---------- */
  setupProfilePhoto() {
    document.getElementById('btn-upload-pfp').onclick = () => document.getElementById('pfp-input').click();
    document.getElementById('pfp-input').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const data = await API.uploadProfilePhoto(file);
        this.user.profilePhoto = data.profilePhoto;
        if (data.profilePhotoUrl) this.user.profilePhotoUrl = data.profilePhotoUrl;
        this.cacheUploadedPhoto(data.profilePhoto, file);
        this.updateUserBadge();
        this.renderWelcomeAvatars();
        this.renderProfilePhotoPreview();
        App.toast('Profile photo updated!');
      } catch (e) { alert('Error: ' + e.message); }
    };
    document.getElementById('btn-remove-pfp').onclick = async () => {
      if (!confirm('Remove profile photo?')) return;
      try {
        await API.deleteProfilePhoto();
        this.user.profilePhoto = null;
        this.updateUserBadge();
        this.renderWelcomeAvatars();
        this.renderProfilePhotoPreview();
        App.toast('Profile photo removed');
      } catch (e) { alert('Error: ' + e.message); }
    };
    this.renderProfilePhotoPreview();
  },

  renderProfilePhotoPreview() {
    const container = document.getElementById('settings-pfp');
    if (this.user && this.user.profilePhoto) {
      const url = this.photoCache[this.user.profilePhoto] || this.getPhotoUrl(this.user.profilePhotoUrl || this.user.profilePhoto);
      container.innerHTML = '<img src="' + url + '" alt="" class="photo-loaded">';
    } else {
      container.innerHTML = '<span class="pfp-placeholder">😊</span>';
    }
  },

  renderWelcomeAvatars() {
    const myPfp = document.getElementById('welcome-my-pfp');
    const myEmoji = document.getElementById('welcome-my-emoji');
    const partnerPfp = document.getElementById('welcome-partner-pfp');
    const partnerEmoji = document.getElementById('welcome-partner-emoji');

    if (this.user && this.user.profilePhoto) {
      this.setPhotoImg(myPfp, this.user.profilePhotoUrl || this.user.profilePhoto);
      myEmoji.style.display = 'none';
    } else {
      this.setPhotoImg(myPfp, null);
      myEmoji.style.display = 'flex';
    }
    if (this.partnerPfp) {
      this.setPhotoImg(partnerPfp, this.partnerPfpUrl || this.partnerPfp);
      partnerEmoji.style.display = 'none';
    } else {
      this.setPhotoImg(partnerPfp, null);
      partnerEmoji.style.display = 'flex';
    }
  },

  /* ---------- Navigation ---------- */
  setupNav() {
    const pages = ['home', 'gallery', 'calendar', 'settings'];
    let currentPage = 'home';

    const moveIndicator = (item) => {
      const indicator = document.getElementById('nav-indicator');
      if (!indicator) return;
      indicator.style.transform = 'translateX(' + item.offsetLeft + 'px) scaleX(0.6)';
      indicator.style.opacity = '1';
      setTimeout(() => { indicator.style.transform = 'translateX(' + item.offsetLeft + 'px) scaleX(1)'; }, 120);
    };

    const initIndicator = () => {
      const active = document.querySelector('.nav-item.active');
      if (active) moveIndicator(active);
    };

    document.querySelectorAll('.nav-item').forEach(item => {
      item.onclick = () => {
        const target = item.dataset.page;
        if (target === currentPage) return;

        const currentIdx = pages.indexOf(currentPage);
        const targetIdx = pages.indexOf(target);
        const forward = targetIdx > currentIdx;

        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        item.classList.add('active');
        moveIndicator(item);

        const currentEl = document.getElementById('page-' + currentPage);
        const targetEl = document.getElementById('page-' + target);

        currentEl.classList.add(forward ? 'slide-out-left' : 'slide-out-right');
        targetEl.classList.add(forward ? 'slide-in-right' : 'slide-in-left');

        requestAnimationFrame(() => {
          targetEl.classList.add('active');
        });

        setTimeout(() => {
          currentEl.classList.remove('active', 'slide-out-left', 'slide-out-right');
          targetEl.classList.remove('slide-in-left', 'slide-in-right');
          currentPage = target;

          if (target === 'gallery') this.renderGallery();
          if (target === 'home') {
            this.renderDashboard();
            if (this.homeSection === 'love') this.renderLoveNotes();
            if (this.homeSection === 'dates') this.renderDateList();
          }
          if (target === 'calendar') Calendar.render();
          if (target === 'settings') this.renderSettings();
          if (target !== 'home') {
            this.stopSlideShow();
            this.stopLoveNotesTimer();
          }
        }, 320);
      };
    });

    window.addEventListener('resize', initIndicator);
    setTimeout(initIndicator, 100);
  },

  /* ---------- Modals ---------- */
  openModal(name) {
    document.getElementById('modal-overlay').style.display = 'block';
    document.getElementById('modal-' + name).style.display = 'flex';
    if (name === 'upload') this.resetUpload();
  },

  closeModal() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
    document.getElementById('modal-overlay').style.display = 'none';
  },

  resetUpload() {
    document.getElementById('file-input').value = '';
    document.getElementById('upload-caption').value = '';
    document.getElementById('upload-preview').style.display = 'none';
    document.getElementById('preview-img').style.display = 'none';
    document.getElementById('preview-video').style.display = 'none';
    document.getElementById('btn-upload').disabled = true;
  },

  /* ---------- Upload ---------- */
  setupUpload() {
    document.getElementById('upload-area').onclick = () => document.getElementById('file-input').click();
    document.getElementById('file-input').onchange = (e) => {
      const file = e.target.files[0];
      if (!file) return;
      const url = URL.createObjectURL(file);
      const preview = document.getElementById('upload-preview');
      preview.style.display = 'flex';
      if (file.type.startsWith('video/')) {
        document.getElementById('preview-img').style.display = 'none';
        const v = document.getElementById('preview-video');
        v.style.display = 'block'; v.src = url;
      } else {
        document.getElementById('preview-video').style.display = 'none';
        const img = document.getElementById('preview-img');
        img.style.display = 'block'; img.src = url;
      }
      document.getElementById('btn-upload').disabled = false;
    };

    document.getElementById('btn-upload').onclick = async () => {
      const file = document.getElementById('file-input').files[0];
      if (!file) return;
      const btn = document.getElementById('btn-upload');
      btn.disabled = true; btn.textContent = 'Uploading...';
      try {
        await API.uploadMedia(file, document.getElementById('upload-caption').value.trim());
        this.closeModal();
        this.refresh();
        App.toast('Memory shared! \u2764\ufe0f');
      } catch (e) { alert('Upload failed: ' + e.message); }
      btn.disabled = false; btn.textContent = 'Share';
    };
  },

  setupWheelEditor() {
    document.getElementById('btn-add-wheel-option').onclick = () => this.addWheelOption();
    document.getElementById('wheel-new-option').onkeydown = (e) => { if (e.key === 'Enter') this.addWheelOption(); };
    document.getElementById('btn-save-wheel').onclick = () => this.saveWheelOptions();
  },

  /* ---------- Events ---------- */
  setupEventForm() {
    document.getElementById('btn-save-event').onclick = async () => {
      const title = document.getElementById('event-title').value.trim();
      const date = document.getElementById('event-date').value;
      const start = document.getElementById('event-start').value;
      const end = document.getElementById('event-end').value;
      const notes = document.getElementById('event-notes').value.trim();
      if (!title || !date || !start || !end) { alert('Please fill in title, date, and time'); return; }
      if (start >= end) { alert('End time must be after start time'); return; }
      try {
        await API.addEvent({ title, date, startTime: start, endTime: end, notes });
        this.closeModal();
        document.getElementById('event-title').value = '';
        document.getElementById('event-notes').value = '';
        Calendar.render();
        this.renderDashboard();
        App.toast('Plan saved! \u2764\ufe0f');
      } catch (e) { alert('Error: ' + e.message); }
    };
  },

  async deleteEvent(id) {
    if (!confirm('Delete this plan?')) return;
    try {
      await API.deleteEvent(id);
      Calendar.render();
      this.renderDashboard();
    } catch (e) { alert('Error: ' + e.message); }
  },

  /* ---------- Settings ---------- */
  async saveNickname() {
    const n = document.getElementById('settings-my-nickname').value.trim();
    if (n.length < 2) { alert('Nickname must be at least 2 characters'); return; }
    try {
      const data = await API.updateNickname(n);
      API.token = data.token;
      localStorage.setItem('token', data.token);
      this.user.nickname = data.nickname;
      this.updateUserBadge();
      this.renderDashboard();
      App.toast('Nickname updated!');
    } catch (e) { alert('Error: ' + e.message); }
  },

  async saveAnniversary() {
    const date = document.getElementById('settings-anniversary').value;
    if (!date) { alert('Please pick a date'); return; }
    try {
      const data = await API.setAnniversary(date);
      this.anniversary = data.anniversary;
      this.renderDashboard();
      App.toast('Anniversary saved! \u2764\uFE0F');
    } catch (e) { alert('Error: ' + e.message); }
  },

  async copyInviteCode() {
    const code = document.getElementById('settings-invite-code').value;
    try {
      await navigator.clipboard.writeText(code);
      App.toast('Invite code copied!');
    } catch {
      document.getElementById('settings-invite-code').select();
      document.execCommand('copy');
      App.toast('Invite code copied!');
    }
  },

  async renderSettings() {
    await this.loadCoupleInfo();
    document.getElementById('settings-my-nickname').value = this.user.nickname;
    await Promise.all([
      this.user && this.user.profilePhoto ? this.preloadPhoto(this.user.profilePhoto) : Promise.resolve(),
      this.partnerPfp ? this.preloadPhoto(this.partnerPfp) : Promise.resolve()
    ]);
    this.renderProfilePhotoPreview();
    try {
      const media = await API.getMedia();
      document.getElementById('storage-info').textContent = media.length + ' items';
    } catch {}
  },

  /* ---------- Dashboard ---------- */
  async renderDashboard() {
    const me = this.user.nickname;
    const partner = this.partnerName;
    document.getElementById('welcome-text').textContent = 'Hey ' + me + (partner && partner !== 'Waiting for partner...' ? ' & ' + partner : '') + '!';
    document.getElementById('welcome-together').textContent = this.formatTogether();
    this.renderWelcomeAvatars();
    this.drawWheel();
    this.setRecentMode(this.recentMode);

    try {
      const events = await API.getEvents();
      const now = Date.now();
      const upcoming = events.filter(e => new Date(e.date + 'T' + e.startTime + ':00').getTime() > now)
        .sort((a, b) => (a.date + 'T' + a.startTime).localeCompare(b.date + 'T' + b.startTime)).slice(0, 5);
      const pastCount = events.filter(e => new Date(e.date + 'T' + e.startTime + ':00').getTime() <= now).length;

      document.getElementById('welcome-sub').textContent = upcoming.length
        ? 'You have ' + upcoming.length + ' upcoming plan' + (upcoming.length > 1 ? 's' : '') + ' \u2764\ufe0f'
        : pastCount ? pastCount + ' memor' + (pastCount > 1 ? 'ies' : 'y') + ' together so far'
        : 'Start planning your first date!';

      const list = document.getElementById('upcoming-list');
      if (!upcoming.length) {
        list.innerHTML = '<div style="text-align:center;padding:24px;color:var(--text-light);font-size:14px;background:var(--card-bg);border-radius:var(--radius-sm);box-shadow:var(--shadow)">'
          + '<span style="font-size:32px;display:block;margin-bottom:8px">\uD83D\uDCC5</span>No upcoming plans<br>'
          + '<button class="btn-sm" style="margin-top:8px" onclick="App.openModal(\'event\')">Plan a Date</button></div>';
      } else {
        list.innerHTML = upcoming.map(e => {
          const t = new Date(e.date + 'T' + e.startTime + ':00').getTime();
          const diff = t - now;
          const days = Math.floor(diff / 86400000);
          const hours = Math.floor((diff % 86400000) / 3600000);
          let badge = e.startTime;
          if (days > 0) badge = days + 'd ' + hours + 'h';
          else if (hours > 0) badge = hours + 'h';
          else badge = 'Soon';
          return '<div class="event-card">'
            + '<div class="event-info"><h4>' + e.title + '</h4>'
            + '<p>' + new Date(e.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
            + ' \u2022 ' + e.startTime + '-' + e.endTime + (e.notes ? ' \u2022 ' + e.notes : '') + '</p></div>'
            + '<span class="event-time-badge">' + badge + '</span></div>';
        }).join('');
      }
    } catch {}

    this.renderRecentMedia();
  },

  mediaStats(m) {
    const likes = m.likeCount || 0;
    const comments = (m.comments && m.comments.length) || 0;
    if (!likes && !comments) return '';
    return '<div class="media-stats">'
      + (likes ? '<span>\u2764\uFE0F ' + likes + '</span>' : '')
      + (comments ? '<span>\uD83D\uDCAC ' + comments + '</span>' : '')
      + '</div>';
  },

  recentMode: localStorage.getItem('recentMode') || 'grid',
  slideInterval: null,

  setRecentMode(mode) {
    this.recentMode = mode;
    localStorage.setItem('recentMode', mode);
    document.querySelectorAll('.view-mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
    const container = document.getElementById('recent-media');
    container.className = mode === 'grid' ? 'recent-grid' : mode === 'slide' ? 'recent-slide' : 'recent-collage';
    this.renderRecentMedia();
  },

  stopSlideShow() {
    if (this.slideInterval) { clearInterval(this.slideInterval); this.slideInterval = null; }
  },

  async renderRecentMedia() {
    this.stopSlideShow();
    try {
      const all = await API.getMedia();
      const recent = all.slice(0, 12);
      const container = document.getElementById('recent-media');
      container.className = this.recentMode === 'grid' ? 'recent-grid' : this.recentMode === 'slide' ? 'recent-slide' : 'recent-collage';
      if (!recent.length) {
        container.innerHTML = '<div class="recent-empty"><span style="font-size:40px;display:block;margin-bottom:8px">\uD83D\uDCF8</span>No memories yet<br>'
          + '<button class="btn-sm" style="margin-top:8px" onclick="App.openModal(\'upload\')">Share your first</button></div>';
        return;
      }

      if (this.recentMode === 'slide') {
        container.innerHTML = recent.map((m, i) => {
          const url = m.url || '/uploads/' + m.filePath;
          const isImg = m.type === 'image';
          return '<div class="slide-item ' + (i === 0 ? 'active' : '') + '" data-slide="' + i + '" onclick="App.showViewer(\'' + m.id + '\')">'
            + (isImg ? '<img src="' + url + '" alt="">' : '<div class="vid-indicator">\u25B6\uFE0F</div><video src="' + url + '" preload="metadata"></video>')
            + this.mediaStats(m) + '</div>';
        }).join('') + '<div class="slide-dots">' + recent.map((_, i) => '<span class="slide-dot ' + (i === 0 ? 'active' : '') + '" data-dot="' + i + '"></span>').join('') + '</div>';
        let idx = 0;
        this.slideInterval = setInterval(() => {
          const items = container.querySelectorAll('.slide-item');
          const dots = container.querySelectorAll('.slide-dot');
          if (!items.length) return;
          items[idx].classList.remove('active');
          dots[idx] && dots[idx].classList.remove('active');
          idx = (idx + 1) % items.length;
          items[idx].classList.add('active');
          dots[idx] && dots[idx].classList.add('active');
        }, 3000);
        return;
      }

      if (this.recentMode === 'collage') {
        container.innerHTML = recent.map((m, i) => {
          const url = m.url || '/uploads/' + m.filePath;
          const isImg = m.type === 'image';
          const rot = (i % 2 === 0 ? -4 : 4) + (Math.random() * 4 - 2);
          const z = recent.length - i;
          return '<div class="collage-item" style="transform:rotate(' + rot.toFixed(1) + 'deg);z-index:' + z + '" onclick="App.showViewer(\'' + m.id + '\')">'
            + (isImg ? '<img src="' + url + '" alt="">' : '<div class="vid-indicator">\u25B6\uFE0F</div><video src="' + url + '" preload="metadata"></video>')
            + this.mediaStats(m) + '</div>';
        }).join('');
        return;
      }

      container.innerHTML = recent.slice(0, 6).map(m => {
        const url = m.url || '/uploads/' + m.filePath;
        if (m.type === 'image') {
          return '<div class="recent-item" onclick="App.showViewer(\'' + m.id + '\')"><img src="' + url + '" alt="">' + this.mediaStats(m) + '</div>';
        }
        return '<div class="recent-item" onclick="App.showViewer(\'' + m.id + '\')"><div class="vid-indicator">\u25B6\uFE0F</div><video src="' + url + '" preload="metadata"></video>' + this.mediaStats(m) + '</div>';
      }).join('');
    } catch {}
  },

  /* ---------- Decision Wheel ---------- */
  wheelSpinning: false,
  wheelAngle: 0,
  tempWheelOptions: [],

  wheelColors: ['#386641', '#6a994e', '#a7c957', '#bc4749', '#f2e8cf', '#386641', '#6a994e', '#a7c957', '#bc4749', '#f2e8cf', '#386641', '#6a994e'],

  drawWheel() {
    const canvas = document.getElementById('wheel-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const size = canvas.width;
    const cx = size / 2, cy = size / 2, r = size / 2 - 8;
    const options = this.wheelOptions || [];
    ctx.clearRect(0, 0, size, size);
    if (options.length < 2) {
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = 'var(--pink-light)';
      ctx.fill();
      ctx.fillStyle = 'var(--text-light)';
      ctx.font = '14px Nunito';
      ctx.textAlign = 'center';
      ctx.fillText('Add 2+ options', cx, cy + 5);
      return;
    }
    const slice = (Math.PI * 2) / options.length;
    options.forEach((opt, i) => {
      const start = i * slice;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, r, start, start + slice);
      ctx.closePath();
      ctx.fillStyle = this.wheelColors[i % this.wheelColors.length];
      ctx.fill();
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(start + slice / 2);
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 13px Nunito';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      ctx.fillText(opt.length > 10 ? opt.slice(0, 9) + '…' : opt, r - 14, 0);
      ctx.restore();
    });
    ctx.beginPath();
    ctx.arc(cx, cy, 42, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = 'var(--border)';
    ctx.lineWidth = 2;
    ctx.stroke();
  },

  spinWheel() {
    if (this.wheelSpinning || !this.wheelOptions || this.wheelOptions.length < 2) return;
    this.wheelSpinning = true;
    const canvas = document.getElementById('wheel-canvas');
    const resultEl = document.getElementById('wheel-result');
    const spinBtn = document.getElementById('btn-spin');
    spinBtn.disabled = true;
    resultEl.textContent = '';
    resultEl.classList.remove('show');

    const extraSpins = 6 + Math.floor(Math.random() * 4);
    const finalAngle = Math.random() * Math.PI * 2;
    const targetAngle = this.wheelAngle + extraSpins * Math.PI * 2 + finalAngle;
    this.wheelAngle = targetAngle;
    canvas.style.transform = 'rotate(' + (this.wheelAngle * 180 / Math.PI) + 'deg)';

    const onEnd = () => {
      canvas.removeEventListener('transitionend', onEnd);
      this.wheelSpinning = false;
      spinBtn.disabled = false;
      const slice = (Math.PI * 2) / this.wheelOptions.length;
      const pointerAngle = -Math.PI / 2;
      let relative = (pointerAngle - this.wheelAngle) % (Math.PI * 2);
      if (relative < 0) relative += Math.PI * 2;
      const idx = Math.floor(relative / slice) % this.wheelOptions.length;
      const winner = this.wheelOptions[idx];
      resultEl.textContent = '\u2728 ' + winner + '!';
      resultEl.classList.add('show');
    };
    canvas.addEventListener('transitionend', onEnd);
  },

  openWheelEditor() {
    this.tempWheelOptions = (this.wheelOptions || []).slice();
    this.renderWheelEditor();
    this.openModal('wheel');
  },

  renderWheelEditor() {
    const list = document.getElementById('wheel-options-list');
    if (!this.tempWheelOptions.length) {
      list.innerHTML = '<p style="color:var(--text-light);font-size:13px;text-align:center">No options yet</p>';
    } else {
      list.innerHTML = this.tempWheelOptions.map((opt, i) => '<div class="wheel-option-row">'
        + '<span>' + this.escapeHtml(opt) + '</span>'
        + '<button onclick="App.removeWheelOption(' + i + ')">\u00D7</button>'
        + '</div>').join('');
    }
  },

  addWheelOption() {
    const input = document.getElementById('wheel-new-option');
    const val = input.value.trim();
    if (!val) return;
    if (this.tempWheelOptions.length >= 12) { alert('Max 12 options'); return; }
    this.tempWheelOptions.push(val);
    input.value = '';
    this.renderWheelEditor();
  },

  removeWheelOption(i) {
    this.tempWheelOptions.splice(i, 1);
    this.renderWheelEditor();
  },

  async saveWheelOptions() {
    try {
      const data = await API.setWheelOptions(this.tempWheelOptions);
      this.wheelOptions = data.wheelOptions;
      this.drawWheel();
      this.closeModal();
      App.toast('Wheel options saved!');
    } catch (e) { alert('Error: ' + e.message); }
  },

  /* ---------- Home Section Toggle ---------- */
  homeSection: localStorage.getItem('homeSection') || 'wheel',
  loveNotesInterval: null,

  setHomeSection(section, skipAnim) {
    this.homeSection = section;
    localStorage.setItem('homeSection', section);

    document.querySelectorAll('.toggle-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.section === section);
    });

    const wheelPanel = document.getElementById('home-wheel-panel');
    const lovePanel = document.getElementById('home-love-panel');
    const datesPanel = document.getElementById('home-dates-panel');
    if (!wheelPanel || !lovePanel || !datesPanel) return;

    if (section === 'wheel') {
      lovePanel.classList.remove('active');
      datesPanel.classList.remove('active');
      wheelPanel.classList.add('active');
      this.stopLoveNotesTimer();
    } else if (section === 'love') {
      wheelPanel.classList.remove('active');
      datesPanel.classList.remove('active');
      lovePanel.classList.add('active');
      this.renderLoveNotes();
    } else if (section === 'dates') {
      wheelPanel.classList.remove('active');
      lovePanel.classList.remove('active');
      datesPanel.classList.add('active');
      this.renderDateList();
    }
  },

  stopLoveNotesTimer() {
    if (this.loveNotesInterval) { clearInterval(this.loveNotesInterval); this.loveNotesInterval = null; }
  },

  /* ---------- Love Notes ---------- */
  setupLoveNotes() {
    document.getElementById('btn-save-love-note').onclick = () => this.saveLoveNote();
  },

  setupDateChecklist() {
    document.getElementById('btn-save-date').onclick = () => this.saveDate();
  },

  openLoveNoteComposer() {
    const select = document.getElementById('love-note-to');
    select.innerHTML = '';
    const recipients = (this.coupleUsers || []).filter(u => u.id !== this.user.id);
    if (!recipients.length) {
      select.innerHTML = '<option value="">Waiting for partner...</option>';
      document.getElementById('btn-save-love-note').disabled = true;
    } else {
      recipients.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.nickname;
        select.appendChild(opt);
      });
      document.getElementById('btn-save-love-note').disabled = false;
    }

    document.getElementById('love-note-title').value = '';
    document.getElementById('love-note-content').value = '';
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    document.getElementById('love-note-unlock').value = now.toISOString().slice(0, 16);
    this.openModal('love-note');
  },

  async saveLoveNote() {
    const toUserId = document.getElementById('love-note-to').value;
    const title = document.getElementById('love-note-title').value.trim();
    const content = document.getElementById('love-note-content').value.trim();
    const unlockVal = document.getElementById('love-note-unlock').value;
    if (!toUserId) { alert('Please select a recipient'); return; }
    if (!content) { alert('Please write something'); return; }
    const btn = document.getElementById('btn-save-love-note');
    btn.disabled = true; btn.textContent = 'Sending...';
    try {
      await API.addLoveNote({ toUserId, title, content, unlockAt: unlockVal ? new Date(unlockVal).toISOString() : new Date().toISOString() });
      this.closeModal();
      App.toast('Love letter sent! ❤️');
      if (this.homeSection === 'love') this.renderLoveNotes();
    } catch (e) { alert('Error: ' + e.message); }
    btn.disabled = false; btn.textContent = 'Send Letter';
  },

  async deleteLoveNote(id) {
    if (!confirm('Delete this love letter?')) return;
    try {
      await API.deleteLoveNote(id);
      this.renderLoveNotes();
      App.toast('Deleted');
    } catch (e) { alert('Error: ' + e.message); }
  },

  async renderLoveNotes() {
    this.stopLoveNotesTimer();
    const list = document.getElementById('love-notes-list');
    if (!list) return;

    const recipients = (this.coupleUsers || []).filter(u => u.id !== this.user.id);
    const writeBtn = document.getElementById('btn-new-love-note');
    if (writeBtn) writeBtn.disabled = !recipients.length;

    try {
      const notes = await API.getLoveNotes();
      if (!notes.length) {
        list.innerHTML = '<div class="love-empty"><span style="font-size:40px;display:block;margin-bottom:8px">✉️</span>No love notes yet<br><button class="btn-sm" style="margin-top:8px" onclick="App.openLoveNoteComposer()">Write the first one</button></div>';
        return;
      }

      list.innerHTML = notes.map(n => this.loveNoteHtml(n)).join('');
      this.updateLoveNoteCountdowns();
      this.loveNotesInterval = setInterval(() => this.updateLoveNoteCountdowns(), 1000);
    } catch {
      list.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px">Failed to load love notes</p>';
    }
  },

  loveNoteHtml(n) {
    const isRecipient = n.to.id === this.user.id;
    const isLocked = !n.isUnlocked && isRecipient;
    const unlockDate = new Date(n.unlockAt);
    const unlockStr = isNaN(unlockDate.getTime()) ? n.unlockAt : unlockDate.toLocaleString();
    const createdStr = new Date(n.createdAt).toLocaleString();

    let statusBadge = '';
    if (isLocked) {
      statusBadge = '<span class="love-status locked" data-unlock="' + n.unlockAt + '">🔒 Locked</span>';
    } else if (!n.isUnlocked && n.isMine) {
      statusBadge = '<span class="love-status sealed">Sealed until ' + this.escapeHtml(unlockStr) + '</span>';
    } else {
      statusBadge = '<span class="love-status open">Open</span>';
    }

    const titleHtml = '<span class="love-note-title">' + this.escapeHtml(n.title || 'Untitled') + '</span>';
    const metaHtml = '<div class="love-note-meta-line"><span>From <b>' + this.escapeHtml(n.from.nickname) + '</b> → To <b>' + this.escapeHtml(n.to.nickname) + '</b></span><span class="love-note-date">' + createdStr + '</span></div>';

    let bodyHtml = '';
    if (isLocked) {
      bodyHtml = '<div class="love-sealed"><span>💌</span><p>This letter is sealed until ' + this.escapeHtml(unlockStr) + '</p><div class="love-countdown" data-unlock="' + n.unlockAt + '">Unlocking soon...</div></div>';
    } else {
      bodyHtml = '<div class="love-content">' + this.escapeHtml(n.content || '').replace(/\n/g, '<br>') + '</div>';
    }

    const deleteBtn = n.canDelete
      ? '<button class="btn-sm" style="background:#fee;color:var(--danger)" onclick="event.stopPropagation();App.deleteLoveNote(\'' + n.id + '\')">Delete</button>'
      : '';

    return '<div class="love-note-card ' + (isLocked ? 'love-locked' : '') + '" data-note-id="' + n.id + '">'
      + '<div class="love-note-index" onclick="App.toggleLoveNote(this)">'
      + '<div class="love-index-left">' + titleHtml + '<span class="love-index-meta">' + this.escapeHtml(n.from.nickname) + ' • ' + createdStr + '</span></div>'
      + statusBadge
      + '</div>'
      + '<div class="love-note-body">'
      + metaHtml
      + bodyHtml
      + '<div class="love-note-footer">' + deleteBtn + '</div>'
      + '</div>'
      + '</div>';
  },

  toggleLoveNote(el) {
    const card = el.closest('.love-note-card');
    if (!card) return;
    card.classList.toggle('open');
  },

  updateLoveNoteCountdowns() {
    const now = Date.now();
    let needsRefresh = false;
    document.querySelectorAll('.love-countdown').forEach(el => {
      const unlock = new Date(el.dataset.unlock).getTime();
      if (isNaN(unlock)) { el.textContent = ''; return; }
      const diff = unlock - now;
      if (diff <= 0) {
        el.textContent = 'Unlocking now...';
        needsRefresh = true;
        return;
      }
      const days = Math.floor(diff / 86400000);
      const hours = Math.floor((diff % 86400000) / 3600000);
      const minutes = Math.floor((diff % 3600000) / 60000);
      const seconds = Math.floor((diff % 60000) / 1000);
      let text = '';
      if (days > 0) text += days + 'd ';
      if (hours > 0 || days > 0) text += hours + 'h ';
      text += minutes + 'm ' + seconds + 's';
      el.textContent = 'Unlocks in ' + text;
    });

    document.querySelectorAll('.love-status.locked').forEach(el => {
      const unlock = new Date(el.dataset.unlock).getTime();
      if (!isNaN(unlock) && unlock <= now) needsRefresh = true;
    });

    if (needsRefresh && this.homeSection === 'love') this.renderLoveNotes();
  },

  /* ---------- Gallery ---------- */
  async renderGallery() {
    try {
      const all = await API.getMedia();
      const container = document.getElementById('gallery-grid');
      if (!all.length) {
        container.innerHTML = '<div class="gallery-empty"><span>\uD83D\uDCF8</span><p>Your gallery is empty</p>'
          + '<button class="btn-sm" style="margin-top:8px" onclick="App.openModal(\'upload\')">Share a memory</button></div>';
        return;
      }
      container.innerHTML = all.map(m => {
        const url = m.url || '/uploads/' + m.filePath;
        let html = '';
        if (m.type === 'image') {
          html = '<img src="' + url + '" alt="">';
        } else {
          html = '<div class="vid-badge">\u25B6 Video</div><video src="' + url + '" preload="metadata"></video>';
        }
        if (m.caption) html += '<div class="caption-overlay">' + m.caption + '</div>';
        html += this.mediaStats(m);
        return '<div class="gallery-item" onclick="App.showViewer(\'' + m.id + '\')">' + html + '</div>';
      }).join('');
    } catch {}
  },

  /* ---------- Date Checklist ---------- */
  async renderDateList() {
    const list = document.getElementById('dates-list');
    if (!list) return;
    try {
      const items = await API.getDates();
      if (!items.length) {
        list.innerHTML = '<div class="love-empty"><span style="font-size:40px;display:block;margin-bottom:8px">📅</span>No date ideas yet<br><button class="btn-sm" style="margin-top:8px" onclick="App.openDateComposer()">Add your first date idea</button></div>';
        return;
      }
      list.innerHTML = items.map(d => this.dateItemHtml(d)).join('');
    } catch {
      list.innerHTML = '<p style="text-align:center;color:var(--text-light);padding:20px">Failed to load date ideas</p>';
    }
  },

  dateItemHtml(d) {
    const isDone = d.isDone;
    const evidenceImg = d.evidenceUrl
      ? '<img src="' + d.evidenceUrl + '" alt="" class="date-evidence" onclick="App.viewDateEvidence(\'' + d.id + '\')">'
      : '';

    let doneInfo = '';
    if (isDone && d.doneBy) {
      const doneDate = d.doneAt ? new Date(d.doneAt).toLocaleString() : '';
      doneInfo = '<span class="date-done-info">Done by ' + this.escapeHtml(d.doneBy) + (doneDate ? ' • ' + doneDate : '') + '</span>';
    }

    const actions = isDone
      ? '<div class="date-actions">'
        + '<label class="date-evidence-label" title="Add photo evidence">📷<input type="file" accept="image/*" hidden onchange="App.uploadDateEvidence(\'' + d.id + '\', this.files[0])"></label>'
        + '<button class="btn-sm" style="background:#fee;color:var(--danger)" onclick="App.deleteDate(\'' + d.id + '\')">Delete</button>'
        + '</div>'
      : '<div class="date-actions">'
        + '<button class="btn-sm" onclick="App.toggleDate(\'' + d.id + '\', true)">Done</button>'
        + '<button class="btn-sm" style="background:#fee;color:var(--danger)" onclick="App.deleteDate(\'' + d.id + '\')">Delete</button>'
        + '</div>';

    return '<div class="date-item' + (isDone ? ' date-done' : '') + '">'
      + '<div class="date-item-header">'
      + '<span class="date-check" onclick="App.toggleDate(\'' + d.id + '\', ' + (!isDone) + ')">' + (isDone ? '✅' : '⬜') + '</span>'
      + '<div class="date-info"><strong>' + this.escapeHtml(d.title) + '</strong>'
      + (d.description ? '<p>' + this.escapeHtml(d.description) + '</p>' : '')
      + doneInfo
      + '</div>'
      + '</div>'
      + evidenceImg
      + actions
      + '</div>';
  },

  openDateComposer() {
    document.getElementById('date-title').value = '';
    document.getElementById('date-description').value = '';
    this.openModal('date');
  },

  async saveDate() {
    const title = document.getElementById('date-title').value.trim();
    const description = document.getElementById('date-description').value.trim();
    if (!title) { alert('Please enter a date idea'); return; }
    const btn = document.getElementById('btn-save-date');
    btn.disabled = true; btn.textContent = 'Adding...';
    try {
      await API.addDate({ title, description });
      this.closeModal();
      App.toast('Date idea added! ❤️');
      if (this.homeSection === 'dates') this.renderDateList();
    } catch (e) { alert('Error: ' + e.message); }
    btn.disabled = false; btn.textContent = 'Add Idea';
  },

  async toggleDate(id, markDone) {
    const formData = new FormData();
    formData.append('isDone', markDone ? 'true' : 'false');
    try {
      await API.updateDate(id, formData);
      this.renderDateList();
    } catch (e) { alert('Error: ' + e.message); }
  },

  async uploadDateEvidence(id, file) {
    if (!file) return;
    const formData = new FormData();
    formData.append('evidence', file);
    try {
      await API.updateDate(id, formData);
      this.renderDateList();
      App.toast('Evidence photo added!');
    } catch (e) { alert('Error: ' + e.message); }
  },

  viewDateEvidence(id) {
    const card = document.querySelector('.date-item[data-id="' + id + '"] .date-evidence');
    if (card) {
      // Could open in a lightbox, but for now just let the img click do nothing extra
    }
  },

  async deleteDate(id) {
    if (!confirm('Delete this date idea?')) return;
    try {
      await API.deleteDate(id);
      this.renderDateList();
      App.toast('Deleted');
    } catch (e) { alert('Error: ' + e.message); }
  },

  /* ---------- Media Viewer ---------- */
  currentMedia: null,

  async showViewer(id) {
    try {
      const all = await API.getMedia();
      const item = all.find(m => m.id === id);
      if (!item) return;
      this.currentMedia = item;
      document.getElementById('view-caption').textContent = item.caption || 'No caption';
      document.getElementById('view-uploader').textContent = 'by ' + (item.uploadedBy || 'Unknown') + ' \u2022 ' + new Date(item.createdAt).toLocaleDateString();
      const body = document.getElementById('view-body');
      const url = item.url || '/uploads/' + item.filePath;
      if (item.type === 'image') {
        body.innerHTML = '<img src="' + url + '" alt="">';
      } else {
        body.innerHTML = '<video src="' + url + '" controls autoplay></video>';
      }
      this.renderViewerLikes(item);
      this.renderViewerComments(item);
      document.getElementById('btn-delete-media').onclick = async () => {
        if (!confirm('Delete this memory?')) return;
        try { await API.deleteMedia(item.id); this.closeModal(); this.refresh(); App.toast('Deleted'); }
        catch (e) { alert('Error: ' + e.message); }
      };
      document.getElementById('btn-like-media').onclick = async () => {
        try {
          const data = await API.likeMedia(item.id);
          item.likedByMe = data.liked;
          item.likeCount = data.count;
          item.likes = data.liked
            ? ((item.likes || []).concat([this.user.id]))
            : ((item.likes || []).filter(uid => uid !== this.user.id));
          this.renderViewerLikes(item);
          this.renderRecentMedia();
          this.renderGallery();
        } catch (e) { alert('Error: ' + e.message); }
      };
      document.getElementById('btn-post-comment').onclick = () => this.postComment(item.id);
      document.getElementById('comment-input').onkeydown = (e) => { if (e.key === 'Enter') this.postComment(item.id); };
      this.openModal('view');
    } catch {}
  },

  renderViewerLikes(item) {
    const btn = document.getElementById('btn-like-media');
    const count = document.getElementById('view-like-count');
    btn.textContent = item.likedByMe ? '\u2764\uFE0F' : '\u2661';
    btn.classList.toggle('liked', !!item.likedByMe);
    const n = item.likeCount || 0;
    count.textContent = n + ' like' + (n === 1 ? '' : 's');
  },

  renderViewerComments(item) {
    const list = document.getElementById('comments-list');
    const comments = item.comments || [];
    if (!comments.length) {
      list.innerHTML = '<p class="comments-empty">No comments yet</p>';
      return;
    }
    list.innerHTML = comments.map(c => '<div class="comment-item">'
      + '<span class="comment-author">' + (c.nickname || 'Unknown') + '</span>'
      + '<span class="comment-text">' + this.escapeHtml(c.text) + '</span>'
      + (c.isMine ? '<button class="comment-delete" onclick="App.deleteComment(\'' + item.id + '\', \'' + c.id + '\')">\u00D7</button>' : '')
      + '</div>').join('');
  },

  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  },

  async postComment(mediaId) {
    const input = document.getElementById('comment-input');
    const text = input.value.trim();
    if (!text) return;
    const btn = document.getElementById('btn-post-comment');
    btn.disabled = true;
    try {
      const comment = await API.addComment(mediaId, text);
      input.value = '';
      if (this.currentMedia && this.currentMedia.id === mediaId) {
        this.currentMedia.comments = this.currentMedia.comments || [];
        this.currentMedia.comments.push(comment);
        this.renderViewerComments(this.currentMedia);
        this.renderRecentMedia();
        this.renderGallery();
      }
    } catch (e) { alert('Error: ' + e.message); }
    btn.disabled = false;
  },

  async deleteComment(mediaId, commentId) {
    if (!confirm('Delete this comment?')) return;
    try {
      await API.deleteComment(mediaId, commentId);
      if (this.currentMedia && this.currentMedia.id === mediaId) {
        this.currentMedia.comments = (this.currentMedia.comments || []).filter(c => c.id !== commentId);
        this.renderViewerComments(this.currentMedia);
        this.renderRecentMedia();
        this.renderGallery();
      }
    } catch (e) { alert('Error: ' + e.message); }
  },

  /* ---------- Refresh ---------- */
  async refresh() {
    this.updateUserBadge();
    this.renderDashboard();
    Calendar.render();
    this.renderGallery();
    this.renderSettings();
    if (this.homeSection === 'love') this.renderLoveNotes();
    if (this.homeSection === 'dates') this.renderDateList();
  },

  /* ---------- Toast ---------- */
  toast(msg) {
    const existing = document.querySelector('.toast');
    if (existing) existing.remove();
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => { el.remove(); }, 2500);
  }
};

document.addEventListener('DOMContentLoaded', () => App.init());
