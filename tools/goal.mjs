#!/usr/bin/env node
// goal-contract v0: parse goal.md and run status/next/check/close/log.
// Source is ASCII-only; Chinese strings are \u escapes. Standard library only.
import {
  readFileSync, writeFileSync, existsSync, mkdirSync, rmSync, realpathSync, statSync
} from 'node:fs';
import { join, dirname, resolve, relative, isAbsolute, sep } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SELF = fileURLToPath(import.meta.url);
const argv = process.argv.slice(2);
const cmd = argv[0];

// Section headings and fixed copy. Escaped so this file stays pure ASCII.
const T = {
  goal: '\u76ee\u6807',                 // mu biao
  conditions: '\u5b8c\u6210\u6761\u4ef6', // wan cheng tiao jian
  bounds: '\u8fb9\u754c',               // bian jie
  next: '\u5f53\u524d\u4e0b\u4e00\u624b', // dang qian xia yi shou
  log: '\u8fd0\u884c\u8bb0\u5f55',     // yun xing ji lu
  allDone: '\u5168\u90e8\u5b8c\u6210'   // quan bu wan cheng
};
const STATUSES = ['active', 'done', 'blocked', 'abandoned'];
const EXEC_TIMEOUT_MS = 60000;

function flag(name) {
  return argv.includes(name);
}
function opt(name, def) {
  const i = argv.indexOf(name);
  if (i < 0 || i + 1 >= argv.length) return def;
  return argv[i + 1];
}
function fail(msg) {
  console.error('ERROR ' + msg);
  process.exit(1);
}
function usage(code) {
  const text = [
    'usage: goal.mjs <status|next|check|close|log|selftest>',
    '  status <goal.md> [--json]',
    '  next <goal.md>',
    '  check <goal.md> [--exec] [--json]',
    '  close <goal.md> [--note TEXT] [--exec]',
    '  log <goal.md> --run ID [--note TEXT]',
    '  selftest'
  ].join('\n');
  if (code === 0) {
    console.log(text);
    return;
  }
  console.error(text);
  process.exit(code);
}
function pad2(n) {
  return String(n).padStart(2, '0');
}
function localDate(d = new Date()) {
  return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
}
function localStamp(d = new Date()) {
  return localDate(d) + ' ' + pad2(d.getHours()) + ':' + pad2(d.getMinutes());
}
function headingRe(title) {
  return new RegExp('^#{1,6}\\s*' + title + '\\s*$');
}

