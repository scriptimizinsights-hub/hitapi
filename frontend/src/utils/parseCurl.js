/**
 * parseCurl — turn a pasted cURL command into a request object.
 *
 * Handles the formats people actually paste:
 *   - Chrome / Firefox / Edge "Copy as cURL (bash)" and "(cmd)" (Windows ^ escaping)
 *   - Postman / Insomnia / Swagger UI code snippets
 *   - Multi-line commands with "\" (bash), "^" (cmd) or "`" (PowerShell) line endings
 *
 * Returns:
 *   { method, url, headers: [{key, value}], body, bodyType: 'json'|'text'|'none',
 *     auth: null | { type: 'basic', username, password }, warnings: [string] }
 * Throws an Error with a readable message when the command can't be parsed.
 */

// ─── Tokenizer (shell-like word splitting) ──────────────────────────────────

function tokenize(input) {
    const tokens = [];
    let cur = '';
    let inToken = false;
    let i = 0;

    const push = () => { if (inToken) tokens.push(cur); cur = ''; inToken = false; };

    while (i < input.length) {
        const ch = input[i];

        // whitespace ends a token
        if (/\s/.test(ch)) { push(); i++; continue; }

        // ANSI-C quoting: $'...' (Chrome uses it when the body has special chars)
        if (ch === '$' && input[i + 1] === "'") {
            inToken = true;
            i += 2;
            while (i < input.length && input[i] !== "'") {
                if (input[i] === '\\' && i + 1 < input.length) {
                    const n = input[i + 1];
                    const map = { n: '\n', t: '\t', r: '\r', '\\': '\\', "'": "'", '"': '"', '0': '\0' };
                    if (n === 'x' && /^[0-9a-fA-F]{2}$/.test(input.substr(i + 2, 2))) {
                        cur += String.fromCharCode(parseInt(input.substr(i + 2, 2), 16)); i += 4; continue;
                    }
                    if (n === 'u' && /^[0-9a-fA-F]{4}$/.test(input.substr(i + 2, 4))) {
                        cur += String.fromCharCode(parseInt(input.substr(i + 2, 4), 16)); i += 6; continue;
                    }
                    cur += map[n] ?? n; i += 2; continue;
                }
                cur += input[i++];
            }
            i++; // closing '
            continue;
        }

        // single quotes: everything literal
        if (ch === "'") {
            inToken = true; i++;
            while (i < input.length && input[i] !== "'") cur += input[i++];
            if (i >= input.length) throw new Error('Unclosed single quote in the cURL command');
            i++; continue;
        }

        // double quotes: backslash escapes \" \\ \$ \`
        if (ch === '"') {
            inToken = true; i++;
            while (i < input.length && input[i] !== '"') {
                if (input[i] === '\\' && '"\\$`'.includes(input[i + 1])) { cur += input[i + 1]; i += 2; continue; }
                cur += input[i++];
            }
            if (i >= input.length) throw new Error('Unclosed double quote in the cURL command');
            i++; continue;
        }

        // backslash escape outside quotes
        if (ch === '\\' && i + 1 < input.length) { inToken = true; cur += input[i + 1]; i += 2; continue; }

        inToken = true;
        cur += ch; i++;
    }
    push();
    return tokens;
}

// ─── Normalise platform-specific line continuations ─────────────────────────

