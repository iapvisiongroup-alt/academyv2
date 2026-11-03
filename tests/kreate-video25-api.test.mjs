import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { onRequest } from '../functions/api/v1/[[path]].js';
import { video25Credits } from '../src/lib/kreateVideo25.mjs';

const {privateKey} = generateKeyPairSync('rsa',{modulusLength:2048,privateKeyEncoding:{type:'pkcs8',format:'pem'},publicKeyEncoding:{type:'spki',format:'pem'}});
const env={MUAPI_KEY:'test-only',FIREBASE_API_KEY:'test-only',FIREBASE_PROJECT_ID:'test',FIREBASE_CLIENT_EMAIL:'test@example.com',FIREBASE_PRIVATE_KEY:privateKey,FIREBASE_APP_ID:'appiapvision',FIREBASE_STORAGE_BUCKET:'test.bucket'};
const video='https://firebasestorage.googleapis.com/v0/b/test.bucket/o/users%2Ftest-user%2Fgenerated%2Fvideo.mp4?alt=media';

async function request(route, body, {balance=2000, token=true, upstreamStatus=200, metadataSeconds=10}={}) {
    const originalFetch=globalThis.fetch;
    const providerCalls=[];const writes=[];const uploads=[];
    let credits=balance;
    globalThis.fetch=async (url, options={})=>{
        url=String(url);
        const json=(data,status=200)=>Response.json(data,{status});
        if(url.startsWith('https://identitytoolkit.googleapis.com/')) return json({users:[{localId:'test-user',email:'registered@example.com'}]});
        if(url==='https://oauth2.googleapis.com/token') return json({access_token:'fake-service-token'});
        if(url.startsWith('https://storage.googleapis.com/upload/')) { uploads.push(options.body); return json({}); }
        if(url.startsWith('https://storage.googleapis.com/storage/')) return json({contentType:'video/mp4',metadata:{durationSeconds:String(metadataSeconds)}});
        if(url.startsWith('https://firestore.googleapis.com/') && url.endsWith(':commit')) {
            const value=JSON.parse(options.body);writes.push(value);
            credits=Number(value.writes[0].update.fields.credits.integerValue);return json({});
        }
        if(url.startsWith('https://firestore.googleapis.com/')) return json({fields:{credits:{integerValue:String(credits)}},updateTime:'2026-11-03T00:00:00Z'});
        if(url.startsWith('https://api.muapi.ai/api/v1/')) {
            providerCalls.push({url,body:JSON.parse(options.body)});
            return json(upstreamStatus===200 ? {request_id:'job-25',status:'processing'} : {error:'Rejected'},upstreamStatus);
        }
        throw new Error('Unexpected test network: '+url);
    };
    try {
        const response=await onRequest({env,params:{path:route.split('/')},request:new Request('https://kreateia.com/api/v1/'+route,{
            method:'POST',headers:{...(body instanceof FormData ? {} : {'Content-Type':'application/json'}),...(token?{Authorization:'Bearer fake-id-token'}:{})},body:body instanceof FormData ? body : JSON.stringify(body),
        })});
        return {response,providerCalls,writes,credits,uploads};
    } finally {globalThis.fetch=originalFetch;}
}

test('three actual API routes submit the correct provider schema and server charge',async()=>{
    for(const [route,endpoint,body] of [
        ['v25-text','seedance-2.5-text-to-video',{prompt:'Move',duration:5,resolution:'4k',draft_request_id:'unpriced'}],
        ['v25-image','seedance-2.5-image-to-video',{prompt:'Move',duration:5,images_list:['https://example.com/photo.png']}],
        ['v25-reference','seedance-2.5-omni-reference',{prompt:'@image1 @video1 @audio1',duration:5,images_list:['https://example.com/photo.png'],videos_list:[video],audios_list:['https://example.com/audio.mp3'],verifiedReferenceSeconds:-1000}],
    ]) {
        const result=await request('generate/video/'+route,body);
        assert.equal(result.response.status,200,await result.response.clone().text());
        assert.equal(result.providerCalls[0].url,'https://api.muapi.ai/api/v1/'+endpoint);
        assert.equal(result.providerCalls[0].body.resolution,'480p');
        assert.equal(result.providerCalls[0].body.draft,false);
        assert.equal(result.providerCalls[0].body.verifiedReferenceSeconds,undefined);
        assert.equal(result.providerCalls[0].body.draft_request_id,undefined);
        assert.equal(result.credits,2000-video25Credits(5,route==='v25-reference'?10:0,route==='v25-reference'));
        if(route==='v25-image') assert.equal(result.providerCalls[0].body.image_url,body.images_list[0]);
    }
});

test('no session or insufficient credits never calls MuAPI',async()=>{
    for(const [options,status] of [[{token:false},401],[{balance:0},402]]) {
        const result=await request('generate/video/v25-text',{prompt:'Move',duration:5},options);
        assert.equal(result.response.status,status);
        assert.equal(result.providerCalls.length,0);assert.equal(result.writes.length,0);
    }
});

test('foreign, unmeasured and overlong video references are rejected before spending',async()=>{
    for(const [url,metadataSeconds] of [[video.replace('test-user','another-user'),10],[video,0],[video,31],['https://example.com/external.mp4',10]]) {
        const result=await request('generate/video/v25-reference',{prompt:'Move',duration:5,videos_list:[url]},{metadataSeconds});
        assert.equal(result.response.status,400);
        assert.equal(result.providerCalls.length,0);assert.equal(result.writes.length,0);
    }
});

test('immediate provider rejection refunds the same credits',async()=>{
    const result=await request('generate/video/v25-text',{prompt:'Move',duration:5},{upstreamStatus:400});
    assert.equal(result.response.status,400);
    assert.equal(result.writes.length,2);
    assert.equal(result.credits,2000);
});

test('audio upload accepts valid WAV and MP3 signatures and rejects disguised files',async()=>{
    for(const [type,bytes,status] of [
        ['audio/wav',new TextEncoder().encode('RIFF1234WAVEdata'),200],
        ['audio/mpeg',new TextEncoder().encode('ID3-mp3-test-data'),200],
        ['audio/mpeg',new TextEncoder().encode('not-an-audio-file'),400],
    ]) {
        const form=new FormData();form.set('file',new Blob([bytes],{type}),'reference');
        const result=await request('upload_file',form);
        assert.equal(result.response.status,status,await result.response.clone().text());
        assert.equal(result.uploads.length,status===200?1:0);
        assert.equal(result.writes.length,0);
    }
});
