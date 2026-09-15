import { useState } from 'react';
import { Upload } from 'lucide-react';
import { useStore } from '../../store/index.js';


export function ImportModal({ projectId, onClose }) {
    const [url, setUrl] = useState('');
    const [loading, setLoading] = useState(false);
    const { importSwagger } = useStore();
    async function handleImport() {
        if (!url.trim()) return;
        setLoading(true);
        try { await importSwagger(projectId, { swagger_url: url }); onClose(); }
        catch (err) { alert(err.message); }
        finally { setLoading(false); }
    }
    return (
        <div className="modal-backdrop" onClick={onClose}>
            <div className="modal" onClick={e => e.stopPropagation()}>
                <div className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Upload size={18} color="var(--accent)" /> Import Swagger / OpenAPI
                </div>
                <div style={{ marginBottom: 20 }}>
                    <label style={{ fontSize: 12, color: 'var(--text-secondary)', display: 'block', marginBottom: 6 }}>Swagger URL</label>
                    <input className="input" placeholder="https://api.example.com/swagger.json" value={url}
                        onChange={e => setUrl(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleImport()} autoFocus />
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>Supports OpenAPI 3.0, 3.1, Swagger 2.0 · JSON</div>
                </div>
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleImport} disabled={loading || !url.trim()}>
                        {loading ? <><div className="spinner" style={{ width: 14, height: 14 }} /> Importing…</> : 'Import'}
                    </button>
                </div>
            </div>
        </div>
    );
}