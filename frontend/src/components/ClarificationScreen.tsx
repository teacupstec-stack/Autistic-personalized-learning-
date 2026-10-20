import React, { useEffect } from 'react';
import type { ClarificationState, IntentMessage } from '../types';
import { CORE_SYMBOLS } from '../constants/symbols';
import { 
  HelpCircle, 
  Check, 
  X, 
  AlertTriangle, 
  Coffee, 
  CheckCircle2, 
  ThumbsUp, 
  ThumbsDown 
} from 'lucide-react';

interface Props {
  state: ClarificationState;
  onConfirmIntent: (intent: IntentMessage) => void;
  onDismiss: () => void;
}

export const ClarificationScreen: React.FC<Props> = ({
  state,
  onConfirmIntent,
  onDismiss,
}) => {
  // Listen for Escape key to dismiss
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onDismiss]);

  if (!state.isOpen) return null;

  const renderIcon = (name: string, color: string) => {
    const props = { size: 24, color };
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
    <div 
      className="modal-overlay" 
      role="dialog" 
      aria-modal="true" 
      aria-labelledby="clarification-title"
    >
      <div className="modal-content" id="clarification-dialog">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <AlertTriangle size={24} color="#F59E0B" />
            <h2 id="clarification-title" style={{ fontSize: '1.25rem', fontWeight: 700 }}>
              What would you like to say?
            </h2>
          </div>

          <button
            id="btn-dismiss-clarification"
            className="btn btn-secondary"
            onClick={onDismiss}
            style={{ padding: '0.35rem 0.65rem' }}
            title="Dismiss clarification (Esc)"
            aria-label="Dismiss clarification"
          >
            <X size={16} />
          </button>
        </div>

        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '1.25rem' }}>
          {state.reason === 'modality_conflict' && (
            <span>The gesture and symbol had different meanings. Please confirm what you meant:</span>
          )}
          {state.reason === 'low_confidence' && (
            <span>Choose the picture that matches your message.</span>
          )}
          {state.reason === 'teacher_check' && (
            <span>Is this your message? You can choose another picture.</span>
          )}
          {state.reason === 'no_model_fallback' && (
            <span>Gesture model is not loaded yet. Please select your picture symbol directly:</span>
          )}
        </p>

        {/* If there was a suspected intent */}
        {state.suspectedIntent && (
          <div 
            style={{
              background: 'rgba(245, 158, 11, 0.1)',
              border: '2px dashed #F59E0B',
              borderRadius: 'var(--radius-md)',
              padding: '1.25rem',
              textAlign: 'center',
              marginBottom: '1.5rem',
            }}
          >
            <span style={{ fontSize: '0.85rem', color: '#FCD34D', display: 'block', marginBottom: '0.25rem' }}>
              Did you mean:
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#FFF', marginBottom: '0.75rem' }}>
              &ldquo;{state.suspectedIntent}&rdquo;
            </div>
            <button
              id="btn-confirm-suspected-intent"
              className="btn btn-primary"
              onClick={() => onConfirmIntent(state.suspectedIntent!)}
              style={{ padding: '0.65rem 1.5rem', fontSize: '1rem', background: '#10B981', borderColor: '#059669' }}
              aria-label={`Yes, confirm ${state.suspectedIntent}`}
            >
              <Check size={18} />
              <span>Yes, that&rsquo;s right!</span>
            </button>
          </div>
        )}

        {/* Or direct symbol selection */}
        <div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', display: 'block', marginBottom: '0.75rem' }}>
            Or choose the symbol you want:
          </span>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(95px, 1fr))', gap: '0.75rem' }}>
            {CORE_SYMBOLS.map((symbol) => (
              <button
                key={symbol.id}
                id={`clarification-symbol-${symbol.intent.toLowerCase()}`}
                className="symbol-card"
                style={{
                  backgroundColor: symbol.colorTheme.bg,
                  borderColor: symbol.colorTheme.border,
                  color: symbol.colorTheme.text,
                  minHeight: '85px',
                  padding: '0.75rem 0.5rem',
                }}
                onClick={() => onConfirmIntent(symbol.intent)}
                aria-label={`Confirm ${symbol.label}`}
              >
                <div style={{ marginBottom: '0.25rem' }}>
                  {renderIcon(symbol.iconName, symbol.colorTheme.text)}
                </div>
                <span style={{ fontSize: '0.95rem', fontWeight: 700 }}>
                  {symbol.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1.5rem' }}>
          <button
            id="btn-cancel-clarification"
            className="btn btn-secondary"
            onClick={onDismiss}
            aria-label="Cancel clarification"
          >
            <span>Cancel</span>
          </button>
        </div>
      </div>
    </div>
  );
};
