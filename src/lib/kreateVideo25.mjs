// MuAPI Seedance 2.5 standard, 480p. Prices verified 2026-11-03.
export const VIDEO25_ROUTES = {
    text: 'generate/video/v25-text',
    image: 'generate/video/v25-image',
    reference: 'generate/video/v25-reference',
};
// ECB reference via Frankfurter, 2026-11-02 (latest available on 2026-11-03).
// Use the cheapest credit package so bulk buyers still pay >= 2x provider cost,
// before payment fees and tax. Reprice when FX or package prices change.
export const VIDEO25_USD_EUR = 0.89158;
export const VIDEO25_EUR_PER_CREDIT = 69.99 / 10000;

export function video25Credits(duration, referenceSeconds = 0, hasVideo = false) {
    if (!Number.isInteger(duration) || duration < 5 || duration > 30) {
        throw new Error('Selecciona una duración de 5 a 30 segundos.');
    }
    if (!Number.isFinite(referenceSeconds) || referenceSeconds < 0 || (hasVideo && referenceSeconds <= 0)) {
        throw new Error('No se pudo verificar la duración de las referencias.');
    }
    const usd = hasVideo ? 0.17 * 0.65 * (duration + referenceSeconds) : 0.17 * duration;
    return Math.ceil(usd * VIDEO25_USD_EUR * 2 / VIDEO25_EUR_PER_CREDIT - 1e-9);
}

export function normalizeVideo25(route, body) {
    if (!Object.values(VIDEO25_ROUTES).includes(route)) return null;
    const duration = Number(body.duration ?? 5);
    video25Credits(duration);
    const prompt = String(body.prompt || '').trim();
    if (!prompt || prompt.length > 10000) throw new Error('Escribe un prompt de hasta 10.000 caracteres.');
    const list = (key, max) => {
        const value = body[key] ?? [];
        if (!Array.isArray(value) || value.length > max) throw new Error('Demasiadas referencias.');
        return value.map(url => {
            if (typeof url !== 'string' || !url.startsWith('https://')) throw new Error('Referencia no válida.');
            return url;
        });
    };
    const result = { prompt, duration, resolution: '480p', high_bitrate: false, draft: false };
    const ratios = ['16:9', '9:16', '1:1', '4:3', '3:4', '21:9', '9:21'];
    const ratio = body.aspect_ratio || '16:9';
    if (!ratios.includes(ratio)) throw new Error('Formato de vídeo no válido.');
    if (route === VIDEO25_ROUTES.image) {
        const images = list('images_list', 1);
        result.image_url = body.image_url || images[0];
        if (typeof result.image_url !== 'string' || !result.image_url.startsWith('https://')) throw new Error('Añade una imagen.');
    } else {
        result.aspect_ratio = ratio;
        if (route === VIDEO25_ROUTES.reference) {
            result.images_list = list('images_list', 30);
            result.videos_list = list('videos_list', 10);
            result.audios_list = list('audios_list', 10);
            if (!result.images_list.length && !result.videos_list.length && !result.audios_list.length) throw new Error('Añade una referencia.');
            result.omni_reference_task_type = 'reference';
        }
    }
    return result;
}

// Read the MP4/MOV movie header; the browser's claimed duration is never trusted.
export function mp4Duration(bytes) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const ascii = (p) => String.fromCharCode(...bytes.subarray(p, p + 4));
    function scan(start, end) {
        let longest = 0;
        for (let p = start; p + 8 <= end;) {
            let size = view.getUint32(p); let header = 8;
            const type = ascii(p + 4);
            if (size === 1) {
                if (p + 16 > end) return null;
                size = Number(view.getBigUint64(p + 8)); header = 16;
            }
            if (size === 0) size = end - p;
            if (!Number.isSafeInteger(size) || size < header || p + size > end) return null;
            if (['moov', 'trak', 'mdia'].includes(type)) {
                const found = scan(p + header, p + size);
                if (found) longest = Math.max(longest, found);
            }
            if (type === 'mvhd' || type === 'mdhd') {
                const b = p + header;
                const version = bytes[b];
                if (version > 1 || b + (version === 1 ? 32 : 20) > p + size) return null;
                const timescale = view.getUint32(b + (version === 1 ? 20 : 12));
                const duration = version === 1 ? Number(view.getBigUint64(b + 24)) : view.getUint32(b + 16);
                const seconds = duration / timescale;
                if (!Number.isFinite(seconds) || seconds <= 0 || seconds >= 86400) return null;
                longest = Math.max(longest, seconds);
            }
            p += size;
        }
        return longest || null;
    }
    return scan(0, bytes.byteLength);
}
