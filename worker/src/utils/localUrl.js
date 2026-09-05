/**
 * worker/src/utils/localUrl.js
 * Detects URLs the Cloudflare Worker cannot reach directly.
 */
export function isLocalUrl(url) {
    try {
        const u = new URL(url);
        const host = u.hostname;
        return (
            host === 'localhost' ||
            host === '127.0.0.1' ||
            host === '0.0.0.0' ||
            host.endsWith('.local') ||
            /^10\./.test(host) ||
            /^192\.168\./.test(host) ||
            /^172\.(1[6-9]|2\d|3[01])\./.test(host)
        );
    } catch {
        return false;
    }
}