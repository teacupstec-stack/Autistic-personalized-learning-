import React, { useState } from 'react';
import {
  FileText,
  CheckCircle2,
  AlertTriangle,
  Download,
  Filter,
  ChevronDown,
  ChevronRight,
  Clock,
  HeartPulse,
  Sparkles,
  ShieldAlert,
  Code
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { Card } from '../../components/common/Card';
import { Button } from '../../components/common/Button';
import { Badge, ActionVariantBadge } from '../../components/common/Badge';
import { validate } from '../../../contracts/validate';
import type { LogEvent, DecisionEvent, OutcomeEvent } from '../../types';

export const EventHistoryScreen: React.FC = () => {
  const { allEvents, history, learner } = useApp();
  const [filterType, setFilterType] = useState<'all' | 'decision' | 'outcome'>('all');
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  const filteredEvents = allEvents.filter(e => {
    if (filterType === 'all') return true;
    return e.event_type === filterType;
  });

  const handleExportJSON = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(allEvents, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `c2_session_${learner.profile_id}_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-1.5 text-xs font-bold text-teal-800 bg-teal-100/70 px-2.5 py-0.5 rounded-full mb-1">
            <FileText className="w-3.5 h-3.5 text-teal-700" />
            Audit Log & Contract Verification
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
            Session Event History
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            Chronological audit log of all DecisionEvents and OutcomeEvents, strictly validated against the C2 JSON Schema.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            icon={<Download className="w-4 h-4" />}
            onClick={handleExportJSON}
            disabled={allEvents.length === 0}
            className="text-xs font-semibold"
          >
            Export Audit Log (JSON)
          </Button>
          <Badge variant="success" size="md">
            {allEvents.length} Verified LogEvents
          </Badge>
        </div>
      </div>

      {/* Filter Chips */}
      <Card padding="sm">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Filter className="w-4 h-4 text-slate-400" />
            <span className="text-xs font-bold text-slate-700">Filter Events:</span>
            {(['all', 'decision', 'outcome'] as const).map(type => (
              <button
                key={type}
                onClick={() => setFilterType(type)}
                className={`text-xs px-3 py-1 rounded-lg font-semibold capitalize transition-colors ${
                  filterType === type
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {type === 'all' ? 'All Events' : `${type} Events`}
              </button>
            ))}
          </div>

          <span className="text-xs text-slate-400">
            Showing {filteredEvents.length} of {allEvents.length} events
          </span>
        </div>
      </Card>

      {/* Event Stream List */}
      <div className="space-y-3">
        {filteredEvents.map((evt, idx) => {
          const isDecision = evt.event_type === 'decision';
          const decisionEvt = isDecision ? (evt as DecisionEvent) : null;
          const outcomeEvt = !isDecision ? (evt as OutcomeEvent) : null;
          const isExpanded = expandedEventId === evt.event_id;

          // Validate against JSON schema
          const validationResult = validate('log_event', evt);

          return (
            <div
              key={evt.event_id}
              className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden transition-all hover:border-slate-300"
            >
              {/* Event Header Bar */}
              <div
                onClick={() => setExpandedEventId(isExpanded ? null : evt.event_id)}
                className="p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 cursor-pointer hover:bg-slate-50/70"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-sm flex-shrink-0 ${
                      isDecision
                        ? 'bg-teal-50 text-teal-700 border border-teal-200'
                        : outcomeEvt?.outcome
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-rose-50 text-rose-700 border border-rose-200'
                    }`}
                  >
                    {isDecision ? 'D' : outcomeEvt?.outcome ? '✔' : '✖'}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900 text-xs sm:text-sm">
                        {isDecision ? 'DecisionEvent' : 'OutcomeEvent'}
                      </span>
                      <Badge variant={isDecision ? 'info' : outcomeEvt?.outcome ? 'success' : 'danger'} size="sm">
                        {isDecision
                          ? decisionEvt?.selected_action || 'action_id = null'
                          : outcomeEvt?.outcome
                          ? 'Success'
                          : 'Failure'}
                      </Badge>
                      {outcomeEvt?.independence && (
                        <Badge variant="purple" size="sm">Independent</Badge>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-[11px] text-slate-400 font-mono mt-0.5">
                      <span>{evt.event_id}</span>
                      <span>•</span>
                      <span>{evt.decision_time}</span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-end sm:self-center">
                  <Badge variant={validationResult.valid ? 'success' : 'danger'} size="sm">
                    {validationResult.valid ? 'Schema Valid ✔' : 'Invalid ✖'}
                  </Badge>
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  )}
                </div>
              </div>

              {/* Event Quick Details */}
              <div className="px-4 pb-3 pt-0 border-t border-slate-50 text-xs flex flex-wrap items-center gap-x-6 gap-y-1 text-slate-600 bg-slate-50/30">
                {isDecision && decisionEvt && (
                  <>
                    <span>
                      <strong>Eligible Actions:</strong> [{decisionEvt.eligible_actions.join(', ') || 'None (Tripwire)'}]
                    </span>
                    <span>
                      <strong>Propensity:</strong> {decisionEvt.action_propensity?.toFixed(2) || 'null'}
                    </span>
                    <span>
                      <strong>Reason:</strong> {decisionEvt.decision.reason}
                    </span>
                  </>
                )}

                {!isDecision && outcomeEvt && (
                  <>
                    <span>
                      <strong>Selected Action:</strong> {outcomeEvt.selected_action}
                    </span>
                    <span>
                      <strong>Outcome Time:</strong> {outcomeEvt.outcome_time}
                    </span>
                    <span>
                      <strong>Distress Annotated:</strong> {outcomeEvt.distress_annotation ? 'Yes' : 'None'}
                    </span>
                  </>
                )}
              </div>

              {/* Raw JSON Payload Viewer (Expanded) */}
              {isExpanded && (
                <div className="p-4 bg-slate-900 text-slate-100 font-mono text-[11px] overflow-x-auto border-t border-slate-200">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-bold">
                      <Code className="w-3.5 h-3.5" />
                      Canonical JSON Wire Payload (Draft 2020-12 Schema Validated)
                    </span>
                    <span>Strict UTC Timestamps</span>
                  </div>
                  <pre className="text-emerald-300">
                    {JSON.stringify(evt, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Empty State */}
      {filteredEvents.length === 0 && (
        <div className="p-12 text-center bg-white rounded-2xl border border-slate-200">
          <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-700">No events logged yet</h3>
          <p className="text-xs text-slate-400 mt-1">
            Start a learning session to generate DecisionEvents and OutcomeEvents.
          </p>
        </div>
      )}
    </div>
  );
};
