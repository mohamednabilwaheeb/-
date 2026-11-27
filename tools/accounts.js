// Runs on GitHub Actions every few minutes with the Firebase service account.
// 1) registers the project admin by uid, 2) reserves usernames, 3) issues temporary passwords requested by the admin.
const admin = require('firebase-admin');
admin.initializeApp({ credential: admin.credential.cert(JSON.parse(process.env.FB_SA)) });
const db = admin.firestore(), auth = admin.auth();
const ADMIN_EMAIL = 'haithamfawzy@dhahiat-sumou.app';
const A = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
const temp = () => Array.from(require('crypto').randomBytes(8), b => A[b % A.length]).join('');
(async () => {
  try { const u = await auth.getUserByEmail(ADMIN_EMAIL); await db.doc('admins/' + u.uid).set({ email: ADMIN_EMAIL, t: Date.now() }, { merge: true }); }
  catch (e) { if (e.code !== 'auth/user-not-found') console.log('admin', e.message); }
  const users = await db.collection('users').get();
  for (const d of users.docs) {
    const un = (d.data().username || '').toLowerCase(); if (!un) continue;
    const ref = db.doc('unames/' + un); const s = await ref.get();
    if (!s.exists) { try { const au = await auth.getUser(d.id); await ref.set({ uid: d.id, email: au.email, t: Date.now() }); console.log('reserved', un); } catch (e) { } }
  }
  const jobs = await db.collection('pwreset').where('status', '==', 'pending').get();
  for (const j of jobs.docs) {
    const uid = j.data().uid || j.id;
    try {
      const pw = temp(); await auth.updateUser(uid, { password: pw });
      await db.doc('users/' + uid).set({ mustChange: true }, { merge: true });
      await j.ref.update({ status: 'done', temp: pw, doneAt: Date.now() }); console.log('reset', uid);
    } catch (e) { await j.ref.update({ status: 'error', err: String(e.message || e) }); console.log('reset failed', uid, e.message); }
  }
  const old = await db.collection('pwreset').where('status', '==', 'done').get();
  for (const j of old.docs) if (Date.now() - (j.data().doneAt || 0) > 2 * 864e5) await j.ref.delete();
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
