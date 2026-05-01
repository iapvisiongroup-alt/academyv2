import { db, APP_ID } from '../lib/firebase.js';
import { collection, getDocs, doc, updateDoc } from 'firebase/firestore';

export function AdminPanel() {
    const overlay = document.createElement('div');
    overlay.className = 'fixed inset-0 bg-black/95 backdrop-blur-2xl flex items-center justify-center z-[9999] p-4 md:p-8 animate-fade-in';

    const modal = document.createElement('div');
    modal.className = 'w-full max-w-5xl h-[80vh] bg-[#0a0a0a] border border-[#FFB000]/30 rounded-[2rem] shadow-[0_0_80px_rgba(255,176,0,0.15)] relative flex flex-col overflow-hidden';

    modal.innerHTML = `
        <div class="p-6 md:p-8 border-b border-white/10 flex justify-between items-center bg-gradient-to-r from-[#FFB000]/10 to-transparent">
            <div>
                <h2 class="text-2xl font-black text-white flex items-center gap-3">
                    <span class="text-3xl">👑</span> Panel de Control Maestro
                </h2>
                <p class="text-white/50 text-sm mt-1">Gestión total de usuarios y créditos de KreateIA</p>
            </div>
            <button id="close-admin-btn" class="text-white/30 hover:text-white p-2 transition-colors bg-white/5 rounded-xl">
                <svg width="24" height="24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 18L18 6M6 6l12 12"></path></svg>
            </button>
        </div>

        <div class="flex-grow overflow-auto p-6 md:p-8">
            <div class="bg-white/5 border border-white/10 rounded-2xl overflow-hidden">
                <table class="w-full text-left text-sm text-white/70">
                    <thead class="bg-white/5 text-white font-bold uppercase text-xs tracking-wider">
                        <tr>
                            <th class="px-6 py-4">Usuario (Email)</th>
                            <th class="px-6 py-4">Rol</th>
                            <th class="px-6 py-4">Créditos Actuales</th>
                            <th class="px-6 py-4 text-right">Acciones Rápidas</th>
                        </tr>
                    </thead>
                    <tbody id="users-table-body" class="divide-y divide-white/5">
                        <tr>
                            <td colspan="4" class="px-6 py-8 text-center text-white/50 animate-pulse">
                                Cargando base de datos de usuarios...
                            </td>
                        </tr>
                    </tbody>
                </table>
            </div>
        </div>
    `;

    const tbody = modal.querySelector('#users-table-body');

    // Función para cargar todos los usuarios de Firebase
    const loadUsers = async () => {
        try {
            const usersRef = collection(db, 'artifacts', APP_ID, 'public', 'data', 'users');
            const snapshot = await getDocs(usersRef);
            
            tbody.innerHTML = ''; // Limpiamos el mensaje de carga

            if (snapshot.empty) {
                tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center">No hay usuarios registrados aún.</td></tr>`;
                return;
            }

            snapshot.forEach(docSnap => {
                const data = docSnap.data();
                const uid = docSnap.id;
                const email = data.email || 'Sin Email';
                const credits = data.credits || 0;
                const role = data.role || 'user';

                const tr = document.createElement('tr');
                tr.className = 'hover:bg-white/5 transition-colors group';
                
                tr.innerHTML = `
                    <td class="px-6 py-4 font-mono text-white">${email}</td>
                    <td class="px-6 py-4">
                        <span class="px-2 py-1 rounded-md text-[10px] font-bold uppercase tracking-widest ${role === 'admin' ? 'bg-[#FFB000]/20 text-[#FFB000]' : 'bg-blue-500/20 text-blue-400'}">
                            ${role}
                        </span>
                    </td>
                    <td class="px-6 py-4">
                        <div class="flex items-center gap-2">
                            <span class="text-xl font-black text-white" id="credit-display-${uid}">${credits}</span>
                            <span class="text-[#FFB000] text-xs font-bold">CR</span>
                        </div>
                    </td>
                    <td class="px-6 py-4 text-right">
                        <div class="flex justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                            <button class="bg-red-500/20 text-red-400 hover:bg-red-500 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors" onclick="window.updateCredits('${uid}', -50)">-50</button>
                            <button class="bg-green-500/20 text-green-400 hover:bg-green-500 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors" onclick="window.updateCredits('${uid}', 50)">+50</button>
                            <button class="bg-blue-500/20 text-blue-400 hover:bg-blue-500 hover:text-white px-3 py-1.5 rounded-lg font-bold text-xs transition-colors" onclick="window.setCustomCredits('${uid}', '${email}')">Editar</button>
                        </div>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        } catch (error) {
            console.error("Error cargando usuarios:", error);
            tbody.innerHTML = `<tr><td colspan="4" class="px-6 py-8 text-center text-red-400">Error de permisos. Asegúrate de que las reglas de Firestore permiten leer la base de datos.</td></tr>`;
        }
    };

    // Funciones globales temporales para los botones de la tabla
    window.updateCredits = async (uid, amount) => {
        try {
            const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', uid);
            // Primero leemos los créditos actuales
            const snap = await getDocs(collection(db, 'artifacts', APP_ID, 'public', 'data', 'users'));
            let currentCredits = 0;
            snap.forEach(d => { if(d.id === uid) currentCredits = d.data().credits || 0; });
            
            const newCredits = Math.max(0, currentCredits + amount); // Evitamos créditos negativos
            await updateDoc(userRef, { credits: newCredits });
            
            // Actualizamos el número en la tabla visualmente sin recargar todo
            document.getElementById(`credit-display-${uid}`).textContent = newCredits;
        } catch (error) {
            alert("Error al actualizar créditos.");
            console.error(error);
        }
    };

    window.setCustomCredits = async (uid, email) => {
        const input = prompt(`¿Cuántos créditos quieres asignarle exactamente a ${email}?`);
        if (input !== null && input !== "" && !isNaN(input)) {
            try {
                const newCredits = parseInt(input);
                const userRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'users', uid);
                await updateDoc(userRef, { credits: newCredits });
                document.getElementById(`credit-display-${uid}`).textContent = newCredits;
            } catch (error) {
                alert("Error al guardar.");
            }
        }
    };

    modal.querySelector('#close-admin-btn').onclick = () => document.body.removeChild(overlay);

    // Cargar los datos al abrir
    loadUsers();

    overlay.appendChild(modal);
    return overlay;
}