// Frontmatter: lines between the first two --- lines, simple key: value.
function parseFrontmatter(lines) {
  if (lines[0].trim() !== '---') fail('missing frontmatter: first line must be ---');
  let end = -1;
  for (let i = 1; i < lines.length; i++) {
    if (lines[i].trim() === '---') {
      end = i;
      break;
    }
  }
  if (end < 0) fail('unterminated frontmatter: no closing ---');
  const meta = {};
  for (let i = 1; i < end; i++) {
    const raw = lines[i].trim();
    if (!raw || raw.startsWith('#')) continue;
    const m = /^([A-Za-z0-9_-]+):\s*(.*)$/.exec(raw);
    if (!m) fail('bad frontmatter line ' + (i + 1) + ': ' + raw);
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

// Condition: "- [ ] C1: text" or "- [x] C1: text"; following indented lines
// carry check: and evidence: keys.
function parseConditions(lines, start) {
  const out = [];
  let cur = null;
  for (let i = start; i < lines.length; i++) {
    const line = lines[i];
    if (/^#{1,6}\s/.test(line)) {
      cur = null;
      continue;
    }
    const m = /^ {0,3}- \[([ xX])\]\s+(.*)$/.exec(line);
    if (m) {
      let text = m[2].trim();
      let id = null;
      const idm = /^([A-Za-z][A-Za-z0-9_.-]{0,19}):\s*(.*)$/.exec(text);
      if (idm) {
        id = idm[1];
        text = idm[2].trim();
      }
      cur = {
        id, text, checked: m[1].toLowerCase() === 'x',
        check: null, evidence: [], index: out.length + 1, line: i + 1
      };
      out.push(cur);
      continue;
    }
    if (!cur) continue;
    const cont = /^(\s+)(check|evidence):\s*(.*)$/i.exec(line);
    if (cont) {
      const key = cont[2].toLowerCase();
      const value = cont[3].trim();
      if (!value) continue;
      if (key === 'check') {
        cur.check = value;
      } else {
        for (const p of value.split(',')) {
          const item = p.trim();
          if (item) cur.evidence.push(item);
        }
      }
      continue;
    }
    if (line.trim() === '' || !/^\s/.test(line)) cur = null;
  }
  return out;
}

function readGoal(file) {
  const abs = resolve(file);
  if (!existsSync(abs)) fail('goal file not found: ' + abs);
  let text;
  try {
    text = readFileSync(abs, 'utf8');
  } catch (e) {
    fail('cannot read ' + abs + ': ' + e.message);
  }
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const nl = text.includes('\r\n') ? '\r\n' : '\n';
  const lines = text.split(/\r?\n/);
  const { meta, end } = parseFrontmatter(lines);
  if (!meta.schema) fail('frontmatter missing schema');
  if (meta.schema !== 'goal/v1') fail('unsupported schema: ' + meta.schema);
  if (!meta.title) fail('frontmatter missing title');
  if (!meta.status) fail('frontmatter missing status');
  if (!STATUSES.includes(meta.status)) {
    fail('bad status "' + meta.status + '": use ' + STATUSES.join(' | '));
  }
  const conditions = parseConditions(lines, end + 1);
  return { file: abs, dir: dirname(abs), lines, nl, meta, frontmatterEnd: end, conditions };
}

function conditionLabel(c) {
  return c.id || '#' + c.index;
}

function sectionFirstLine(lines, title) {
  const re = headingRe(title);
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i].trim())) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return '';
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) break;
    if (lines[i].trim()) return lines[i].trim();
  }
  return '';
}

// Evidence must stay under the goal file directory; ../ escapes fail.
function resolveEvidence(dir, rel) {
  if (isAbsolute(rel)) {
    return { path: rel, ok: false, reason: 'absolute path' };
  }
  const full = resolve(dir, rel);
  const r = relative(dir, full);
  if (r === '..' || r.startsWith('..' + sep) || isAbsolute(r)) {
    return { path: full, ok: false, reason: 'outside goal dir' };
  }
  if (!existsSync(full)) return { path: full, ok: false, reason: 'missing' };
  try {
    if (!statSync(full).isFile()) return { path: full, ok: false, reason: 'not a file' };
  } catch (e) {
    return { path: full, ok: false, reason: 'unreadable' };
  }
  // Follow symlinks/junctions: the resolved target must still be under the goal dir.
  try {
    const realDir = realpathSync(dir);
    const realFull = realpathSync(full);
    const rr = relative(realDir, realFull);
    if (rr === '..' || rr.startsWith('..' + sep) || isAbsolute(rr)) {
      return { path: full, ok: false, reason: 'outside goal dir (realpath)' };
    }
  } catch (e) {
    return { path: full, ok: false, reason: 'unresolvable path' };
  }
  return { path: full, ok: true, reason: null };
}

function runCheck(dir, command) {
  const r = spawnSync(command, {
    cwd: dir,
    shell: true,
    timeout: EXEC_TIMEOUT_MS,
    encoding: 'utf8',
    windowsHide: true
  });
  const output = String(r.stdout || '') + String(r.stderr || '');
  const summary = output.split(/\r?\n/).filter((l) => l.trim() !== '').slice(-3);
  const timedOut = !!(r.error && r.error.code === 'ETIMEDOUT');
  const exit = typeof r.status === 'number' ? r.status : null;
  return {
    command,
    ran: true,
    exit,
    timedOut,
    ok: !timedOut && exit === 0,
    summary
  };
}

