import { auth } from './firebase.js';

function isSameOriginUrl(value) {
    try {
        return new URL(value, window.location.origin).origin === window.location.origin;
    } catch {
        return false;
    }
}

export async function openMediaPrivately(url) {
    if (!url) throw new Error('No se encontró el archivo.');

    const popup = window.open('', '_blank', 'noopener,noreferrer');

    try {
        let response;

        if (isSameOriginUrl(url)) {
            response = await fetch(url);
        } else {
            const user = auth.currentUser;
            if (!user) throw new Error('Debes iniciar sesión.');

            const token = await user.getIdToken();
            response = await fetch('/api/v1/media/open', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ url }),
            });
        }

        if (!response.ok) {
            const data = await response.json().catch(() => ({}));
            throw new Error(data.error || 'No se pudo abrir el archivo.');
        }

        const blobUrl = URL.createObjectURL(await response.blob());

        if (popup) {
            popup.location.replace(blobUrl);
        } else {
            const anchor = document.createElement('a');
            anchor.href = blobUrl;
            anchor.target = '_blank';
            anchor.rel = 'noopener noreferrer';
            anchor.click();
        }

        setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (error) {
        if (popup) popup.close();
        throw error;
    }
}
