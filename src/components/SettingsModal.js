import { auth } from '../lib/firebase.js';
import { signOut } from 'firebase/auth';

export function SettingsModal() {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/90 backdrop-blur-xl flex items-center justify-center z-[9999] p-4 animate-fade-in';

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-[420px] bg-[#0a0a0a] border border-white/10 rounded-[2.5rem] p-10 shadow-[0_0_80px_rgba(0,0,0,0.8)] relative';

    // Obtenemos los datos del usuario actual
    const user = auth.currentUser;
    const userEmail = user ? user.email : 'Usuario';
    const initial = userEmail.charAt(0).toUpperCase();

    modal.innerHTML = `
        <div class="flex justify-center mb-6">
            <div class="w-20 h-20 bg-gradient-to-tr from-[#3B82F6] to-[#FFB000] rounded-full flex items-center justify-center text-black font-black text-3xl uppercase shadow-[0_0_30px_rgba(255,176,0,0.3)]">
                ${initial}
            </div>
        </div>
        <h2 class="text-2xl font-bold text-center text-white mb-2">Mi Perfil</h2>
        <p class="text-center text-white/50 mb-8">${userEmail}</p>

        <button id="logout-btn" class="w-full bg-red-500/10 hover:bg-red-500/20 text-red-500 border border-red-500/20 font-bold rounded-2xl px-4 py-4 transition-all flex items-center justify-center mb-4">
            <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"></path></svg>
            Cerrar Sesión
        </button>
        <button id="close-modal-btn" class="w-full text-white/50 hover:text-white font-bold rounded-2xl px-4 py-3 transition-colors text-sm">
            Cerrar ventana
        </button>
    `;

    const closeBtn = modal.querySelector('#close-modal-btn');
    closeBtn.onclick = () => {
        document.body.removeChild(overlay);
    };

    const logoutBtn = modal.querySelector('#logout-btn');
    logoutBtn.onclick = async () => {
        try {
            // Le decimos a Firebase que cierre la sesión
            await signOut(auth);
            // Cerramos la ventana modal
            document.body.removeChild(overlay);
            
            // ¡OJO A LA MAGIA! No hace falta que programemos que desaparezca tu avatar arriba a la derecha. 
            // Como en Header.js pusimos el "onAuthStateChanged", al lanzar el signOut, 
            // la web detectará el cambio y pondrá sola el botón de "Iniciar Sesión" otra vez.
        } catch (error) {
            console.error("Error al cerrar sesión:", error);
        }
    };

    overlay.appendChild(modal);
    return overlay;
}
