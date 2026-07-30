import { defineConfig } from 'vite';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
    base: '/',
    plugins: [
        tailwindcss(),
        {
            name: 'kreateia-stylesheet-compatibility',
            enforce: 'post',
            transformIndexHtml: {
                order: 'post',
                handler(html) {
                    return html.replace(
                        /<link rel="stylesheet" crossorigin href="([^"]+)">/g,
                        '<link rel="stylesheet" href="$1">'
                    );
                },
            },
        },
    ],
    server: {
        proxy: {
            '/api': {
                target: 'https://api.muapi.ai',
                changeOrigin: true,
                secure: false
            }
        }
    }
});
