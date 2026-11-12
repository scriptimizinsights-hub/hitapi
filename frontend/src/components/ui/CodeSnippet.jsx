import { useMemo, useState } from 'react';
import { Copy, Check } from 'lucide-react';
import { LANGUAGES, toSnippet } from '../../utils/codegen.js';

const STORAGE_KEY = 'hitapi:codeLang';

function savedLang() {
    try { return localStorage.getItem(STORAGE_KEY) || 'curl'; } catch { return 'curl'; }
}

/**
 * Code for one request in cURL, Python, Go or Node.js, with a copy button.
 * The chosen language is remembered for next time.
 *
 * @param {{ request: { method, url, headers, body } }} props
 */
export function CodeSnippet({ request }) {
    const [lang, setLang] = useState(savedLang);
    const [copied, setCopied] = useState(false);

    const code = useMemo(() => {
        try { return toSnippet(lang, request); } catch (e) { return `// ${e.message}`; }
    }, [lang, request]);

    function choose(id) {
        setLang(id);
        try { localStorage.setItem(STORAGE_KEY, id); } catch { /* storage blocked */ }
    }

    async function copy() {
        try { await navigator.clipboard.writeText(code); } catch { /* clipboard blocked */ }
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    }

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }} role="tablist" aria-label="Language">
                {LANGUAGES.map(l => (
                    <button
                        key={l.id}
                        role="tab"
                        aria-selected={lang === l.id}
                        onClick={() => choose(l.id)}
                        className={`btn btn-sm ${lang === l.id ? 'btn-primary' : 'btn-ghost'}`}
                        style={{ padding: '4px 10px' }}
                    >
                        {l.label}
                    </button>
                ))}
                <button className="btn btn-ghost btn-sm" onClick={copy} style={{ marginLeft: 'auto' }} aria-label="Copy code">
                    {copied ? <Check size={12} /> : <Copy size={12} />} {copied ? 'Copied' : 'Copy'}
                </button>
            </div>
            <pre className="code-block" style={{ whiteSpace: 'pre', overflowX: 'auto', margin: 0, maxHeight: 420 }}>{code}</pre>
        </div>
    );
}
