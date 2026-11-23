/**
 * src/main.mjs — the hitapi command.
 *
 *   hitapi run <file…> [options]     run HitAPI collections / scenarios / backups, Postman collections
 *   hitapi cloud run --project --suite   run a HitAPI cloud flow suite and wait for it
 *
 * Exit code: 0 all passed · 1 something failed · 2 wrong usage or unreadable file
 */

import { writeFileSync, readFileSync } from 'node:fs';
import { loadSuites, loadData, loadEnvFile, varsFromProcessEnv, parseVarArg, UsageError } from './load.mjs';
import { runSuite } from './run.mjs';
import { cliReporter, toJson, toJUnit, totals, makeRedactor } from './report.mjs';
import { cloudRun, DEFAULT_API } from './cloud.mjs';
import { setVar } from './shared/vars.js';

const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

export const HELP = `hitapi ${VERSION} — run HitAPI tests from the command line and in CI

Usage
  hitapi run <file…> [options]
  hitapi cloud run --project <id> --suite <id> [options]

Files (run)
  HitAPI collection   extension: collection ⋯ → Export to a file (or Publish to GitHub)
  HitAPI scenario     extension: scenario ⋯ → Export for the CLI
  HitAPI backup       extension: ☁ Backup → Export all (runs its scenarios; --collection NAME for a collection)
  Postman collection  v2.0 / v2.1

Variables ({{name}}), later ones win
  --env-file <file>   Postman environment, HitAPI backup, {"name":"value"} JSON or NAME=value lines
  --env <name>        environment to use from a HitAPI backup
  HITAPI_VAR_<name>   environment variables (CI secrets), e.g. HITAPI_VAR_token
  --var <name=value>  one variable (repeat it)

Options (run)
  --folder <name>       only this folder of a collection ("Orders" or "Shop/Orders")
  --scenario <name>     a scenario of a backup        --collection <name>  a collection of a backup
  --data <file>         CSV or JSON rows: one run per row (data-driven)
  --reporter <name>     cli (default) | json | junit — what is printed
  --junit <file>        also write a JUnit XML report (GitHub, GitLab, Jenkins, Azure…)
  --json <file>         also write a JSON report
  --bail                stop at the first failure
  --timeout <ms>        per request (default: each request's own setting, 30 s)
  --delay <ms>          wait between requests
  --export-env <file>   write the variables at the end (incl. ones set by "Set vars") as JSON

Options (cloud run)
  --project <id> --suite <id>   the HitAPI project and flow suite
  --api-key <key>       default: HITAPI_API_KEY (HitAPI → API keys)
  --api <url>           default: ${DEFAULT_API} (or HITAPI_API_URL)
  --timeout <seconds>   how long to wait (default 600)     --no-wait  start it and exit
  --junit <file> --json <file> --reporter json

Exit code: 0 passed · 1 failed · 2 usage error
Docs: https://hitapi.dev`;

const FLAGS = new Set(['bail', 'no-wait', 'help', 'version', 'h', 'v']);
const MULTI = new Set(['var']);

export function parseArgs(argv) {
  const pos = []; const o = { var: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') { pos.push(...argv.slice(i + 1)); break; }
    if (a.startsWith('-') && a.length > 1) {
      let [name, val] = a.replace(/^--?/, '').split(/=(.*)/s);
      if (FLAGS.has(name)) { o[name] = true; continue; }
      if (val === undefined) { val = argv[++i]; if (val === undefined) throw new UsageError(`--${name} needs a value`); }
      if (MULTI.has(name)) o[name].push(val); else o[name] = val;
    } else pos.push(a);
  }
  return { pos, o };
}

const KNOWN_RUN = ['var', 'env-file', 'env', 'folder', 'scenario', 'collection', 'data', 'reporter', 'junit', 'json', 'bail', 'timeout', 'delay', 'export-env'];
const KNOWN_CLOUD = ['project', 'suite', 'api-key', 'api', 'timeout', 'no-wait', 'junit', 'json', 'reporter', 'var'];

