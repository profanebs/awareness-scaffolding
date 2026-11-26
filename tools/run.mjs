#!/usr/bin/env node
// Run record v0: one JSONL file per task run.
// Layout: <root>/<YYYY-MM-DD>/<runId>.jsonl
// Events: start | step | result
import { mkdirSync, appendFileSync, readFileSync, readdirSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomBytes } from 'node:crypto';

const DEFAULT_ROOT = join(process.cwd(), '_state', 'runs');
const MODES = ['read', 'edit', 'full'];
const RUN_ID_RE = /^\d{8}-\d{6}-[0-9a-f]{4}$/;

const argv = process.argv.slice(2);
const cmd = argv[0];

function flag(name) {
  const i = argv.indexOf(name);
  return i >= 0;
}
function opt(name, def) {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) return def;
  return argv[i + 1];
}
function root() {
  return process.env.RUNS_ROOT || opt('--root', DEFAULT_ROOT);
}
function nowIso() {
  return new Date().toISOString();
}
// Local time with offset, e.g. 2026-11-27T03:22:32+08:00.
// Event "at" stays UTC; atLocal is for humans and mail filenames.
function localIso(d = new Date()) {
  const off = -d.getTimezoneOffset();
  const sign = off >= 0 ? '+' : '-';
  const abs = Math.abs(off);
  const pad = (n) => String(n).padStart(2, '0');
  const local = new Date(d.getTime() + off * 60000);
  return local.toISOString().slice(0, 19) + sign + pad(Math.floor(abs / 60)) + ':' + pad(abs % 60);
}
function dayDir(r) {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return join(r, `${y}-${m}-${day}`);
}
function newRunId() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
  return `${stamp}-${randomBytes(2).toString('hex')}`;
}
function runPath(runId) {
  if (!RUN_ID_RE.test(runId)) throw new Error('bad run id: ' + runId);
  const day = runId.slice(0, 4) + '-' + runId.slice(4, 6) + '-' + runId.slice(6, 8);
  return join(root(), day, runId + '.jsonl');
}
function readEvents(file) {
  const text = readFileSync(file, 'utf8');
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}
function append(file, obj) {
  const at = obj.at ? new Date(obj.at) : new Date();
  appendFileSync(file, JSON.stringify({ ...obj, atLocal: localIso(at) }) + '\n', 'utf8');
}
function fail(msg) {
  console.error('ERROR ' + msg);
  process.exit(1);
}

