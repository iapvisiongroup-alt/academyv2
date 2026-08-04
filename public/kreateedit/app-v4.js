import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js';
import { getAuth, GoogleAuthProvider, onAuthStateChanged, signInWithPopup, signOut, setPersistence, browserLocalPersistence } from 'https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDVD2Sbu7nVbFfVkgujMcgOC_S0oDla-zQ',
  authDomain: 'appacademy-fc66d.firebaseapp.com',
  projectId: 'appacademy-fc66d',
  appId: '1:179709280377:web:debe06ba04244955a454a8',
};
const auth = getAuth(initializeApp(firebaseConfig));
const authPersistenceReady = setPersistence(auth, browserLocalPersistence).catch(() => null);
const googleProvider = new GoogleAuthProvider();
const $ = id => document.getElementById(id);
const API_BASE = '/api/kreateedit';
const state = {
  assets: [], clips: [], audioTracks: [], selectedId: null, currentClipIndex: 0,
  playhead: 0, playing: false, ratio: '16:9', pixelsPerSecond: 75,
  playbackClipId: '', playbackStartedAt: 0, playbackStartTime: 0, playbackRaf: 0,
  playbackAudioElements: new Map(),
  history: [], future: [], previewMuted: false, exporting: false, user: null, cloudReady: false,
  bridgeToken: '', bridgeUser: null,
  projects: [], projectId: '', projectKind: 'video', projectCreatedAt: '', importProjectResolver: null,
  videoTracks: [{id:'track-1',name:'Vídeo 1'}], activeVideoTrackId: 'track-1', newProjectKind: 'video',
  audioBufferPromises: new Map(), waveformContext: null,
};

const els = {
  fileInput:$('file-input'), mediaList:$('media-list'), dropZone:$('drop-zone'), video:$('preview-video'),
  image:$('preview-image'), empty:$('empty-preview'), videoTracks:$('video-tracks'), audioClips:$('audio-clips'),
  playhead:$('playhead'), timeRuler:$('time-ruler'), clipProperties:$('clip-properties'), noSelection:$('no-selection'),
  canvasWrap:$('canvas-wrap'), playBtn:$('play-btn'), currentTime:$('current-time'), totalTime:$('total-time'),
};

