import React, { useState } from 'react';
import type { 
  EnrolledIntentMapping, 
  IntentMessage, 
  ParticipantProfile 
} from '../types';
import { 
  GraduationCap, 
  UserCheck, 
  Plus, 
  Check, 
  HelpCircle, 
  Edit3, 
  Save, 
  Layers 
} from 'lucide-react';

interface Props {
  enrolments: EnrolledIntentMapping[];
  profile: ParticipantProfile;
  onUpdateEnrolment: (updated: EnrolledIntentMapping[]) => void;
  onUpdateProfile: (updated: ParticipantProfile) => void;
  onTestEnrolmentSample: (intent: IntentMessage) => void;
}

export const TeacherArea: React.FC<Props> = ({
  enrolments,
  profile,
  onUpdateEnrolment,
  onUpdateProfile,
  onTestEnrolmentSample,
}) => {
  const [isOpen, setIsOpen] = useState<boolean>(true);
  const [editingIntent, setEditingIntent] = useState<IntentMessage | null>(null);
  const [tempDescription, setTempDescription] = useState<string>('');
  const [isEditingNotes, setIsEditingNotes] = useState<boolean>(false);
  const [tempNotes, setTempNotes] = useState<string>(profile.notes);

  const handleStartEdit = (mapping: EnrolledIntentMapping) => {
    setEditingIntent(mapping.intent);
    setTempDescription(mapping.gestureDescription);
  };

  const handleSaveEdit = (intent: IntentMessage) => {
    const updated = enrolments.map(m => {
      if (m.intent === intent) {
        return {
          ...m,
          gestureDescription: tempDescription.trim() || 'Custom agreed gesture',
          status: 'enrolled' as const,
          lastUpdated: new Date().toISOString(),
        };
      }
      return m;
    });
    onUpdateEnrolment(updated);
    setEditingIntent(null);
  };

  return (
    <section 
      id="teacher-enrolment-section" 
      className="glass-panel" 
      aria-labelledby="teacher-section-title"
    >
      <div className="panel-header">
        <div>
          <h2 id="teacher-section-title" className="panel-title">
            <GraduationCap size={22} color="#818CF8" />
            <span>Teacher &amp; Caregiver Area: Learning Through Confirmed Use</span>
          </h2>
          <span style={{ fontSize: '0.8125rem', color: 'var(--text-secondary)' }}>
            Record and confirm individually agreed gesture meanings. Universal gestures are not assumed.
          </span>
        </div>

        <button
          id="btn-toggle-teacher-panel"
          className="btn btn-secondary"
          onClick={() => setIsOpen(prev => !prev)}
          aria-expanded={isOpen}
          style={{ padding: '0.4rem 0.75rem', fontSize: '0.8125rem' }}
        >
          <Layers size={14} />
          <span>{isOpen ? 'Collapse Panel' : 'Expand Panel'}</span>
        </button>
      </div>

      {isOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Participant Profile Banner */}
          <div 
            style={{
              background: 'rgba(15, 23, 42, 0.5)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 'var(--radius-md)',
              padding: '1rem',
              display: 'flex',
              flexWrap: 'wrap',
              gap: '1.5rem',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>
                  Participant ID (Pseudonym)
                </span>
                <strong style={{ fontSize: '0.95rem', color: 'var(--text-primary)' }}>
                  {profile.pseudonym} ({profile.participantId})
                </strong>
              </div>

              <div>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', display: 'block' }}>
                  Session ID
                </span>
                <span style={{ fontSize: '0.875rem', fontFamily: 'var(--font-mono)', color: '#38BDF8' }}>
                  {profile.sessionId}
                </span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <UserCheck size={16} color="#10B981" />
                <span style={{ fontSize: '0.8rem', color: '#6EE7B7' }}>
                  Research prototype — verify consent before participant use
                </span>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              {isEditingNotes ? (
                <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'center' }}>
                  <input
                    type="text"
                    value={tempNotes}
                    onChange={(e) => setTempNotes(e.target.value)}
                    style={{
                      background: '#0F172A',
                      border: '1px solid var(--border-focus)',
                      color: '#FFF',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      fontSize: '0.8rem',
                    }}
                  />
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      onUpdateProfile({ ...profile, notes: tempNotes });
                      setIsEditingNotes(false);
                    }}
                    style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  >
                    Save
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-secondary"
                  onClick={() => setIsEditingNotes(true)}
                  style={{ padding: '0.2rem 0.5rem', fontSize: '0.75rem' }}
                  title={profile.notes}
                >
                  <Edit3 size={12} />
                  <span>Edit Notes</span>
                </button>
              )}
            </div>
          </div>

          {/* Enrolled Mappings Table */}
          <div style={{ overflowX: 'auto' }}>
            <table className="data-table" aria-label="Table of enrolled gesture mappings for learner">
              <thead>
                <tr>
                  <th scope="col">Intent Message</th>
                  <th scope="col">Agreed Gesture Description</th>
                  <th scope="col">Status</th>
                  <th scope="col">Enrolled Samples</th>
                  <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {enrolments.map((mapping) => {
                  const isEditing = editingIntent === mapping.intent;
                  return (
                    <tr key={mapping.intent} id={`enrolment-row-${mapping.intent.toLowerCase()}`}>
                      <td style={{ fontWeight: 600 }}>
                        <span 
                          style={{
                            display: 'inline-block',
                            padding: '0.2rem 0.6rem',
                            borderRadius: '4px',
                            background: 'rgba(255, 255, 255, 0.08)',
                          }}
                        >
                          {mapping.intent}
                        </span>
                      </td>

                      <td>
                        {isEditing ? (
                          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                            <input
                              id={`input-desc-${mapping.intent.toLowerCase()}`}
                              type="text"
                              value={tempDescription}
                              onChange={(e) => setTempDescription(e.target.value)}
                              placeholder="e.g. Open palm raised towards chest"
                              style={{
                                background: '#0F172A',
                                border: '1px solid var(--border-focus)',
                                color: '#FFF',
                                padding: '0.3rem 0.6rem',
                                borderRadius: '4px',
                                fontSize: '0.85rem',
                                width: '280px',
                              }}
                            />
                            <button
                              id={`btn-save-desc-${mapping.intent.toLowerCase()}`}
                              className="btn btn-primary"
                              onClick={() => handleSaveEdit(mapping.intent)}
                              style={{ padding: '0.25rem 0.6rem', fontSize: '0.8rem' }}
                              aria-label={`Save description for ${mapping.intent}`}
                            >
                              <Save size={13} />
                              <span>Save</span>
                            </button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                            <span style={{ color: 'var(--text-primary)' }}>
                              {mapping.gestureDescription}
                            </span>
                            <button
                              id={`btn-edit-desc-${mapping.intent.toLowerCase()}`}
                              onClick={() => handleStartEdit(mapping)}
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                padding: '0.2rem',
                              }}
                              title="Edit description"
                              aria-label={`Edit description for ${mapping.intent}`}
                            >
                              <Edit3 size={14} />
                            </button>
                          </div>
                        )}
                      </td>

                      <td>
                        <span 
                          className="status-chip"
                          style={{
                            padding: '0.2rem 0.5rem',
                            fontSize: '0.75rem',
                            background: mapping.status === 'enrolled' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(245, 158, 11, 0.15)',
                            color: mapping.status === 'enrolled' ? '#34D399' : '#FBBF24',
                          }}
                        >
                          {mapping.status === 'enrolled' ? <Check size={12} /> : <HelpCircle size={12} />}
                          <span>{mapping.status}</span>
                        </span>
                      </td>

                      <td>
                        <strong style={{ fontFamily: 'var(--font-mono)' }}>
                          {mapping.samplesCount} samples
                        </strong>
                      </td>

                      <td style={{ textAlign: 'right' }}>
                        <button
                          id={`btn-add-sample-${mapping.intent.toLowerCase()}`}
                          className="btn btn-secondary"
                          onClick={() => onTestEnrolmentSample(mapping.intent)}
                          style={{ padding: '0.3rem 0.65rem', fontSize: '0.8rem' }}
                          title={`Record a new enrolment sample for ${mapping.intent}`}
                          aria-label={`Add sample for ${mapping.intent}`}
                        >
                          <Plus size={13} />
                          <span>How to teach</span>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <div 
            style={{ 
              fontSize: '0.8rem', 
              color: 'var(--text-secondary)',
              background: 'rgba(99, 102, 241, 0.08)',
              border: '1px solid rgba(99, 102, 241, 0.25)',
              padding: '0.75rem 1rem',
              borderRadius: 'var(--radius-md)',
            }}
          >
            <strong>Personal Enrolment Protocol:</strong> Confirm or correct real camera gestures during communication to update the active learner’s memory.
            Only confirmed examples update personal prototypes; model guesses are never saved as labels.
          </div>
        </div>
      )}
    </section>
  );
};
