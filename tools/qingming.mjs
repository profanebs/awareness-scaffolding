#!/usr/bin/env node
// Qingming cane v0: four tap points, one ledger, a residual list, stale-run sweep.
// Source is ASCII-only; all Chinese copy lives in prompts.json (UTF-8 data file).
import {
  mkdirSync, readFileSync, writeFileSync, appendFileSync,
  existsSync, statSync, readdirSync, rmSync
} from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const HERE = dirname(SELF);
const PROMPTS_FILE = join(HERE, 'prompts.json');
const POINTS = ['before-speak', 'end-turn', 'wake', 'rule'];
const LEDGER_NAME = 'ledger.md';
const RESIDUAL_NAME = 'residual.md';

// anchor/v1 section headings and line prefixes (escaped to keep source ASCII).
const ANCHOR_SCHEMA = 'anchor/v1';
const H_ONE_LINE = ['One line', '\u4e00\u53e5\u8bdd'];
const H_STATE = ['Current state', '\u5f53\u524d\u72b6\u6001'];
const H_TAPS = ['Predicted tap points', '\u9884\u8ba1\u4f1a\u88ab\u6572\u7684\u70b9'];
const L_NOW = ['Now:', '\u73b0\u5728\uFF1A'];
const L_NEXT = ['Next:', '\u4e0b\u4e00\u624b\uFF1A'];

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name) {
  return argv.includes(name);
}
function opt(name, def) {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) return def;
  return argv[i + 1];
}
function root() {
  const named = opt('--root', null);
  if (named) return resolve(named);
  return process.env.AWARENESS_ROOT || process.cwd();
}
function runsDir() {
  return process.env.RUNS_ROOT || join(root(), '_state', 'runs');
}
function ledgerFile() {
  return join(root(), 'memory', LEDGER_NAME);
}
function residualFile() {
  return join(root(), 'memory', RESIDUAL_NAME);
}
function stateFile() {
  return join(root(), '_state', 'qingming', 'state.json');
}

function fail(msg) {
  console.error('ERROR ' + msg);
  process.exit(1);
}
function usage(code) {
  const text = [
    'usage: qingming.mjs <tap|log|residual|sweep|wean|anchor|selftest> [--root DIR]',
    '  root: --root DIR > AWARENESS_ROOT > cwd',
    '  tap <before-speak|end-turn|wake|rule> [--anchor FILE]',
    '  log --point P --saw TEXT --chose TEXT [--gap TEXT]',
    '  residual add TEXT | list | done N',
    '  sweep [--hours N] [--mark]',
    '  wean --without | --with',
    '  anchor <anchor.md> [--json]',
    '  selftest'
  ].join('\n');
  if (code === 0) {
    console.log(text);
    return;
  }
  console.error(text);
  process.exit(code);
}

function loadPrompts() {
  if (!existsSync(PROMPTS_FILE)) fail('prompts.json not found: ' + PROMPTS_FILE);
  try {
    return JSON.parse(readFileSync(PROMPTS_FILE, 'utf8'));
  } catch (e) {
    fail('prompts.json is not valid JSON: ' + e.message);
  }
}
function hint(key) {
  const p = loadPrompts();
  return (p.text && p.text[key]) || '';
}