function normalise(raw) {
    let s = String(raw || '').trim();

    // Windows cmd "Copy as cURL (cmd)": ^ escapes every special char, ^ + newline continues
    const looksCmd = /\^\s*\r?\n/.test(s) || /\^"/.test(s);
    if (looksCmd) {
        s = s.replace(/\^\s*\r?\n/g, ' ');       // line continuations
        s = s.replace(/\^(.)/g, '$1');          // ^" -> "  ^^ -> ^  ^& -> &
        // cmd escapes inner quotes as \"" -> "
        s = s.replace(/\\""/g, '\\"');
    }

    s = s.replace(/\\\r?\n/g, ' ');            // bash: backslash + newline
    s = s.replace(/`\r?\n/g, ' ');             // PowerShell: backtick + newline
    s = s.replace(/^\$\s+/, '');               // leading "$ " prompt
    s = s.replace(/^curl\.exe\b/i, 'curl');
    return s;
}

// ─── Parser ─────────────────────────────────────────────────────────────────

// Flags that take a value we don't use — skip their argument
const SKIP_WITH_ARG = new Set([
    '-o', '--output', '-w', '--write-out', '-m', '--max-time', '--connect-timeout',
    '--retry', '--retry-delay', '--retry-max-time', '-x', '--proxy', '--proxy-user', '--cacert',
    '--cert', '--key', '--capath', '-E', '--resolve', '--limit-rate', '-c', '--cookie-jar',
    '-K', '--config', '--max-redirs', '--interface', '-r', '--range', '--unix-socket', '-T', '--upload-file'
]);

const DATA_FLAGS = new Set(['-d', '--data', '--data-raw', '--data-binary', '--data-ascii']);

export function looksLikeCurl(text) {
    return /^\s*(\$\s+)?curl(\.exe)?\s/i.test(String(text || ''));
}

export function parseCurl(raw) {
    const tokens = tokenize(normalise(raw));
    if (!tokens.length || !/^curl(\.exe)?$/i.test(tokens[0])) {
        throw new Error('That doesn\'t look like a cURL command — it should start with "curl"');
    }

    let method = null;
    let url = null;
    const headers = [];
    const dataParts = [];
    const urlencodedParts = [];
    const formParts = [];
    let auth = null;
    let forceGet = false;
    let headOnly = false;
    let jsonFlag = false;
    const warnings = [];

    const addHeader = (line) => {
        const idx = line.indexOf(':');
        if (idx <= 0) return;
        const key = line.slice(0, idx).trim();
        const value = line.slice(idx + 1).trim();
        if (key) headers.push({ key, value });
    };

    for (let i = 1; i < tokens.length; i++) {
        let tok = tokens[i];
        let val;

        // --flag=value form
        if (tok.startsWith('--') && tok.includes('=')) {
            const eq = tok.indexOf('=');
            val = tok.slice(eq + 1);
            tok = tok.slice(0, eq);
        }
        // combined short flag with value, e.g. -XPOST or -H'Accept: x'
        else if (/^-[XHdubAeFo][^-]/.test(tok) && tok.length > 2) {
            val = tok.slice(2);
            tok = tok.slice(0, 2);
        }
        const next = () => (val !== undefined ? val : tokens[++i]);

        if (tok === '-X' || tok === '--request') method = String(next() || '').toUpperCase();
        else if (tok === '-H' || tok === '--header') addHeader(next() || '');
        else if (DATA_FLAGS.has(tok)) {
            const d = next() ?? '';
            if (d.startsWith('@') && tok !== '--data-raw') warnings.push(`File upload "${d}" can't be sent from the browser; paste the file content into Body instead`);
            else dataParts.push(d);
        }
        else if (tok === '--data-urlencode') urlencodedParts.push(next() ?? '');
        else if (tok === '--json') { dataParts.push(next() ?? ''); jsonFlag = true; }
        else if (tok === '-F' || tok === '--form' || tok === '--form-string') formParts.push(next() ?? '');
        else if (tok === '-u' || tok === '--user') {
            const u = next() || '';
            const idx = u.indexOf(':');
            auth = { type: 'basic', username: idx >= 0 ? u.slice(0, idx) : u, password: idx >= 0 ? u.slice(idx + 1) : '' };
        }
        else if (tok === '-A' || tok === '--user-agent') headers.push({ key: 'User-Agent', value: next() || '' });
        else if (tok === '-e' || tok === '--referer') headers.push({ key: 'Referer', value: next() || '' });
        else if (tok === '-b' || tok === '--cookie') headers.push({ key: 'Cookie', value: next() || '' });
        else if (tok === '--oauth2-bearer') headers.push({ key: 'Authorization', value: `Bearer ${next() || ''}` });
        else if (tok === '--url') url = next();
        else if (tok === '-G' || tok === '--get') forceGet = true;
        else if (tok === '-I' || tok === '--head') headOnly = true;
        else if (SKIP_WITH_ARG.has(tok)) next();
        else if (tok.startsWith('-')) { /* -s -k -L -v --compressed --location --insecure etc: ignore */ }
        else if (!url) url = tok;
    }

    if (!url) throw new Error('No URL found in the cURL command');
    if (!/^https?:\/\//i.test(url)) url = `https://${url.replace(/^\/\//, '')}`;
    try { new URL(url); } catch { throw new Error(`Invalid URL in the cURL command: ${url}`); }

    // --data-urlencode: encode the value part (name=value or just value)
    const encoded = urlencodedParts.map(p => {
        const idx = p.indexOf('=');
        if (idx < 0) return encodeURIComponent(p);
        return `${p.slice(0, idx)}=${encodeURIComponent(p.slice(idx + 1))}`;
    });

    let body = [...dataParts, ...encoded].join('&');

    // -G moves data into the query string
    if (forceGet && body) {
        const u = new URL(url);
        for (const pair of body.split('&')) {
            if (!pair) continue;
            const idx = pair.indexOf('=');
            const k = idx >= 0 ? pair.slice(0, idx) : pair;
            const v = idx >= 0 ? pair.slice(idx + 1) : '';
            try { u.searchParams.append(decodeURIComponent(k), decodeURIComponent(v)); }
            catch { u.searchParams.append(k, v); }
        }
        url = u.toString();
        body = '';
    }

    // -F multipart: browsers/proxy can't rebuild a file upload, so send fields as urlencoded
    if (formParts.length && !body) {
        if (formParts.some(f => /=@/.test(f))) warnings.push('File fields (-F name=@file) were dropped; only text fields were imported');
        body = formParts.filter(f => !/=@/.test(f)).map(f => {
            const idx = f.indexOf('=');
            return idx < 0 ? encodeURIComponent(f) : `${encodeURIComponent(f.slice(0, idx))}=${encodeURIComponent(f.slice(idx + 1))}`;
        }).join('&');
        if (body && !headers.some(h => h.key.toLowerCase() === 'content-type')) {
            headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' });
        }
        if (formParts.length) warnings.push('Multipart form (-F) was converted to a URL-encoded form body');
    }

    if (jsonFlag) {
        if (!headers.some(h => h.key.toLowerCase() === 'content-type')) headers.push({ key: 'Content-Type', value: 'application/json' });
        if (!headers.some(h => h.key.toLowerCase() === 'accept')) headers.push({ key: 'Accept', value: 'application/json' });
    }

    // Method: explicit -X wins; else HEAD for -I; POST when there's a body; else GET
    if (!method) method = headOnly ? 'HEAD' : (body ? 'POST' : 'GET');

    // Body type
    let bodyType = 'none';
    if (body) {
        try { JSON.parse(body); bodyType = 'json'; } catch { bodyType = 'text'; }
        // data without an explicit Content-Type is sent by curl as a form
        if (bodyType === 'text' && dataParts.length && !headers.some(h => h.key.toLowerCase() === 'content-type')) {
            headers.push({ key: 'Content-Type', value: 'application/x-www-form-urlencoded' });
        }
    }

    // Headers a browser/worker will set itself — drop them so the request isn't rejected
    const DROP = new Set(['content-length', 'host', 'connection', 'accept-encoding']);
    const cleanHeaders = headers.filter(h => !DROP.has(h.key.toLowerCase()));

    return { method, url, headers: cleanHeaders, body, bodyType, auth, warnings };
}