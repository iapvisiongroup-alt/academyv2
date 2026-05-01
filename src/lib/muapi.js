import { getModelById, getVideoModelById, getI2IModelById, getI2VModelById, getV2VModelById, getLipSyncModelById } from './models.js';
import { auth, db, APP_ID } from './firebase.js';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// ==========================================
// SISTEMA DE PRECIOS (CRÉDITOS)
// ==========================================
const COST_MAP = {
    'image': 5,          // Crear una imagen = 5 créditos
    'video': 30,         // Crear un vídeo = 30 créditos
    'lipsync': 20,       // Hacer LipSync = 20 créditos
    'nano-banana-pro': 15 // Modo cine = 15 créditos
};

export class MuapiClient {
    constructor() {
        // En lugar de apuntar a muapi.ai, apuntamos a nuestro propio dominio.
        // Las peticiones irán a nuestra Cloudflare Function.
        this.baseUrl = ''; 
    }

    async chargeCredits(actionType, modelId = null) {
        const user = auth.currentUser;
        if (!user) throw new Error("Debes iniciar sesión para generar contenido.");

        let cost = COST_MAP[actionType] || 10;
        if (modelId === 'nano-banana-pro') cost = COST_MAP['nano-banana-pro'];

        try {
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) throw new Error("Perfil de usuario no encontrado.");

            const currentCredits = userSnap.data().credits || 0;
            const isAdmin = userSnap.data().role === 'admin';

            if (!isAdmin && currentCredits < cost) {
                throw new Error(`Créditos insuficientes. Necesitas ${cost} CR, pero tienes ${currentCredits} CR.`);
            }

            await updateDoc(userRef, {
                credits: Math.max(0, currentCredits - cost)
            });

            console.log(`[KreateIA Billing] Cobrados ${cost} CR. Saldo: ${Math.max(0, currentCredits - cost)} CR`);
            return true;

        } catch (error) {
            console.error("[KreateIA Billing Error]", error);
            throw error;
        }
    }

    async generateImage(params) {
        await this.chargeCredits('image', params.model);

        const modelInfo = getModelById(params.model) || { endpoint: params.model };
        const endpoint = params.model === 'nano-banana-pro' ? 'nano-banana-pro' : (modelInfo?.endpoint || params.model);
        const url = `${this.baseUrl}/api/v1/${endpoint}`;

        const finalPayload = { prompt: params.prompt };
        if (params.aspect_ratio) finalPayload.aspect_ratio = params.aspect_ratio;
        if (params.resolution) finalPayload.resolution = params.resolution;
        if (params.quality) finalPayload.quality = params.quality;
        if (params.negative_prompt) finalPayload.negative_prompt = params.negative_prompt;
        if (params.image_url) {
            finalPayload.image_url = params.image_url;
            finalPayload.strength = params.strength || 0.6;
        }
        if (params.seed && params.seed !== -1) finalPayload.seed = params.seed;

        try {
            // FÍJATE: Ya no mandamos el 'x-api-key' aquí. Cloudflare se lo pondrá.
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`API Request Failed: ${response.status} - ${errText.slice(0, 100)}`);
            }

            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId);
            const imageUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: imageUrl };

        } catch (error) {
            throw error;
        }
    }

    async pollForResult(requestId, maxAttempts = 60, interval = 2000) {
        const pollUrl = `${this.baseUrl}/api/v1/predictions/${requestId}/result`;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, interval));
            try {
                // FÍJATE: Tampoco mandamos el 'x-api-key' en el polling.
                const response = await fetch(pollUrl, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    if (response.status >= 500) continue;
                    throw new Error(`Poll Failed: ${response.status}`);
                }

                const data = await response.json();
                const status = data.status?.toLowerCase();

                if (status === 'completed' || status === 'succeeded' || status === 'success') {
                    return data;
                }
                if (status === 'failed' || status === 'error') {
                    throw new Error(`Generation failed: ${data.error || 'Unknown error'}`);
                }
            } catch (error) {
                if (attempt === maxAttempts) throw error;
            }
        }
        throw new Error('Generation timed out after polling.');
    }

    async generateVideo(params) {
        await this.chargeCredits('video');
        const modelInfo = getVideoModelById(params.model);
        const endpoint = modelInfo?.endpoint || params.model;
        const url = `${this.baseUrl}/api/v1/${endpoint}`;

        const finalPayload = {};
        if (params.prompt) finalPayload.prompt = params.prompt;
        if (params.request_id) finalPayload.request_id = params.request_id;
        if (params.aspect_ratio) finalPayload.aspect_ratio = params.aspect_ratio;
        if (params.duration) finalPayload.duration = params.duration;
        if (params.resolution) finalPayload.resolution = params.resolution;
        if (params.quality) finalPayload.quality = params.quality;
        if (params.mode) finalPayload.mode = params.mode;
        if (params.image_url) finalPayload.image_url = params.image_url;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId, 900, 2000);
            const videoUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: videoUrl };
        } catch (error) {
            throw error;
        }
    }

    async generateI2I(params) {
        await this.chargeCredits('image');
        const modelInfo = getI2IModelById(params.model);
        const endpoint = modelInfo?.endpoint || params.model;
        const url = `${this.baseUrl}/api/v1/${endpoint}`;

        const finalPayload = { prompt: params.prompt || '' };
        const imageField = modelInfo?.imageField || 'image_url';
        const imagesList = params.images_list?.length > 0 ? params.images_list : (params.image_url ? [params.image_url] : null);
        
        if (imagesList) {
            if (imageField === 'images_list') finalPayload.images_list = imagesList;
            else finalPayload[imageField] = imagesList[0];
        }

        if (params.aspect_ratio) finalPayload.aspect_ratio = params.aspect_ratio;
        if (params.resolution) finalPayload.resolution = params.resolution;
        if (params.quality) finalPayload.quality = params.quality;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId);
            const imageUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: imageUrl };
        } catch (error) {
            throw error;
        }
    }

    async generateI2V(params) {
        await this.chargeCredits('video');
        const modelInfo = getI2VModelById(params.model);
        const endpoint = modelInfo?.endpoint || params.model;
        const url = `${this.baseUrl}/api/v1/${endpoint}`;

        const finalPayload = {};
        if (params.prompt) finalPayload.prompt = params.prompt;

        const imageField = modelInfo?.imageField || 'image_url';
        if (params.image_url) {
            if (imageField === 'images_list') finalPayload.images_list = [params.image_url];
            else finalPayload[imageField] = params.image_url;
        }

        if (params.aspect_ratio) finalPayload.aspect_ratio = params.aspect_ratio;
        if (params.duration) finalPayload.duration = params.duration;
        if (params.resolution) finalPayload.resolution = params.resolution;
        if (params.quality) finalPayload.quality = params.quality;
        if (params.mode) finalPayload.mode = params.mode;
        if (params.name) finalPayload.name = params.name;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId, 900, 2000);
            const videoUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: videoUrl };
        } catch (error) {
            throw error;
        }
    }

    async uploadFile(file) {
        const url = `${this.baseUrl}/api/v1/upload_file`;
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(url, {
            method: 'POST',
            body: formData
            // Cloudflare interceptará esto y añadirá el header
        });

        if (!response.ok) throw new Error(`File upload failed: ${response.status}`);
        const data = await response.json();
        const fileUrl = data.url || data.file_url || data.data?.url;
        if (!fileUrl) throw new Error('No URL returned from file upload');
        return fileUrl;
    }

    async processV2V(params) {
        await this.chargeCredits('video');
        const modelInfo = getV2VModelById(params.model);
        const endpoint = modelInfo?.endpoint || params.model;
        const url = `${this.baseUrl}/api/v1/${endpoint}`;

        const videoField = modelInfo?.videoField || 'video_url';
        const finalPayload = { [videoField]: params.video_url };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId, 900, 2000);
            const videoUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: videoUrl };
        } catch (error) {
            throw error;
        }
    }

    async processLipSync(params) {
        await this.chargeCredits('lipsync');
        const modelInfo = getLipSyncModelById(params.model);
        const endpoint = modelInfo?.endpoint || params.model;
        const url = `${this.baseUrl}/api/v1/${endpoint}`;

        const finalPayload = {};
        if (params.audio_url) finalPayload.audio_url = params.audio_url;
        if (params.image_url) finalPayload.image_url = params.image_url;
        if (params.video_url) finalPayload.video_url = params.video_url;
        if (params.prompt) finalPayload.prompt = params.prompt;
        if (params.resolution) finalPayload.resolution = params.resolution;
        if (params.seed !== undefined && params.seed !== -1) finalPayload.seed = params.seed;

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId, 900, 2000);
            const videoUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: videoUrl };
        } catch (error) {
            throw error;
        }
    }
}

export const muapi = new MuapiClient();