function uid(prefix='id'){return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2,7)}`}
function clamp(v,min,max){return Math.min(max,Math.max(min,Number(v)||0))}
function fmt(seconds){const s=Math.max(0,Number(seconds)||0);const m=Math.floor(s/60);return `${String(m).padStart(2,'0')}:${String(Math.floor(s%60)).padStart(2,'0')}.${Math.floor((s%1)*10)}`}
function durationOf(clip){return Math.max(.1,(clip.end||0)-(clip.start||0))}
function volumeOf(clip){const value=Number(clip.volume);return Number.isFinite(value)?clamp(value,0,1):1}
function fadeInOf(clip){return clamp(clip.fadeIn||0,0,durationOf(clip))}
function fadeOutOf(clip){return clamp(clip.fadeOut||0,0,durationOf(clip))}
function clipGainAtTime(clip,time){const elapsed=clamp(time-timelineStartOf(clip),0,durationOf(clip)),remaining=Math.max(0,durationOf(clip)-elapsed),fadeIn=fadeInOf(clip),fadeOut=fadeOutOf(clip);return Math.min(1,fadeIn?elapsed/fadeIn:1,fadeOut?remaining/fadeOut:1)}
function timelineStartOf(clip){return Math.max(0,Number(clip.timelineStart)||0)}
function clipsForTrack(trackId){return state.clips.filter(c=>(c.trackId||'track-1')===trackId)}
function visibleClipAtTime(time){for(const track of state.videoTracks){const clip=clipsForTrack(track.id).filter(item=>time>=timelineStartOf(item)&&time<timelineStartOf(item)+durationOf(item)).sort((a,b)=>timelineStartOf(b)-timelineStartOf(a))[0];if(clip)return clip}return null}
function totalDuration(){return Math.max(0,...[...state.clips,...state.audioTracks].map(c=>timelineStartOf(c)+durationOf(c)))}
function normalizeClipPositions(clips){const cursors={};return (clips||[]).map(raw=>{const trackId=raw.trackId||'track-1',hasPosition=Number.isFinite(Number(raw.timelineStart)),timelineStart=hasPosition?Math.max(0,Number(raw.timelineStart)):(cursors[trackId]||0),clip={...raw,trackId,timelineStart};cursors[trackId]=Math.max(cursors[trackId]||0,timelineStart+durationOf(clip));return clip})}
function assetFor(id){return state.assets.find(a=>a.id===id)}
function selectedClip(){return state.clips.find(c=>c.id===state.selectedId)||state.audioTracks.find(c=>c.id===state.selectedId)||null}
function escapeHtml(v){return String(v||'').replace(/[&<>"']/g,m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]))}
function toast(message){$('toast').textContent=message;$('toast').classList.remove('hidden');clearTimeout(toast.t);toast.t=setTimeout(()=>$('toast').classList.add('hidden'),2400)}
function refreshIcons(){window.lucide?.createIcons({attrs:{'stroke-width':2}})}

async function decodeAssetAudio(asset,context){
  if(!asset?.url)throw new Error('Archivo de audio no disponible.');
  const key=asset.id||asset.url;
  if(!state.audioBufferPromises.has(key)){
    state.audioBufferPromises.set(key,(async()=>{
      const response=await fetch(asset.url);
      if(!response.ok)throw new Error('No se pudo leer el audio.');
      const bytes=await response.arrayBuffer();
      const decoder=context||state.waveformContext||(state.waveformContext=new AudioContext());
      return decoder.decodeAudioData(bytes.slice(0));
    })().catch(error=>{state.audioBufferPromises.delete(key);throw error}));
  }
  return state.audioBufferPromises.get(key);
}

async function renderWaveform(canvas){
  const clip=state.audioTracks.find(item=>item.id===canvas.dataset.waveform),asset=clip&&assetFor(clip.assetId);
  if(!clip||!asset||!canvas.isConnected)return;
  try{
    const buffer=await decodeAssetAudio(asset),channel=buffer.getChannelData(0),ratio=window.devicePixelRatio||1;
    const width=Math.max(1,Math.round(canvas.clientWidth*ratio)),height=Math.max(1,Math.round(canvas.clientHeight*ratio));
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d'),bars=Math.max(12,Math.floor(width/5)),startSample=Math.floor(clamp(clip.start,0,buffer.duration)*buffer.sampleRate),endSample=Math.min(channel.length,Math.ceil(clamp(clip.end,clip.start,buffer.duration)*buffer.sampleRate)),span=Math.max(1,endSample-startSample);
    ctx.clearRect(0,0,width,height);ctx.fillStyle=clip.muted?'rgba(148,163,184,.5)':'rgba(74,222,128,.9)';
    for(let bar=0;bar<bars;bar++){
      const from=startSample+Math.floor(span*bar/bars),to=Math.min(endSample,from+Math.max(1,Math.floor(span/bars))),step=Math.max(1,Math.floor((to-from)/32));
      let peak=0;for(let sample=from;sample<to;sample+=step)peak=Math.max(peak,Math.abs(channel[sample]||0));
      const barHeight=Math.max(2,peak*height*.9),x=bar*width/bars+1;
      ctx.fillRect(x,(height-barHeight)/2,Math.max(1,width/bars-2),barHeight);
    }
  }catch{canvas.classList.add('waveform-unavailable')}
}
function renderAudioWaveforms(){document.querySelectorAll('[data-waveform]').forEach(canvas=>renderWaveform(canvas))}
function seekTimelineThumbnail(video){
  const seek=()=>{const requested=Number(video.dataset.thumbTime)||0;video.currentTime=clamp(requested,0,Math.max(0,(video.duration||requested+.1)-.05))};
  if(video.readyState>=1)seek();else video.addEventListener('loadedmetadata',seek,{once:true});
}

function snapshot(){return JSON.stringify({clips:state.clips,audioTracks:state.audioTracks,videoTracks:state.videoTracks,activeVideoTrackId:state.activeVideoTrackId,selectedId:state.selectedId,ratio:state.ratio})}
function recordHistory(){state.history.push(snapshot());if(state.history.length>40)state.history.shift();state.future=[];updateHistoryButtons()}
function checkpoint(){recordHistory();markSaved()}
function restore(raw){const d=JSON.parse(raw);state.clips=normalizeClipPositions(d.clips);state.audioTracks=(d.audioTracks||[]).map(c=>({...c,timelineStart:timelineStartOf(c)}));state.videoTracks=d.videoTracks?.length?d.videoTracks:[{id:'track-1',name:'Vídeo 1'}];state.activeVideoTrackId=d.activeVideoTrackId||state.videoTracks[0].id;state.selectedId=d.selectedId||null;state.ratio=d.ratio||'16:9';applyRatio();renderAll()}
function undo(){if(!state.history.length)return;state.future.push(snapshot());restore(state.history.pop());updateHistoryButtons()}
function redo(){if(!state.future.length)return;state.history.push(snapshot());restore(state.future.pop());updateHistoryButtons()}
function updateHistoryButtons(){$('undo-btn').disabled=!state.history.length;$('redo-btn').disabled=!state.future.length}
function projectPayload(){return {project:{id:state.projectId,name:$('project-name').value,kind:state.projectKind,clips:state.clips,audioTracks:state.audioTracks,videoTracks:state.videoTracks,activeVideoTrackId:state.activeVideoTrackId,ratio:state.ratio,createdAt:state.projectCreatedAt,updatedAt:new Date().toISOString()}}}
function markSaved(){$('save-state').textContent='Guardando...';clearTimeout(markSaved.t);markSaved.t=setTimeout(saveProject,500)}
async function authHeaders(extra={}){
  if(!state.user)throw new Error('Debes iniciar sesión.');
  const token=state.bridgeToken||await state.user.getIdToken();
  return {...extra,Authorization:`Bearer ${token}`};
}

function readKreateIASession(){
  const hash=new URLSearchParams(location.hash.slice(1)),token=hash.get('kreateia_session');
  if(!token)return null;
  try{
    const raw=token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/');
    const payload=JSON.parse(decodeURIComponent(Array.from(atob(raw),c=>'%'+c.charCodeAt(0).toString(16).padStart(2,'0')).join('')));
    if(!payload.sub||Number(payload.exp||0)*1000<=Date.now())throw new Error('Sesión caducada');
    state.bridgeToken=token;
    state.bridgeUser={uid:payload.user_id||payload.sub,email:payload.email||'',getIdToken:async()=>token};
    history.replaceState({},'',location.pathname+location.search);
    return state.bridgeUser;
  }catch(error){
    history.replaceState({},'',location.pathname+location.search);
    toast('La conexión con KreateIA ha caducado.');
    return null;
  }
}
async function saveProject(){
  if(!state.projectId)return;
  try{localStorage.setItem('kreateedit-project',JSON.stringify(projectPayload()));}catch{}
  if(!state.user){$('save-state').textContent='Sesión local';return}
  try{const response=await fetch(`${API_BASE}/project/${state.projectId}`,{method:'PUT',headers:await authHeaders({'Content-Type':'application/json'}),body:JSON.stringify(projectPayload())});if(!response.ok)throw new Error();$('save-state').textContent='Guardado en Cloudflare'}catch{$('save-state').textContent='Pendiente de guardar'}
}

async function readMetadata(asset){return new Promise(resolve=>{if(asset.type==='image'){const i=new Image();i.onload=()=>{asset.duration=5;asset.width=i.naturalWidth;asset.height=i.naturalHeight;resolve()};i.onerror=()=>resolve();i.src=asset.url;return}const media=document.createElement(asset.type==='audio'?'audio':'video');media.preload='metadata';media.onloadedmetadata=()=>{asset.duration=Number.isFinite(media.duration)?media.duration:5;asset.width=media.videoWidth||0;asset.height=media.videoHeight||0;resolve()};media.onerror=()=>{asset.duration=5;resolve()};media.src=asset.url})}
async function addFiles(files){
  if(!state.user){await login();if(!state.user)return}
  const valid=[...files].filter(f=>f.type.startsWith('video/')||f.type.startsWith('audio/')||f.type.startsWith('image/'));
  if(!valid.length)return toast('Selecciona archivos de vídeo, audio o imagen.');
  const label=els.dropZone.querySelector('strong');
  label.textContent='Subiendo archivos...';
  try{
    for(const file of valid){
      const draft={name:file.name,type:file.type.split('/')[0],url:URL.createObjectURL(file),duration:0};
      try{
        await readMetadata(draft);
        const row=createUploadRow(file);
        const asset=await uploadFile(file,draft.duration,percent=>updateUploadRow(row,percent));
        state.assets.unshift(asset);finishUploadRow(row);
      }finally{URL.revokeObjectURL(draft.url)}
    }
    renderLibrary();
    toast(`${valid.length} archivo${valid.length===1?' guardado':'s guardados'} en Cloudflare`);
  }catch(error){
    toast(error.message||'No se pudo subir el archivo.');
    throw error;
  }finally{
    label.textContent='Sube tus archivos';
  }
}

function createUploadRow(file){const id=uid('upload'),row=document.createElement('div');row.className='upload-item';row.id=id;row.innerHTML=`<div><strong>${escapeHtml(file.name)}</strong><span>Preparando...</span></div><div class="upload-progress"><i></i></div>`;$('upload-queue').prepend(row);return row}
function updateUploadRow(row,percent){row.querySelector('span').textContent=`Subiendo · ${percent}%`;row.querySelector('i').style.width=`${percent}%`}
function finishUploadRow(row){row.classList.add('done');row.querySelector('span').textContent='Guardado';setTimeout(()=>row.remove(),2200)}
async function uploadFile(file,duration,onProgress){
  if(!state.projectId)throw new Error('Abre un proyecto antes de subir archivos.');
  const headers=await authHeaders({'Content-Type':file.type,'X-File-Name':encodeURIComponent(file.name),'X-Media-Duration':String(duration),'X-Project-Id':state.projectId});
  return new Promise((resolve,reject)=>{const xhr=new XMLHttpRequest();xhr.open('POST',`${API_BASE}/upload`);Object.entries(headers).forEach(([key,value])=>xhr.setRequestHeader(key,value));xhr.upload.onprogress=event=>{const total=event.lengthComputable?event.total:file.size;onProgress(Math.min(99,Math.round(event.loaded/Math.max(1,total)*100)))};xhr.onerror=()=>reject(new Error('Se perdió la conexión durante la subida.'));xhr.onload=()=>{let data={};try{data=JSON.parse(xhr.responseText||'{}')}catch{}if(xhr.status<200||xhr.status>=300)return reject(new Error(data.error||'No se pudo subir el archivo.'));onProgress(100);resolve(data.asset)};xhr.send(file)})
}

async function handleFiles(files){try{await addFiles(files)}catch(error){console.error('[KreateEdit upload]',error)}}

function renderLibrary(){const filter=document.querySelector('.source-tab.active')?.dataset.filter||'all';const rows=state.assets.filter(a=>filter==='all'||a.type===filter);els.mediaList.innerHTML=rows.length?rows.map(a=>`<article class="media-card" data-asset="${a.id}"><div class="media-thumb">${a.type==='image'?`<img src="${a.url}" alt="">`:a.type==='video'?`<video src="${a.url}" muted preload="metadata"></video>`:`<i data-lucide="music-2"></i>`}</div><div class="media-info"><strong>${escapeHtml(a.name)}</strong><span>${a.type==='image'?'Imagen':fmt(a.duration)}</span></div><button class="delete-media" data-delete-media="${a.id}" title="Eliminar de KreateEdit" aria-label="Eliminar de KreateEdit"><i data-lucide="trash-2"></i></button><button class="add-media" data-add="${a.id}" title="Añadir a la línea de tiempo"><i data-lucide="plus"></i></button></article>`).join(''):`<div class="empty-library">${state.user?'Tu biblioteca en Cloudflare está vacía.':'Inicia sesión para cargar tu biblioteca en la nube.'}</div>`;els.mediaList.querySelectorAll('[data-add]').forEach(b=>b.onclick=e=>{e.stopPropagation();addAssetToTimeline(b.dataset.add)});els.mediaList.querySelectorAll('[data-delete-media]').forEach(b=>b.onclick=e=>{e.stopPropagation();deleteMediaAsset(b.dataset.deleteMedia)});refreshIcons()}
async function deleteMediaAsset(assetId){const asset=assetFor(assetId);if(!asset||!state.user||!state.projectId)return;const used=state.clips.some(c=>c.assetId===assetId)||state.audioTracks.some(c=>c.assetId===assetId);const message=`¿Eliminar “${asset.name}” de este proyecto?${used?' También se quitará de su línea de tiempo.':''}\n\nLas generaciones del SaaS y los demás proyectos no se modificarán.`;if(!confirm(message))return;try{const response=await fetch(`${API_BASE}/media?id=${encodeURIComponent(assetId)}&projectId=${encodeURIComponent(state.projectId)}`,{method:'DELETE',headers:await authHeaders()});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No se pudo eliminar el archivo.');state.assets=state.assets.filter(a=>a.id!==assetId);state.clips=state.clips.filter(c=>c.assetId!==assetId);state.audioTracks=state.audioTracks.filter(c=>c.assetId!==assetId);state.audioBufferPromises.delete(assetId);if(!selectedClip())state.selectedId=state.clips[0]?.id||state.audioTracks[0]?.id||null;renderAll();markSaved();toast('Archivo eliminado solo de este proyecto')}catch(error){toast(error.message||'No se pudo eliminar el archivo.')}}
function addAssetToTimeline(assetId){const a=assetFor(assetId);if(!a)return;checkpoint();const base={id:uid('clip'),assetId:a.id,name:a.name,start:0,end:Math.max(.1,a.duration||5),volume:1,muted:false,fadeIn:0,fadeOut:0};if(a.type==='audio'){const timelineStart=Math.max(0,...state.audioTracks.map(c=>timelineStartOf(c)+durationOf(c)));state.audioTracks.push({...base,kind:'audio',offset:0,timelineStart})}else{const timelineStart=Math.max(0,...clipsForTrack(state.activeVideoTrackId).map(c=>timelineStartOf(c)+durationOf(c)));state.clips.push({...base,kind:a.type,trackId:state.activeVideoTrackId,timelineStart})}state.selectedId=base.id;renderAll();toast('Añadido a la pista activa')}

function clipHtml(c,index,isAudio=false){
  const a=assetFor(c.assetId),width=Math.max(42,durationOf(c)*state.pixelsPerSecond),left=timelineStartOf(c)*state.pixelsPerSecond,bg=a?.type==='image'?a.url:'',volume=Math.round(volumeOf(c)*100);
  let visual=`<div class="clip-fill" ${bg?`style="background-image:url('${bg}')"`:''}></div>`;
  if(a?.type==='video'&&!isAudio){
    const frameCount=clamp(Math.ceil(width/72),1,10);
    const frames=Array.from({length:frameCount},(_,frameIndex)=>{
      const progress=(frameIndex+.5)/frameCount;
      const time=c.start+durationOf(c)*progress;
      return `<video class="clip-video-thumb" src="${a.url}" data-thumb-time="${time}" muted preload="metadata" playsinline></video>`;
    }).join('');
    visual=`<div class="clip-fill clip-filmstrip" aria-hidden="true">${frames}</div>`;
  }
  return `<article class="timeline-clip ${isAudio?'audio':'video'} ${c.id===state.selectedId?'selected':''}" data-clip="${c.id}" style="left:${left}px;width:${width}px"><button class="trim-handle trim-left" data-trim-handle="start" data-id="${c.id}" title="Recortar inicio" aria-label="Recortar inicio"></button>${visual}${isAudio?`<canvas class="clip-waveform" data-waveform="${c.id}" aria-hidden="true"></canvas>`:''}<div class="clip-info"><strong>${escapeHtml(c.name)}</strong><span data-clip-duration>${fmt(durationOf(c))}</span></div><div class="clip-flags">${c.muted?'<i data-lucide="volume-x"></i>':''}${fadeInOf(c)||fadeOutOf(c)?'<i data-lucide="audio-waveform"></i>':''}${c.extracted?'<i data-lucide="audio-lines"></i>':''}</div><input class="clip-volume" data-volume-id="${c.id}" type="range" min="0" max="100" value="${volume}" title="Volumen ${volume}%" aria-label="Volumen del clip" /><button class="trim-handle trim-right" data-trim-handle="end" data-id="${c.id}" title="Recortar final" aria-label="Recortar final"></button></article>`;
}
function renderTimeline(){els.videoTracks.innerHTML=state.videoTracks.map(track=>`<div class="track ${track.id===state.activeVideoTrackId?'active-track':''}" data-track="${track.id}"><button class="track-label" data-activate-track="${track.id}"><i data-lucide="film"></i><span>${escapeHtml(track.name)}</span>${state.videoTracks.length>1?`<i class="remove-track" data-remove-track="${track.id}" data-lucide="x"></i>`:''}</button><div class="track-content" data-track-content="${track.id}">${clipsForTrack(track.id).map((c,i)=>clipHtml(c,i)).join('')}</div></div>`).join('');els.audioClips.innerHTML=state.audioTracks.map((c,i)=>clipHtml(c,i,true)).join('');document.querySelectorAll('[data-clip]').forEach(el=>{el.onclick=()=>selectClip(el.dataset.clip);el.onpointerdown=e=>{if(e.button!==0||e.target.closest('[data-trim-handle],[data-volume-id]'))return;startTimelineInteraction(e,el.dataset.clip,'move')}});document.querySelectorAll('[data-trim-handle]').forEach(handle=>handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();startTimelineInteraction(e,handle.dataset.id,handle.dataset.trimHandle==='start'?'trim-start':'trim-end')});document.querySelectorAll('[data-volume-id]').forEach(input=>{input.onpointerdown=e=>e.stopPropagation();input.onclick=e=>e.stopPropagation();input.oninput=e=>{e.stopPropagation();const clip=state.clips.find(c=>c.id===input.dataset.volumeId)||state.audioTracks.find(c=>c.id===input.dataset.volumeId);if(!clip)return;clip.volume=Number(input.value)/100;input.title=`Volumen ${input.value}%`;if(state.selectedId===clip.id){$('volume-slider').value=input.value;$('volume-label').textContent=`${input.value}%`}markSaved()}});document.querySelectorAll('[data-activate-track]').forEach(b=>b.onclick=()=>{state.activeVideoTrackId=b.dataset.activateTrack;renderTimeline()});document.querySelectorAll('[data-remove-track]').forEach(b=>b.onclick=e=>{e.stopPropagation();removeVideoTrack(b.dataset.removeTrack)});updateTimelineReadout();refreshIcons();requestAnimationFrame(()=>{renderAudioWaveforms();document.querySelectorAll('.clip-video-thumb').forEach(video=>seekTimelineThumbnail(video))})}
function updateTimelineReadout(){const total=totalDuration();$('timeline-duration').textContent=fmt(total);$('total-time').textContent=fmt(total);renderRuler(total);updatePlayhead()}
function startTimelineInteraction(event,id,mode){const clip=state.clips.find(c=>c.id===id)||state.audioTracks.find(c=>c.id===id),element=document.querySelector(`[data-clip="${id}"]`),asset=clip&&assetFor(clip.assetId);if(!clip||!element)return;event.preventDefault();recordHistory();state.selectedId=id;const origin={x:event.clientX,start:clip.start,end:clip.end,timelineStart:timelineStartOf(clip)},minDuration=.1,maxEnd=asset?.type==='image'?60:Math.max(clip.end,Number(asset?.duration)||clip.end);element.classList.add('dragging','selected');document.body.classList.add('timeline-dragging');const snap=value=>Math.round(value*10)/10;function move(pointer){const delta=(pointer.clientX-origin.x)/state.pixelsPerSecond;if(mode==='move'){clip.timelineStart=Math.max(0,snap(origin.timelineStart+delta))}else if(mode==='trim-start'){const bounded=clamp(delta,-Math.min(origin.start,origin.timelineStart),durationOf(origin)-minDuration);clip.start=snap(origin.start+bounded);clip.timelineStart=snap(origin.timelineStart+bounded)}else{clip.end=snap(clamp(origin.end+delta,origin.start+minDuration,maxEnd))}element.style.left=`${timelineStartOf(clip)*state.pixelsPerSecond}px`;element.style.width=`${Math.max(42,durationOf(clip)*state.pixelsPerSecond)}px`;element.querySelector('[data-clip-duration]').textContent=fmt(durationOf(clip));updateTimelineReadout()}function end(){window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);document.body.classList.remove('timeline-dragging');element.classList.remove('dragging');markSaved();renderAll()}window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});window.addEventListener('pointercancel',end,{once:true})}
function renderRuler(total){const width=Math.max(900,total*state.pixelsPerSecond+100);els.timeRuler.style.width=`${width}px`;document.querySelectorAll('[data-track-content]').forEach(el=>el.style.width=`${width}px`);els.audioClips.style.width=`${width}px`;let labels='';for(let s=0;s<=Math.max(total,12);s+=2)labels+=`<span class="ruler-label" style="left:${s*state.pixelsPerSecond}px">${fmt(s).slice(0,5)}</span>`;els.timeRuler.innerHTML=labels}
function selectClip(id){state.selectedId=id;const c=selectedClip();els.noSelection.classList.toggle('hidden',!!c);els.clipProperties.classList.toggle('hidden',!c);if(c){const a=assetFor(c.assetId),maxFade=Math.max(0,durationOf(c)/2),volume=Math.round(volumeOf(c)*100);$('selected-name').textContent=c.name;$('selected-kind').textContent=(a?.type||c.kind).toUpperCase();$('selected-thumb').style.backgroundImage=a?.type==='image'?`url('${a.url}')`:'';$('selected-thumb').innerHTML=a?.type==='video'?`<video src="${a.url}" muted preload="metadata" playsinline></video>`:a?.type==='audio'?'<i data-lucide="audio-waveform"></i>':'';$('trim-start').value=c.start.toFixed(1);$('trim-end').value=c.end.toFixed(1);$('trim-start-range').max=Math.max(.1,a?.duration||c.end);$('trim-end-range').max=Math.max(.1,a?.duration||c.end);$('trim-start-range').value=c.start;$('trim-end-range').value=c.end;$('volume-slider').value=volume;$('volume-label').textContent=`${volume}%`;$('mute-toggle').checked=!!c.muted;$('fade-in').max=maxFade;$('fade-out').max=maxFade;$('fade-in-range').max=maxFade;$('fade-out-range').max=maxFade;$('fade-in').value=fadeInOf(c).toFixed(1);$('fade-out').value=fadeOutOf(c).toFixed(1);$('fade-in-range').value=fadeInOf(c);$('fade-out-range').value=fadeOutOf(c);$('extract-btn').disabled=(a?.type!=='video'||c.kind==='audio');if(!state.playing)showSelectedPreview()}renderTimeline();refreshIcons()}
function renderAll(){renderLibrary();renderTimeline();selectClip(state.selectedId);applyRatio()}

function showSelectedPreview(){const c=selectedClip();const a=c&&assetFor(c.assetId);els.video.pause();els.video.style.display='none';els.image.style.display='none';els.empty.style.display=a?'none':'flex';if(!a)return;if(a.type==='image'){els.image.src=a.url;els.image.style.display='block'}else{els.video.src=a.url;els.video.currentTime=c.start;els.video.muted=state.previewMuted||c.muted;els.video.volume=volumeOf(c);els.video.style.display='block'}updatePreviewTime()}
function updatePreviewTime(){const c=selectedClip();if(!c)return;const local=els.video.style.display==='block'?clamp(els.video.currentTime-c.start,0,durationOf(c)):0;state.playhead=timelineStartOf(c)+local;$('current-time').textContent=fmt(state.playhead);updatePlayhead()}
function updatePlayhead(){els.playhead.style.transform=`translate3d(${state.playhead*state.pixelsPerSecond}px,0,0)`}
function seekBy(seconds){if(state.playing)stopTimelinePlayback();setTimelinePlayhead(clamp(state.playhead+seconds,0,totalDuration()),true)}
function timelineTimeFromPointer(clientX){const scroll=$('timeline-scroll'),rect=scroll.getBoundingClientRect(),label=parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--track-label'))||92,max=Math.max(totalDuration(),(scroll.scrollWidth-label)/state.pixelsPerSecond);return clamp((clientX-rect.left+scroll.scrollLeft-label)/state.pixelsPerSecond,0,max)}
function setTimelinePlayhead(time,seek=false){state.playhead=Math.max(0,Number(time)||0);$('current-time').textContent=fmt(state.playhead);updatePlayhead();if(seek)seekTimelinePreview(state.playhead)}
function showTimelineFrame(time,autoplay=false){const clip=visibleClipAtTime(time),asset=clip&&assetFor(clip.assetId);if(!clip||!asset){els.video.pause();els.video.style.display='none';els.image.style.display='none';els.empty.style.display='flex';state.playbackClipId='';return}const local=clamp(time-timelineStartOf(clip),0,durationOf(clip)),sourceChanged=state.playbackClipId!==clip.id;state.playbackClipId=clip.id;els.empty.style.display='none';if(asset.type==='image'){els.video.pause();els.video.style.display='none';if(sourceChanged)els.image.src=asset.url;els.image.style.display='block';return}els.image.style.display='none';els.video.style.display='block';if(sourceChanged){els.video.src=asset.url;els.video.currentTime=clip.start+local}else if(Math.abs(els.video.currentTime-(clip.start+local))>.3){els.video.currentTime=clip.start+local}els.video.muted=autoplay||state.previewMuted||clip.muted;els.video.volume=clamp(clip.volume,0,1);if(autoplay&&els.video.paused)els.video.play().catch(()=>{})}
function stopTimelineAudio(){state.playbackAudioElements.forEach(audio=>audio.pause())}
function syncTimelineAudio(time,autoplay=true){const active=new Set(),clips=[...state.clips,...state.audioTracks];for(const clip of clips){const asset=assetFor(clip.assetId),from=timelineStartOf(clip),to=from+durationOf(clip);if(!asset||asset.type==='image'||time<from||time>=to||clip.muted||state.previewMuted)continue;active.add(clip.id);let audio=state.playbackAudioElements.get(clip.id);if(!audio){audio=new Audio(asset.url);audio.preload='auto';state.playbackAudioElements.set(clip.id,audio)}const desired=clip.start+(time-from);audio.volume=clamp(volumeOf(clip)*clipGainAtTime(clip,time),0,1);if(Math.abs(audio.currentTime-desired)>.3)audio.currentTime=desired;if(autoplay&&audio.paused)audio.play().catch(()=>{})}state.playbackAudioElements.forEach((audio,id)=>{if(!active.has(id))audio.pause()})}
function seekTimelinePreview(time){showTimelineFrame(time,false);state.playhead=time;$('current-time').textContent=fmt(time);updatePlayhead()}
function startPlayheadDrag(event){if(event.button!==0)return;event.preventDefault();event.stopPropagation();if(state.playing)stopTimelinePlayback();document.body.classList.add('playhead-dragging');const move=pointer=>setTimelinePlayhead(timelineTimeFromPointer(pointer.clientX));const end=pointer=>{move(pointer);window.removeEventListener('pointermove',move);window.removeEventListener('pointerup',end);window.removeEventListener('pointercancel',end);document.body.classList.remove('playhead-dragging');seekTimelinePreview(state.playhead)};move(event);window.addEventListener('pointermove',move);window.addEventListener('pointerup',end,{once:true});window.addEventListener('pointercancel',end,{once:true})}
function stopTimelinePlayback(){state.playing=false;cancelAnimationFrame(state.playbackRaf);state.playbackRaf=0;els.video.pause();stopTimelineAudio();updatePlayIcon()}
function timelinePlaybackTick(now){if(!state.playing)return;const time=state.playbackStartTime+(now-state.playbackStartedAt)/1000,total=totalDuration();if(time>=total){state.playhead=total;$('current-time').textContent=fmt(total);updatePlayhead();stopTimelinePlayback();return}state.playhead=time;$('current-time').textContent=fmt(time);updatePlayhead();showTimelineFrame(time,true);syncTimelineAudio(time,true);state.playbackRaf=requestAnimationFrame(timelinePlaybackTick)}
function playSelected(){if(!state.clips.length&&!state.audioTracks.length)return toast('Añade contenido a la línea de tiempo.');if(state.playing){stopTimelinePlayback();return}if(state.playhead>=totalDuration())state.playhead=0;state.playbackStartTime=state.playhead;state.playbackStartedAt=performance.now();state.playing=true;updatePlayIcon();showTimelineFrame(state.playhead,true);syncTimelineAudio(state.playhead,true);state.playbackRaf=requestAnimationFrame(timelinePlaybackTick)}
function updatePlayIcon(){els.playBtn.innerHTML=`<i data-lucide="${state.playing?'pause':'play'}"></i>`;refreshIcons()}
function nextClip(delta=1){if(!state.clips.length)return;const ordered=[...state.clips].sort((a,b)=>timelineStartOf(a)-timelineStartOf(b));let i=ordered.findIndex(c=>c.id===state.selectedId);i=clamp((i<0?0:i)+delta,0,ordered.length-1);selectClip(ordered[i].id)}

function updateTrim(field,value){const c=selectedClip(),a=c&&assetFor(c.assetId);if(!c||!a)return;const max=Math.max(.1,a.duration||c.end);checkpoint();if(field==='start')c.start=clamp(value,0,c.end-.1);else c.end=clamp(value,c.start+.1,max);selectClip(c.id)}
function updateFade(field,value){const c=selectedClip();if(!c)return;const amount=clamp(value,0,durationOf(c)/2);c[field]=amount;$(`${field==='fadeIn'?'fade-in':'fade-out'}`).value=amount.toFixed(1);$(`${field==='fadeIn'?'fade-in-range':'fade-out-range'}`).value=amount;renderTimeline();markSaved()}
function moveClip(id,delta){const clip=state.clips.find(c=>c.id===id);if(!clip)return;const siblings=clipsForTrack(clip.trackId||'track-1'),position=siblings.findIndex(c=>c.id===id),other=siblings[position+delta];if(position<0||!other)return;checkpoint();const a=state.clips.indexOf(clip),b=state.clips.indexOf(other);[state.clips[a],state.clips[b]]=[state.clips[b],state.clips[a]];renderAll()}
function addVideoTrack(){if(state.videoTracks.length>=6)return toast('Puedes usar hasta 6 pistas de vídeo.');checkpoint();const id=uid('track');state.videoTracks.push({id,name:`Vídeo ${state.videoTracks.length+1}`});state.activeVideoTrackId=id;renderTimeline();toast('Nueva pista preparada')}
function removeVideoTrack(id){if(state.videoTracks.length===1)return;const clips=clipsForTrack(id);if(clips.length&&!confirm('Esta pista contiene clips. ¿Eliminar la pista y sus clips?'))return;checkpoint();state.clips=state.clips.filter(c=>(c.trackId||'track-1')!==id);state.videoTracks=state.videoTracks.filter(track=>track.id!==id);state.activeVideoTrackId=state.videoTracks[0].id;renderAll()}
function splitSelected(){let c=selectedClip();const atPlayhead=state.clips.find(item=>state.playhead>timelineStartOf(item)+.1&&state.playhead<timelineStartOf(item)+durationOf(item)-.1);if(atPlayhead)c=atPlayhead;if(!c||c.kind==='audio')return toast('Sitúa el cursor sobre un clip de vídeo.');const local=clamp(c.start+(state.playhead-timelineStartOf(c)),c.start,c.end);if(local<=c.start+.1||local>=c.end-.1)return toast('Sitúa el cursor dentro del clip.');checkpoint();const i=state.clips.findIndex(x=>x.id===c.id),second={...c,id:uid('clip'),start:local,timelineStart:timelineStartOf(c)+(local-c.start)};c.end=local;state.clips.splice(i+1,0,second);state.selectedId=second.id;renderAll();toast('Clip dividido')}
function extractAudio(){const c=selectedClip(),a=c&&assetFor(c.assetId);if(!c||a?.type!=='video')return toast('Selecciona un vídeo.');checkpoint();c.muted=true;c.extracted=true;const audio={...c,id:uid('audio'),kind:'audio',name:`Audio · ${c.name}`,muted:false,extractedFrom:c.id};state.audioTracks.push(audio);renderAll();toast('Audio extraído en una pista independiente')}
function duplicateSelected(){const c=selectedClip();if(!c)return;checkpoint();const copy={...c,id:uid(c.kind==='audio'?'audio':'clip'),name:`${c.name} copia`,timelineStart:timelineStartOf(c)+durationOf(c)};const list=c.kind==='audio'?state.audioTracks:state.clips;list.splice(list.indexOf(c)+1,0,copy);state.selectedId=copy.id;renderAll()}
function deleteSelected(){const c=selectedClip();if(!c)return;checkpoint();state.clips=state.clips.filter(x=>x.id!==c.id);state.audioTracks=state.audioTracks.filter(x=>x.id!==c.id&&x.extractedFrom!==c.id);state.selectedId=state.clips[0]?.id||state.audioTracks[0]?.id||null;renderAll()}
function applyRatio(){els.canvasWrap.className=`canvas-wrap ratio-${state.ratio.replace(':','-')}`;document.querySelectorAll('[data-ratio]').forEach(b=>b.classList.toggle('active',b.dataset.ratio===state.ratio))}

async function exportProject(){if(!state.clips.length)return toast('Añade al menos un clip.');const canvas=$('export-canvas'),ctx=canvas.getContext('2d');const res=Number($('export-resolution').value),fps=Number($('export-fps').value);const [rw,rh]=state.ratio==='9:16'?[res,res*16/9]:state.ratio==='1:1'?[res,res]:[res*16/9,res];canvas.width=Math.round(rw);canvas.height=Math.round(rh);const stream=canvas.captureStream(fps);let audioCtx=null,dest=null;try{audioCtx=new AudioContext();dest=audioCtx.createMediaStreamDestination();dest.stream.getAudioTracks().forEach(t=>stream.addTrack(t))}catch{}const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(MediaRecorder.isTypeSupported)||'';const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};const done=new Promise(resolve=>recorder.onstop=resolve);recorder.start(250);state.exporting=true;$('start-export').disabled=true;$('cancel-export').textContent='Cerrar';$('export-progress-wrap').classList.remove('hidden');let elapsed=0,total=totalDuration();const exportClips=[...state.clips].sort((a,b)=>timelineStartOf(a)-timelineStartOf(b));for(const clip of exportClips){if(!state.exporting)break;const asset=assetFor(clip.assetId);if(!asset)continue;const d=durationOf(clip);if(asset.type==='image'){const img=new Image();img.src=asset.url;await img.decode().catch(()=>{});const start=performance.now();while(state.exporting&&(performance.now()-start)/1000<d){drawCover(ctx,img,canvas.width,canvas.height);updateExport((elapsed+(performance.now()-start)/1000)/total);await frame()}}else{const v=document.createElement('video');v.src=asset.url;v.playsInline=true;v.muted=clip.muted;v.volume=clamp(clip.volume,0,1);await once(v,'loadedmetadata');v.currentTime=clip.start;await once(v,'seeked');let source,gain;if(audioCtx&&!clip.muted){try{source=audioCtx.createMediaElementSource(v);gain=audioCtx.createGain();gain.gain.value=clip.volume;source.connect(gain).connect(dest)}catch{}}await v.play().catch(()=>{});while(state.exporting&&v.currentTime<clip.end){drawCover(ctx,v,canvas.width,canvas.height);updateExport((elapsed+v.currentTime-clip.start)/total);await frame()}v.pause();try{source?.disconnect();gain?.disconnect()}catch{}}elapsed+=d}recorder.stop();await done;audioCtx?.close();if(state.exporting){const blob=new Blob(chunks,{type:mime||'video/webm'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`KreateEdit-${Date.now()}.webm`;a.click();setTimeout(()=>URL.revokeObjectURL(url),60000);updateExport(1);$('export-status').textContent='Exportación completada';toast('Vídeo exportado correctamente')}state.exporting=false;$('start-export').disabled=false}
function drawCover(ctx,media,w,h){ctx.fillStyle='#000';ctx.fillRect(0,0,w,h);const mw=media.videoWidth||media.naturalWidth||w,mh=media.videoHeight||media.naturalHeight||h,scale=Math.min(w/mw,h/mh),dw=mw*scale,dh=mh*scale;ctx.drawImage(media,(w-dw)/2,(h-dh)/2,dw,dh)}
function frame(){return new Promise(r=>requestAnimationFrame(r))}
function once(el,event){return new Promise((resolve,reject)=>{const ok=()=>{clean();resolve()},bad=()=>{clean();reject(new Error('No se pudo leer el archivo'))},clean=()=>{el.removeEventListener(event,ok);el.removeEventListener('error',bad)};el.addEventListener(event,ok,{once:true});el.addEventListener('error',bad,{once:true})})}
function updateExport(v){const p=Math.round(clamp(v,0,1)*100);$('export-progress').style.width=`${p}%`;$('export-percent').textContent=`${p}%`;$('export-status').textContent=p<100?'Procesando clips...':'Finalizando...'}

async function login(){
  try{return (await signInWithPopup(auth,googleProvider)).user}
  catch(error){toast(error.code==='auth/unauthorized-domain'?'Falta autorizar este dominio en Firebase.':(error.message||'No se pudo iniciar sesión.'));return null}
}

async function loadCloudWorkspace(){
  if(!state.user)return;
  showProjectHome();
  try{
    const headers=await authHeaders();
    const projectsResponse=await fetch(`${API_BASE}/projects`,{headers});
    const projectsData=await projectsResponse.json().catch(()=>({}));
    if(!projectsResponse.ok)throw new Error(projectsData.error||'No se pudieron cargar tus proyectos.');
    state.assets=[];
    state.projects=projectsData.projects||[];state.cloudReady=true;renderProjects();
    const importParams=new URLSearchParams(location.search),importSource=importParams.get('import');
    if(importSource){
      const importedName=String(importParams.get('name')||'KreateVideo').replace(/\.[^.]+$/,'');
      if(!state.projects.length)await createProject(importedName,'video');
      else if(state.projects.length===1)await openProject(state.projects[0].id);
      else openImportProjectModal();
    }
  }catch(error){$('project-list').innerHTML=`<div class="project-loading error">${escapeHtml(error.message||'No se pudo conectar con tus proyectos.')}</div>`;toast(error.message||'No se pudo cargar Cloudflare.')}
}

function openImportProjectModal(){
  const list=$('import-project-list');
  list.innerHTML=state.projects.map(project=>`<button class="import-project-option" data-import-project="${project.id}"><i data-lucide="clapperboard"></i><span><strong>${escapeHtml(project.name)}</strong><small>Editado ${formatProjectDate(project.updatedAt)}</small></span><i data-lucide="chevron-right"></i></button>`).join('');
  list.querySelectorAll('[data-import-project]').forEach(button=>button.onclick=()=>{closeImportProjectModal();openProject(button.dataset.importProject)});
  $('import-project-modal').classList.remove('hidden');refreshIcons();
}
function closeImportProjectModal(){$('import-project-modal').classList.add('hidden')}

function showProjectHome(){state.exporting=false;$('app').classList.add('hidden');$('photo-workspace').classList.add('hidden');$('project-home').classList.remove('hidden');renderProjects();refreshIcons()}
function renderProjects(){if(!state.user){$('project-list').innerHTML='<div class="project-loading">Inicia sesión en KreateIA para ver tus proyectos.</div>';return}$('project-count').textContent=`${state.projects.length} proyecto${state.projects.length===1?'':'s'}`;$('project-list').innerHTML=state.projects.length?state.projects.map(project=>`<article class="project-card" data-open-project="${project.id}"><div class="project-card-preview ${project.kind}"><i data-lucide="${project.kind==='photo'?'image':'clapperboard'}"></i><span>${project.kind==='photo'?'Foto':'Vídeo'}</span></div><div class="project-card-copy"><strong>${escapeHtml(project.name)}</strong><span>Editado ${formatProjectDate(project.updatedAt)}</span></div><button class="icon-btn" data-delete-project="${project.id}" title="Eliminar proyecto"><i data-lucide="trash-2"></i></button></article>`).join(''):'<button class="empty-project-card" id="empty-new-project"><i data-lucide="plus"></i><strong>Crea tu primer proyecto</strong><span>Elige vídeo o fotografía y empieza desde cero</span></button>';$('project-list').querySelectorAll('[data-open-project]').forEach(card=>card.onclick=()=>openProject(card.dataset.openProject));$('project-list').querySelectorAll('[data-delete-project]').forEach(button=>button.onclick=event=>{event.stopPropagation();deleteProject(button.dataset.deleteProject)});$('empty-new-project')?.addEventListener('click',openProjectModal);refreshIcons()}
function formatProjectDate(value){const date=new Date(value||Date.now());return new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',year:'numeric'}).format(date)}
function openProjectModal(){$('new-project-name').value='';state.newProjectKind='video';document.querySelectorAll('[data-project-kind]').forEach(button=>button.classList.toggle('active',button.dataset.projectKind==='video'));$('project-modal').classList.remove('hidden');setTimeout(()=>$('new-project-name').focus(),50);refreshIcons()}
function closeProjectModal(){$('project-modal').classList.add('hidden')}
async function createProject(name,kind=state.newProjectKind){await authPersistenceReady;if(!state.user&&auth.currentUser)state.user=auth.currentUser;if(!state.user){toast('Inicia sesión para crear el proyecto.');const user=await login();if(!user)return;state.user=user}const button=$('create-project');button.disabled=true;try{const response=await fetch(`${API_BASE}/projects`,{method:'POST',headers:await authHeaders({'Content-Type':'application/json'}),body:JSON.stringify({name:name||$('new-project-name').value.trim(),kind})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No se pudo crear el proyecto.');state.projects.unshift(data.project);closeProjectModal();await openProject(data.project.id)}catch(error){toast(error.message||'No se pudo crear el proyecto.')}finally{button.disabled=false}}
async function openProject(projectId){
  if(!state.user)return;
  try{
    const headers=await authHeaders();
    const [projectResponse,libraryResponse]=await Promise.all([
      fetch(`${API_BASE}/project/${projectId}`,{headers}),
      fetch(`${API_BASE}/library?projectId=${encodeURIComponent(projectId)}`,{headers}),
    ]);
    const data=await projectResponse.json().catch(()=>({}));
    const libraryData=await libraryResponse.json().catch(()=>({}));
    if(!projectResponse.ok||!data.project)throw new Error(data.error||'No se pudo abrir el proyecto.');
    if(!libraryResponse.ok)throw new Error(libraryData.error||'No se pudo cargar el contenido del proyecto.');
    const project=data.project;
    state.projectId=project.id||projectId;
    state.assets=libraryData.assets||[];
    state.projectKind=project.kind==='photo'?'photo':'video';
    state.projectCreatedAt=project.createdAt||new Date().toISOString();
    $('project-name').value=project.name||'Proyecto sin nombre';
    state.clips=normalizeClipPositions(project.clips);
    state.audioTracks=(project.audioTracks||[]).map(c=>({...c,timelineStart:timelineStartOf(c)}));
    state.videoTracks=project.videoTracks?.length?project.videoTracks:[{id:'track-1',name:'Vídeo 1'}];
    state.activeVideoTrackId=project.activeVideoTrackId||state.videoTracks[0].id;
    state.ratio=project.ratio||'16:9';
    state.selectedId=state.clips[0]?.id||state.audioTracks[0]?.id||null;
    const ids=new Set(state.assets.map(asset=>asset.id));
    state.clips=state.clips.filter(clip=>ids.has(clip.assetId));
    state.audioTracks=state.audioTracks.filter(track=>ids.has(track.assetId));
    if(state.projectKind==='photo'){showPhotoWorkspace(project);return}
    $('project-home').classList.add('hidden');$('photo-workspace').classList.add('hidden');$('app').classList.remove('hidden');
    $('save-state').textContent='Guardado en Cloudflare';
    state.playhead=0;state.history=[];state.future=[];
    renderAll();
    await importFromKreateIA();
  }catch(error){toast(error.message||'No se pudo abrir el proyecto.')}
}
function showPhotoWorkspace(project){$('project-home').classList.add('hidden');$('app').classList.add('hidden');$('photo-workspace').classList.remove('hidden');$('photo-project-name').textContent=project.name;refreshIcons()}
async function deleteProject(projectId){const project=state.projects.find(item=>item.id===projectId);if(!project||!confirm(`¿Eliminar “${project.name}”? Tus archivos de la biblioteca se conservarán.`))return;try{const response=await fetch(`${API_BASE}/project/${projectId}`,{method:'DELETE',headers:await authHeaders()});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No se pudo eliminar el proyecto.');state.projects=state.projects.filter(item=>item.id!==projectId);renderProjects();toast('Proyecto eliminado')}catch(error){toast(error.message||'No se pudo eliminar el proyecto.')}}

async function importFromKreateIA(){
  const params=new URLSearchParams(location.search),source=params.get('import');
  if(!source||!state.user)return;
  try{
    toast('Importando generación de KreateIA...');
    const response=await fetch(source);if(!response.ok)throw new Error('No se pudo recuperar la generación.');
    const blob=await response.blob(),type=params.get('type')||blob.type.split('/')[0],extension=type==='image'?'png':'mp4';
    const file=new File([blob],params.get('name')||`KreateIA-${Date.now()}.${extension}`,{type:blob.type||`${type}/${extension}`});
    await addFiles([file]);const asset=state.assets[0];if(asset)addAssetToTimeline(asset.id);
    history.replaceState({},'',location.pathname);toast('Generación añadida a KreateEdit');
  }catch(error){toast(error.message||'No se pudo importar la generación.')}
}

async function exportProjectV2(){
  if(!state.clips.length)return toast('Añade al menos un clip.');
  const canvas=$('export-canvas'),ctx=canvas.getContext('2d');
  const res=Number($('export-resolution').value),fps=Number($('export-fps').value);
  const [rw,rh]=state.ratio==='9:16'?[res,res*16/9]:state.ratio==='1:1'?[res,res]:[res*16/9,res];
  canvas.width=Math.round(rw);canvas.height=Math.round(rh);
  const stream=canvas.captureStream(fps);
  let audioCtx=null,dest=null;
  const background=[];
  try{
    audioCtx=new AudioContext();
    await audioCtx.resume();
    dest=audioCtx.createMediaStreamDestination();
    dest.stream.getAudioTracks().forEach(track=>stream.addTrack(track));
    for(const track of state.audioTracks.filter(item=>!item.extractedFrom&&!item.muted)){
      const asset=assetFor(track.assetId);if(!asset)continue;
      const media=document.createElement('audio');media.src=asset.url;media.volume=1;
      await once(media,'loadedmetadata');media.currentTime=track.start||0;
      const source=audioCtx.createMediaElementSource(media),gain=audioCtx.createGain();
      gain.gain.value=track.volume;source.connect(gain).connect(dest);
      background.push({media,source,gain,end:track.end});
    }
  }catch{}
  const mime=['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].find(type=>MediaRecorder.isTypeSupported(type))||'';
  const recorder=new MediaRecorder(stream,mime?{mimeType:mime}:undefined),chunks=[];
  recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  const done=new Promise(resolve=>recorder.onstop=resolve);
  recorder.start(250);state.exporting=true;
  $('start-export').disabled=true;$('cancel-export').textContent='Cancelar';$('export-progress-wrap').classList.remove('hidden');
  background.forEach(item=>item.media.play().catch(()=>{}));
  let elapsed=0,total=totalDuration();
  for(const clip of state.clips){
    if(!state.exporting)break;
    const asset=assetFor(clip.assetId);if(!asset)continue;
    const duration=durationOf(clip);
    if(asset.type==='image'){
      const img=new Image();img.src=asset.url;await img.decode().catch(()=>{});
      const started=performance.now();
      while(state.exporting&&(performance.now()-started)/1000<duration){drawCover(ctx,img,canvas.width,canvas.height);updateExport((elapsed+(performance.now()-started)/1000)/total);await frame()}
    }else{
      const video=document.createElement('video');video.src=asset.url;video.playsInline=true;
      const extracted=state.audioTracks.find(track=>track.extractedFrom===clip.id&&!track.muted);
      const includeAudio=!clip.muted||!!extracted;
      video.muted=!includeAudio;video.volume=1;
      await once(video,'loadedmetadata');video.currentTime=clip.start;await once(video,'seeked');
      let source,gain;
      if(audioCtx&&includeAudio){try{source=audioCtx.createMediaElementSource(video);gain=audioCtx.createGain();gain.gain.value=extracted?.volume??clip.volume;source.connect(gain).connect(dest)}catch{}}
      await video.play().catch(()=>{});
      while(state.exporting&&video.currentTime<clip.end){drawCover(ctx,video,canvas.width,canvas.height);updateExport((elapsed+video.currentTime-clip.start)/total);await frame()}
      video.pause();try{source?.disconnect();gain?.disconnect()}catch{}
    }
    elapsed+=duration;
  }
  background.forEach(item=>{item.media.pause();try{item.source.disconnect();item.gain.disconnect()}catch{}});
  recorder.stop();await done;audioCtx?.close();
  if(state.exporting){
    const blob=new Blob(chunks,{type:mime||'video/webm'}),url=URL.createObjectURL(blob),anchor=document.createElement('a');
    anchor.href=url;anchor.download=`KreateEdit-${Date.now()}.webm`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),60000);
    updateExport(1);$('export-status').textContent='Exportación completada';toast('Vídeo exportado correctamente');
  }
  state.exporting=false;$('start-export').disabled=false;
}

$('upload-btn').onclick=() => els.fileInput.click();els.dropZone.onclick=()=>els.fileInput.click();els.fileInput.onchange=e=>{handleFiles(e.target.files);e.target.value=''};['dragenter','dragover'].forEach(n=>els.dropZone.addEventListener(n,e=>{e.preventDefault();els.dropZone.classList.add('drag')}));['dragleave','drop'].forEach(n=>els.dropZone.addEventListener(n,e=>{e.preventDefault();els.dropZone.classList.remove('drag');if(n==='drop')handleFiles(e.dataTransfer.files)}));
$('playhead').onpointerdown=startPlayheadDrag;$('timeline-scroll').onpointerdown=e=>{if(e.button!==0||e.target.closest('.timeline-clip,.track-label,.timeline-actions'))return;startPlayheadDrag(e)};
document.querySelectorAll('.source-tab').forEach(b=>b.onclick=()=>{document.querySelectorAll('.source-tab').forEach(x=>x.classList.remove('active'));b.classList.add('active');renderLibrary()});document.querySelectorAll('[data-ratio]').forEach(b=>b.onclick=()=>{checkpoint();state.ratio=b.dataset.ratio;applyRatio()});
$('play-btn').onclick=playSelected;$('prev-btn').onclick=()=>nextClip(-1);$('next-btn').onclick=()=>nextClip(1);$('mute-preview-btn').onclick=()=>{state.previewMuted=!state.previewMuted;const playbackClip=state.clips.find(c=>c.id===state.playbackClipId);els.video.muted=state.previewMuted||!!playbackClip?.muted;$('mute-preview-btn').innerHTML=`<i data-lucide="${state.previewMuted?'volume-x':'volume-2'}"></i>`;refreshIcons()};els.video.ontimeupdate=()=>{if(!state.playing)updatePreviewTime()};
$('trim-start').onchange=e=>updateTrim('start',e.target.value);$('trim-end').onchange=e=>updateTrim('end',e.target.value);$('trim-start-range').onchange=e=>updateTrim('start',e.target.value);$('trim-end-range').onchange=e=>updateTrim('end',e.target.value);$('volume-slider').oninput=e=>{$('volume-label').textContent=`${e.target.value}%`;const c=selectedClip();if(c){c.volume=e.target.value/100;els.video.volume=c.volume;renderTimeline();markSaved()}};$('mute-toggle').onchange=e=>{const c=selectedClip();if(c){checkpoint();c.muted=e.target.checked;els.video.muted=state.previewMuted||c.muted;renderAll()}};$('fade-in').oninput=e=>updateFade('fadeIn',e.target.value);$('fade-out').oninput=e=>updateFade('fadeOut',e.target.value);$('fade-in-range').oninput=e=>updateFade('fadeIn',e.target.value);$('fade-out-range').oninput=e=>updateFade('fadeOut',e.target.value);
$('split-btn').onclick=splitSelected;$('extract-btn').onclick=extractAudio;$('duplicate-btn').onclick=duplicateSelected;$('delete-btn').onclick=deleteSelected;$('undo-btn').onclick=undo;$('redo-btn').onclick=redo;$('project-name').oninput=markSaved;$('timeline-zoom').oninput=e=>{state.pixelsPerSecond=Number(e.target.value);renderTimeline()};$('timeline-zoom-out').onclick=()=>{$('timeline-zoom').value=Math.max(45,Number($('timeline-zoom').value)-10);$('timeline-zoom').dispatchEvent(new Event('input'))};$('timeline-zoom-in').onclick=()=>{$('timeline-zoom').value=Math.min(130,Number($('timeline-zoom').value)+10);$('timeline-zoom').dispatchEvent(new Event('input'))};$('zoom-slider').oninput=e=>{$('zoom-label').textContent=`${e.target.value}%`;els.canvasWrap.style.transform=`scale(${e.target.value/100})`};
$('add-video-track').onclick=addVideoTrack;
$('quick-split-btn').onclick=splitSelected;$('quick-delete-btn').onclick=deleteSelected;$('quick-mute-btn').onclick=()=>{const clip=selectedClip();if(!clip)return toast('Selecciona un clip.');checkpoint();clip.muted=!clip.muted;renderAll()};
$('export-btn').onclick=()=>{$('export-modal').classList.remove('hidden');refreshIcons()};$('close-export').onclick=()=>$('export-modal').classList.add('hidden');$('cancel-export').onclick=()=>{state.exporting=false;$('export-modal').classList.add('hidden')};$('start-export').onclick=()=>exportProjectV2().catch(err=>{state.exporting=false;$('start-export').disabled=false;toast(err.message||'No se pudo exportar')});
$('open-image-studio').onclick=()=>window.open('https://kreateia.com/?page=image&from=kreateedit','_blank','noopener');$('open-video-studio').onclick=()=>window.open('https://kreateia.com/?page=video&from=kreateedit','_blank','noopener');
$('back-to-studio-btn').onclick=()=>window.location.assign('https://kreateia.com/');
$('home-back-btn').onclick=()=>window.location.assign('https://kreateia.com/');$('projects-btn').onclick=showProjectHome;$('photo-projects-btn').onclick=showProjectHome;$('photo-back-btn').onclick=showProjectHome;$('new-project-btn').onclick=openProjectModal;$('close-project-modal').onclick=closeProjectModal;$('cancel-project').onclick=closeProjectModal;$('create-project').onclick=()=>createProject();document.querySelectorAll('[data-project-kind]').forEach(button=>button.onclick=()=>{state.newProjectKind=button.dataset.projectKind;document.querySelectorAll('[data-project-kind]').forEach(item=>item.classList.toggle('active',item===button))});$('new-project-name').onkeydown=event=>{if(event.key==='Enter')createProject()};
$('close-import-project').onclick=closeImportProjectModal;
$('import-new-project').onclick=()=>{const params=new URLSearchParams(location.search),name=String(params.get('name')||'Proyecto KreateIA').replace(/\.[^.]+$/,'');closeImportProjectModal();createProject(name,'video')};
$('mobile-library-btn').onclick=()=>document.querySelector('.library-panel').classList.add('open');$('close-library-mobile').onclick=()=>document.querySelector('.library-panel').classList.remove('open');$('mobile-properties-btn').onclick=()=>document.querySelector('.properties-panel').classList.add('open');$('close-properties-mobile').onclick=()=>document.querySelector('.properties-panel').classList.remove('open');

$('auth-btn').onclick=()=>state.user?signOut(auth):login();
document.addEventListener('keydown',event=>{
  const target=event.target,tag=target?.tagName?.toLowerCase(),textInput=tag==='textarea'||tag==='select'||target?.isContentEditable||(tag==='input'&&!['range','checkbox','button'].includes(target.type));
  if(textInput)return;
  const command=event.metaKey||event.ctrlKey;
  if(event.code==='Space'){event.preventDefault();playSelected();return}
  if(event.key==='Backspace'||event.key==='Delete'){event.preventDefault();deleteSelected();return}
  if(command&&event.key.toLowerCase()==='z'){event.preventDefault();event.shiftKey?redo():undo();return}
  if(command&&event.key.toLowerCase()==='y'){event.preventDefault();redo();return}
  if(command&&event.key.toLowerCase()==='s'){event.preventDefault();saveProject();toast('Proyecto guardado');return}
  if(command&&event.key.toLowerCase()==='d'){event.preventDefault();duplicateSelected();return}
  if(command&&event.key.toLowerCase()==='b'){event.preventDefault();splitSelected();return}
  if(event.key==='ArrowLeft'){event.preventDefault();seekBy(event.shiftKey?-1:-.1);return}
  if(event.key==='ArrowRight'){event.preventDefault();seekBy(event.shiftKey?1:.1)}
});

onAuthStateChanged(auth,user=>{
  const activeUser=user||state.bridgeUser||null;
  state.user=activeUser;
  $('auth-btn').classList.toggle('hidden',!!state.bridgeUser);
  $('auth-btn').innerHTML=user?'<i data-lucide="log-out"></i><span>Salir</span>':'<i data-lucide="log-in"></i><span>Iniciar sesión</span>';
  refreshIcons();if(activeUser)loadCloudWorkspace();else{state.assets=[];state.projects=[];state.clips=[];state.audioTracks=[];state.selectedId=null;state.cloudReady=false;showProjectHome()}
});

readKreateIASession();
window.addEventListener('beforeunload',()=>state.assets.filter(a=>!a.cloud).forEach(a=>URL.revokeObjectURL(a.url)));refreshIcons();renderAll();
