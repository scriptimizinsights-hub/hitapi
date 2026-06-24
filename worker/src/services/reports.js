/**
 * Report Generator — stores HTML/JSON/CSV reports in Cloudflare R2
 */

/**
 * Generate HTML report
 */
function generateHTML(execution, results, bugs, project) {
  const passRate = execution.total
    ? Math.round((execution.passed / execution.total) * 100)
    : 0;

  const statusColor = passRate >= 90 ? '#1D9E75' : passRate >= 70 ? '#EF9F27' : '#E24B4A';

  const resultRows = results.map(r => `
    <tr class="${r.status}">
      <td><span class="method ${r.method?.toLowerCase()}">${r.method || ''}</span></td>
      <td>${r.path || ''}</td>
      <td>${r.test_name || ''}</td>
      <td><span class="type-badge ${r.test_type}">${r.test_type || ''}</span></td>
      <td><span class="status-badge ${r.status}">${r.status}</span></td>
      <td>${r.actual_status || '-'}</td>
      <td>${r.response_time_ms ? r.response_time_ms + 'ms' : '-'}</td>
      <td class="reason">${r.failure_reason || ''}</td>
    </tr>
  `).join('');

  const bugRows = bugs.map(b => `
    <div class="bug-item ${b.severity}">
      <div class="bug-header">
        <span class="sev-badge ${b.severity}">${b.severity.toUpperCase()}</span>
        <strong>${b.title}</strong>
        <span class="endpoint-tag">${b.method} ${b.path}</span>
      </div>
      <p>${b.description}</p>
      ${b.root_cause ? `<p><strong>Root cause:</strong> ${b.root_cause}</p>` : ''}
      ${b.suggested_fix ? `<p><strong>Fix:</strong> ${b.suggested_fix}</p>` : ''}
    </div>
  `).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>APIForge Report — ${project.name}</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f8f9fa; color: #1a1a1a; }
  .header { background: #0f0f0f; color: #fff; padding: 32px 40px; }
  .logo { font-size: 13px; color: #888; margin-bottom: 8px; letter-spacing: 0.08em; text-transform: uppercase; }
  h1 { font-size: 28px; font-weight: 600; margin-bottom: 4px; }
  .meta { font-size: 13px; color: #888; }
  .container { max-width: 1100px; margin: 0 auto; padding: 32px 40px; }
  .metrics { display: grid; grid-template-columns: repeat(5, 1fr); gap: 16px; margin-bottom: 32px; }
  .metric { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 20px; text-align: center; }
  .metric-label { font-size: 12px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px; }
  .metric-val { font-size: 32px; font-weight: 700; }
  .pass-rate { color: ${statusColor}; }
  .section { background: #fff; border: 1px solid #e5e7eb; border-radius: 10px; padding: 24px; margin-bottom: 24px; }
  .section h2 { font-size: 16px; font-weight: 600; margin-bottom: 16px; display: flex; align-items: center; gap: 8px; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th { background: #f9fafb; padding: 10px 12px; text-align: left; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; border-bottom: 1px solid #e5e7eb; }
  td { padding: 10px 12px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  tr:last-child td { border-bottom: none; }
  .method { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
  .get { background: #dcfce7; color: #166534; }
  .post { background: #dbeafe; color: #1e40af; }
  .put { background: #fef3c7; color: #92400e; }
  .delete { background: #fee2e2; color: #991b1b; }
  .patch { background: #fce7f3; color: #9d174d; }
  .status-badge { font-size: 11px; font-weight: 600; padding: 2px 8px; border-radius: 10px; }
  .passed { background: #dcfce7; color: #166534; }
  .failed { background: #fee2e2; color: #991b1b; }
  .skipped { background: #f3f4f6; color: #6b7280; }
  .error { background: #fce7f3; color: #9d174d; }
  .type-badge { font-size: 10px; padding: 1px 6px; border-radius: 3px; background: #f3f4f6; color: #374151; }
  .reason { color: #ef4444; font-size: 12px; max-width: 200px; }
  .bug-item { border-left: 3px solid #e5e7eb; padding: 14px 16px; margin-bottom: 12px; border-radius: 0 8px 8px 0; background: #fafafa; }
  .bug-item.critical { border-left-color: #dc2626; }
  .bug-item.high { border-left-color: #f97316; }
  .bug-item.medium { border-left-color: #eab308; }
  .bug-item.low { border-left-color: #22c55e; }
  .bug-header { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; }
  .sev-badge { font-size: 10px; font-weight: 700; padding: 2px 8px; border-radius: 10px; }
  .critical.sev-badge { background: #fee2e2; color: #991b1b; }
  .high.sev-badge { background: #ffedd5; color: #9a3412; }
  .medium.sev-badge { background: #fef3c7; color: #92400e; }
  .low.sev-badge { background: #dcfce7; color: #166534; }
  .endpoint-tag { font-size: 11px; background: #f3f4f6; padding: 2px 8px; border-radius: 4px; font-family: monospace; color: #374151; }
  .bug-item p { font-size: 13px; color: #4b5563; margin-top: 4px; line-height: 1.5; }
  .footer { text-align: center; color: #9ca3af; font-size: 12px; padding: 24px; }
</style>
</head>
<body>
<div class="header">
  <div class="logo">⚡ APIForge — AI-Powered API Testing</div>
  <h1>${project.name} — Test Report</h1>
  <div class="meta">Environment: ${project.environment} &nbsp;·&nbsp; Generated: ${new Date().toISOString().split('T')[0]} &nbsp;·&nbsp; Triggered: ${execution.triggered}</div>
</div>
<div class="container">
  <div class="metrics">
    <div class="metric"><div class="metric-label">Total tests</div><div class="metric-val">${execution.total}</div></div>
    <div class="metric"><div class="metric-label">Passed</div><div class="metric-val" style="color:#1D9E75">${execution.passed}</div></div>
    <div class="metric"><div class="metric-label">Failed</div><div class="metric-val" style="color:#E24B4A">${execution.failed}</div></div>
    <div class="metric"><div class="metric-label">Skipped</div><div class="metric-val" style="color:#888">${execution.skipped}</div></div>
    <div class="metric"><div class="metric-label">Pass rate</div><div class="metric-val pass-rate">${passRate}%</div></div>
  </div>

  ${bugs.length ? `
  <div class="section">
    <h2>🐛 AI-Detected Bugs (${bugs.length})</h2>
    ${bugRows}
  </div>` : ''}

  <div class="section">
    <h2>📋 Test Results</h2>
    <table>
      <thead>
        <tr>
          <th>Method</th><th>Path</th><th>Test</th><th>Type</th><th>Status</th><th>HTTP</th><th>Time</th><th>Reason</th>
        </tr>
      </thead>
      <tbody>${resultRows}</tbody>
    </table>
  </div>
</div>
<div class="footer">Generated by APIForge · Powered by Cloudflare Workers AI</div>
</body>
</html>`;
}

/**
 * Generate CSV report
 */
function generateCSV(results) {
  const headers = ['Method', 'Path', 'Test Name', 'Type', 'Status', 'HTTP Status', 'Response Time (ms)', 'Failure Reason'];
  const rows = results.map(r => [
    r.method || '', r.path || '', r.test_name || '', r.test_type || '',
    r.status, r.actual_status || '', r.response_time_ms || '', r.failure_reason || ''
  ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(','));
  return [headers.join(','), ...rows].join('\n');
}

/**
 * Store report in R2 and return metadata
 */
export async function storeReport(r2, { execution, results, bugs, project, format = 'html' }) {
  let content, contentType, ext;

  switch (format) {
    case 'json':
      content = JSON.stringify({ execution, results, bugs, project, generated_at: new Date().toISOString() }, null, 2);
      contentType = 'application/json';
      ext = 'json';
      break;
    case 'csv':
      content = generateCSV(results);
      contentType = 'text/csv';
      ext = 'csv';
      break;
    default:
      content = generateHTML(execution, results, bugs, project);
      contentType = 'text/html';
      ext = 'html';
  }

  const key = `reports/${project.id}/${execution.id}/${Date.now()}.${ext}`;
  const bytes = new TextEncoder().encode(content);

  await r2.put(key, bytes, {
    httpMetadata: { contentType },
    customMetadata: {
      project_id: project.id,
      execution_id: execution.id,
      format
    }
  });

  return { key, size_bytes: bytes.length, format };
}

/**
 * Get a signed URL for a report (or serve directly)
 */
export async function getReport(r2, key) {
  const obj = await r2.get(key);
  if (!obj) return null;
  return {
    body: obj.body,
    contentType: obj.httpMetadata?.contentType || 'text/html',
    size: obj.size
  };
}
