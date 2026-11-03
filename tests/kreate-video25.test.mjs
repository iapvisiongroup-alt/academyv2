import test from 'node:test';
import assert from 'node:assert/strict';
import { video25Credits, normalizeVideo25, VIDEO25_ROUTES, mp4Duration, VIDEO25_USD_EUR, VIDEO25_EUR_PER_CREDIT } from '../src/lib/kreateVideo25.mjs';

test('480p billing covers twice provider cost even at the cheapest credit package', () => {
    const cases = [[5,0,false,0.85], [30,0,false,5.1], [10,10,true,2.21], [5,3.5,true,0.93925]];
    for (const [duration, seconds, hasVideo, usd] of cases) {
        const revenue = video25Credits(duration, seconds, hasVideo) * VIDEO25_EUR_PER_CREDIT;
        assert.ok(revenue >= usd * VIDEO25_USD_EUR * 2);
        assert.ok(revenue < usd * VIDEO25_USD_EUR * 2 + VIDEO25_EUR_PER_CREDIT);
    }
    for (const seconds of [-1, 0, 4, 31, NaN, Infinity, 5.5]) assert.throws(() => video25Credits(seconds));
    assert.throws(() => video25Credits(10, 0, true));
});

test('higher resolution, draft finalization and unpriced fields cannot pass normalization', () => {
    const result = normalizeVideo25(VIDEO25_ROUTES.text, {
        prompt: 'A product on a table', duration: 10, resolution: '4k', high_bitrate: true,
        draft: true, draft_request_id: 'bypass', verifiedReferenceSeconds: -100,
    });
    assert.deepEqual(result, { prompt: 'A product on a table', duration: 10, resolution: '480p', high_bitrate: false, draft: false, aspect_ratio: '16:9' });
});

test('image-to-video uses image_url and omni accepts each media type', () => {
    assert.equal(normalizeVideo25(VIDEO25_ROUTES.image, {prompt:'Move',images_list:['https://example.com/1.png']}).image_url,'https://example.com/1.png');
    const body = { prompt:'@image1 @video1 @audio1', duration:30,
        images_list:['https://example.com/1.png'],videos_list:['https://example.com/1.mp4'],audios_list:['https://example.com/1.mp3'] };
    const result = normalizeVideo25(VIDEO25_ROUTES.reference, body);
    assert.equal(result.omni_reference_task_type, 'reference');
    assert.deepEqual(result.videos_list, body.videos_list);
    assert.deepEqual(result.audios_list, body.audios_list);
    assert.throws(() => normalizeVideo25(VIDEO25_ROUTES.reference,{prompt:'Empty'}));
    assert.throws(() => normalizeVideo25(VIDEO25_ROUTES.reference,{...body,images_list:Array(31).fill('https://x.com/a')}));
});

function movie(version, timescale, duration) {
    const header = new Uint8Array(version ? 32 : 20);
    header[0]=version;
    const view=new DataView(header.buffer);
    view.setUint32(version ? 20 : 12,timescale);
    if(version) view.setBigUint64(24,BigInt(duration)); else view.setUint32(16,duration);
    const atom=(type,data)=>{
        const bytes=new Uint8Array(data.length+8);new DataView(bytes.buffer).setUint32(0,bytes.length);
        bytes.set(new TextEncoder().encode(type),4);bytes.set(data,8);return bytes;
    };
    return atom('moov',atom('mvhd',header));
}

test('server measures MP4 header duration, including version 1 and corrupt files', () => {
    assert.equal(mp4Duration(movie(0,1000,3500)),3.5);
    assert.equal(mp4Duration(movie(1,48000,480000)),10);
    assert.equal(mp4Duration(movie(0,0,3500)),null);
    assert.equal(mp4Duration(new Uint8Array(0)),null);
    const corrupt=movie(0,1000,3500);new DataView(corrupt.buffer).setUint32(0,99999);
    assert.equal(mp4Duration(corrupt),null);
});
