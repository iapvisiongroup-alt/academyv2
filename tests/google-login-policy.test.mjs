import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('CSP allows the Firebase Google helper without opening script permissions broadly', async () => {
    const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
    const policy = html.match(/content="(default-src[^"]+)"/)[1];
    const directives = new Map(policy.split(';').map(part => {
        const [name, ...sources] = part.trim().split(/\s+/);
        return [name, sources];
    }));
    assert.ok(directives.get('script-src').includes('https://apis.google.com'));
    assert.ok(!directives.get('script-src').includes('*'));
    assert.ok(!directives.get('script-src').includes("'unsafe-eval'"));
    assert.deepEqual(directives.get('object-src'), ["'none'"]);
    assert.ok(directives.get('frame-src').includes('https://*.firebaseapp.com'));
});