function pad(n) {
  return String(n).padStart(2, '0');
}
function stamp(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function dateOnly(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
// Local time with offset, e.g. 2026-11-27T03:22:32+08:00.
function localIso(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const local = new Date(d.getTime() + off * 60000);
  return local.toISOString().slice(0, 19) + sign + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
}
function clean(s) {
  return String(s == null ? '' : s).replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').trim();
}

function readState() {
  let raw = {};
  try {
    raw = JSON.parse(readFileSync(stateFile(), 'utf8'));
  } catch (e) {
    raw = {};
  }
  const tap = raw && typeof raw.tap === 'object' && raw.tap ? raw.tap : {};
  const wean = raw && typeof raw.wean === 'object' && raw.wean ? raw.wean : {};
  return {
    v: 1,
    tap: { ...tap },
    wean: { with: Number(wean.with) || 0, without: Number(wean.without) || 0 }
  };
}
function writeState(s) {
  mkdirSync(dirname(stateFile()), { recursive: true });
  writeFileSync(stateFile(), JSON.stringify(s, null, 2) + '\n', 'utf8');
}

function appendWithTitle(file, title, line) {
  mkdirSync(dirname(file), { recursive: true });
  let prefix = '';
  if (!existsSync(file) || statSync(file).size === 0) prefix = title;
  appendFileSync(file, prefix + line + '\n', 'utf8');
}
function appendLine(file, obj) {
  let prefix = '';
  try {
    const t = readFileSync(file, 'utf8');
    if (t && !t.endsWith('\n')) prefix = '\n';
  } catch (e) {
    prefix = '';
  }
  appendFileSync(file, prefix + JSON.stringify(obj) + '\n', 'utf8');
}
function readEvents(file) {
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch (e) {
    return [];
  }
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line));
    } catch (e) {
      // Tolerate a half-written or corrupt line.
    }
  }
  return out;
}

// --- anchor/v1: a one-page project anchor read by tap ------------------------

// Frontmatter: lines between the first two --- lines, simple key: value.
// Throws instead of exiting so the tap path can ignore a broken anchor.
function parseFrontmatter(lines) {
  if (lines.length === 0 || lines[0].trim() !== '---') {
    throw new Error('missing frontmatter: first line must be ---');
  }
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) throw new Error('unterminated frontmatter: no closing ---');
  const meta = {};
  for (let i = 1; i < end; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw);
    if (!m) throw new Error('bad frontmatter line ' + (i + 1) + ': ' + raw);
    let value = m[2].replace(/\s+#.*$/, '').trim();
    if (value.length >= 2) {
      const q = value[0];
      if ((q === '"' || q === "'") && value[value.length - 1] === q) {
        value = value.slice(1, -1);
      }
    }
    meta[m[1]] = value;
  }
  return { meta, end };
}

function headingText(line) {
  const m = /^#{1,6}\s+(.*\S)\s*$/.exec(String(line).trim());
  return m ? m[1] : null;
}

// Body lines of the first heading whose text starts with one of titles.
function anchorSection(lines, titles) {
  let start = -1;
  for (let i = 0; i < lines.length; i++) {
    const h = headingText(lines[i]);
    if (h !== null && titles.some((t) => h.startsWith(t))) {
      start = i;
      break;
    }
  }
  if (start < 0) return null;
  const body = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (headingText(lines[i]) !== null) break;
    body.push(lines[i]);
  }
  return body;
}

function anchorFlow(body) {
  const items = [];
  for (const raw of body || []) {
    let line = raw.trim();
    if (!line) continue;
    line = line.replace(/^[-*]\s+/, '').trim();
    if (!line) continue;
    for (const p of L_NOW) {
      if (line.startsWith(p)) { line = line.slice(p.length).trim(); break; }
    }
    for (const p of L_NEXT) {
      if (line.startsWith(p)) { line = line.slice(p.length).trim(); break; }
    }
    if (line) items.push(line);
  }
  return { state: items[0] || '', next: items[1] || '' };
}

function anchorPredictionCount(body) {
  if (!body) return 0;
  let n = 0;
  for (const line of body) if (/^\s*- /.test(line)) n++;
  return n;
}