function checkKnown(o, known) {
  for (const k of Object.keys(o)) if (k !== 'var' && !known.includes(k) && !FLAGS.has(k)) throw new UsageError(`Unknown option --${k}. See hitapi --help`);
}

export async function main(argv, io = {}) {
  const out = io.stdout || ((s) => process.stdout.write(s));
  const err = io.stderr || ((s) => process.stderr.write(s));
  const env = io.env || process.env;
  try {
    const { pos, o } = parseArgs(argv);
    if (o.version || o.v) { out(`${VERSION}\n`); return 0; }
    if (o.help || o.h || !pos.length) { out(`${HELP}\n`); return pos.length || o.help || o.h ? 0 : 2; }
    if (pos[0] === 'run') { checkKnown(o, KNOWN_RUN); return await runCommand(pos.slice(1), o, { out, err, env, color: io.color }); }
    if (pos[0] === 'cloud' && pos[1] === 'run') { checkKnown(o, KNOWN_CLOUD); return await cloudCommand(o, { out, err, env }); }
    throw new UsageError(`Unknown command "${pos.join(' ')}". Use "hitapi run <file>" or "hitapi cloud run". See hitapi --help`);
  } catch (e) {
    if (e instanceof UsageError) { err(`hitapi: ${e.message}\n`); return 2; }
    err(`hitapi: ${e.message}\n`); return 2;
  }
}

async function runCommand(files, o, { out, err, env, color }) {
  if (!files.length) throw new UsageError('Which file? hitapi run <file…>');
  const reporter = o.reporter || 'cli';
  if (!['cli', 'json', 'junit'].includes(reporter)) throw new UsageError(`--reporter must be cli, json or junit`);
  const num = (name) => { if (o[name] == null) return undefined; const n = Number(o[name]); if (!Number.isFinite(n) || n < 0) throw new UsageError(`--${name} must be a number of milliseconds`); return n; };
  const timeoutMs = num('timeout'); num('delay');

  const suites = files.flatMap(f => loadSuites(f, o));
  if (!suites.some(s => s.steps.some(x => x.enabled))) throw new UsageError('Nothing to run: no requests in the file(s).');
  // variables: file (or the backup's own environment), then HITAPI_VAR_*, then --var
  let vars = { env: { name: 'CLI', vars: [] }, globals: [] };
  if (o['env-file']) { const e = loadEnvFile(o['env-file'], o.env); vars = { env: { name: e.name, vars: e.vars }, globals: e.globals || [] }; }
  else if (o.env) {
    const s = suites.find(x => x.envs);
    if (!s) throw new UsageError('--env picks an environment from a HitAPI backup: pass the backup with --env-file, or run a backup file.');
    const e = s.envs.find(x => x.name.toLowerCase() === o.env.toLowerCase());
    if (!e) throw new UsageError(`No environment "${o.env}". There is: ${s.envs.map(x => x.name).join(', ') || 'none'}`);
    vars = { env: { name: e.name, vars: e.vars }, globals: s.globals || [] };
  } else if (suites[0].globals) vars.globals = suites[0].globals;
  for (const r of [...varsFromProcessEnv(env), ...o.var.map(parseVarArg)]) vars.env.vars = setVar(vars.env.vars, r.key, r.value, { secret: r.secret });
  const rows = o.data ? loadData(o.data) : null;

  const secretValues = () => [...vars.env.vars, ...vars.globals].filter(r => r.secret).map(r => r.value);
  const red = () => makeRedactor(secretValues());
  const print = reporter === 'cli' ? cliReporter({ write: out, color: color ?? (!!process.stdout.isTTY && !env.NO_COLOR), scrub: (s) => red().scrub(s) }) : null;

  const reports = [];
  const ctrl = new AbortController();
  for (const suite of suites) {
    if (ctrl.signal.aborted) break;
    const n = rows ? rows.length : 1;
    print?.suiteStart(suite, n);
    const r = await runSuite(suite, vars, {
      rows, timeoutMs, signal: ctrl.signal,
      onStep: (x, pass) => { print?.step(x, pass); if (!pass && o.bail) ctrl.abort('bail'); },
    });
    if (r.error) print?.suiteError(suite, r.error);
    reports.push(r);
  }
  const { scrub } = red();
  if (o.junit) writeFileSync(o.junit, toJUnit(reports, { scrub }));
  if (o.json) writeFileSync(o.json, toJson(reports, { scrub }));
  if (o['export-env']) writeFileSync(o['export-env'], `${JSON.stringify(Object.fromEntries(vars.env.vars.filter(r => r.enabled !== false).map(r => [r.key, r.value])), null, 2)}\n`);
  if (reporter === 'json') out(`${toJson(reports, { scrub })}\n`);
  else if (reporter === 'junit') out(toJUnit(reports, { scrub }));
  else print.summary(reports);
  if (o.bail && ctrl.signal.aborted && reporter === 'cli') err('hitapi: stopped at the first failure (--bail)\n');
  const t = totals(reports);
  return t.failed === 0 && t.errors === 0 ? 0 : 1;
}

