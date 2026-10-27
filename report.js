// Scoring rules and PDF drawing for the EPP Level Final Report.
// Rules come from "Guide to the Midterm and Final Report Templates" (6 Oct 2026), section 3.
// Layout follows Level_1_Final_Report.docx: US Letter, 0.5 inch margins, Calibri metrics (Carlito).

(function () {
  'use strict';

  const LEVEL_NAMES = ['Outstanding', 'Very Good', 'Satisfactory', 'Unsatisfactory', 'Poor'];

  // Lowest score for Outstanding, Very Good, Satisfactory, Unsatisfactory. Anything lower is Poor.
  const AREAS = [
    { key: 'written', label: 'Written Projects', short: 'Written', max: 35, floors: [31.5, 24.5, 17.5, 8.75] },
    { key: 'oral', label: 'Oral Projects', short: 'Oral', max: 35, floors: [31.5, 24.5, 17.5, 8.75] },
    { key: 'rl', label: 'Reading & Listening Skills', short: 'Reading & Listening', max: 15, floors: [13, 10, 7, 4] },
    { key: 'c21', label: '21st Century Skills', short: '21st Century', max: 15, floors: [13, 10, 7, 4] },
  ];

  const GRADES = [[95, 'A+'], [90, 'A'], [85, 'B+'], [80, 'B'], [75, 'C+'], [70, 'C'], [65, 'D+'], [60, 'D'], [-Infinity, 'F']];

  // Returns a number, null for an empty box, or NaN for something that is not a valid score.
  function parseScore(raw, max) {
    if (raw === null || raw === undefined) return null;
    const text = String(raw).trim().replace(',', '.');
    if (text === '') return null;
    if (!/^\d+(\.\d+)?$/.test(text)) return NaN;
    const n = Number(text);
    if (n < 0 || n > max) return NaN;
    return Math.round(n * 100) / 100;
  }

  function levelIndex(area, score) {
    for (let i = 0; i < area.floors.length; i++) if (score >= area.floors[i]) return i;
    return 4;
  }

  function gradeFor(total) {
    for (const [floor, letter] of GRADES) if (total >= floor) return letter;
    return 'F';
  }

  function fmt(n) {
    return String(Math.round(n * 100) / 100);
  }

  // Everything the report needs about one student, worked out from the typed scores.
  function evaluate(student, level) {
    const bank = (window.STATEMENTS[String(level)] || {});
    const areas = {};
    let complete = true;
    let anyInvalid = false;
    for (const area of AREAS) {
      const score = parseScore(student.scores ? student.scores[area.key] : '', area.max);
      if (score === null) { complete = false; areas[area.key] = { area, score: null }; continue; }
      if (Number.isNaN(score)) { complete = false; anyInvalid = true; areas[area.key] = { area, score: NaN }; continue; }
      const idx = levelIndex(area, score);
      areas[area.key] = { area, score, idx, levelName: LEVEL_NAMES[idx], statement: (bank[area.key] || [])[idx] || '' };
    }
    const w = areas.written.score, o = areas.oral.score;
    const lp = (typeof w === 'number' && typeof o === 'number' && !Number.isNaN(w) && !Number.isNaN(o)) ? w + o : null;
    let total = null, grade = null;
    if (complete) {
      total = Math.round(AREAS.reduce((s, a) => s + areas[a.key].score, 0) * 100) / 100;
      grade = gradeFor(total);
    }
    const hasName = !!(student.name && student.name.trim());
    return { areas, lp, total, grade, complete: complete && hasName, scoresComplete: complete, anyInvalid, hasName };
  }

  // ---------- PDF drawing ----------
  // Positions in points (1/72 inch) measured from Level_1_Final_Report.docx: US Letter, 0.5 inch margins,
  // table grid widths, cell padding 115 twips (5.75 pt), row minimum heights, text box sizes and offsets.

  const PAGE_W = 612, PAGE_H = 792;
  const LEFT = 36, RIGHT = 575.5, TABLE_RIGHT = 578.6;
  const PAD = 5.75;            // cell padding
  const LEAD = 13.45;          // Calibri 11 pt line height in Word
  const LINE11 = 11;

  const C = {
    black: [0, 0, 0], titleRed: [0xC0, 0, 0], red: [255, 0, 0], blue: [0, 0x70, 0xC0],
    grey: [0xED, 0xED, 0xED], green: [0xE2, 0xEF, 0xD9], yellow: [0xFF, 0xF2, 0xCC],
    boxGreen: [0x70, 0xAD, 0x47], white: [255, 255, 255],
  };

  let assetCache = null;
  async function loadAssets() {
    if (assetCache) return assetCache;
    const get = async (url) => {
      const res = await fetch(url);
      if (!res.ok) throw new Error('Could not load ' + url);
      return new Uint8Array(await res.arrayBuffer());
    };
    const [regular, bold, boldItalic, interlink, school, sigCourse, sigSchool] = await Promise.all([
      get('fonts/Carlito-Regular.ttf'), get('fonts/Carlito-Bold.ttf'), get('fonts/Carlito-BoldItalic.ttf'),
      get('assets/interlink.jpg'), get('assets/school-mksgt.jpg'),
      get('assets/sig-course-instructor.png'), get('assets/sig-school-principal.png'),
    ]);
    assetCache = { regular, bold, boldItalic, interlink, school, sigCourse, sigSchool };
    return assetCache;
  }

  function dataUrlToBytes(dataUrl) {
    const bin = atob(dataUrl.split(',')[1]);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function wrap(text, font, size, width) {
    const lines = [];
    for (const para of String(text || '').split(/\r?\n/)) {
      const words = para.split(/\s+/).filter(Boolean);
      if (!words.length) { lines.push(''); continue; }
      let line = '';
      for (const word of words) {
        const test = line ? line + ' ' + word : word;
        if (font.widthOfTextAtSize(test, size) <= width) { line = test; continue; }
        if (line) lines.push(line);
        let piece = word;
        while (font.widthOfTextAtSize(piece, size) > width && piece.length > 1) {
          let cut = piece.length - 1;
          while (cut > 1 && font.widthOfTextAtSize(piece.slice(0, cut), size) > width) cut--;
          lines.push(piece.slice(0, cut));
          piece = piece.slice(cut);
        }
        line = piece;
      }
      lines.push(line);
    }
    return lines;
  }

  // Builds a document holding one page per student and returns it.
  async function buildDocument(students, settings) {
    const { PDFDocument, rgb } = window.PDFLib;
    const a = await loadAssets();
    const doc = await PDFDocument.create();
    doc.registerFontkit(window.fontkit);
    const fonts = {
      regular: await doc.embedFont(a.regular, { subset: true }),
      bold: await doc.embedFont(a.bold, { subset: true }),
      boldItalic: await doc.embedFont(a.boldItalic, { subset: true }),
    };
    const img = {
      interlink: await doc.embedJpg(a.interlink),
      sigCourse: await doc.embedPng(a.sigCourse),
      sigSchool: await doc.embedPng(a.sigSchool),
      customLogo: !!settings.logo,
    };
    if (settings.logo) {
      const bytes = dataUrlToBytes(settings.logo);
      img.school = settings.logo.startsWith('data:image/png') ? await doc.embedPng(bytes) : await doc.embedJpg(bytes);
    } else {
      img.school = await doc.embedJpg(a.school);
    }
    const color = (c) => rgb(c[0] / 255, c[1] / 255, c[2] / 255);
    for (const student of students) drawPage(doc, student, settings, fonts, img, color);
    doc.setTitle('Level ' + (settings.level || 1) + ' Final Report');
    doc.setCreator('EPP Report Maker');
    doc.setProducer('EPP Report Maker');
    return doc;
  }

  function drawPage(doc, student, settings, F, img, color) {
    const page = doc.addPage([PAGE_W, PAGE_H]);
    const Y = (top) => PAGE_H - top; // distance from the top of the page -> PDF coordinates
    const level = settings.level || 1;
    const ev = evaluate(student, level);

    const rect = (x, top, w, h, opts = {}) => page.drawRectangle({
      x, y: Y(top + h), width: w, height: h,
      color: opts.fill ? color(opts.fill) : undefined,
      borderColor: opts.border ? color(opts.border) : undefined,
      borderWidth: opts.border ? (opts.borderWidth || 0.5) : 0,
    });
    const text = (str, x, base, font, size, c = C.black) => page.drawText(str, { x, y: Y(base), size, font, color: color(c) });
    const centred = (str, cx, base, font, size, c) => text(str, cx - font.widthOfTextAtSize(str, size) / 2, base, font, size, c);
    const image = (im, x, top, w, h) => page.drawImage(im, { x, y: Y(top + h), width: w, height: h });

    // Header logos, at the sizes the Word header gives them.
    image(img.interlink, 0, 2, 211, 93.75);
    if (img.customLogo) {
      const s = Math.min(188.6 / img.school.width, 98 / img.school.height);
      const w = img.school.width * s, h = img.school.height * s;
      image(img.school, PAGE_W - 8 - w, 1.5 + (98 - h) / 2, w, h);
    } else {
      image(img.school, PAGE_W - 188.6, 1.5, 188.6, 98);
    }

    // Title bar: grey cell, black border, 16 pt bold dark red.
    const blank = (v, n) => (v && String(v).trim()) ? String(v).trim() : '_'.repeat(n);
    const title = 'LEVEL ' + level + ' FINAL REPORT – SEMESTER ' + blank(settings.semester, 3) +
      ' (TERM ' + blank(settings.term, 3) + '/ ' + blank(settings.year, 5) + ')';
    rect(LEFT, 102.2, RIGHT - LEFT, 18.8, { fill: C.grey, border: C.black });
    let ts = 16;
    while (F.bold.widthOfTextAtSize(title, ts) > RIGHT - LEFT - 2 * PAD && ts > 9) ts -= 0.5;
    centred(title, (LEFT + RIGHT) / 2, 102.2 + 11.5, F.bold, ts, C.titleRed);

    // Student details: 11 pt bold, grey label cells.
    const cols = [LEFT, LEFT + 130.25, LEFT + 387.65, LEFT + 411.4, RIGHT];
    const rowTops = [145.4, 159.3, 173.2], rowH = 13.9;
    const cell = (str, x0, x1, top, pad = PAD) => {
      // Long entries print smaller rather than being cut off.
      let s = String(str || ''), size = LINE11;
      while (size > 7 && F.bold.widthOfTextAtSize(s, size) > x1 - x0 - 2 * pad) size -= 0.25;
      while (s && F.bold.widthOfTextAtSize(s, size) > x1 - x0 - 2 * pad) s = s.slice(0, -1);
      text(s, x0 + pad, top + 8.6, F.bold, size);
    };
    const info = [['STUDENT’S NAME', student.name || ''], ['COURSE', 'LEVEL ' + level], ['PERIOD OF ASSESSMENT', settings.period || '']];
    info.forEach(([label, value], i) => {
      const top = rowTops[i];
      rect(cols[0], top, cols[1] - cols[0], rowH, { fill: C.grey, border: C.black });
      if (i === 0) {
        rect(cols[1], top, cols[2] - cols[1], rowH, { fill: C.grey, border: C.black });
        rect(cols[2], top, cols[3] - cols[2], rowH, { fill: C.grey, border: C.black });
        rect(cols[3], top, cols[4] - cols[3], rowH, { fill: C.grey, border: C.black });
        cell(value, cols[1], cols[2], top);
        cell('ID:', cols[2], cols[3] + 12, top); // Word lets 'ID:' run past its narrow cell
        cell(student.sid || '', cols[3], cols[4], top);
      } else {
        rect(cols[1], top, cols[4] - cols[1], rowH, { fill: C.grey, border: C.black });
        cell(value, cols[1], cols[4], top);
      }
      cell(label, cols[0], cols[1], top);
    });

    // Main table: three columns, red borders, 11 pt statements.
    const c1 = LEFT, c2 = LEFT + 207.9, c3 = c2 + 90.5, c4 = TABLE_RIGHT;
    const linesFor = (key, width) => {
      const a = ev.areas[key];
      return wrap(a && a.statement ? a.statement : '', F.regular, LINE11, width - 2 * PAD);
    };
    const wL = linesFor('written', c4 - c3), oL = linesFor('oral', c4 - c3);
    const rL = linesFor('rl', c4 - c2), cL = linesFor('c21', c4 - c2);
    const SUB_MIN = 54; // room for the label and its score box (Word lets the box hang over a 39 pt row)
    const wH = Math.max(39, SUB_MIN, wL.length * LEAD - 0.5);
    const oH = Math.max(39, SUB_MIN, oL.length * LEAD - 0.5);
    const rH = Math.max(88.85, rL.length * LEAD + 4);
    let cH = Math.max(139.9, cL.length * LEAD + 4);
    const mTop = 211;
    const bottomNeeded = mTop + wH + oH + rH + cH + 15 + 30 + 96 + 11 + 26;
    if (bottomNeeded > 756) cH = Math.max(cL.length * LEAD + 6, 96, cH - (bottomNeeded - 756));

    const num = (key) => {
      const a = ev.areas[key];
      return (a && typeof a.score === 'number' && !Number.isNaN(a.score)) ? fmt(a.score) : '';
    };
    const box = (x, top, w, h, str, size, c) => {
      rect(x, top, w, h, { fill: C.white, border: C.boxGreen, borderWidth: 1 });
      if (!str) return;
      let s = size;
      while (F.bold.widthOfTextAtSize(str, s) > w - 4 && s > 7) s -= 0.5;
      centred(str, x + w / 2, top + 3.8 + 0.75 * s, F.bold, s, c);
    };
    const statement = (lines, x, top, h) => {
      let base = top + (h - lines.length * LEAD) / 2 + 8.1; // cells are vertically centred
      for (const line of lines) { text(line, x + PAD, base, F.regular, LINE11); base += LEAD; }
    };
    const heading = (parts, top, h, firstBase, boxTop, value) => {
      // parts: lines of [text, superscript?] pieces; 18 pt bold, 22 pt apart; 48 x 31.8 pt box below.
      // firstBase and boxTop are offsets from the middle of the cell, measured on the Word file.
      const mid = top + h / 2;
      const cx = (c1 + c2) / 2;
      parts.forEach((line, i) => {
        const base = mid + firstBase + i * 22;
        const width = line.reduce((sum, [t, sup]) => sum + F.bold.widthOfTextAtSize(t, sup ? 12 : 18), 0);
        let x = cx - width / 2;
        for (const [t, sup] of line) {
          const size = sup ? 12 : 18;
          text(t, x, sup ? base - 6 : base, F.bold, size);
          x += F.bold.widthOfTextAtSize(t, size);
        }
      });
      box(cx - 24, mid + boxTop, 48, 31.8, value, 20, C.red);
    };
    const subLabel = (label, top, key, drop) => {
      text(label, c2 + PAD, top + drop + 8, F.bold, LINE11, C.blue);
      text('(35%)', c2 + PAD, top + drop + 8 + LEAD, F.bold, LINE11, C.blue);
      box(c2 + PAD, top + drop + 30.9, 30.75, 20.85, num(key), 11, C.red);
    };

    // Language Proficiency.
    const lpH = wH + oH;
    rect(c1, mTop, c2 - c1, lpH, { fill: C.green, border: C.red });
    rect(c2, mTop, c3 - c2, wH, { border: C.red });
    rect(c3, mTop, c4 - c3, wH, { border: C.red });
    rect(c2, mTop + wH, c3 - c2, oH, { border: C.red });
    rect(c3, mTop + wH, c4 - c3, oH, { border: C.red });
    heading([[['Language Proficiency', false]], [['70%', false]]], mTop, lpH, -19.8, 18, ev.lp !== null ? fmt(ev.lp) : '');
    subLabel('Written Projects', mTop, 'written', 0);
    statement(wL, c3, mTop, wH);
    subLabel('Oral Projects', mTop + wH, 'oral', 7.3);
    statement(oL, c3, mTop + wH, oH);

    // Reading & Listening.
    const rTop = mTop + lpH;
    rect(c1, rTop, c2 - c1, rH, { fill: C.yellow, border: C.red });
    rect(c2, rTop, c4 - c2, rH, { border: C.red });
    heading([[['Reading & Listening Skills', false]], [['15%', false]]], rTop, rH, -30.9, 4.9, num('rl'));
    statement(rL, c2, rTop, rH);

    // 21st Century Skills.
    const cTop = rTop + rH;
    rect(c1, cTop, c2 - c1, cH, { fill: C.grey, border: C.red });
    rect(c2, cTop, c4 - c2, cH, { fill: C.grey, border: C.red });
    heading([[['21', false], ['ST', true], [' CENTURY SKILLS ', false]], [['15 %', false]]], cTop, cH, cH >= 120 ? -30.9 : -24, cH >= 120 ? 21.1 : 10, num('c21'));
    statement(cL, c2, cTop, cH);

    // Overall Score and Grade Letter.
    const oTop = cTop + cH + 15;
    text('Overall Score:', LEFT, oTop + 15.8, F.bold, LINE11);
    box(102, oTop, 40.7, 25, ev.total !== null ? fmt(ev.total) : '', 20, C.red);
    text('Grade Letter:', 287, oTop + 15.8, F.bold, LINE11);
    box(350, oTop - 0.5, 38, 25.5, ev.grade || '', 18, C.blue);

    // Comment box.
    const kTop = oTop + 30, kH = 96;
    rect(LEFT, kTop, RIGHT - LEFT, kH, { border: C.black });
    const comment = (student.comment || '').trim();
    if (comment) {
      let s = LINE11, lead = LEAD, lines = wrap(comment, F.regular, s, RIGHT - LEFT - 2 * PAD);
      while (lines.length * lead > kH - 4 && s > 7.5) {
        s -= 0.5; lead = s * LEAD / LINE11; lines = wrap(comment, F.regular, s, RIGHT - LEFT - 2 * PAD);
      }
      let base = kTop + s + 1;
      for (const line of lines) { if (base > kTop + kH - 2) break; text(line, LEFT + PAD, base, F.regular, s); base += lead; }
    }

    // Signatures: Ink Free labels in blue, red lines (or the names, if given).
    const sBase = kTop + kH + 11;
    image(img.sigCourse, LEFT, sBase - 11.16, 94.14, 15.36);
    const ctitle = (settings.countersignTitle || 'School Principal').trim() || 'School Principal';
    if (ctitle === 'School Principal') image(img.sigSchool, 419.2, sBase - 11.16, 76.68, 15.36);
    else text(ctitle, 419.2, sBase, F.boldItalic, 12, C.blue);
    const lineBase = sBase + 21;
    const rule = '_________________________';
    const inst = (settings.instructor || '').trim();
    const cname = (settings.countersignName || '').trim();
    text(inst || rule, LEFT, lineBase, F.bold, LINE11, C.red);
    text(cname || rule, 435.6, lineBase, F.bold, LINE11, C.red);
  }

  async function buildPdfBytes(students, settings) {
    const doc = await buildDocument(students, settings);
    return doc.save();
  }

  window.Report = { AREAS, LEVEL_NAMES, GRADES, parseScore, levelIndex, gradeFor, evaluate, fmt, buildPdfBytes, loadAssets };
})();
