'use client';

import { useState, useRef, useEffect } from 'react';

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Choose...',
  hasError = false,
  className = '',
  id,
  'data-error': dataError,
}: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
  hasError?: boolean;
  className?: string;
  id?: string;
  'data-error'?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedOption = options.find(o => o.value === value);

  return (
    <div className={`relative w-full ${open ? 'z-[100]' : 'z-10'} ${className}`} ref={containerRef}>
      <button
        type="button"
        id={id}
        data-error={dataError}
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center justify-between text-left focus:outline-none bg-transparent appearance-none font-medium text-base py-0.5 ${value ? 'text-foreground' : 'text-muted'}`}
        style={{ fontSize: '16px' }}
      >
        <span className="truncate leading-none py-1">{selectedOption ? selectedOption.label : placeholder}</span>
        <svg className={`w-4 h-4 ml-2 transition-transform duration-200 text-muted ${open ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7"/>
        </svg>
      </button>
      
      {open && (
        <div 
          className="absolute z-50 w-[calc(100%+2rem)] -left-4 mt-3 rounded-[1.2rem] overflow-hidden"
          style={{ 
            background: 'rgba(15,5,35,0.5)', 
            backdropFilter: 'blur(40px) saturate(220%) brightness(110%)', 
            WebkitBackdropFilter: 'blur(40px) saturate(220%) brightness(110%)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 1px 0 rgba(255,255,255,0.2) inset, 0 -1px 0 rgba(0,0,0,0.1) inset, 0 12px 40px rgba(0,0,0,0.4), 0 0 0 0.5px rgba(255,255,255,0.05) inset'
          }}
        >
          {/* Liquid glass specular highlight */}
          <div className="absolute inset-0 pointer-events-none z-0" style={{
            background: 'linear-gradient(135deg, rgba(255,255,255,0.15) 0%, rgba(255,255,255,0.03) 35%, transparent 60%, rgba(0,0,0,0.2) 100%)'
          }} />
          
          <ul className="relative z-10 max-h-60 overflow-y-auto py-2 custom-scrollbar">
            {options.map((opt) => (
              <li
                key={opt.value}
                onClick={() => { onChange(opt.value); setOpen(false); }}
                className={`px-5 py-3 text-base cursor-pointer transition-colors active:bg-white/10 ${
                  value === opt.value 
                    ? 'bg-primary/25 text-white font-bold border-l-2 border-primary' 
                    : 'text-white/80 hover:bg-white/10 hover:text-white border-l-2 border-transparent'
                }`}
              >
                {opt.label}
              </li>
            ))}
            {options.length === 0 && (
              <li className="px-5 py-3 text-base text-white/50">No options available</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