if (cmd === 'start') {
  const task = opt('--task');
  const mode = opt('--mode', 'read');
  const who = opt('--who', 'terminal');
  if (!task) fail('--task is required');
  if (!MODES.includes(mode)) fail('--mode must be one of ' + MODES.join(','));
  const runId = newRunId();
  const file = runPath(runId);
  mkdirSync(join(root(), runId.slice(0, 4) + '-' + runId.slice(4, 6) + '-' + runId.slice(6, 8)), { recursive: true });
  append(file, { v: 1, t: 'start', run: runId, at: nowIso(), task, mode, who, cwd: process.cwd() });
  console.log('RUN ' + runId);
} else if (cmd === 'step') {
  const runId = argv[1];
  if (!runId) fail('run id is required');
  const file = runPath(runId);
  if (!existsSync(file)) fail('run not found: ' + runId);
  const events = readEvents(file);
  if (events.some((e) => e.t === 'result')) fail('run already ended: ' + runId);
  const n = events.filter((e) => e.t === 'step').length + 1;
  append(file, {
    v: 1, t: 'step', run: runId, at: nowIso(), n,
    tool: opt('--tool', 'shell'),
    summary: opt('--summary', '')
  });
  console.log('OK step ' + n);
} else if (cmd === 'end') {
  const runId = argv[1];
  if (!runId) fail('run id is required');
  const file = runPath(runId);
  if (!existsSync(file)) fail('run not found: ' + runId);
  const events = readEvents(file);
  if (events.some((e) => e.t === 'result')) fail('run already ended: ' + runId);
  const terminalFlags = ['--ok', '--fail', '--parked', '--abandoned'].filter(flag);
  if (terminalFlags.length > 1) fail('use only one of --ok / --fail / --parked / --abandoned');
  const kind = flag('--abandoned') ? 'abandoned' : flag('--parked') ? 'parked' : flag('--fail') ? 'failed' : 'done';
  const ok = kind === 'done';
  const artifacts = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--artifact' && i + 1 < argv.length) artifacts.push(argv[i + 1]);
  }
  append(file, {
    v: 1, t: 'result', run: runId, at: nowIso(), ok, kind,
    errorKind: ok ? null : opt('--errorKind', kind),
    note: opt('--note', null),
    artifacts
  });
  console.log(ok ? 'OK' : kind === 'failed' ? 'FAIL' : kind.toUpperCase());
} else if (cmd === 'list') {
  const limit = Number(opt('--limit', '20'));
  const r = root();
  const rows = [];
  if (existsSync(r)) {
    for (const day of readdirSync(r).sort().reverse()) {
      const dir = join(r, day);
      if (!existsSync(dir)) continue;
      for (const name of readdirSync(dir)) {
        if (!name.endsWith('.jsonl')) continue;
        try {
          const events = readEvents(join(dir, name));
          const start = events.find((e) => e.t === 'start');
          const result = events.find((e) => e.t === 'result');
          rows.push({
            run: name.replace(/\.jsonl$/, ''),
            task: start ? start.task : null,
            mode: start ? start.mode : null,
            who: start ? start.who : null,
            at: start ? start.at : null,
            atLocal: start ? (start.atLocal || null) : null,
            open: !result,
            ok: result ? result.ok : null,
            kind: result ? (result.kind || (result.ok ? 'done' : 'failed')) : null,
            errorKind: result ? result.errorKind : null,
            steps: events.filter((e) => e.t === 'step').length,
            artifacts: result ? result.artifacts : []
          });
        } catch (e) {
          rows.push({ run: name.replace(/\.jsonl$/, ''), error: String(e.message || e) });
        }
      }
    }
  }
  rows.sort((a, b) => String(b.at || '').localeCompare(String(a.at || '')));
  console.log(JSON.stringify(rows.slice(0, limit), null, 2));
} else if (cmd === 'selftest') {
  const tmp = join(tmpdir(), 'runs-selftest-' + randomBytes(4).toString('hex'));
  process.env.RUNS_ROOT = tmp;
  const id = newRunId();
  const file = runPath(id);
  mkdirSync(join(tmp, id.slice(0, 4) + '-' + id.slice(4, 6) + '-' + id.slice(6, 8)), { recursive: true });
  append(file, { v: 1, t: 'start', run: id, at: nowIso(), task: 'selftest', mode: 'read', who: 'selftest', cwd: tmp });
  for (let i = 1; i <= 3; i++) {
    append(file, { v: 1, t: 'step', run: id, at: nowIso(), n: i, tool: 'selftest', summary: 'step ' + i });
  }
  append(file, { v: 1, t: 'result', run: id, at: nowIso(), ok: true, kind: 'done', errorKind: null, note: null, artifacts: [] });
  const events = readEvents(file);
  if (events.length !== 5) fail('expected 5 events, got ' + events.length);
  if (!events.every((e) => e.run === id)) fail('run id mismatch');
  if (events[0].t !== 'start' || events[4].t !== 'result') fail('event order wrong');
  if (events[4].kind !== 'done') fail('expected kind done');
  // parked / abandoned keep the main 5-line count untouched; check them in separate runs.
  for (const kindName of ['parked', 'abandoned']) {
    const alt = newRunId();
    const altFile = runPath(alt);
    mkdirSync(join(tmp, alt.slice(0, 4) + '-' + alt.slice(4, 6) + '-' + alt.slice(6, 8)), { recursive: true });
    append(altFile, { v: 1, t: 'start', run: alt, at: nowIso(), task: 'selftest ' + kindName, mode: 'read', who: 'selftest', cwd: tmp });
    append(altFile, { v: 1, t: 'result', run: alt, at: nowIso(), ok: false, kind: kindName, errorKind: kindName, note: null, artifacts: [] });
    const altEvents = readEvents(altFile);
    if (altEvents.length !== 2 || altEvents[1].kind !== kindName) fail('expected kind ' + kindName);
  }
  console.log('OK selftest ' + id + ' lines=5');
  rmSync(tmp, { recursive: true, force: true });
} else {
  console.log('usage: run.mjs <start|step|end|list|selftest>');
  console.log('  start --task TEXT [--mode read|edit|full] [--who NAME] [--root DIR]');
  console.log('  step RUNID [--tool NAME] [--summary TEXT]');
  console.log('  end RUNID [--ok|--fail|--parked|--abandoned] [--note TEXT] [--errorKind KIND] [--artifact PATH]...');
  console.log('  list [--limit N]');
  process.exit(2);
}
