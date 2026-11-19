// Local mirror of the token-radar-01 gate's seven rows (RULES.txt "The gate"), run on out/.
// Not the sealed scorer; it reads the same limits the rules state.
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'out';
const kit = process.argv[3] ?? '../token-radar-01-kit';
const snap = JSON.parse(readFileSync(join(kit, 'input/snapshot.json'), 'utf8'));
const failures = [];
const pass = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};

// --- dashboard_files ---
{
  const dir = join(out, 'dashboard');
  const files = existsSync(dir) ? readdirSync(dir) : [];
  let ok = files.includes('index.html') && files.some((f) => f.endsWith('.css')) && files.some((f) => f.endsWith('.js'));
  let detail = `${files.length} files`;
  let total = 0;
  const NAME = /^[A-Za-z0-9._-]+$/;
  for (const f of files) {
    const st = statSync(join(dir, f));
    total += st.size;
    if (!st.isFile() || f.startsWith('.') || f.startsWith('-') || f.length > 128 || !NAME.test(f)) { ok = false; detail += `; bad name ${f}`; }
    const text = readFileSync(join(dir, f), 'utf8');
    if (f.endsWith('.html')) {
      const attrs = text.match(/(?:href|src|action|poster|cite|background|data|formaction)\s*=\s*["'][^"']*https?:\/\//gi);
      if (attrs) { ok = false; detail += `; ${f} has network URL in attribute`; }
      const style = text.match(/<style[^>]*>([\s\S]*?)<\/style>/gi);
      if (style && /https?:\/\//.test(style.join(''))) { ok = false; detail += `; ${f} has network URL in <style>`; }
    }
    if (f.endsWith('.css') && /https?:\/\//.test(text)) { ok = false; detail += `; ${f} has network URL in CSS`; }
    if ((f.endsWith('.js') || f.endsWith('.mjs')) && /(from\s+['"]|import\s*\(?\s*['"]|require\s*\(\s*['"])https?:\/\//.test(text)) { ok = false; detail += `; ${f} has network URL in import`; }
  }
  if (files.length > 400 || total > 4_194_304) { ok = false; detail += `; over limits (${files.length} files, ${total} bytes)`; }
  detail += `, ${total} bytes`;
  pass('dashboard_files', ok, detail);
}

// --- board_file + sorted_by_value + coverage + farm_steps ---
{
  const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
  const rows = Array.isArray(board) ? board : board.rows;
  const slugs = new Set(snap.protocols.map((p) => p.slug));
  let ok = Array.isArray(rows) && rows.length >= 100 && rows.length <= 4000;
  let detail = `${rows.length} rows`;
  const seen = new Set();
  for (const r of rows) {
    if (!slugs.has(r.slug)) { ok = false; detail += `; invented slug ${r.slug}`; break; }
    if (seen.has(r.slug)) { ok = false; detail += `; duplicate slug ${r.slug}`; break; }
    seen.add(r.slug);
    if (typeof r.name !== 'string' || r.name.length === 0) { ok = false; detail += `; ${r.slug} bad name`; break; }
    if (!Number.isSafeInteger(r.rank) || r.rank <= 0) { ok = false; detail += `; ${r.slug} bad rank`; break; }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0 || r.implied_value_usd > 1e14) { ok = false; detail += `; ${r.slug} bad implied`; break; }
  }
  const size = statSync(join(out, 'board.json')).size;
  if (size > 8_388_608) { ok = false; detail += '; board.json over 8 MiB'; }
  pass('board_file', ok, detail + `, ${size} bytes`);

  const ranks = rows.map((r) => r.rank).sort((a, b) => a - b);
  let sorted = ranks.every((v, i) => v === i + 1);
  for (let i = 1; i < rows.length; i++) if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) sorted = false;
  if (rows.length >= 2 && rows[0].implied_value_usd === rows[rows.length - 1].implied_value_usd) sorted = false;
  pass('sorted_by_value', sorted, `ranks 1..${rows.length}, top $${rows[0].implied_value_usd.toLocaleString()} to $${rows[rows.length - 1].implied_value_usd.toLocaleString()}`);

  const missing = snap.watchlist.filter((s) => !seen.has(s));
  pass('coverage', missing.length === 0, missing.length === 0 ? `all ${snap.watchlist.length} watchlist slugs covered` : `missing ${missing.join(', ')}`);

  let fsOk = true; let fsDetail = '';
  for (const r of rows) {
    const steps = r.farm_steps;
    if (!Array.isArray(steps) || steps.length < 3 || steps.length > 12) { fsOk = false; fsDetail = `${r.slug} has ${steps?.length} steps`; break; }
    for (const s of steps) {
      const t = s.trim();
      if (t.length < 20 || t.length > 600) { fsOk = false; fsDetail = `${r.slug} step of ${t.length} chars`; break; }
    }
    if (!fsOk) break;
  }
  pass('farm_steps', fsOk, fsOk ? `${rows.length * (rows[0]?.farm_steps.length ?? 0)} steps, all 20..600 chars` : fsDetail);
}

// --- screenshots ---
{
  const dir = join(out, 'screenshots');
  const files = existsSync(dir) ? readdirSync(dir).filter((f) => !f.startsWith('.')) : [];
  let ok = files.length >= 3 && files.length <= 4;
  let detail = `${files.length} images`;
  for (const f of files) {
    const buf = readFileSync(join(dir, f));
    const isPng = buf.length > 24 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
    const isJpg = buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
    let dims = '';
    if (isPng) {
      const w = buf.readUInt32BE(16); const h = buf.readUInt32BE(20);
      dims = `${w}x${h}`;
      if (Math.max(w, h) > 1440 || Math.min(w, h) < 800) { ok = false; detail += `; ${f} ${dims} out of size limits`; }
    } else if (isJpg) {
      dims = 'jpeg';
    } else { ok = false; detail += `; ${f} not PNG/JPEG`; }
    if (buf.length > 524_288) { ok = false; detail += `; ${f} ${buf.length} bytes over 512 KiB`; }
    detail += `; ${f} ${buf.length} bytes ${dims}`;
  }
  pass('screenshots', ok, detail);
}

// --- dossier_matches ---
{
  const { buildDossier } = await import(join(process.cwd(), 'vendor/makefun-board.ts'));
  const rebuilt = buildDossier(out, { text_max_bytes: 65_536, screenshots: { max: 4, max_bytes: 524_288 }, dashboard: { max_files: 400, max_bytes: 4_194_304 } });
  const saved = readFileSync(join(out, 'dossier.json'));
  const ok = Buffer.compare(Buffer.from(rebuilt), saved) === 0 && saved.length <= 1_572_864;
  const d = JSON.parse(saved.toString('utf8'));
  pass('dossier_matches', ok, ok ? `byte-identical, ${saved.length} bytes, text ${Buffer.byteLength(d.text, 'utf8')} bytes` : `mismatch or over 1.5 MiB (${saved.length} bytes)`);
}

console.log(failures.length === 0 ? 'GATE: ALL 7 PASS' : `GATE: ${failures.length} FAILING: ${failures.join(', ')}`);
process.exit(failures.length === 0 ? 0 : 1);