async function cloudCommand(o, { out, err, env }) {
  const quiet = o.reporter === 'json';
  const res = await cloudRun({
    api: o.api || env.HITAPI_API_URL || DEFAULT_API, key: o['api-key'] || env.HITAPI_API_KEY,
    project: o.project, suite: o.suite, timeoutSec: o.timeout ? Number(o.timeout) : 600, wait: !o['no-wait'],
    pollMs: Number(env.HITAPI_POLL_MS) || 2000,
    log: (s) => (quiet ? err : out)(`hitapi cloud: ${s}\n`),
  });
  if (o['no-wait']) { if (quiet) out(`${JSON.stringify(res.run)}\n`); return 0; }
  const steps = res.stepResults || [];
  const pass = (s) => s.status === 'passed' || s.status === 'pass' || s.status === 'skipped';
  const results = steps.map(s => ({ name: s.step_name || s.name || `Step ${s.step_order + 1}`, method: s.request_method || s.method || '', status: s.actual_status || 0, ms: s.response_time_ms || s.duration_ms || 0, pass: pass(s), kind: s.status, iteration: 0,
    // "failed": a check failed (JUnit failure) · anything else not passed: could not run (JUnit error)
    error: pass(s) || s.status === 'failed' ? null : (s.failure_reason || s.error_message || String(s.status)),
    tests: s.status === 'failed' ? [{ pass: false, name: s.failure_reason || `Step failed${s.actual_status ? ` (HTTP ${s.actual_status})` : ''}`, message: '' }] : [] }));
  const failedRun = res.run.status !== 'done' && res.run.status !== 'passed';
  const report = { suite: { name: res.run.suite_name || `Flow suite ${o.suite}`, file: `cloud:${o.project}/${o.suite}`, kind: 'cloud' }, startedAt: (res.run.started_at || 0) * 1000 || Date.now(), iterations: 1, results };
  const plain = { scrub: (s) => s };
  if (o.junit) writeFileSync(o.junit, toJUnit([report], plain));
  if (o.json) writeFileSync(o.json, toJson([report], plain));
  if (quiet) out(`${toJson([report], plain)}\n`);
  else {
    for (const r of results) out(`  ${r.pass ? '✓' : '✗'} ${r.method} ${r.name} ${r.status || ''}${r.error || r.tests[0] ? ` — ${r.error || r.tests[0].name}` : ''}\n`);
    out(`\n${failedRun || results.some(r => !r.pass) ? 'FAIL' : 'PASS'} ${res.run.passed ?? results.filter(r => r.pass).length} passed, ${res.run.failed ?? results.filter(r => !r.pass).length} failed (run ${res.run.id}, ${res.run.status})\n`);
  }
  return failedRun || results.some(r => !r.pass) ? 1 : 0;
}
