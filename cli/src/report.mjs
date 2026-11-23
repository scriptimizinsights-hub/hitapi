/**
 * src/report.mjs — results as text (terminal), JSON or JUnit XML (CI test reports).
 * Values of secret variables are blanked out of everything printed or written.
 */

export function makeRedactor(values) {
  const list = [...new Set(values.filter(v => v && v.length >= 4))].sort((a, b) => b.length - a.length);
  const scrub = (s) => (s == null ? s : list.reduce((t, v) => t.split(v).join('••••••'), String(s)));
  return { scrub, deep: (o) => (list.length ? JSON.parse(scrub(JSON.stringify(o))) : o) };
}

const done = (r) => (r.results || []).filter(x => !x.running);

export function totals(reports) {
  let total = 0; let passed = 0; let ms = 0; let errors = 0;
  for (const r of reports) {
    if (r.error) { errors++; continue; }
    for (const x of done(r)) { total++; if (x.pass) passed++; ms += x.ms || 0; }
  }
  return { suites: reports.length, total, passed, failed: total - passed, errors, ms };
}

const why = (x) => {
  if (x.error) return x.error;
  const bad = (x.tests || []).filter(t => !t.pass);
  if (bad.length) return bad.map(t => `${t.name}${t.message ? ` — ${t.message}` : ''}`).join('; ');
  return `status ${x.status}`;
};

export function toJson(reports, { scrub }) {
  const t = totals(reports);
  return scrub(JSON.stringify({
    tool: 'hitapi-cli', at: new Date().toISOString(), ok: t.failed === 0 && t.errors === 0, summary: t,
    suites: reports.map(r => ({
      name: r.suite.name, file: r.suite.file, kind: r.suite.kind, error: r.error || null, iterations: r.iterations || 1, status: r.status || null,
      results: done(r).map(x => ({ name: x.name, method: x.method, url: x.response?.url || null, iteration: x.iteration, status: x.status, ms: x.ms, pass: x.pass, error: x.error || null, tests: x.tests || [], setVars: x.setVars || [] })),
    })),
  }, null, 2));
}

const xml = (s) => String(s ?? '').replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export function toJUnit(reports, { scrub }) {
  const t = totals(reports);
  const all = reports.flatMap(done);
  const nErr = all.filter(x => x.error).length + t.errors;
  const nFail = all.filter(x => !x.pass && !x.error).length;
  const out = [`<?xml version="1.0" encoding="UTF-8"?>`, `<testsuites name="hitapi" tests="${t.total + t.errors}" failures="${nFail}" errors="${nErr}" time="${(t.ms / 1000).toFixed(3)}">`];
  for (const r of reports) {
    const list = done(r);
    const failed = list.filter(x => !x.pass && !x.error).length;
    const errs = list.filter(x => x.error).length + (r.error ? 1 : 0);
    out.push(`  <testsuite name="${xml(r.suite.name)}" tests="${list.length + (r.error ? 1 : 0)}" failures="${failed}" errors="${errs}" time="${(list.reduce((n, x) => n + (x.ms || 0), 0) / 1000).toFixed(3)}" timestamp="${new Date(r.startedAt || Date.now()).toISOString()}" file="${xml(r.suite.file)}">`);
    if (r.error) out.push(`    <testcase classname="${xml(r.suite.name)}" name="(setup)"><error message="${xml(scrub(r.error))}"/></testcase>`);
    for (const x of list) {
      const name = `${x.method || ''} ${x.name}${(r.iterations || 1) > 1 ? ` [row ${x.iteration + 1}]` : ''}${x.attempt ? ` (repeat ${x.attempt + 1})` : ''}`.trim();
      out.push(`    <testcase classname="${xml(r.suite.name)}" name="${xml(name)}" time="${((x.ms || 0) / 1000).toFixed(3)}">`);
      if (x.error) out.push(`      <error message="${xml(scrub(x.error))}" type="${xml(x.kind || 'error')}"/>`);
      else if (!x.pass) {
        const lines = (x.tests || []).filter(tt => !tt.pass).map(tt => `${tt.name}: ${tt.message || ''}${tt.actual !== undefined ? ` (actual: ${typeof tt.actual === 'string' ? tt.actual : JSON.stringify(tt.actual)})` : ''}`);
        out.push(`      <failure message="${xml(scrub(why(x)))}">${xml(scrub(lines.join('\n') || `HTTP ${x.status}`))}</failure>`);
      }
      if (x.status) out.push(`      <system-out>${xml(`HTTP ${x.status} in ${x.ms} ms${x.setVars?.length ? `; set ${x.setVars.join(', ')}` : ''}`)}</system-out>`);
      out.push('    </testcase>');
    }
    out.push('  </testsuite>');
  }
  out.push('</testsuites>', '');
  return out.join('\n');
}

/** Terminal output, as steps finish. */
export function cliReporter({ write = (s) => process.stdout.write(s), color = !!process.stdout.isTTY && !process.env.NO_COLOR, scrub = (s) => s } = {}) {
  const c = (code, s) => (color ? `\x1b[${code}m${s}\x1b[0m` : s);
  const green = (s) => c(32, s); const red = (s) => c(31, s); const dim = (s) => c(2, s); const bold = (s) => c(1, s);
  return {
    suiteStart(suite, rows) {
      write(`\n${bold(suite.name)} ${dim(`(${suite.kind}${rows > 1 ? `, ${rows} data rows` : ''} · ${suite.file})`)}\n`);
      for (const n of suite.notes || []) write(dim(`  note: ${n}\n`));
    },
    step(x, pass) {
      const status = x.status ? (x.status < 400 ? green(String(x.status)) : red(String(x.status))) : '';
      write(`  ${pass ? green('✓') : red('✗')} ${x.method || ''} ${x.name}  ${status} ${dim(`${x.ms || 0} ms`)}\n`);
      if (!pass) {
        if (x.error) write(`      ${red(scrub(x.error))}\n`);
        for (const t of (x.tests || []).filter(t => !t.pass)) write(`      ${red('✗')} ${scrub(t.name)}${t.message ? dim(` — ${scrub(t.message)}`) : ''}\n`);
        if (!x.error && !(x.tests || []).length) write(dim(`      no tests: a status of 400 or more fails\n`));
      }
      for (const w of x.warnings || []) write(dim(`      ! ${scrub(w)}\n`));
    },
    suiteError(suite, err) { write(`  ${red('✗')} ${scrub(err)}\n`); },
    summary(reports) {
      const t = totals(reports);
      const ok = t.failed === 0 && t.errors === 0;
      write(`\n${ok ? green(bold('PASS')) : red(bold('FAIL'))} ${t.passed} passed, ${t.failed} failed${t.errors ? `, ${t.errors} could not run` : ''} · ${t.suites} suite${t.suites === 1 ? '' : 's'} · ${t.ms} ms\n`);
    },
  };
}
