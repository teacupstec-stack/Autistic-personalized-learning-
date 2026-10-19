import React from 'react';
import type { ActionVariant, SessionStatus } from '../../types';

export interface BadgeProps {
  children: React.ReactNode;
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'action';
  size?: 'sm' | 'md';
  icon?: React.ReactNode;
  className?: string;
}

export const Badge: React.FC<BadgeProps> = ({
  children,
  variant = 'default',
  size = 'md',
  icon,
  className = ''
}) => {
  const sizeStyles = {
    sm: 'text-xs px-2 py-0.5 gap-1',
    md: 'text-xs px-2.5 py-1 gap-1.5'
  };

  const variantStyles = {
    default: 'bg-slate-100 text-slate-700 border border-slate-200',
    success: 'bg-emerald-50 text-emerald-800 border border-emerald-200',
    warning: 'bg-amber-50 text-amber-800 border border-amber-200',
    danger: 'bg-rose-50 text-rose-800 border border-rose-200',
    info: 'bg-sky-50 text-sky-800 border border-sky-200',
    purple: 'bg-purple-50 text-purple-800 border border-purple-200',
    action: 'bg-teal-50 text-teal-800 border border-teal-200 font-mono'
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full ${sizeStyles[size]} ${variantStyles[variant]} ${className}`}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </span>
  );
};

export const StatusBadge: React.FC<{ status: SessionStatus }> = ({ status }) => {
  switch (status) {
    case 'active':
      return (
        <Badge variant="success" icon={<span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />}>
          Session Active
        </Badge>
      );
    case 'break_active':
    case 'break_requested':
      return (
        <Badge variant="warning" icon={<span className="w-2 h-2 rounded-full bg-amber-500" />}>
          On Break
        </Badge>
      );
    case 'intervention_required':
      return (
        <Badge variant="danger" icon={<span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />}>
          Human Help Needed
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="info" icon={<span className="w-2 h-2 rounded-full bg-sky-500" />}>
          Session Completed
        </Badge>
      );
    case 'idle':
    default:
      return (
        <Badge variant="default" icon={<span className="w-2 h-2 rounded-full bg-slate-400" />}>
          Session Idle
        </Badge>
      );
  }
};

export const ActionVariantBadge: React.FC<{ variant: ActionVariant }> = ({ variant }) => {
  const map: Record<ActionVariant, { label: string; badgeVariant: 'info' | 'success' | 'warning' | 'purple' }> = {
    easy_visual: { label: 'Easy • Visual', badgeVariant: 'success' },
    easy_text: { label: 'Easy • Text', badgeVariant: 'info' },
    medium_visual: { label: 'Medium • Visual', badgeVariant: 'warning' },
    medium_text: { label: 'Medium • Text', badgeVariant: 'purple' }
  };

  const item = map[variant] || { label: variant, badgeVariant: 'info' };
  return <Badge variant={item.badgeVariant}>{item.label}</Badge>;
};
