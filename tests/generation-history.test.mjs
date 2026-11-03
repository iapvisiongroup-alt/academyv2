import test from 'node:test';
import assert from 'node:assert/strict';
import { generationHistoryRecord, recentVideoHistory } from '../src/lib/generationHistory.mjs';

test('foreground and recovered videos share one deterministic history record', () => {
    const task = { id: 'queue-1', request_id: 'provider-1', type: 'video', prompt: 'Spot', settings: { duration: 10, quality: '480p', model: 'Kreate Video 2.5' } };
    const recovered = generationHistoryRecord(task, '/api/v1/media/kreateia-video');
    const foreground = generationHistoryRecord({ ...task, id: 'another-tab' }, '/api/v1/media/kreateia-video');
    assert.deepEqual(recovered, foreground);
    assert.equal(recovered.id, 'provider-1');
    assert.equal(recovered.data.duration, 10);
    assert.equal(recovered.data.quality, '480p');
    assert.equal(recovered.data.type, 'video');
    assert.equal(recovered.data.model, 'Kreate Video 2.5');
});

test('image recovery preserves its existing document identity', () => {
    assert.equal(generationHistoryRecord({ id: 'image-task', request_id: 'request-2', type: 'image' }, '/api/media/image').id, 'image-task');
});

test('history includes misplaced recovered videos and old video-only records without duplicates', () => {
    const rows = recentVideoHistory([
        { id: 'legacy', request_id: 'r1', type: 'video', url: '/old', createdAt: { seconds: 1 } },
        { id: 'image', type: 'image', url: '/image', createdAt: { seconds: 20 } },
        { id: 'recovered', request_id: 'r1', type: 'video', url: '/recovered', createdAt: { seconds: 1 } },
        { id: 'new', type: 'video', url: '/new', createdAt: { seconds: 2 } },
        { id: 'pending', type: 'video' },
    ]);
    assert.deepEqual(rows.map(row => row.id), ['new', 'recovered']);
});
