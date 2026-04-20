import { getModelById, getVideoModelById, getI2IModelById, getI2VModelById, getV2VModelById, getLipSyncModelById } from './models.js';
import { auth, db, APP_ID } from './firebase.js';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// ==========================================
// CONFIGURACIÓN MAESTRA DE KREATEIA
// ==========================================
// ⚠️ ESTA ES TU CLAVE PRIVADA DE MUAPI (O DE LA API QUE USES).
// En un entorno de producción estricto, esta clave no debería estar en el frontend,
// sino que tu frontend llamaría a tu backend (ej. Cloudflare Workers) y este a Muapi.
// Para esta fase, la usaremos directamente aquí para que funcione de inmediato.
const MASTER_API_KEY = "PON_AQUI_TU_CLAVE_SECRETA_DE_MUAPI"; 

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
        this.baseUrl = import.meta.env.DEV ? '' : 'https://api.muapi.ai';
    }

    /**
     * Valida que el usuario tenga sesión iniciada, tenga suficientes créditos
     * y le descuenta el coste de la acción. Si todo es correcto, devuelve true.
     */
    async chargeCredits(actionType, modelId = null) {
        const user = auth.currentUser;
        if (!user) {
            throw new Error("Debes iniciar sesión para generar contenido.");
        }

        // Si es el modo cine, usamos su coste específico
        let cost = COST_MAP[actionType] || 10;
        if (modelId === 'nano-banana-pro') {
            cost = COST_MAP['nano-banana-pro'];
        }

        try {
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', user.uid);
            const userSnap = await getDoc(userRef);

            if (!userSnap.exists()) {
                throw new Error("Perfil de usuario no encontrado.");
            }

            const currentCredits = userSnap.data().credits || 0;
            const isAdmin = userSnap.data().role === 'admin';

            // Los admins tienen créditos infinitos (o no se les bloquea)
            if (!isAdmin && currentCredits < cost) {
                throw new Error(`Créditos insuficientes. Necesitas ${cost} CR, pero tienes ${currentCredits} CR.`);
            }

            // Descontar créditos (incluso al admin para que vea el gasto, aunque no se le bloquee)
            await updateDoc(userRef, {
                credits: Math.max(0, currentCredits - cost)
            });

            console.log(`[KreateIA Billing] Cobrados ${cost} CR. Saldo restante: ${Math.max(0, currentCredits - cost)} CR`);
            return true;

        } catch (error) {
            console.error("[KreateIA Billing Error]", error);
            throw error;
        }
    }

    // Ya no necesitamos getKey() del usuario. Usamos la MASTER_API_KEY.
    getKey() {
        if (!MASTER_API_KEY || MASTER_API_KEY === "PON_AQUI_TU_CLAVE_SECRETA_DE_MUAPI") {
            console.warn("⚠️ ALERTA: No has configurado tu MASTER_API_KEY en muapi.js");
            // Fallback temporal al localStorage por si estás probando
            return localStorage.getItem('muapi_key') || ''; 
        }
        return MASTER_API_KEY;
    }

    /**
     * Generates an image (Text-to-Image or Image-to-Image)
     */
    async generateImage(params) {
        // 1. COBRO DE CRÉDITOS ANTES DE HACER NADA
        await this.chargeCredits('image', params.model);

        const key = this.getKey();
        if (!key) throw new Error("Falta la clave maestra de la API.");

        const modelInfo = getModelById(params.model) || { endpoint: params.model };
        // Excepción para el modo cine que usa nano-banana-pro
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

        console.log('[Muapi] Requesting:', url);

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': key
                },
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

            const result = await this.pollForResult(requestId, key);
            const imageUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: imageUrl };

        } catch (error) {
            console.error("Muapi Client Error:", error);
            throw error;
        }
    }

    /**
     * Polls the predictions endpoint
     */
    async pollForResult(requestId, key, maxAttempts = 60, interval = 2000) {
        const pollUrl = `${this.baseUrl}/api/v1/predictions/${requestId}/result`;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, interval));
            try {
                const response = await fetch(pollUrl, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json', 'x-api-key': key }
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
        const key = this.getKey();

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
                headers: { 'Content-Type': 'application/json', 'x-api-key': key },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId, key, 900, 2000);
            const videoUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: videoUrl };
        } catch (error) {
            throw error;
        }
    }

    async generateI2I(params) {
        await this.chargeCredits('image');
        const key = this.getKey();
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
                headers: { 'Content-Type': 'application/json', 'x-api-key': key },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId, key);
            const imageUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: imageUrl };
        } catch (error) {
            throw error;
        }
    }

    async generateI2V(params) {
        await this.chargeCredits('video');
        const key = this.getKey();
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
                headers: { 'Content-Type': 'application/json', 'x-api-key': key },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId, key, 900, 2000);
            const videoUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: videoUrl };
        } catch (error) {
            throw error;
        }
    }

    async uploadFile(file) {
        const key = this.getKey();
        const url = `${this.baseUrl}/api/v1/upload_file`;
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'x-api-key': key },
            body: formData
        });

        if (!response.ok) throw new Error(`File upload failed: ${response.status}`);
        const data = await response.json();
        const fileUrl = data.url || data.file_url || data.data?.url;
        if (!fileUrl) throw new Error('No URL returned from file upload');
        return fileUrl;
    }

    async processV2V(params) {
        await this.chargeCredits('video');
        const key = this.getKey();
        const modelInfo = getV2VModelById(params.model);
        const endpoint = modelInfo?.endpoint || params.model;
        const url = `${this.baseUrl}/api/v1/${endpoint}`;

        const videoField = modelInfo?.videoField || 'video_url';
        const finalPayload = { [videoField]: params.video_url };

        try {
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'x-api-key': key },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId, key, 900, 2000);
            const videoUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: videoUrl };
        } catch (error) {
            throw error;
        }
    }

    async processLipSync(params) {
        await this.chargeCredits('lipsync');
        const key = this.getKey();
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
                headers: { 'Content-Type': 'application/json', 'x-api-key': key },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) throw new Error(`API Request Failed: ${response.status}`);
            const submitData = await response.json();
            const requestId = submitData.request_id || submitData.id;
            
            if (!requestId) return submitData;
            if (params.onRequestId) params.onRequestId(requestId);

            const result = await this.pollForResult(requestId, key, 900, 2000);
            const videoUrl = result.outputs?.[0] || result.url || result.output?.url;
            return { ...result, url: videoUrl };
        } catch (error) {
            throw error;
        }
    }
}

export const muapi = new MuapiClient();
