import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyDVD2Sbu7nVbFfVkgujMcgOC_S0oDla-zQ",
  authDomain: "appacademy-fc66d.firebaseapp.com",
  projectId: "appacademy-fc66d",
  storageBucket: "appacademy-fc66d.firebasestorage.app",
  messagingSenderId: "179709280377",
  appId: "1:179709280377:web:debe06ba04244955a454a8",
  measurementId: "G-1K888B2MWR"
};

// Inicializamos la app
const app = initializeApp(firebaseConfig);

// Exportamos los servicios para usarlos en toda la web
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

// Constantes de tu negocio
export const APP_ID = "appiapvision";
export const ADMIN_EMAIL = "info@iapvision.com";
