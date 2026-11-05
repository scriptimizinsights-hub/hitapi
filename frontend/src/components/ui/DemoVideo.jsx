import { useRef, useState } from 'react';

export const DEMO_VIDEO = {
    src: '/media/hitapi-demo.mp4',
    poster: '/media/hitapi-demo-poster.jpg',
    title: 'HitAPI product demo',
    duration: '1:11',
};

/**
 * HitAPI product demo video. Loads nothing until the visitor presses play
 * (only the cover image), so pages stay fast.
 */
export function DemoVideo({ maxWidth = 1000 }) {
    const ref = useRef(null);
    const [started, setStarted] = useState(false);

    function play() {
        setStarted(true);
        const v = ref.current;
        if (v) { v.controls = true; v.play().catch(() => { }); }
    }

    return (
        <div style={{
            position: 'relative', maxWidth, margin: '0 auto', aspectRatio: '16 / 9',
            borderRadius: 16, overflow: 'hidden', background: '#0a0a0f',
            border: '1px solid var(--border)',
            boxShadow: '0 30px 80px rgba(0,0,0,0.5), 0 0 60px rgba(130,100,255,0.12)',
        }}>
            <video
                ref={ref}
                poster={DEMO_VIDEO.poster}
                preload="none"
                playsInline
                controls={started}
                onPlay={() => setStarted(true)}
                aria-label={DEMO_VIDEO.title}
                style={{ width: '100%', height: '100%', display: 'block', objectFit: 'cover' }}
            >
                <source src={DEMO_VIDEO.src} type="video/mp4" />
                Your browser can't play this video. <a href={DEMO_VIDEO.src}>Download the HitAPI demo</a>.
            </video>

            {!started && (
                <button
                    onClick={play}
                    aria-label={`Play ${DEMO_VIDEO.title} (${DEMO_VIDEO.duration})`}
                    style={{
                        position: 'absolute', inset: 0, width: '100%', height: '100%',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: 'linear-gradient(180deg, rgba(10,10,15,0.05) 0%, rgba(10,10,15,0.35) 100%)',
                        border: 'none', cursor: 'pointer', padding: 0,
                    }}
                >
                    <span style={{
                        display: 'flex', alignItems: 'center', gap: 12,
                        padding: '14px 26px 14px 18px', borderRadius: 999,
                        background: 'var(--accent)', color: '#fff', fontSize: 16, fontWeight: 600,
                        boxShadow: '0 10px 40px rgba(130,100,255,0.55)',
                    }}>
                        <span style={{
                            width: 38, height: 38, borderRadius: '50%', background: 'rgba(255,255,255,0.18)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}>
                            <svg width="16" height="16" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 2.5v11l9.5-5.5z" fill="#fff" /></svg>
                        </span>
                        Watch the demo · {DEMO_VIDEO.duration}
                    </span>
                </button>
            )}
        </div>
    );
}