function anchorStale(review) {
  const text = String(review || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return true;
  return text < dateOnly();
}

function readAnchor(file) {
  const abs = resolve(file);
  if (!existsSync(abs)) throw new Error('anchor file not found: ' + abs);
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (e) {
    throw new Error('cannot read ' + abs + ': ' + e.message);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const lines = text.split(/\r?\n/);
  const { meta } = parseFrontmatter(lines);
  if (!meta.schema) throw new Error('frontmatter missing schema');
  if (meta.schema !== ANCHOR_SCHEMA) throw new Error('unsupported schema: ' + meta.schema);
  if (!meta.project) throw new Error('frontmatter missing project');
  const stateBody = anchorSection(lines, H_STATE);
  if (!stateBody) throw new Error('missing section: ' + H_STATE[0]);
  const tapsBody = anchorSection(lines, H_TAPS);
  if (!tapsBody) throw new Error('missing section: ' + H_TAPS[0]);
  const flow = anchorFlow(stateBody);
  const review = meta.review || '';
  return {
    file: abs,
    project: meta.project,
    status: meta.status || '',
    review,
    stale: anchorStale(review),
    state: flow.state,
    next: flow.next,
    predictions: anchorPredictionCount(tapsBody)
  };
}

// Resolve order: --anchor > ANCHOR_FILE > ./anchor.md. A missing or broken
// anchor never blocks a tap; it just prints no anchor line.
function tapAnchor() {
  const named = opt('--anchor', null) || process.env.ANCHOR_FILE || '';
  let file = named;
  if (!file) {
    const local = join(process.cwd(), 'anchor.md');
    if (existsSync(local)) file = local;
  }
  if (!file) return null;
  try {
    return readAnchor(file);
  } catch (e) {
    return null;
  }
}

function anchorLine(a) {
  if (a.stale) return 'anchor: STALE since ' + clean(a.review || 'unknown') + ' | ' + clean(a.project);
  return 'anchor: ' + clean(a.project) + ' | ' + clean(a.state || '(no state)') + ' | ' + a.predictions + ' predicted taps';
}

function cmdAnchor(file, json) {
  if (!file) usage(2);
  let a;
  try {
    a = readAnchor(file);
  } catch (e) {
    fail(e.message);
  }
  if (json) {
    console.log(JSON.stringify({
      project: a.project,
      status: a.status || null,
      review: a.review || null,
      stale: a.stale,
      state: a.state,
      next: a.next,
      predictions: a.predictions
    }));
    return;
  }
  console.log('project: ' + a.project);
  console.log('status: ' + (a.status || 'none'));
  console.log('review: ' + (a.review || 'none'));
  console.log('stale: ' + (a.stale ? 'yes' : 'no'));
  console.log('state: ' + a.state);
  if (a.next) console.log('next: ' + a.next);
  console.log('predictions: ' + a.predictions);
}

function cmdTap(point) {
  if (!POINTS.includes(point)) usage(2);
  const anchor = tapAnchor();
  const prompts = loadPrompts();
  const arr = prompts.points && prompts.points[point];
  if (!Array.isArray(arr) || arr.length === 0) fail('no prompts for point: ' + point);
  const st = readState();
  const n = Number(st.tap[point]) || 0;
  writeState({ ...st, tap: { ...st.tap, [point]: n + 1 } });
  if (anchor) console.log(anchorLine(anchor));
  console.log(arr[n % arr.length]);
}

function cmdLog(point, saw, chose, gap) {
  if (!POINTS.includes(point)) fail('--point must be one of ' + POINTS.join(', '));
  if (saw == null || chose == null) fail('--saw and --chose are required');
  let line = `- ${stamp()} | ${point} | saw: ${clean(saw)} | chose: ${clean(chose)}`;
  const g = clean(gap);
  if (g) line += ` | gap: ${g}`;
  appendWithTitle(ledgerFile(), hint('ledger-title'), line);
  console.log(line);
}

function residualItems() {
  const file = residualFile();
  if (!existsSync(file)) return [];
  const lines = readFileSync(file, 'utf8').split(/\r?\n/);
  const items = [];
  lines.forEach((line, i) => {
    if (/^- \[ \] /.test(line)) items.push({ i, text: line.slice(6).replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*$/, '') });
  });
  return items;
}
function cmdResidual(sub, rest) {
  if (sub === 'add') {
    const text = clean(rest.join(' '));
    if (!text) usage(2);
    appendWithTitle(residualFile(), hint('residual-title'), `- [ ] ${text} (${dateOnly()})`);
    console.log('ADDED ' + text);
    return;
  }
  if (sub === 'list') {
    const items = residualItems();
    if (items.length === 0) {
      console.log(hint('residual-empty'));
      return;
    }
    items.forEach((item, i) => console.log(`${i + 1}. ${item.text}`));
    return;
  }
  if (sub === 'done') {
    const n = Number(rest[0]);
    const file = residualFile();
    if (!Number.isInteger(n) || n < 1) usage(2);
    if (!existsSync(file)) fail('no residual item ' + n);
    const lines = readFileSync(file, 'utf8').split(/\r?\n/);
    const open = [];
    lines.forEach((line, i) => {
      if (/^- \[ \] /.test(line)) open.push(i);
    });
    if (n > open.length) fail('no residual item ' + n);
    const idx = open[n - 1];
    lines[idx] = lines[idx].replace('- [ ]', '- [x]');
    writeFileSync(file, lines.join('\n'), 'utf8');
    console.log('DONE ' + n);
    return;
  }
  usage(2);
}

function listRunFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  let entries = [];
  try {
    entries = readdirSync(dir, { recursive: true });
  } catch (e) {
    return [];
  }
  for (const rel of entries) {
    const name = String(rel);
    if (!name.endsWith('.jsonl')) continue;
    const file = join(dir, name);
    try {
      if (statSync(file).isFile()) out.push(file);
    } catch (e) {
      // File vanished between listing and stat; skip.
    }
  }
  return out;
}

