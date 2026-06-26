const fs = require('fs');
const path = require('path');
const supabase = require('./supabase');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'couple-app';
const DB_PATH = path.join(__dirname, 'data.json');

async function main() {
  if (!supabase) {
    console.error('Supabase not configured. Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));

  // 1. Upload profile photos to storage
  for (const user of raw.users) {
    if (!user.profile_photo) continue;
    const localPath = path.join(__dirname, 'uploads', 'profiles', user.profile_photo);
    if (fs.existsSync(localPath)) {
      const storagePath = 'profiles/' + user.profile_photo;
      console.log('Uploading profile photo:', storagePath);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fs.readFileSync(localPath), { contentType: 'image/jpeg', upsert: true });
      if (error) console.error('  Failed:', error.message);
      else console.log('  OK');
    }
  }

  // 2. Upload media files to storage
  for (const m of raw.media) {
    if (!m.file_path) continue;
    const localPath = path.join(__dirname, 'uploads', m.file_path);
    if (fs.existsSync(localPath)) {
      const storagePath = 'media/' + m.file_path;
      console.log('Uploading media:', storagePath);
      const ext = path.extname(m.file_path);
      const ct = ['.jpg','.jpeg'].includes(ext) ? 'image/jpeg'
        : ext === '.png' ? 'image/png'
        : ext === '.mp4' ? 'video/mp4'
        : 'application/octet-stream';
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(storagePath, fs.readFileSync(localPath), { contentType: ct, upsert: true });
      if (error) console.error('  Failed:', error.message);
      else console.log('  OK');
    }
  }

  // 3. Upload date evidence files
  for (const d of raw.date_checklist || []) {
    if (!d.evidence_file_path) continue;
    const localPath = path.join(__dirname, 'uploads', d.evidence_file_path);
    if (fs.existsSync(localPath)) {
      console.log('Uploading evidence:', d.evidence_file_path);
      const { error } = await supabase.storage
        .from(BUCKET)
        .upload(d.evidence_file_path, fs.readFileSync(localPath), { contentType: 'image/jpeg', upsert: true });
      if (error) console.error('  Failed:', error.message);
      else console.log('  OK');
    }
  }

  // 4. Insert users
  for (const u of raw.users) {
    console.log('Inserting user:', u.nickname);
    const { error } = await supabase.from('users').upsert(u, { onConflict: 'id' });
    if (error) console.error('  Failed:', error.message);
    else console.log('  OK');
  }

  // 5. Insert couple_settings
  if (raw.couple_settings) {
    for (const [spaceId, settings] of Object.entries(raw.couple_settings)) {
      console.log('Inserting couple_settings for:', spaceId);
      const { error } = await supabase.from('couple_settings').upsert(
        { space_id: spaceId, ...settings },
        { onConflict: 'space_id' }
      );
      if (error) console.error('  Failed:', error.message);
      else console.log('  OK');
    }
  }

  // 6. Insert events
  for (const e of raw.events) {
    console.log('Inserting event:', e.title);
    const { error } = await supabase.from('events').upsert(e, { onConflict: 'id' });
    if (error) console.error('  Failed:', error.message);
    else console.log('  OK');
  }

  // 7. Insert media records
  for (const m of raw.media) {
    console.log('Inserting media:', m.id);
    const { error } = await supabase.from('media').upsert(m, { onConflict: 'id' });
    if (error) console.error('  Failed:', error.message);
    else console.log('  OK');
  }

  // 8. Insert love_notes
  for (const n of raw.love_notes || []) {
    console.log('Inserting love note:', n.id);
    const { error } = await supabase.from('love_notes').upsert(n, { onConflict: 'id' });
    if (error) console.error('  Failed:', error.message);
    else console.log('  OK');
  }

  // 9. Insert date_checklist
  for (const d of raw.date_checklist || []) {
    console.log('Inserting date:', d.title);
    const { error } = await supabase.from('date_checklist').upsert(d, { onConflict: 'id' });
    if (error) console.error('  Failed:', error.message);
    else console.log('  OK');
  }

  console.log('\nMigration complete!');
}

main().catch(e => { console.error(e); process.exit(1); });
