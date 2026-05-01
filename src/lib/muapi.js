import { getModelById, getVideoModelById, getI2IModelById, getI2VModelById, getV2VModelById, getLipSyncModelById } from './models.js';
import { auth, db, APP_ID } from './firebase.js';
import { doc, getDoc, updateDoc } from 'firebase/firestore';

// ==========================================
// SISTEMA DE PRECIOS (CRÉDITOS)
// ==========================================
const COST_MAP = {
    'image': 5,          
    'video': 30,         
    'lipsync': 20,       
    'nano-banana-pro': 15 
};

export class MuapiClient {
    constructor() {
        // CORRECCIÓN: Al estar en Cloudflare Pages, usamos la ruta relativa
        // Esto hará que llame a https://tu-dominio.com/api/v1/...
        this.baseUrl = window.location.origin; 
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

            // Restamos los créditos en Firebase
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
        
        // Construimos la URL completa hacia tu Proxy de Cloudflare
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
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(finalPayload)
            });

            if (!response.ok) {
                const errText = await response.text();
                throw new Error(`Error en el servidor: ${response.status}`);
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
        // La URL de consulta también pasa por tu Proxy
        const pollUrl = `${this.baseUrl}/api/v1/predictions/${requestId}/result`;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, interval));
            try {
                const response = await fetch(pollUrl, {
                    method: 'GET',
                    headers: { 'Content-Type': 'application/json' }
                });

                if (!response.ok) {
                    if (response.status >= 500) continue;
                    throw new Error(`Fallo al consultar estado: ${response.status}`);
                }

                const data = await response.json();
                const status = data.status?.toLowerCase();

                if (status === 'completed' || status === 'succeeded' || status === 'success') {
                    return data;
                }
                if (status === 'failed' || status === 'error') {
                    throw new Error(`Generación fallida: ${data.error || 'Error desconocido'}`);
                }
            } catch (error) {
                if (attempt === maxAttempts) throw error;
            }
        }
        throw new Error('Tiempo de espera agotado.');
    }

    // El resto de funciones (generateVideo, uploadFile, etc.) usarán automáticamente this.baseUrl corregido
    async uploadFile(file) {
        const url = `${this.baseUrl}/api/v1/upload_file`;
        const formData = new FormData();
        formData.append('file', file);

        const response = await fetch(url, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) throw new Error(`Fallo al subir archivo: ${response.status}`);
        const data = await response.json();
        const fileUrl = data.url || data.file_url || data.data?.url;
        return fileUrl;
    }
}

export const muapi = new MuapiClient();