function cmdSweep(hoursRaw, mark) {
  const hours = Number(hoursRaw);
  if (!Number.isFinite(hours) || hours < 0) fail('--hours must be zero or a positive number');
  const now = Date.now();
  const hits = [];
  for (const file of listRunFiles(runsDir())) {
    const events = readEvents(file);
    const start = events.find((e) => e.t === 'start');
    const result = events.find((e) => e.t === 'result');
    if (!start || result) continue;
    let t = start.at ? Date.parse(start.at) : NaN;
    if (!Number.isFinite(t)) {
      try {
        t = statSync(file).mtimeMs;
      } catch (e) {
        t = now;
      }
    }
    const age = Math.max(0, (now - t) / 3600000);
    if (age < hours) continue;
    hits.push({
      file,
      run: basename(file, '.jsonl'),
      age,
      task: start.task || ''
    });
  }
  hits.sort((a, b) => b.age - a.age);
  if (hits.length === 0) {
    console.log(hint('sweep-empty'));
    return;
  }
  for (const h of hits) console.log(`${h.run} | ${h.age.toFixed(1)}h | ${h.task}`);
  if (mark) {
    let marked = 0;
    let skipped = 0;
    for (const h of hits) {
      // Re-read before writing: another session may have ended it meanwhile.
      const fresh = readEvents(h.file);
      if (fresh.some((e) => e.t === 'result')) {
        skipped++;
        continue;
      }
      const now = new Date();
      const at = now.toISOString();
      appendLine(h.file, {
        v: 1, t: 'result', run: h.run, at, atLocal: localIso(now), ok: false,
        kind: 'abandoned', errorKind: 'abandoned',
        note: 'swept stale open run', artifacts: []
      });
      marked++;
    }
    console.log('marked=' + marked);
    if (skipped) console.log('skipped=' + skipped);
  }
}

function cmdWean(mode) {
  if (mode !== '--without' && mode !== '--with') usage(2);
  const st = readState();
  if (mode === '--without') st.wean.without += 1;
  else st.wean.with += 1;
  writeState(st);
  console.log(`without=${st.wean.without} with=${st.wean.with}`);
}

