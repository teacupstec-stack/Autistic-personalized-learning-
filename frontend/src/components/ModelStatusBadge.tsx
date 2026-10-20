import React from 'react';
import type { ModelStatusType } from '../types';
import { AlertCircle, CheckCircle, Info } from 'lucide-react';

interface Props {
  status: ModelStatusType;
  modelName?: string;
  onRefresh?: () => void;
}

export const ModelStatusBadge: React.FC<Props> = ({ status, modelName = 'PUSG-Fusion ONNX' }) => {
  if (status === 'ready') {
    return (
      <div 
        id="model-status-badge"
        className="status-chip status-ready" 
        title="Gesture model loaded and active for inference"
        role="status"
        aria-label="Model status: Ready"
      >
        <CheckCircle size={16} />
        <span>{modelName}: Ready</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div 
        id="model-status-badge"
        className="status-chip status-error" 
        title="Error loading gesture recognition model"
        role="status"
        aria-label="Model status: Error"
      >
        <AlertCircle size={16} />
        <span>Gesture Model: Error</span>
      </div>
    );
  }

  // Default: 'not_loaded'
  return (
    <div 
      id="model-status-badge"
      className="status-chip status-not_loaded" 
      title="No trained model loaded yet. Symbol communication remains 100% active."
      role="status"
      aria-label="Model status: Gesture model not loaded"
    >
      <Info size={16} />
      <span>Gesture Model: Not Loaded (Symbol Mode Active)</span>
    </div>
  );
};
