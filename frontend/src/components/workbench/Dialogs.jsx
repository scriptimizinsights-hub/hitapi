import { useEffect, useRef, useState } from 'react';
import { X, Copy } from 'lucide-react';
import { LANGUAGES, generate } from '@hitapi/shared/convert/codegen.js';

export function Dialog({ title, onClose, children, wide, footer }) {
  const ref = useRef(null);
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    document.addEventListener('keydown', onKey, true);
    ref.current?.querySelector('textarea, input, select, button')?.focus();
    return () => document.removeEventListener('keydown', onKey, true);
  }, [onClose]);
  return (
    <div className="modal-backdrop wbw-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div ref={ref} className={`wbw-dialog${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="wbw-dialog-head"><strong>{title}</strong><button type="button" className="btn btn-ghost btn-icon" aria-label="Close" onClick={onClose}><X size={14} /></button></div>
        <div className="wbw-dialog-body">{children}</div>
        {footer && <div className="wbw-dialog-foot">{footer}</div>}
      </div>
    </div>
  );
}

const LANG_KEY = 'hitapi:web:codeLang';

export function CodeDialog({ request, onClose, onNotify }) {
  const [lang, setLang] = useState(() => { try { return localStorage.getItem(LANG_KEY) || 'curl'; } catch { return 'curl'; } });
  const code = (() => { try { return generate(lang, request); } catch (e) { return `// ${e.message}`; } })();
  return (
    <Dialog title="Code" wide onClose={onClose} footer={<>
      <span className="text-xs text-tertiary">Secrets are included: be careful where you paste this.</span>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-primary btn-sm" onClick={() => navigator.clipboard?.writeText(code).then(() => onNotify?.('Code copied'))}><Copy size={12} /> Copy</button>
    </>}>
      <div className="wbw-seg" role="radiogroup" aria-label="Language">
        {LANGUAGES.map(l => <button key={l.id} type="button" role="radio" aria-checked={lang === l.id} className={`wbw-seg-btn${lang === l.id ? ' on' : ''}`} onClick={() => { setLang(l.id); try { localStorage.setItem(LANG_KEY, l.id); } catch { /* ignore */ } }}>{l.label}</button>)}
      </div>
      <pre className="wbw-pre wbw-codeout" aria-label="Generated code">{code}</pre>
    </Dialog>
  );
}

export function CurlDialog({ onImport, onClose }) {
  const [text, setText] = useState('');
  const [error, setError] = useState('');
  const go = () => { const e = onImport(text); if (e) setError(e); };
  return (
    <Dialog title="Import from cURL" onClose={onClose} footer={<>
      <span className="text-xs text-tertiary">Works with "Copy as cURL" from Chrome / Firefox DevTools (bash or cmd), Postman, Insomnia and Swagger.</span>
      <span className="wbw-grow" />
      <button type="button" className="btn btn-primary btn-sm" disabled={!text.trim()} onClick={go}>Import</button>
    </>}>
      <textarea className="input font-mono wbw-curl" aria-label="cURL command" value={text} autoFocus
        placeholder={"curl 'https://api.example.com/v1/users' \\\n  -H 'Authorization: Bearer <token>' \\\n  --data-raw '{\"name\":\"Asha\"}'"}
        onChange={(e) => { setText(e.target.value); setError(''); }}
        onKeyDown={(e) => { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); e.stopPropagation(); go(); } }} />
      {error && <div className="wbw-err" role="alert">{error}</div>}
    </Dialog>
  );
}