function selftest() {
  const tmp = join(tmpdir(), 'qingming-selftest-' + process.pid);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const ledger = join(tmp, 'memory', LEDGER_NAME);
  const residual = join(tmp, 'memory', RESIDUAL_NAME);
  let checks = 0;
  let error = null;
  const must = (cond, msg) => {
    if (!cond) throw new Error(msg);
    checks++;
  };
  const run = (args, extraEnv, cwd) => {
    const env = { ...process.env, AWARENESS_ROOT: tmp };
    delete env.RUNS_ROOT;
    delete env.ANCHOR_FILE;
    Object.assign(env, extraEnv || {});
    return spawnSync(process.execPath, [SELF, ...args], { env, encoding: 'utf8', cwd });
  };
  try {
    // tap (cwd pinned to tmp so a stray ./anchor.md cannot add a line)
    const tapped = run(['tap', 'end-turn'], null, tmp);
    must(tapped.status === 0, 'tap exit ' + tapped.status);
    const tapText = String(tapped.stdout || '').trim();
    must(tapText.length > 0 && tapText.split(/\r?\n/).length === 1, 'tap output');
    const bad = run(['tap', 'no-such-point']);
    must(bad.status !== 0, 'invalid point must exit non-zero');

    // root resolution: --root beats AWARENESS_ROOT, env beats cwd
    const altRoot = join(tmp, 'alt-root');
    const alt = run(['tap', 'wake', '--root', altRoot]);
    must(alt.status === 0, 'tap --root exit ' + alt.status);
    must(existsSync(join(altRoot, '_state', 'qingming', 'state.json')), '--root writes state under named root');
    must(!readFileSync(join(tmp, '_state', 'qingming', 'state.json'), 'utf8').includes('"wake": 1'),
      '--root does not touch env root');
    const cwdRoot = join(tmp, 'cwd-root');
    mkdirSync(cwdRoot, { recursive: true });
    const cwdEnv = { ...process.env };
    delete cwdEnv.AWARENESS_ROOT;
    const byCwd = spawnSync(process.execPath, [SELF, 'tap', 'wake'], { env: cwdEnv, encoding: 'utf8', cwd: cwdRoot });
    must(byCwd.status === 0, 'tap cwd root exit ' + byCwd.status);
    must(existsSync(join(cwdRoot, '_state', 'qingming', 'state.json')), 'cwd is the default root');

    // log
    const logged = run([
      'log', '--point', 'end-turn',
      '--saw', 'line1\nline2|x', '--chose', 'chose text', '--gap', 'gap text'
    ]);
    must(logged.status === 0, 'log exit ' + logged.status);
    const ledgerText = readFileSync(ledger, 'utf8');
    must(ledgerText.includes('saw: line1 line2/x'), 'log newline/pipe cleanup');
    must(ledgerText.split(/\r?\n/).filter((l) => l.startsWith('- ')).length === 1, 'ledger line count');
    must(ledgerText.includes('| gap: gap text'), 'log gap');

    // residual
    must(run(['residual', 'add', 'first item']).status === 0, 'residual add 1');
    must(run(['residual', 'add', 'second item']).status === 0, 'residual add 2');
    let listed = run(['residual', 'list']);
    must(listed.stdout.includes('1. first item') && listed.stdout.includes('2. second item'), 'residual list order');
    must(run(['residual', 'done', '1']).status === 0, 'residual done');
    listed = run(['residual', 'list']);
    must(String(listed.stdout || '').trim() === '1. second item', 'residual renumber after done');
    must(readFileSync(residual, 'utf8').includes('- [x] first item'), 'residual checked marker');

    // sweep: default root
    const dayDir = join(tmp, '_state', 'runs', '2026-01-01');
    mkdirSync(dayDir, { recursive: true });
    const old = new Date(Date.now() - 3 * 3600 * 1000).toISOString();
    const openId = '20260101-000000-aaaa';
    const openFile = join(dayDir, openId + '.jsonl');
    writeFileSync(openFile, JSON.stringify({
      v: 1, t: 'start', run: openId, at: old, task: 'stale task', mode: 'read', who: 'selftest'
    }) + '\n', 'utf8');
    const closedId = '20260101-000000-bbbb';
    writeFileSync(join(dayDir, closedId + '.jsonl'),
      JSON.stringify({ v: 1, t: 'start', run: closedId, at: old, task: 'closed task' }) + '\n' +
      JSON.stringify({ v: 1, t: 'result', run: closedId, at: old, ok: true, kind: 'done' }) + '\n',
      'utf8');
    const swept = run(['sweep', '--hours', '2']);
    must(swept.status === 0, 'sweep exit ' + swept.status);
    must(swept.stdout.includes(openId), 'sweep lists stale open run');
    must(!swept.stdout.includes(closedId), 'sweep skips closed run');

    // sweep: RUNS_ROOT override
    const ovrDir = join(tmp, 'override-runs', '2026-01-02');
    mkdirSync(ovrDir, { recursive: true });
    const ovrId = '20260102-000000-cccc';
    writeFileSync(join(ovrDir, ovrId + '.jsonl'), JSON.stringify({
      v: 1, t: 'start', run: ovrId, at: old, task: 'override task'
    }) + '\n', 'utf8');
    const overridden = run(['sweep', '--hours', '2'], { RUNS_ROOT: join(tmp, 'override-runs') });
    must(overridden.stdout.includes(ovrId), 'sweep honors RUNS_ROOT');
    must(!overridden.stdout.includes(openId), 'sweep override ignores default root');

    // sweep --mark
    const markedRun = run(['sweep', '--hours', '2', '--mark']);
    must(markedRun.status === 0, 'sweep mark exit ' + markedRun.status);
    const resultEvent = readEvents(openFile).find((e) => e.t === 'result');
    must(resultEvent && resultEvent.kind === 'abandoned', 'sweep mark kind');
    must(resultEvent.ok === false && resultEvent.note === 'swept stale open run', 'sweep mark fields');
    must(/Z$/.test(String(resultEvent.at)), 'sweep mark at utc');
    must(/[+-]\d\d:\d\d$/.test(String(resultEvent.atLocal)), 'sweep mark atLocal offset');
    const sweptAgain = run(['sweep', '--hours', '2']);
    must(String(sweptAgain.stdout || '').includes(hint('sweep-empty')), 'sweep empty hint');

    // anchor: fresh review, two predictions, state/next prefixes stripped
    const future = dateOnly(new Date(Date.now() + 86400000));
    const anchorBody = [
      '---',
      'schema: anchor/v1',
      'project: demo',
      'status: active',
      'review: ' + future,
      '---',
      '',
      '# One line',
      '',
      'ship anchor v0',
      '',
      '# Predicted tap points',
      '',
      '- P1: phase 2 ends',
      '- P2: user says stop',
      'plain text is not a predicted tap',
      '',
      '# Current state / next hand',
      '',
      '- Now: build parser',
      '- Next: write README',
      ''
    ].join('\n');
    const freshAnchor = join(tmp, 'anchor-fresh.md');
    writeFileSync(freshAnchor, anchorBody, 'utf8');
    const fresh = run(['anchor', freshAnchor]);
    must(fresh.status === 0, 'anchor exit ' + fresh.status);
    const freshText = String(fresh.stdout || '');
    must(freshText.includes('project: demo'), 'anchor project');
    must(freshText.includes('status: active'), 'anchor status');
    must(freshText.includes('review: ' + future), 'anchor review');
    must(freshText.includes('stale: no'), 'anchor stale no');
    must(freshText.includes('state: build parser'), 'anchor state');
    must(freshText.includes('next: write README'), 'anchor next');
    must(freshText.includes('predictions: 2'), 'anchor predictions');
    const freshJson = JSON.parse(String(run(['anchor', freshAnchor, '--json']).stdout || '{}'));
    must(freshJson.project === 'demo' && freshJson.status === 'active', 'anchor json project/status');
    must(freshJson.state === 'build parser' && freshJson.next === 'write README', 'anchor json state/next');
    must(freshJson.predictions === 2 && freshJson.stale === false, 'anchor json predictions/stale');

    // tap with a fresh anchor: anchor line first, prompt line second
    const tapFresh = run(['tap', 'end-turn', '--anchor', freshAnchor]);
    must(tapFresh.status === 0, 'tap anchor exit ' + tapFresh.status);
    const tapFreshLines = String(tapFresh.stdout || '').trim().split(/\r?\n/);
    must(tapFreshLines.length === 2, 'tap anchor two lines');
    must(tapFreshLines[0] === 'anchor: demo | build parser | 2 predicted taps', 'tap anchor line');
    must(tapFreshLines[1].length > 0 && !tapFreshLines[1].startsWith('anchor:'), 'tap anchor keeps prompt');
    const tapRel = run(['tap', 'end-turn', '--anchor', basename(freshAnchor)], null, tmp);
    must(String(tapRel.stdout || '').includes('anchor: demo'), 'tap anchor relative to cwd');
    const tapEnv = run(['tap', 'end-turn'], { ANCHOR_FILE: freshAnchor });
    must(String(tapEnv.stdout || '').includes('anchor: demo'), 'tap anchor env var');

    // stale anchor: past review date
    const staleAnchor = join(tmp, 'anchor-stale.md');
    writeFileSync(staleAnchor, anchorBody
      .replace('review: ' + future, 'review: 2020-01-01')
      .replace('project: demo', 'project: old'), 'utf8');
    const stale = run(['anchor', staleAnchor, '--json']);
    must(stale.status === 0 && JSON.parse(String(stale.stdout || '{}')).stale === true, 'anchor stale json');
    must(String(run(['anchor', staleAnchor]).stdout || '').includes('stale: yes'), 'anchor stale text');
    const tapStale = run(['tap', 'end-turn', '--anchor', staleAnchor]);
    const tapStaleLines = String(tapStale.stdout || '').trim().split(/\r?\n/);
    must(tapStaleLines.length === 2, 'tap stale two lines');
    must(tapStaleLines[0] === 'anchor: STALE since 2020-01-01 | old', 'tap stale line');
    const tapPrec = run(['tap', 'end-turn', '--anchor', freshAnchor], { ANCHOR_FILE: staleAnchor });
    must(String(tapPrec.stdout || '').includes('anchor: demo') && !String(tapPrec.stdout).includes('STALE'),
      'anchor flag beats env');

    // no anchor: old single-line tap behavior
    const plain = run(['tap', 'end-turn'], null, tmp);
    must(String(plain.stdout || '').trim().split(/\r?\n/).length === 1, 'tap without anchor one line');

    // missing file / bad frontmatter / bad structure
    const absent = join(tmp, 'no-such-anchor.md');
    must(run(['anchor', absent]).status !== 0, 'anchor missing file exit');
    must(String(run(['anchor', absent]).stderr || '').includes('ERROR'), 'anchor missing file message');
    const tapAbsent = run(['tap', 'end-turn', '--anchor', absent]);
    must(tapAbsent.status === 0, 'tap missing anchor exit 0');
    must(String(tapAbsent.stdout || '').trim().split(/\r?\n/).length === 1, 'tap missing anchor one line');
    const badAnchor = join(tmp, 'anchor-bad.md');
    writeFileSync(badAnchor, '# ' + H_STATE + '\n\n- no frontmatter\n', 'utf8');
    must(run(['anchor', badAnchor]).status !== 0, 'anchor bad frontmatter exit');
    const tapBad = run(['tap', 'end-turn', '--anchor', badAnchor]);
    must(tapBad.status === 0, 'tap bad anchor exit 0');
    must(String(tapBad.stdout || '').trim().split(/\r?\n/).length === 1, 'tap bad anchor one line');
    const hollowAnchor = join(tmp, 'anchor-hollow.md');
    writeFileSync(hollowAnchor, '---\nschema: anchor/v1\nproject: x\n---\n\nnothing\n', 'utf8');
    must(run(['anchor', hollowAnchor]).status !== 0, 'anchor bad structure exit');
    must(String(run(['anchor', hollowAnchor]).stderr || '').includes('missing section'), 'anchor bad structure message');

    // wean
    run(['wean', '--without']);
    run(['wean', '--without']);
    const weaned = run(['wean', '--with']);
    must(String(weaned.stdout || '').trim() === 'without=2 with=1', 'wean counts');
  } catch (e) {
    error = e;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  if (error) fail('selftest: ' + error.message);
  console.log('OK qingming selftest checks=' + checks);
}

if (cmd === 'tap') {
  cmdTap(argv[1]);
} else if (cmd === 'log') {
  cmdLog(opt('--point'), opt('--saw'), opt('--chose'), opt('--gap', null));
} else if (cmd === 'residual') {
  cmdResidual(argv[1], argv.slice(2));
} else if (cmd === 'sweep') {
  cmdSweep(opt('--hours', '2'), flag('--mark'));
} else if (cmd === 'wean') {
  cmdWean(argv[1]);
} else if (cmd === 'anchor') {
  cmdAnchor(argv[1], flag('--json'));
} else if (cmd === 'selftest') {
  selftest();
} else {
  usage(2);
}