function analyze(goal, exec) {
  const conditions = goal.conditions.map((c) => {
    const evidence = c.evidence.map((raw) => {
      const e = resolveEvidence(goal.dir, raw);
      return { raw, path: e.path, ok: e.ok, reason: e.reason };
    });
    let status;
    if (!c.checked) status = 'open';
    else if (c.evidence.length === 0 && !c.check) status = 'fail';
    else if (evidence.some((e) => !e.ok)) status = 'fail';
    else status = 'pass';
    let execResult = null;
    if (exec && c.check && c.checked) {
      execResult = runCheck(goal.dir, c.check);
      if (status === 'pass' && !execResult.ok) status = 'fail';
    }
    return {
      id: c.id,
      label: conditionLabel(c),
      text: c.text,
      checked: c.checked,
      status,
      check: c.check,
      evidence,
      exec: execResult
    };
  });
  const total = conditions.length;
  const done = conditions.filter((c) => c.checked).length;
  const open = conditions.filter((c) => c.status === 'open').length;
  const failed = conditions.filter((c) => c.status === 'fail').length;
  const ok = total > 0 && open === 0 && failed === 0 && done === total;
  return { ok, total, done, open, failed, conditions };
}

function printCheck(result, exec) {
  for (const c of result.conditions) {
    let line = '[' + c.status + '] ' + c.label + ' ' + c.text;
    if (c.status === 'fail') {
      const bad = c.evidence.filter((e) => !e.ok);
      if (bad.length > 0) {
        line += ' (evidence: ' + bad.map((e) => e.raw + ' ' + (e.reason || 'missing')).join(', ') + ')';
      } else if (!c.check && c.evidence.length === 0) {
        line += ' (no evidence or check)';
      }
      if (c.exec && !c.exec.ok) {
        line += ' (check ' + (c.exec.timedOut ? 'timeout' : 'exit ' + c.exec.exit) + ')';
      }
    }
    console.log(line);
    if (c.check && !exec) console.log('  [skip-exec] ' + c.check);
    if (c.check && exec && !c.checked) console.log('  [skip-open] ' + c.check);
    if (c.exec) {
      console.log('  check ' + (c.exec.timedOut ? 'timeout' : 'exit ' + c.exec.exit));
      for (const s of c.exec.summary) console.log('  > ' + s);
    }
    if (c.evidence.length > 0) {
      console.log('  evidence: ' + c.evidence.map((e) => e.raw + (e.ok ? ' ok' : ' ' + (e.reason || 'missing'))).join(', '));
    }
  }
  console.log((result.ok ? 'OK' : 'NOT OK')
    + ' total=' + result.total
    + ' done=' + result.done
    + ' open=' + result.open
    + ' failed=' + result.failed);
}

function appendUnderSection(lines, title, line) {
  const re = headingRe(title);
  let idx = -1;
  for (let i = 0; i < lines.length; i++) {
    if (re.test(lines[i].trim())) {
      idx = i;
      break;
    }
  }
  if (idx < 0) {
    while (lines.length > 0 && lines[lines.length - 1].trim() === '') lines.pop();
    if (lines.length > 0) lines.push('');
    lines.push('# ' + title, '', line);
    return;
  }
  let end = lines.length;
  for (let i = idx + 1; i < lines.length; i++) {
    if (/^#{1,6}\s/.test(lines[i])) {
      end = i;
      break;
    }
  }
  let last = idx;
  for (let i = idx + 1; i < end; i++) {
    if (lines[i].trim() !== '') last = i;
  }
  if (last === idx) lines.splice(idx + 1, 0, '', line);
  else lines.splice(last + 1, 0, line);
}

