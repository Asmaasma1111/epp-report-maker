(function () {
  'use strict';

  const STORE_KEY = 'erm-class-v1';
  const R = window.Report;
  const $ = (id) => document.getElementById(id);

  // ---------- State ----------

  const blankState = () => ({
    settings: {
      level: 1, semester: '', term: '', year: '', period: '',
      instructor: '', countersignTitle: 'School Principal', countersignName: '', logo: null,
    },
    students: [],
    selected: null,
    step: 'details',
  });

  let state = blankState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && saved.settings && Array.isArray(saved.students)) state = Object.assign(blankState(), saved);
  } catch (e) { /* start fresh */ }

  let saveTimer = null;
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); }
      catch (e) { toast('This browser could not save your work. Use "Save a class file" to keep a copy.'); }
    }, 250);
  }

  const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const newStudent = (name = '', sid = '') => ({ id: uid(), name, sid, scores: { written: '', oral: '', rl: '', c21: '' }, comment: '' });
  const current = () => state.students.find((s) => s.id === state.selected) || null;

  // ---------- Small helpers ----------

  let toastTimer = null;
  function toast(msg, ms = 3200) {
    const t = $('toast');
    t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; a.rel = 'noopener';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  }

  const safeName = (s) => String(s || '').replace(/[\\/:*?"<>|]+/g, '').replace(/\s+/g, ' ').trim();
  const reportFileName = (st) => (safeName(st.name) || 'Student') + ' – Level ' + state.settings.level + ' Final Report.pdf';
  const hasArabic = (s) => /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/.test(s || '');

  function status(st) {
    const ev = R.evaluate(st, state.settings.level);
    if (ev.anyInvalid) return { cls: 'bad', label: 'Check scores', ev };
    if (!ev.hasName) return { cls: 'todo', label: 'No name', ev };
    if (hasArabic(st.name)) return { cls: 'bad', label: 'English name', ev };
    if (!ev.scoresComplete) return { cls: 'todo', label: 'Scores missing', ev };
    return { cls: 'ok', label: 'Ready', ev };
  }

  // ---------- Steps ----------

  function showStep(step, scroll = true) {
    state.step = step; save();
    document.querySelectorAll('[data-panel]').forEach((p) => { p.hidden = p.dataset.panel !== step; });
    document.querySelectorAll('.step').forEach((b) => {
      if (b.dataset.step === step) b.setAttribute('aria-current', 'step'); else b.removeAttribute('aria-current');
    });
    if (step === 'download') renderDownload();
    if (scroll && window.matchMedia('(max-width: 860px)').matches) $('step-' + step).scrollIntoView({ behavior: 'smooth', block: 'start' });
  }
  document.querySelectorAll('.step').forEach((b) => b.addEventListener('click', () => showStep(b.dataset.step)));
  document.querySelectorAll('[data-goto]').forEach((b) => b.addEventListener('click', () => {
    showStep(b.dataset.goto); window.scrollTo({ top: 0, behavior: 'smooth' });
  }));

  // ---------- Theme and text size ----------

  function markTheme() {
    const t = document.documentElement.dataset.theme ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.querySelectorAll('[data-theme-set]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.themeSet === t)));
  }
  document.querySelectorAll('[data-theme-set]').forEach((b) => b.addEventListener('click', () => {
    document.documentElement.dataset.theme = b.dataset.themeSet;
    try { localStorage.setItem('erm-theme', b.dataset.themeSet); } catch (e) {}
    markTheme();
  }));
  markTheme();
  document.querySelectorAll('[data-text]').forEach((b) => b.addEventListener('click', () => {
    const now = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16;
    const next = Math.min(22, Math.max(14, now + Number(b.dataset.text) * 2));
    document.documentElement.style.fontSize = next + 'px';
    try { localStorage.setItem('erm-text', String(next)); } catch (e) {}
  }));

  // ---------- Step 1: class details ----------

  const settingFields = ['semester', 'term', 'year', 'period', 'instructor', 'countersignTitle', 'countersignName'];
  function titleText() {
    const s = state.settings;
    const b = (v, n) => (v && String(v).trim()) ? String(v).trim() : '_'.repeat(n);
    return 'LEVEL ' + s.level + ' FINAL REPORT – SEMESTER ' + b(s.semester, 3) + ' (TERM ' + b(s.term, 3) + '/ ' + b(s.year, 5) + ')';
  }
  function renderDetails() {
    settingFields.forEach((f) => { $(f).value = state.settings[f] || ''; });
    $('titlePreview').textContent = titleText();
    $('logoPreview').src = state.settings.logo || 'assets/school-mksgt.jpg';
    $('logoReset').hidden = !state.settings.logo;
    $('logoNote').textContent = state.settings.logo
      ? 'Your own logo prints at the top right of every report.'
      : 'The MKSGT logo prints at the top right. Teaching somewhere else? Use your own school\'s logo.';
  }
  settingFields.forEach((f) => $(f).addEventListener('input', () => {
    state.settings[f] = $(f).value;
    $('titlePreview').textContent = titleText();
    save();
  }));

  $('logoFile').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\/(png|jpeg)$/.test(file.type)) { toast('Please choose a PNG or JPG picture.'); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        // Shrink big pictures and flatten onto white so every PDF stays small.
        const max = 600, scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height);
        ctx.drawImage(img, 0, 0, c.width, c.height);
        state.settings.logo = c.toDataURL('image/jpeg', 0.92);
        save(); renderDetails(); toast('Logo updated.');
      };
      img.onerror = () => toast('That picture could not be opened.');
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
  $('logoReset').addEventListener('click', () => { state.settings.logo = null; save(); renderDetails(); });

  // ---------- Step 2: students ----------

  function renderList() {
    const list = $('studentList');
    list.innerHTML = '';
    state.students.forEach((st, i) => {
      const s = status(st);
      const li = document.createElement('li');
      const b = document.createElement('button');
      b.type = 'button';
      if (st.id === state.selected) b.setAttribute('aria-current', 'true');
      const who = document.createElement('span'); who.className = 'who';
      const nm = document.createElement('b'); nm.textContent = (i + 1) + '. ' + (st.name || 'New student');
      const idl = document.createElement('small'); idl.textContent = st.sid ? 'ID ' + st.sid : 'No ID yet';
      who.append(nm, idl);
      const badge = document.createElement('span'); badge.className = 'badge ' + s.cls; badge.textContent = s.label;
      b.append(who, badge);
      b.addEventListener('click', () => select(st.id));
      li.appendChild(b); list.appendChild(li);
    });
    $('emptyList').hidden = state.students.length > 0;
    const ready = state.students.filter((st) => status(st).cls === 'ok').length;
    $('navStudents').textContent = state.students.length
      ? ready + ' of ' + state.students.length + ' ready' : 'No students yet';
  }

  function buildScoreRows() {
    const wrap = $('scores');
    wrap.innerHTML = '';
    R.AREAS.forEach((area) => {
      const row = document.createElement('div');
      row.className = 'score-row'; row.dataset.key = area.key;
      const weight = area.max === 35 ? '35%' : '15%';
      row.innerHTML =
        '<div class="area">' + area.label + '<small>' + weight + ' of the report</small></div>' +
        '<label class="score-in"><input inputmode="decimal" autocomplete="off" aria-label="' + area.label + ' score out of ' + area.max + '"><span>/ ' + area.max + '</span></label>' +
        '<div class="detail"><span class="lvl">No score yet</span><p class="statement"></p></div>';
      const input = row.querySelector('input');
      input.addEventListener('input', () => {
        const st = current(); if (!st) return;
        st.scores[area.key] = input.value;
        save(); updateEditorLive(); renderList();
      });
      wrap.appendChild(row);
    });
  }

  function updateEditorLive() {
    const st = current(); if (!st) return;
    const ev = R.evaluate(st, state.settings.level);
    R.AREAS.forEach((area) => {
      const row = document.querySelector('.score-row[data-key="' + area.key + '"]');
      const a = ev.areas[area.key];
      const lvl = row.querySelector('.lvl'), stmt = row.querySelector('.statement');
      row.classList.toggle('bad', a.score !== null && Number.isNaN(a.score));
      if (a.score === null) { lvl.className = 'lvl'; lvl.textContent = 'No score yet'; stmt.textContent = ''; }
      else if (Number.isNaN(a.score)) { lvl.className = 'lvl l4'; lvl.textContent = 'Enter a number from 0 to ' + area.max; stmt.textContent = ''; }
      else { lvl.className = 'lvl l' + a.idx; lvl.textContent = a.levelName; stmt.textContent = a.statement.replace(/^\([^)]*\)\s*/, ''); }
    });
    $('tLp').textContent = ev.lp !== null ? R.fmt(ev.lp) + ' / 70' : '–';
    $('tTotal').textContent = ev.total !== null ? R.fmt(ev.total) + ' / 100' : '–';
    $('tGrade').textContent = ev.grade || '–';
    $('arabicWarn').hidden = !hasArabic(st.name);
    const n = (st.comment || '').length;
    $('commentHint').textContent = n > 600
      ? n + ' characters: the text will print smaller to fit the box. Shorter comments read better.'
      : n ? n + ' characters. About 600 fit at normal size.' : 'About 600 characters fit at normal size.';
  }

  function renderEditor() {
    const st = current();
    $('editor').hidden = !st;
    if (!st) return;
    $('sName').value = st.name; $('sId').value = st.sid; $('sComment').value = st.comment;
    document.querySelectorAll('.score-row').forEach((row) => { row.querySelector('input').value = st.scores[row.dataset.key] || ''; });
    const i = state.students.indexOf(st);
    $('prevStudent').disabled = i <= 0;
    $('nextStudent').disabled = i >= state.students.length - 1;
    updateEditorLive();
  }

  function select(id) {
    state.selected = id; save();
    renderList(); renderEditor();
    if (window.matchMedia('(max-width: 980px)').matches) $('editor').scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  [['sName', 'name'], ['sId', 'sid'], ['sComment', 'comment']].forEach(([el, key]) => {
    $(el).addEventListener('input', () => {
      const st = current(); if (!st) return;
      st[key] = $(el).value; save(); updateEditorLive();
      if (key !== 'comment') renderList();
    });
  });

  $('addStudent').addEventListener('click', () => {
    const st = newStudent(); state.students.push(st); select(st.id); $('sName').focus();
  });
  $('togglePaste').addEventListener('click', () => {
    const box = $('pasteBox'); box.hidden = !box.hidden;
    $('togglePaste').setAttribute('aria-expanded', String(!box.hidden));
    if (!box.hidden) $('pasteText').focus();
  });
  $('pasteCancel').addEventListener('click', () => { $('pasteBox').hidden = true; $('togglePaste').setAttribute('aria-expanded', 'false'); });
  $('pasteAdd').addEventListener('click', () => {
    const lines = $('pasteText').value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    let added = 0, firstId = null;
    for (const line of lines) {
      let parts = line.split('\t');
      if (parts.length < 2) parts = line.split(/[,;]/);
      let name = (parts[0] || '').trim(), sid = (parts[1] || '').trim();
      // Accept "ID <tab> name" too.
      if (/^\d+$/.test(name) && sid && !/^\d+$/.test(sid)) [name, sid] = [sid, name];
      if (!name && !sid) continue;
      if (/^(name|student'?s? name|students?)$/i.test(name)) continue; // skip a header row
      const st = newStudent(name, sid); state.students.push(st); added++;
      if (!firstId) firstId = st.id;
    }
    if (!added) { toast('No students found. Put one student on each line.'); return; }
    $('pasteText').value = ''; $('pasteBox').hidden = true; $('togglePaste').setAttribute('aria-expanded', 'false');
    toast(added === 1 ? '1 student added.' : added + ' students added.');
    select(firstId);
  });

  $('prevStudent').addEventListener('click', () => {
    const i = state.students.indexOf(current()); if (i > 0) select(state.students[i - 1].id);
  });
  $('nextStudent').addEventListener('click', () => {
    const i = state.students.indexOf(current()); if (i < state.students.length - 1) select(state.students[i + 1].id);
  });
  $('removeStudent').addEventListener('click', () => {
    const st = current(); if (!st) return;
    if (!confirm('Remove ' + (st.name || 'this student') + ' and their scores?')) return;
    const i = state.students.indexOf(st);
    state.students.splice(i, 1);
    const next = state.students[Math.min(i, state.students.length - 1)];
    state.selected = next ? next.id : null;
    save(); renderList(); renderEditor();
  });

  // ---------- PDFs ----------

  function librariesReady() {
    if (window.PDFLib && window.fontkit && window.JSZip) return true;
    toast('The page could not load its PDF tools. Check the internet connection and reload the page.', 6000);
    return false;
  }

  async function withBusy(button, fn) {
    if (!librariesReady()) return;
    const label = button.textContent;
    button.disabled = true; button.textContent = 'Making PDFs…';
    try { await fn(); }
    catch (e) { console.error(e); toast('Something went wrong while making the PDF. Please try again.', 5000); }
    finally { button.disabled = false; button.textContent = label; }
  }

  let previewUrl = null, previewStudent = null;
  $('previewOne').addEventListener('click', () => withBusy($('previewOne'), async () => {
    const st = current(); if (!st) return;
    const bytes = await R.buildPdfBytes([st], state.settings);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    previewStudent = st;
    $('previewTitle').textContent = 'Preview: ' + (st.name || 'New student');
    $('previewFrame').src = previewUrl;
    $('previewDialog').showModal();
  }));
  $('previewClose').addEventListener('click', () => $('previewDialog').close());
  $('previewDownload').addEventListener('click', () => {
    if (previewUrl && previewStudent) fetch(previewUrl).then((r) => r.blob()).then((b) => saveBlob(b, reportFileName(previewStudent)));
  });

  $('downloadOne').addEventListener('click', () => withBusy($('downloadOne'), async () => {
    const st = current(); if (!st) return;
    const s = status(st);
    if (s.cls !== 'ok' && !confirm('This report is not finished (' + s.label.toLowerCase() + '). Download it anyway?')) return;
    const bytes = await R.buildPdfBytes([st], state.settings);
    saveBlob(new Blob([bytes], { type: 'application/pdf' }), reportFileName(st));
  }));

  function readyStudents() {
    const ready = state.students.filter((st) => status(st).cls === 'ok');
    const skipped = state.students.length - ready.length;
    if (!ready.length) { toast('No reports are ready yet. Each student needs a name and all four scores.', 5000); return null; }
    if (skipped && !confirm(skipped + (skipped === 1 ? ' report is' : ' reports are') + ' not finished and will be left out. Continue?')) return null;
    return ready;
  }
  const batchName = () => {
    const s = state.settings;
    const bits = ['Level ' + s.level + ' Final Reports'];
    if (s.term) bits.push('Term ' + safeName(s.term));
    if (s.year) bits.push(safeName(s.year));
    return bits.join(' – ');
  };

  $('zipAll').addEventListener('click', () => withBusy($('zipAll'), async () => {
    const ready = readyStudents(); if (!ready) return;
    const zip = new window.JSZip();
    const used = new Set();
    for (const st of ready) {
      let name = reportFileName(st), n = 2;
      while (used.has(name)) name = reportFileName(st).replace(/\.pdf$/, ' (' + n++ + ').pdf');
      used.add(name);
      zip.file(name, await R.buildPdfBytes([st], state.settings));
    }
    const blob = await zip.generateAsync({ type: 'blob' });
    saveBlob(blob, batchName() + '.zip');
    toast(ready.length + ' reports saved in one ZIP file.');
  }));

  $('pdfAll').addEventListener('click', () => withBusy($('pdfAll'), async () => {
    const ready = readyStudents(); if (!ready) return;
    const bytes = await R.buildPdfBytes(ready, state.settings);
    saveBlob(new Blob([bytes], { type: 'application/pdf' }), batchName() + '.pdf');
    toast(ready.length + ' reports saved in one PDF.');
  }));

  // ---------- Step 3: download summary and backup ----------

  function renderDownload() {
    const total = state.students.length;
    const notReady = state.students.filter((st) => status(st).cls !== 'ok');
    $('readySummary').textContent = !total ? 'No students yet. Add them in step 2.'
      : (total - notReady.length) + ' of ' + total + ' reports are ready.' + (notReady.length ? ' Not ready yet:' : '');
    const ul = $('notReady'); ul.innerHTML = '';
    notReady.forEach((st) => {
      const li = document.createElement('li');
      const a = document.createElement('a'); a.href = '#';
      a.textContent = (st.name || 'Student with no name') + ': ' + status(st).label.toLowerCase();
      a.addEventListener('click', (e) => { e.preventDefault(); showStep('students'); select(st.id); });
      li.appendChild(a); ul.appendChild(li);
    });
  }

  $('saveClass').addEventListener('click', () => {
    const data = { app: 'EPP Report Maker', version: 1, saved: new Date().toISOString(), settings: state.settings, students: state.students };
    const d = new Date();
    const stamp = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
    saveBlob(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }), 'Class file – ' + batchName() + ' – ' + stamp + '.json');
  });
  $('openClass').addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (!data || !data.settings || !Array.isArray(data.students)) throw new Error('not a class file');
        if (state.students.length && !confirm('Opening this file replaces the class on this page. Continue?')) return;
        const fresh = blankState();
        state.settings = Object.assign(fresh.settings, data.settings);
        state.students = data.students.map((s) => Object.assign(newStudent(), s, { scores: Object.assign(newStudent().scores, s.scores || {}) }));
        state.selected = state.students[0] ? state.students[0].id : null;
        save(); renderAll(); toast('Class file opened: ' + state.students.length + ' students.');
      } catch (err) { toast('That file is not a class file from this page.'); }
    };
    reader.readAsText(file);
  });
  $('newClass').addEventListener('click', () => {
    if (!confirm('Start a new class? This clears every student and score from this page. Save a class file first if you want a copy.')) return;
    const keep = state.settings;
    state = blankState();
    // Keep signatures and logo; they rarely change between classes.
    ['instructor', 'countersignTitle', 'countersignName', 'logo'].forEach((k) => { state.settings[k] = keep[k]; });
    save(); renderAll(); showStep('details');
  });

  // ---------- Start ----------

  function renderAll() {
    renderDetails(); renderList(); renderEditor();
    if (state.step === 'download') renderDownload();
  }
  buildScoreRows();
  if (state.selected && !current()) state.selected = state.students[0] ? state.students[0].id : null;
  renderAll();
  showStep(state.step || 'details', false);
  // Warm up fonts and logos so the first PDF is quick.
  R.loadAssets().catch(() => {});
})();
