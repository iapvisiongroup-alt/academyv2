'use client';

import { useState, useEffect, useCallback } from 'react';
import { ImageStudio, VideoStudio, LipSyncStudio, CinemaStudio, getUserBalance } from 'studio';
import ApiKeyModal from './ApiKeyModal';

const TABS = [
  { id: 'image',   label: 'Estudio de Imagen' },
  { id: 'video',   label: 'Estudio de Vídeo' },
  { id: 'lipsync', label: 'Lip Sync' },
  { id: 'cinema',  label: 'Modo Cine' },
];

const STORAGE_KEY = 'muapi_key';

export default function StandaloneShell() {
  const [apiKey, setApiKey] = useState(null);
  const [activeTab, setActiveTab] = useState('image');
  const [balance, setBalance] = useState(null);
  const [showSettings, setShowSettings] = useState(false);
  const [hasMounted, setHasMounted] = useState(false);

  const fetchBalance = useCallback(async (key) => {
    try {
      const data = await getUserBalance(key);
      setBalance(data.balance);
    } catch (err) {
      console.error('Balance fetch failed:', err);
    }
  }, []);

  useEffect(() => {
    setHasMounted(true);
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      setApiKey(stored);
      fetchBalance(stored);
    }
  }, [fetchBalance]);

  const handleKeySave = useCallback((key) => {
    localStorage.setItem(STORAGE_KEY, key);
    setApiKey(key);
    fetchBalance(key);
  }, [fetchBalance]);

  const handleKeyChange = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setApiKey(null);
    setBalance(null);
  }, []);

  // Poll for balance every 30 seconds if key is present
  useEffect(() => {
    if (!apiKey) return;
    const interval = setInterval(() => fetchBalance(apiKey), 30000);
    return () => clearInterval(interval);
  }, [apiKey, fetchBalance]);

  if (!hasMounted) return (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center">
      <div className="animate-spin text-[#FFB000] text-3xl">◌</div>
    </div>
  );

  if (!apiKey) {
    return <ApiKeyModal onSave={handleKeySave} />;
  }

  return (
    <div className="h-screen bg-[#030303] flex flex-col overflow-hidden text-white">
      {/* Header */}
      <header className="flex-shrink-0 h-14 border-b border-white/[0.03] flex items-center justify-between px-6 bg-black/20 backdrop-blur-md z-40">
        {/* Left: Logo KreateIA */}
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center drop-shadow-[0_0_10px_rgba(59,130,246,0.3)]">
            <svg viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full">
              <circle cx="50" cy="50" r="40" stroke="white" strokeWidth="2" strokeDasharray="15 10" className="opacity-20" />
              <circle cx="50" cy="50" r="12" fill="white" />
              <circle cx="80" cy="50" r="6" fill="#FFB000">
                <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
              </circle>
              <path d="M20 50C20 33.4315 33.4315 20 50 20C66.5685 20 80 33.4315 80 50" stroke="#3B82F6" strokeWidth="6" strokeLinecap="round" />
              <path d="M80 50C80 66.5685 66.5685 80 50 80C33.4315 80 20 66.5685 20 50" stroke="#FF6B00" strokeWidth="6" strokeLinecap="round" />
            </svg>
          </div>
          <div className="hidden sm:flex items-center font-bold tracking-tight text-lg">
            <span style={{ background: 'linear-gradient(135deg, #60A5FA 0%, #3B82F6 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}>Kreate</span>
            <span style={{ background: 'linear-gradient(135deg, #FF6B00 0%, #FFB000 100%)', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent', marginLeft: '2px' }}>IA</span>
            <span className="ml-2 text-white/50 font-medium text-sm">Studio</span>
          </div>
        </div>

        {/* Center: Navigation */}
        <nav className="absolute left-1/2 -translate-x-1/2 flex items-center gap-6">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`relative py-4 text-[13px] font-medium transition-all whitespace-nowrap px-1 ${
                activeTab === tab.id
                  ? 'text-[#FFB000]'
                  : 'text-white/50 hover:text-white'
              }`}
            >
              {tab.label}
              {activeTab === tab.id && (
                <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-[#FFB000] shadow-[0_-2px_10px_rgba(255,176,0,0.5)] rounded-full" />
              )}
            </button>
          ))}
        </nav>

        {/* Right: Actions */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-white/5 px-3 py-1.5 rounded-full border border-white/5 transition-colors">
            <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
            <div className="flex flex-col">
              <span className="text-xs font-bold text-white/90">
                ${balance !== null ? `${balance}` : '---'}
              </span>
            </div>
          </div>

          <div 
            onClick={() => setShowSettings(true)}
            className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#3B82F6] to-[#FFB000] border border-white/20 cursor-pointer hover:scale-105 transition-transform" 
          />
        </div>
      </header>

      {/* Studio Content */}
      <div className="flex-1">
        {activeTab === 'image'   && <ImageStudio   apiKey={apiKey} />}
        {activeTab === 'video'   && <VideoStudio   apiKey={apiKey} />}
        {activeTab === 'lipsync' && <LipSyncStudio apiKey={apiKey} />}
        {activeTab === 'cinema'  && <CinemaStudio  apiKey={apiKey} />}
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 animate-fade-in-up">
          <div className="bg-[#0a0a0a] border border-white/10 rounded-xl p-8 w-full max-w-sm shadow-2xl">
            <h2 className="text-white font-bold text-lg mb-2">Ajustes</h2>
            <p className="text-white/40 text-[13px] mb-8">
              Gestiona tus preferencias de KreateIA Studio y tu clave de acceso.
            </p>
            
            <div className="space-y-4 mb-8">
              <div className="bg-white/5 border border-white/[0.03] rounded-md p-4">
                <label className="block text-xs font-bold text-white/30 mb-2">
                  Clave API Activa (Muapi)
                </label>
                <div className="text-[13px] font-mono text-white/80">
                  {apiKey.slice(0, 8)}••••••••••••••••
                </div>
              </div>
            </div>

            <div className="flex gap-3">
              <button
                onClick={handleKeyChange}
                className="flex-1 h-10 rounded-md bg-red-500/10 text-red-400 hover:bg-red-500/20 text-xs font-semibold transition-all"
              >
                Cambiar Clave
              </button>
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 h-10 rounded-md bg-[#FFB000]/10 text-[#FFB000] hover:bg-[#FFB000]/20 text-xs font-semibold transition-all border border-[#FFB000]/20"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