function cmdStatus(file) {
  const g = readGoal(file);
  const analysis = analyze(g, false);
  const total = analysis.total;
  const done = analysis.done;
  const open = analysis.conditions.filter((c) => c.status === 'open').map(conditionLabel);
  const failed = analysis.conditions.filter((c) => c.status === 'fail').map(conditionLabel);
  const hasChecks = g.conditions.some((c) => c.check);
  const nextLine = analysis.ok ? '' : sectionFirstLine(g.lines, T.next);
  if (flag('--json')) {
    console.log(JSON.stringify({
      file: g.file,
      schema: g.meta.schema,
      title: g.meta.title,
      status: g.meta.status,
      created: g.meta.created || null,
      owner: g.meta.owner || null,
      review: g.meta.review || null,
      total,
      done,
      open,
      failed,
      ok: analysis.ok,
      checksRun: false,
      next: nextLine
    }, null, 2));
    return;
  }
  console.log('title: ' + g.meta.title);
  console.log('status: ' + g.meta.status);
  if (g.meta.created) console.log('created: ' + g.meta.created);
  if (g.meta.owner) console.log('owner: ' + g.meta.owner);
  if (g.meta.review) console.log('review: ' + g.meta.review);
  console.log('done: ' + done + '/' + total);
  console.log('open: ' + (open.length > 0 ? open.join(', ') : '-'));
  console.log('failed: ' + (failed.length > 0 ? failed.join(', ') : '-'));
  console.log('check: ' + (analysis.ok
    ? (hasChecks ? 'evidence OK (commands not run)' : 'OK')
    : 'NOT OK'));
  console.log('next: ' + (nextLine || (analysis.ok
    ? '-'
    : (failed.length > 0 ? 'fix ' + failed.join(', ') : '-'))));
}

function cmdNext(file) {
  const g = readGoal(file);
  if (g.conditions.length === 0) fail('no completion conditions');
  const analysis = analyze(g, false);
  const hasChecks = g.conditions.some((c) => c.check);
  if (analysis.ok) {
    console.log(hasChecks ? T.allDone + ' (run check --exec to verify commands)' : T.allDone);
    return;
  }
  const c = analysis.conditions.find((x) => x.status === 'open' || x.status === 'fail');
  if (!c) {
    console.log(T.allDone);
    return;
  }
  console.log('id: ' + c.label);
  console.log('status: ' + c.status);
  console.log('text: ' + c.text);
  console.log('check: ' + (c.check || '-'));
  console.log('evidence: ' + (c.evidence.length > 0 ? c.evidence.map((e) => e.raw).join(', ') : '-'));
  if (c.status === 'fail') {
    const bad = c.evidence.filter((e) => !e.ok);
    if (bad.length > 0) {
      console.log('reason: evidence ' + bad.map((e) => e.raw + ' ' + (e.reason || 'missing')).join(', '));
    } else if (!c.check && c.evidence.length === 0) {
      console.log('reason: no evidence or check');
    }
  }
}

function cmdCheck(file) {
  const g = readGoal(file);
  const exec = flag('--exec');
  const res = analyze(g, exec);
  if (flag('--json')) {
    console.log(JSON.stringify(res, null, 2));
  } else {
    printCheck(res, exec);
    if (res.total === 0) console.error('ERROR no completion conditions');
  }
  process.exit(res.ok ? 0 : 1);
}

function cmdClose(file) {
  const exec = flag('--exec');
  const note = String(opt('--note', '')).replace(/[\r\n|]+/g, ' ').trim();
  const g = readGoal(file);
  if (g.meta.status === 'done') {
    console.log('ALREADY done: ' + g.file);
    return;
  }
  if (g.meta.status !== 'active') {
    fail('close refused: status is ' + g.meta.status + '; only active can close');
  }
  const hasCheck = g.conditions.some((c) => c.check);
  if (hasCheck && !exec) {
    fail('close refused: goal has check commands; run check --exec before close');
  }
  const res = analyze(g, exec);
  if (!res.ok) {
    printCheck(res, exec);
    console.error('ERROR close refused: goal is not complete');
    process.exit(1);
  }
  const lines = g.lines.slice();
  for (let i = 1; i < g.frontmatterEnd; i++) {
    if (/^status\s*:/.test(lines[i])) lines[i] = 'status: done';
  }
  appendUnderSection(lines, T.log, '- closed ' + localDate() + (note ? ' | ' + note : ''));
  writeFileSync(g.file, lines.join(g.nl), 'utf8');
  console.log('OK closed ' + g.file);
}

