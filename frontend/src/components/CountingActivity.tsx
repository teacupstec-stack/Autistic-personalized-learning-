import React, { useState, useEffect } from 'react';
import type { ActivityContext } from '../types';
import { Star, Apple, RotateCcw, Plus, Sparkles, Check } from 'lucide-react';

interface Props {
  variant?: 'stars' | 'apples';
  onActivityUpdate: (ctx: ActivityContext) => void;
  onRequestHelp?: () => void;
}

export const CountingActivity: React.FC<Props> = ({ onActivityUpdate, variant = 'stars' }) => {
  const itemName = variant === 'stars' ? 'stars' : 'apples';
  const [targetCount] = useState<number>(5);
  const [currentCount, setCurrentCount] = useState<number>(0);

  const status: ActivityContext['status'] = 
    currentCount === 0 ? 'idle' : currentCount >= targetCount ? 'completed' : 'in_progress';

  useEffect(() => {
    onActivityUpdate({
      activityId: 'counting_' + variant,
      activityName: 'Counting ' + itemName,
      currentCount,
      targetCount,
      status,
      notes: `Learner has counted ${currentCount} out of ${targetCount} ${itemName}.`,
    });
  }, [currentCount, targetCount, status, onActivityUpdate, variant, itemName]);

  const handleIncrement = () => {
    if (currentCount < targetCount) {
      setCurrentCount(prev => prev + 1);
    }
  };

  const handleReset = () => {
    setCurrentCount(0);
  };

  const handleItemClick = (index: number) => {
    // If clicking the next uncounted star
    if (index === currentCount) {
      handleIncrement();
    }
  };

  return (
    <section 
      id="counting-activity-section" 
      className="glass-panel" 
      aria-labelledby="counting-activity-title"
    >
      <div className="panel-header">
        <h2 id="counting-activity-title" className="panel-title">
          <Sparkles size={20} color="#F59E0B" />
          <span>Let’s count {itemName}</span>
        </h2>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span 
            className="status-chip"
            style={{ 
              background: status === 'completed' ? 'rgba(16, 185, 129, 0.2)' : 'rgba(56, 189, 248, 0.15)',
              color: status === 'completed' ? '#34D399' : '#38BDF8',
            }}
          >
            {status === 'completed' ? 'You counted all five!' : `Count: ${currentCount} / ${targetCount}`}
          </span>
          <button 
            id="btn-reset-activity"
            className="btn btn-secondary" 
            onClick={handleReset}
            title="Reset counting activity"
            aria-label="Reset counting activity"
            style={{ padding: '0.4rem 0.75rem', fontSize: '0.85rem' }}
          >
            <RotateCcw size={14} />
            <span>Try again</span>
          </button>
        </div>
      </div>

      <p style={{ color: 'var(--text-secondary)', fontSize: '0.875rem', marginBottom: '1rem' }}>
        Tap each {variant === 'stars' ? 'star' : 'apple'} to count. The outlined one is next. There is no rush.
      </p>

      <div className="counting-scene">
        <div 
          className="counting-items-row" 
          role="group" 
          aria-label={"Count " + itemName}
        >
          {Array.from({ length: targetCount }).map((_, idx) => {
            const isCounted = idx < currentCount;
            const isNext = idx === currentCount;
            return (
              <button
                key={idx}
                id={`star-item-${idx + 1}`}
                className={`star-item ${isCounted ? 'star-counted' : 'star-uncounted'}`}
                onClick={() => handleItemClick(idx)}
                aria-label={`${variant === 'stars' ? 'Star' : 'Apple'} ${idx + 1} of ${targetCount}, ${isCounted ? 'counted' : 'not counted'}`}
                title={isCounted ? `Star ${idx + 1} counted` : isNext ? `Click to count star ${idx + 1}` : `Star ${idx + 1}`}
                style={{
                  border: isNext ? '2px solid #38BDF8' : undefined,
                  transform: isNext ? 'scale(1.05)' : undefined,
                }}
              >
                {isCounted ? (
                  <Check size={28} strokeWidth={3} />
                ) : (
                  variant === 'stars' ? <Star size={38} /> : <Apple size={38} />
                )}
              </button>
            );
          })}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', marginTop: '0.5rem' }}>
          <button
            id="btn-count-next"
            className="btn btn-primary"
            onClick={handleIncrement}
            disabled={status === 'completed'}
            style={{
              opacity: status === 'completed' ? 0.5 : 1,
              cursor: status === 'completed' ? 'not-allowed' : 'pointer',
            }}
          >
            <Plus size={18} />
            <span>{status === 'completed' ? 'All Counted!' : `Count next (${currentCount + 1})`}</span>
          </button>
        </div>
      </div>
    </section>
  );
};
