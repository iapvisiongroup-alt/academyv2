import React from 'react';

export const KreateCoreIcon = ({ className = "w-10 h-10" }) => (
  <svg viewBox="0 0 100 100" className={className} fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="50" cy="50" r="40" stroke="currentColor" strokeWidth="2" strokeDasharray="15 10" className="opacity-20" />
    <circle cx="50" cy="50" r="12" fill="currentColor" />
    <circle cx="80" cy="50" r="6" fill="#FFB000">
      <animate attributeName="opacity" values="1;0.4;1" dur="2s" repeatCount="indefinite" />
    </circle>
    <path d="M20 50C20 33.4315 33.4315 20 50 20C66.5685 20 80 33.4315 80 50" stroke="#3B82F6" strokeWidth="6" strokeLinecap="round" />
    <path d="M80 50C80 66.5685 66.5685 80 50 80C33.4315 80 20 66.5685 20 50" stroke="#FF6B00" strokeWidth="6" strokeLinecap="round" />
  </svg>
);

export const KreateIALogo = ({ className = "text-2xl" }) => (
  <div className={`inline-flex items-center font-bold tracking-tight ${className}`}>
    <span className="text-grad-kreate">Kreate</span>
    <span className="text-grad-ia ml-1">IA</span>
  </div>
);