function cmdLog(file) {
  const runId = opt('--run');
  if (!runId) fail('--run is required');
  const note = String(opt('--note', '')).replace(/[\r\n|]+/g, ' ').trim();
  const g = readGoal(file);
  const safeRun = String(runId).replace(/[\r\n|]+/g, ' ').trim();
  const line = '- run ' + safeRun + ' | ' + localStamp() + (note ? ' | ' + note : '');
  const lines = g.lines.slice();
  appendUnderSection(lines, T.log, line);
  writeFileSync(g.file, lines.join(g.nl), 'utf8');
  console.log('OK logged ' + safeRun);
}

function selftest() {
  const tmp = join(tmpdir(), 'goal-selftest-' + process.pid);
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  let checks = 0;
  const must = (cond, msg) => {
    if (!cond) throw new Error(msg);
    checks++;
  };
  const run = (args, cwd) => spawnSync(process.execPath, [SELF, ...args], {
    cwd: cwd || tmp,
    encoding: 'utf8'
  });
  const goalFile = join(tmp, 'goal.md');
  const c1cmd = 'node -e "require(\'fs\').writeFileSync(\'ran.txt\',\'x\')"';
  const initial = [
    '---',
    'schema: goal/v1',
    'title: Selftest goal',
    'status: active',
    'created: 2026-01-01',
    'owner: selftest',
    'review: 2026-01-02',
    '---',
    '',
    '# ' + T.goal,
    '',
    'Selftest only.',
    '',
    '# ' + T.conditions,
    '',
    '- [x] C1: has evidence and a passing check',
    '  check: ' + c1cmd,
    '  evidence: c1.md',
    '- [ ] C2: still open',
    '- [x] C3: missing evidence',
    '  evidence: missing.md',
    '',
    '# ' + T.bounds,
    '',
    '- budget: none',
    '',
    '# ' + T.next,
    '',
    '1. Finish C2.',
    '',
    '# ' + T.log,
    ''
  ].join('\n');
  try {
    writeFileSync(goalFile, initial, 'utf8');
    writeFileSync(join(tmp, 'c1.md'), 'evidence', 'utf8');

    // status
    const st = run(['status', goalFile]);
    must(st.status === 0, 'status exit ' + st.status + ' ' + st.stderr);
    must(st.stdout.includes('Selftest goal'), 'status title');
    must(st.stdout.includes('done: 2/3'), 'status done count');
    must(st.stdout.includes('open: C2'), 'status open list');
    must(st.stdout.includes('next: 1. Finish C2.'), 'status next line');

    const stj = run(['status', goalFile, '--json']);
    must(stj.status === 0, 'status json exit');
    const sj = JSON.parse(stj.stdout);
    must(sj.total === 3 && sj.done === 2 && sj.open.length === 1, 'status json counts');
    must(sj.open[0] === 'C2', 'status json open id');

    // next
    const nx = run(['next', goalFile]);
    must(nx.status === 0, 'next exit');
    must(nx.stdout.includes('C2') && nx.stdout.includes('still open'), 'next condition');
    must(nx.stdout.includes('check: -'), 'next check placeholder');

    // check without --exec must not run the command
    const chk = run(['check', goalFile]);
    must(chk.status === 1, 'check exit on incomplete goal');
    must(chk.stdout.includes('[skip-exec] ' + c1cmd), 'check skip-exec line');
    must(!existsSync(join(tmp, 'ran.txt')), 'check must not execute without --exec');

    const chkj = run(['check', goalFile, '--json']);
    must(chkj.status === 1, 'check json exit');
    const cj = JSON.parse(chkj.stdout);
    must(cj.ok === false && cj.total === 3 && cj.done === 2 && cj.open === 1 && cj.failed === 1, 'check json counts');
    must(cj.conditions[0].status === 'pass', 'check json c1 pass');
    must(cj.conditions[1].status === 'open', 'check json c2 open');
    must(cj.conditions[2].status === 'fail', 'check json c3 fail');

    // check --exec runs the check line
    const chkx = run(['check', goalFile, '--exec']);
    must(chkx.status === 1, 'check exec exit');
    must(existsSync(join(tmp, 'ran.txt')), 'check --exec ran the command');
    must(chkx.stdout.includes('check exit 0'), 'check exec summary');

    // close must refuse while incomplete and leave the file untouched
    const beforeClose = readFileSync(goalFile, 'utf8');
    const refused = run(['close', goalFile]);
    must(refused.status === 1, 'close refuse exit');
    must(refused.stderr.includes('close refused'), 'close refuse message');
    must(readFileSync(goalFile, 'utf8') === beforeClose, 'close refuse must not write');

    // a failing check blocks close even when the box is checked
    let text = readFileSync(goalFile, 'utf8');
    text = text.replace('- [ ] C2: still open', '- [x] C2: check must pass\n  check: node -e "process.exit(1)"');
    writeFileSync(goalFile, text, 'utf8');
    const failExec = run(['check', goalFile, '--exec', '--json']);
    must(failExec.status === 1, 'failing check exit');
    const fj = JSON.parse(failExec.stdout);
    must(fj.conditions[1].status === 'fail', 'failing check condition');
    must(fj.conditions[1].exec.exit === 1, 'failing check exit code');
    const refused2 = run(['close', goalFile, '--exec']);
    must(refused2.status === 1, 'close refuse with failing check');

    // fix check and evidence, then check passes
    text = readFileSync(goalFile, 'utf8').replace('node -e "process.exit(1)"', 'node -e "process.exit(0)"');
    writeFileSync(goalFile, text, 'utf8');
    writeFileSync(join(tmp, 'missing.md'), 'now here', 'utf8');
    const okRun = run(['check', goalFile]);
    must(okRun.status === 0, 'check pass exit ' + okRun.status + ' ' + okRun.stdout);

    // log
    const lg = run(['log', goalFile, '--run', '20260101-000000-aaaa', '--note', 'first']);
    must(lg.status === 0, 'log exit');
    let after = readFileSync(goalFile, 'utf8');
    must(after.includes('- run 20260101-000000-aaaa |'), 'log line');
    must(after.includes('| first'), 'log note');

    // close writes done
    const closed = run(['close', goalFile, '--exec', '--note', 'shipped']);
    must(closed.status === 0, 'close exit ' + closed.status + ' ' + closed.stderr);
    after = readFileSync(goalFile, 'utf8');
    must(/^status: done$/m.test(after), 'close sets status done');
    must(after.includes('- closed '), 'close log line');
    must(after.includes('| shipped'), 'close note');
    const stDone = run(['status', goalFile, '--json']);
    must(JSON.parse(stDone.stdout).status === 'done', 'status reads done');
    const allDone = run(['next', goalFile]);
    must(allDone.stdout.includes(T.allDone), 'next all done message');

    // evidence escaping the goal dir must fail
    const travDir = join(tmp, 'trav');
    mkdirSync(travDir);
    writeFileSync(join(tmp, 'outside.txt'), 'outside', 'utf8');
    const travGoal = join(travDir, 'goal.md');
    writeFileSync(travGoal, [
      '---',
      'schema: goal/v1',
      'title: Traversal',
      'status: active',
      '---',
      '',
      '# ' + T.conditions,
      '',
      '- [x] C1: outside evidence',
      '  evidence: ../outside.txt'
    ].join('\n'), 'utf8');
    const trav = run(['check', travGoal, '--json']);
    must(trav.status === 1, 'traversal exit');
    const tj = JSON.parse(trav.stdout);
    must(tj.conditions[0].evidence[0].ok === false, 'traversal evidence blocked');
    must(String(tj.conditions[0].evidence[0].reason).includes('outside'), 'traversal reason');

    // close with check commands requires --exec
    const noExecGoal = join(tmp, 'noexec.md');
    writeFileSync(noExecGoal, [
      '---', 'schema: goal/v1', 'title: No exec close', 'status: active', '---', '',
      '# ' + T.conditions, '',
      '- [x] C1: checked with a check command',
      '  check: node -e "process.exit(0)"',
      '  evidence: c1.md'
    ].join('\n'), 'utf8');
    const noExecClose = run(['close', noExecGoal]);
    must(noExecClose.status === 1, 'close without exec exit');
    must(String(noExecClose.stderr).includes('check --exec'), 'close without exec message');

    // a checked condition needs evidence or a check
    const noEvGoal = join(tmp, 'noev.md');
    writeFileSync(noEvGoal, [
      '---', 'schema: goal/v1', 'title: No evidence', 'status: active', '---', '',
      '# ' + T.conditions, '',
      '- [x] C1: claimed done without proof'
    ].join('\n'), 'utf8');
    must(run(['check', noEvGoal]).status === 1, 'checked without evidence fails');
    must(run(['close', noEvGoal]).status === 1, 'close without evidence fails');

    // abandoned/blocked goals cannot be closed into done
    const abandGoal = join(tmp, 'abandoned.md');
    writeFileSync(abandGoal, [
      '---', 'schema: goal/v1', 'title: Abandoned', 'status: abandoned', '---', '',
      '# ' + T.conditions, '',
      '- [x] C1: looked done',
      '  evidence: c1.md'
    ].join('\n'), 'utf8');
    const abandClose = run(['close', abandGoal, '--exec']);
    must(abandClose.status === 1, 'abandoned close exit');
    must(String(abandClose.stderr).includes('only active can close'), 'abandoned close message');

    // --exec must not run checks on still-open conditions
    const openCheckGoal = join(tmp, 'opencheck.md');
    writeFileSync(openCheckGoal, [
      '---', 'schema: goal/v1', 'title: Open check', 'status: active', '---', '',
      '# ' + T.conditions, '',
      '- [ ] C1: not started',
      '  check: node -e "require(\'fs\').writeFileSync(\'open-ran.txt\',\'x\')"'
    ].join('\n'), 'utf8');
    const openCheck = run(['check', openCheckGoal, '--exec']);
    must(openCheck.status === 1, 'open check exit');
    must(!existsSync(join(tmp, 'open-ran.txt')), 'open check must not execute');

    // status/next must reflect failed evidence, not just checkboxes
    const statusFailGoal = join(tmp, 'statusfail.md');
    writeFileSync(statusFailGoal, [
      '---', 'schema: goal/v1', 'title: Status fail', 'status: active', '---', '',
      '# ' + T.conditions, '',
      '- [x] C1: checked but evidence missing',
      '  evidence: gone.md'
    ].join('\n'), 'utf8');
    const sf = run(['status', statusFailGoal]);
    must(sf.status === 0, 'status fail exit');
    must(sf.stdout.includes('failed: C1'), 'status failed list');
    must(sf.stdout.includes('check: NOT OK'), 'status not ok');
    must(!/next: -\s*$/.test(sf.stdout), 'status next not dash');
    const nf = run(['next', statusFailGoal]);
    must(nf.status === 0, 'next fail exit');
    must(nf.stdout.includes('status: fail'), 'next fail status');
    must(nf.stdout.includes('reason: evidence'), 'next fail reason');

    // evidence must be a file, not a directory
    const dirGoal = join(tmp, 'dir-evidence.md');
    mkdirSync(join(tmp, 'sub'));
    writeFileSync(dirGoal, [
      '---', 'schema: goal/v1', 'title: Dir evidence', 'status: active', '---', '',
      '# ' + T.conditions, '',
      '- [x] C1: directory is not evidence',
      '  evidence: sub'
    ].join('\n'), 'utf8');
    const dg = run(['check', dirGoal]);
    must(dg.status === 1, 'directory evidence exit');
    must(dg.stdout.includes('not a file'), 'directory evidence reason');

    // a checked condition with no evidence and no check explains itself
    const noProofGoal = join(tmp, 'noproof.md');
    writeFileSync(noProofGoal, [
      '---', 'schema: goal/v1', 'title: No proof', 'status: active', '---', '',
      '# ' + T.conditions, '',
      '- [x] C1: claimed'
    ].join('\n'), 'utf8');
    const np = run(['check', noProofGoal]);
    must(np.status === 1, 'no proof exit');
    must(np.stdout.includes('no evidence or check'), 'no proof reason');

    // log notes sanitize pipes
    const pipeGoal = join(tmp, 'pipe.md');
    writeFileSync(pipeGoal, [
      '---', 'schema: goal/v1', 'title: Pipe', 'status: active', '---', '',
      '# ' + T.conditions, '',
      '- [ ] C1: open'
    ].join('\n'), 'utf8');
    run(['log', pipeGoal, '--run', 'R2', '--note', 'a|b']);
    must(readFileSync(pipeGoal, 'utf8').includes('| a b'), 'log note sanitized');

    // log creates a missing section
    const noLogDir = join(tmp, 'nolog');
    mkdirSync(noLogDir);
    const noLogGoal = join(noLogDir, 'goal.md');
    writeFileSync(noLogGoal, [
      '---', 'schema: goal/v1', 'title: No log', 'status: active', '---', '',
      '# ' + T.conditions, '', '- [x] C1: done'
    ].join('\n'), 'utf8');
    const nlg = run(['log', noLogGoal, '--run', '20260101-000000-bbbb']);
    must(nlg.status === 0, 'log create section exit');
    must(readFileSync(noLogGoal, 'utf8').includes('# ' + T.log), 'log section created');

    // broken frontmatter and missing files fail loudly
    const bad = join(tmp, 'bad.md');
    writeFileSync(bad, '---\nschema: goal/v1\ntitle: Bad\n', 'utf8');
    const badRun = run(['status', bad]);
    must(badRun.status === 1, 'unterminated frontmatter exit');
    must(String(badRun.stderr).includes('ERROR'), 'unterminated frontmatter message');
    const noFm = join(tmp, 'nofm.md');
    writeFileSync(noFm, '# just markdown\n', 'utf8');
    must(run(['status', noFm]).status === 1, 'missing frontmatter exit');
    const missing = run(['status', join(tmp, 'nope.md')]);
    must(missing.status === 1, 'missing file exit');
    must(String(missing.stderr).includes('not found'), 'missing file message');
  } catch (e) {
    console.error('ERROR goal selftest: ' + e.message);
    rmSync(tmp, { recursive: true, force: true });
    process.exit(1);
  }
  rmSync(tmp, { recursive: true, force: true });
  console.log('OK goal selftest checks=' + checks);
}

if (cmd === 'status') {
  const file = argv[1];
  if (!file || file.startsWith('--')) usage(2);
  cmdStatus(file);
} else if (cmd === 'next') {
  const file = argv[1];
  if (!file || file.startsWith('--')) usage(2);
  cmdNext(file);
} else if (cmd === 'check') {
  const file = argv[1];
  if (!file || file.startsWith('--')) usage(2);
  cmdCheck(file);
} else if (cmd === 'close') {
  const file = argv[1];
  if (!file || file.startsWith('--')) usage(2);
  cmdClose(file);
} else if (cmd === 'log') {
  const file = argv[1];
  if (!file || file.startsWith('--')) usage(2);
  cmdLog(file);
} else if (cmd === 'selftest') {
  selftest();
} else {
  usage(2);
}
