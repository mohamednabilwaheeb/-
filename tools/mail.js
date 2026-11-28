// E-mail jobs, run from accounts.js every few minutes on GitHub Actions:
//  1) account e-mails (verify / change address / password reset) queued by the app in `mailq`, sent from the project Gmail
//  2) weekly backup (Thursday 12:00 Makkah time) sent to the admin's verified e-mail
const fs = require('fs'), path = require('path');
const FROM_USER = 'dhahiatsumoumakkahtaam@gmail.com', FROM_NAME = 'Dhahiat Sumou Makkah TAAM';
const ADMIN_EMAIL = 'haithamfawzy@dhahiat-sumou.app';
const legacy = m => /@dhahiat-sumou\.app$/i.test(m || '');

module.exports = async function (db, auth) {
  const pass = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '');
  let tx = null;
  if (pass) {
    const nm = require('nodemailer');
    tx = nm.createTransport({ service: 'gmail', auth: { user: FROM_USER, pass } });
    try { await tx.verify(); } catch (e) { console.log('gmail login failed', e.message); tx = null; }
  }
  const logo = path.join(__dirname, 'logo.png');
  const shell = (title, body) => `<!doctype html><html dir="rtl" lang="ar"><body style="margin:0;background:#f3f4f6;font-family:Tahoma,Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0"><tr><td align="center">
<table width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border-radius:14px;overflow:hidden;border:1px solid #e5e7eb">
<tr><td style="padding:18px 24px;border-bottom:4px solid #a91a2c" align="left"><img src="cid:taamlogo" alt="TAAM" height="54"></td></tr>
<tr><td style="padding:24px;color:#13294b;font-size:15px;line-height:1.9;text-align:right">
<h2 style="margin:0 0 12px;font-size:19px;color:#13294b">${title}</h2>${body}</td></tr>
<tr><td style="padding:14px 24px;background:#f9fafb;color:#6b7280;font-size:12px;text-align:right">تطبيق Dhahiat Sumou Makkah TAAM — إدارة مشروع ضاحية سمو، بلوك 5<br>شركة تام للإنشاء والتعمير<br>هذه رسالة آلية، يُرجى عدم الرد عليها.</td></tr>
</table></td></tr></table></body></html>`;
  const btn = (href, t) => `<p style="margin:22px 0;text-align:center"><a href="${href}" style="background:#a91a2c;color:#fff;text-decoration:none;padding:12px 26px;border-radius:10px;font-weight:bold;display:inline-block">${t}</a></p>
<p style="font-size:12px;color:#6b7280">إن لم يعمل الزر، انسخ الرابط التالي وافتحه في المتصفح:<br><span dir="ltr" style="word-break:break-all">${href}</span></p>`;
  const send = (to, subject, title, body, att = []) => tx.sendMail({ from: `"${FROM_NAME}" <${FROM_USER}>`, to, subject, html: shell(title, body),
    attachments: [{ filename: 'logo.png', path: logo, cid: 'taamlogo' }, ...att] });
  const hi = n => `<p>${n ? `السيد/ة ${n}،` : 'عزيزي المستخدم،'}<br>السلام عليكم ورحمة الله وبركاته،</p>`;

  /* ---------- 1) account e-mails ---------- */
  const q = await db.collection('mailq').where('status', '==', 'new').limit(50).get();
  for (const d of q.docs) {
    const j = d.data(); let st = 'done', err = '';
    try {
      if (!tx) { st = 'nomail'; }
      else if (j.k === 'verify') {
        const u = await auth.getUser(j.uid);
        if (u.emailVerified || legacy(u.email)) st = 'skip';
        else { const link = await auth.generateEmailVerificationLink(u.email);
          await send(u.email, 'تأكيد البريد الإلكتروني — Dhahiat Sumou Makkah TAAM', 'تأكيد البريد الإلكتروني',
            hi(u.displayName) + '<p>شكراً لتسجيلك في تطبيق Dhahiat Sumou Makkah TAAM. يُرجى تأكيد بريدك الإلكتروني بالضغط على الزر التالي، وهذا مطلوب لاعتماد حسابك.</p>' + btn(link, 'تأكيد البريد الإلكتروني') + '<p>إن لم تكن أنت من أنشأ هذا الحساب، يمكنك تجاهل هذه الرسالة.</p>'); }
      } else if (j.k === 'change') {
        const u = await auth.getUser(j.uid); const to = String(j.to || '').toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to) || legacy(to)) st = 'skip';
        else { const link = await auth.generateVerifyAndChangeEmailLink(u.email, to);
          await send(to, 'تأكيد إضافة البريد الإلكتروني — Dhahiat Sumou Makkah TAAM', 'تأكيد إضافة البريد الإلكتروني',
            hi(u.displayName) + '<p>طلبتَ إضافة هذا البريد الإلكتروني إلى حسابك في تطبيق Dhahiat Sumou Makkah TAAM. يُرجى التأكيد بالضغط على الزر التالي، وبعدها يمكنك تسجيل الدخول بالبريد الإلكتروني أو باسم المستخدم.</p>' + btn(link, 'تأكيد البريد الإلكتروني') + '<p>إن لم تطلب ذلك، يمكنك تجاهل هذه الرسالة.</p>'); }
      } else if (j.k === 'reset') {
        const to = String(j.to || '').toLowerCase();
        const recent = (await db.collection('mailq').where('to', '==', to).get()).docs.filter(x => x.id !== d.id && x.data().status === 'done' && Date.now() - (x.data().doneAt || 0) < 36e5).length;
        if (recent >= 3) st = 'limit';
        else { let u = null; try { u = await auth.getUserByEmail(to); } catch (e) { }
          if (!u) st = 'skip';
          else { const link = await auth.generatePasswordResetLink(to);
            await send(to, 'إعادة تعيين كلمة المرور — Dhahiat Sumou Makkah TAAM', 'إعادة تعيين كلمة المرور',
              hi(u.displayName) + '<p>تلقّينا طلباً لإعادة تعيين كلمة المرور لحسابك في تطبيق Dhahiat Sumou Makkah TAAM. اضغط على الزر التالي لتعيين كلمة مرور جديدة.</p>' + btn(link, 'تعيين كلمة مرور جديدة') + '<p>إن لم تطلب ذلك، يمكنك تجاهل هذه الرسالة، وستبقى كلمة المرور الحالية كما هي.</p>'); } }
      } else st = 'skip';
    } catch (e) { st = 'error'; err = String(e.message || e).slice(0, 200); }
    await d.ref.update({ status: st, err, doneAt: Date.now() }); console.log('mail', j.k, st, err);
  }
  const oldq = await db.collection('mailq').where('t', '<', Date.now() - 7 * 864e5).get();
  for (const d of oldq.docs) await d.ref.delete();

  /* ---------- 2) weekly backup ---------- */
  const now = new Date(Date.now() + 3 * 36e5); // Makkah time (UTC+3)
  const wk = (() => { const d = new Date(now); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 3) % 7)); return d.toISOString().slice(0, 10); })(); // week starting Saturday
  const sys = db.doc('sys/backup'), ss = await sys.get(), sd = ss.exists ? ss.data() : {};
  const force = process.env.FORCE_BACKUP === '1';
  const due = force || (now.getUTCDay() === 4 && now.getUTCHours() >= 12 && sd.week !== wk);
  if (!due) return;
  let to = '';
  try { const au = await auth.getUserByEmail(ADMIN_EMAIL); const ud = (await db.doc('users/' + au.uid).get()).data() || {};
    if (ud.email && !legacy(ud.email)) { const a2 = await auth.getUserByEmail(ud.email).catch(() => null); if (a2 && a2.emailVerified) to = ud.email; } } catch (e) { }
  if (!to) { // the admin may have moved his account to his own e-mail
    const ad = await db.collection('admins').get();
    for (const a of ad.docs) { try { const u = await auth.getUser(a.id); if (u.email && !legacy(u.email) && u.emailVerified) { to = u.email; break; } } catch (e) { } } }
  if (!tx) { await sys.set({ status: 'nomail', t: Date.now() }, { merge: true }); console.log('backup: gmail not configured'); return; }
  if (!to) { await sys.set({ status: 'unverified', t: Date.now() }, { merge: true }); console.log('backup: admin e-mail not verified'); return; }
  const ExcelJS = require('exceljs'); const wb = new ExcelJS.Workbook();
  const RLM = '‏', ar = s => (typeof s === 'string' && /[؀-ۿ]/.test(s) ? RLM + s : s);
  const sheet = (name, cols, rows) => { // columns physically run from the right
    const ws = wb.addWorksheet(name, { views: [{ rightToLeft: false }] }); const n = cols.length;
    ws.columns = cols.slice().reverse().map(c => ({ width: c[1] }));
    const h = ws.getRow(1); cols.forEach((c, i) => { const cell = h.getCell(n - i); cell.value = ar(c[0]); cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFA91A2C' } }; cell.alignment = { horizontal: 'center', vertical: 'middle', readingOrder: 'rtl', wrapText: true }; });
    rows.forEach((r, k) => { const row = ws.getRow(k + 2); r.forEach((v, i) => { const cell = row.getCell(n - i); cell.value = ar(v == null ? '' : v);
      cell.alignment = { horizontal: typeof v === 'number' ? 'center' : 'right', vertical: 'middle', readingOrder: 'rtl', wrapText: true }; }); });
    return ws; };
  const all = async c => (await db.collection(c).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const dt = t => t ? new Date(t + 3 * 36e5).toISOString().slice(0, 16).replace('T', ' ') : '';
  const users = await all('users'), cos = await all('companies'), v = await all('v'), prog = await all('prog'), rep = await all('rep');
  const coN = Object.fromEntries(cos.map(c => [c.id, c.name]));
  sheet('الحسابات', [['م', 5], ['الاسم', 24], ['اسم المستخدم', 18], ['البريد الإلكتروني', 30], ['النوع', 10], ['الشركة', 26], ['الحالة', 12]],
    users.map((u, i) => [i + 1, u.name || '', u.username || '', u.email || '', u.role === 'contractor' ? 'مقاول' : 'فريق تام', coN[u.company] || '', u.disabled ? 'موقوف' : u.approved ? 'مفعّل' : 'بانتظار الاعتماد']));
  sheet('المقاولون', [['م', 5], ['الشركة', 34], ['الفلل في الموقف التنفيذي', 18], ['الحالة', 10]], cos.map((c, i) => [i + 1, c.name || '', c.pco || '', c.active === false ? 'موقوفة' : 'نشطة']));
  const SN = { o: 'مفتوحة', p: 'قيد التنفيذ', c: 'مغلقة' }, marks = [];
  for (const d of v) for (const p of [1, 2]) Object.values((d['p' + p] || {}).marks || {}).sort((a, b) => (a.t || 0) - (b.t || 0)).forEach((m, i) =>
    marks.push([d.id.split('-').pop(), d.id, p, i + 1, m.note || '', SN[m.st] || 'مفتوحة', m.by || '', dt(m.t), m.cby || '']));
  marks.sort((a, b) => (+a[0] - +b[0]) || (a[2] - b[2]));
  sheet('ملاحظات Snag List', [['الفيلا', 8], ['الرمز', 12], ['المرحلة', 8], ['رقم الملاحظة', 10], ['الملاحظة', 46], ['الحالة', 12], ['بواسطة', 18], ['التاريخ', 17], ['أُغلقت بواسطة', 18]], marks);
  const IT = ['remw', 'remp', 'prep', 'elec', 'mech', 'plas', 'slope', 'foam', 'wp', 'flood', 'th', 'fin'];
  const ITN = ['إزالة العزل القديم', 'إزالة اللياسة القديمة', 'تجهيزات اللياسة', 'الكهرباء', 'الميكانيكا', 'اللياسة', 'الميول', 'الرغوية', 'العزل المائي', 'اختبار الغمر', 'العزل الحراري', 'التشطيب النهائي'];
  prog.sort((a, b) => +a.id.split('-').pop() - +b.id.split('-').pop());
  sheet('الموقف التنفيذي', [['الفيلا', 8], ['المقاول', 14], ...ITN.map(n => [n, 11]), ['آخر تحديث', 24]],
    prog.map(p => [p.id.split('-').pop(), p.co === 'TAAJ' ? 'التاج المضيء' : p.co === 'PCC' ? 'تخطيط (PCC)' : '', ...IT.map(k => (p.na || []).includes(k) ? 'لا ينطبق' : (+p[k] || 0)), (p.ub || '') + ' ' + dt(p.ut)]));
  rep.sort((a, b) => (a.date < b.date ? 1 : -1));
  sheet('تقارير المقاولين', [['التاريخ', 12], ['المقاول', 30], ['الحالة', 10], ['متأخر', 8], ['عدد الفلل', 10], ['وقت الإرسال', 17]],
    rep.map(r => [r.date || '', coN[r.cid] || '', r.status === 'sent' ? 'مرسَل' : 'مسودة', r.late ? 'نعم' : '', Object.keys(r.villas || {}).length, dt(r.sentAt)]));
  const strip = o => JSON.parse(JSON.stringify(o, (k, val) => (typeof val === 'string' && val.startsWith('data:image') ? '[image]' : val)));
  const json = { exportedAt: new Date().toISOString(), users: users.map(u => strip(u)), companies: cos.map(strip), v: v.map(strip), prog: prog.map(strip), rep: rep.map(strip),
    pcfg: await all('pcfg'), settings: await all('settings') };
  const day = now.toISOString().slice(0, 10);
  await send(to, `النسخة الاحتياطية الأسبوعية — ${day}`, 'النسخة الاحتياطية الأسبوعية',
    hi('') + `<p>مرفق النسخة الاحتياطية الأسبوعية لبيانات تطبيق Dhahiat Sumou Makkah TAAM بتاريخ ${day}:</p><ul style="padding-right:18px">
<li>ملف إكسل بالحسابات والمقاولين وملاحظات Snag List (${marks.length} ملاحظة) والموقف التنفيذي (${prog.length} فيلا) وتقارير المقاولين (${rep.length} تقرير).</li>
<li>ملف JSON كامل لاستعادة البيانات عند الحاجة (دون الصور).</li></ul><p>يُرجى الاحتفاظ بهذه الرسالة.</p>`,
    [{ filename: `Dhahiat_Sumou_Backup_${day}.xlsx`, content: Buffer.from(await wb.xlsx.writeBuffer()) },
     { filename: `Dhahiat_Sumou_Backup_${day}.json`, content: Buffer.from(JSON.stringify(json)) }]);
  await sys.set({ week: wk, status: 'sent', to, t: Date.now() }, { merge: true }); console.log('backup sent');
};
