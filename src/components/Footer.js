export function Footer() {
    const footer = document.createElement('footer');
    footer.className = 'w-full bg-[#030303] border-t border-white/5 py-5 px-6 z-40 relative flex-shrink-0';

    footer.innerHTML = `
        <div class="max-w-6xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
            <div class="flex flex-col items-center md:items-start gap-1">
                <div class="flex items-center font-bold tracking-tight text-md opacity-80 hover:opacity-100 transition-opacity cursor-pointer">
                    <span style="background: linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%); -webkit-background-clip: text; color: transparent;">Kreate</span>
                    <span style="background: linear-gradient(135deg, #FF6B00 0%, #FFB000 100%); -webkit-background-clip: text; color: transparent; margin-left: 2px;">IA</span>
                </div>
                <p class="text-white/30 text-[10px]">© ${new Date().getFullYear()} KreateIA Studio. Todos los derechos reservados.</p>
            </div>

            <nav class="flex flex-wrap justify-center gap-x-6 gap-y-2">
                <a href="#" class="text-white/50 hover:text-[#FFB000] text-xs font-medium transition-colors">Servicios a Empresas</a>
                <a href="#" class="text-white/50 hover:text-[#FFB000] text-xs font-medium transition-colors">Preguntas Frecuentes</a>
                <a href="#" class="text-white/50 hover:text-[#FFB000] text-xs font-medium transition-colors">Quiénes Somos</a>
                <a href="#" class="text-white/50 hover:text-[#FFB000] text-xs font-medium transition-colors">Contacto</a>
                <a href="#" class="text-white/50 hover:text-[#FFB000] text-xs font-medium transition-colors">Política de Cookies</a>
            </nav>
        </div>
    `;

    return footer;
}
