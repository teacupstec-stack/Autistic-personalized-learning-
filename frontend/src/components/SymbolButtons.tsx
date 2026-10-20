import React, { useEffect, useState, useCallback } from 'react';
import { CORE_SYMBOLS } from '../constants/symbols';
import type { PictureSymbol, IntentMessage } from '../types';
import { 
  HelpCircle, 
  Coffee, 
  CheckCircle2, 
  ThumbsUp, 
  ThumbsDown, 
  Volume2, 
  VolumeX, 
  ShieldCheck 
} from 'lucide-react';

interface Props {
  onSelectSymbol: (symbol: PictureSymbol) => void;
  lastConfirmedIntent: IntentMessage | null;
  lastConfirmedSource?: string;
}

export const SymbolButtons: React.FC<Props> = ({ 
  onSelectSymbol, 
  lastConfirmedIntent,
}) => {
  const [audioFeedback, setAudioFeedback] = useState<boolean>(false);

  const speak = useCallback((text: string) => {
    if (!audioFeedback) return;
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 0.95; // slightly slower for clear comprehension
      utterance.pitch = 1.0;
      window.speechSynthesis.speak(utterance);
    }
  }, [audioFeedback]);

  const handleSelect = useCallback((symbol: PictureSymbol) => {
    speak(symbol.label);
    onSelectSymbol(symbol);
  }, [speak, onSelectSymbol]);

  // Keyboard shortcut listener: keys 1 to 5
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input or textarea
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }
      const matched = CORE_SYMBOLS.find(s => s.keyboardShortcut === e.key);
      if (matched) {
        e.preventDefault();
        handleSelect(matched);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSelect]);

  const renderIcon = (name: string, color: string) => {
    const props = { size: 36, color };
    switch (name) {
      case 'HelpCircle':
        return <HelpCircle {...props} />;
      case 'Coffee':
        return <Coffee {...props} />;
      case 'CheckCircle2':
        return <CheckCircle2 {...props} />;
      case 'ThumbsUp':
        return <ThumbsUp {...props} />;
      case 'ThumbsDown':
        return <ThumbsDown {...props} />;
      default:
        return <HelpCircle {...props} />;
    }
  };

  return (
    <section 
      id="symbol-communication-section" 
      className="glass-panel" 
      aria-labelledby="symbol-section-title"
    >
      <div className="panel-header">
        <div>
          <h2 id="symbol-section-title" className="panel-title">
            <ShieldCheck size={22} color="#10B981" />
            <span>What would you like to say?</span>
          </h2>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Tap a picture. You can use these any time.
          </span>
        </div>

        <button
          id="btn-toggle-speech"
          className="btn btn-secondary"
          onClick={() => setAudioFeedback(prev => !prev)}
          title={audioFeedback ? 'Mute spoken announcements' : 'Enable spoken announcements'}
          aria-label={audioFeedback ? 'Speech output is on' : 'Speech output is off'}
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8125rem' }}
        >
          {audioFeedback ? <Volume2 size={15} color="#38BDF8" /> : <VolumeX size={15} />}
          <span>{audioFeedback ? 'Speech On' : 'Speech Muted'}</span>
        </button>
      </div>

      {/* 5 Large Communication Buttons */}
      <div className="symbol-grid" role="group" aria-label="Five core communication symbols">
        {CORE_SYMBOLS.map((symbol) => {
          const isRecentlySelected = lastConfirmedIntent === symbol.intent;
          return (
            <button
              key={symbol.id}
              id={`symbol-btn-${symbol.intent.toLowerCase()}`}
              className="symbol-card"
              style={{
                backgroundColor: symbol.colorTheme.bg,
                borderColor: isRecentlySelected ? '#38BDF8' : symbol.colorTheme.border,
                color: symbol.colorTheme.text,
                boxShadow: isRecentlySelected ? '0 0 16px rgba(56, 189, 248, 0.4)' : undefined,
                transform: isRecentlySelected ? 'scale(1.02)' : undefined,
              }}
              onClick={() => handleSelect(symbol)}
              aria-label={`Select communication symbol: ${symbol.label}. Press key ${symbol.keyboardShortcut}.`}
            >
              <span className="symbol-shortcut" aria-hidden="true">
                [{symbol.keyboardShortcut}]
              </span>
              <div className="symbol-icon-wrapper" aria-hidden="true">
                {renderIcon(symbol.iconName, symbol.colorTheme.text)}
              </div>
              <span className="symbol-label">
                {symbol.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Confirmation Banner */}
      {lastConfirmedIntent && (
        <div 
          id="confirmed-symbol-alert"
          className="confirmed-alert"
          style={{
            background: 'rgba(16, 185, 129, 0.15)',
            border: '1px solid rgba(16, 185, 129, 0.3)',
            color: '#A7F3D0',
          }}
          role="status"
          aria-live="polite"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <CheckCircle2 size={22} color="#10B981" />
            <div>
              <strong>Your message: &ldquo;{lastConfirmedIntent}&rdquo;</strong>
              <p>Your message is here for your teacher.</p>
            </div>
          </div>

        </div>
      )}


    </section>
  );
};
