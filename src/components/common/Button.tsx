import React from 'react';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'ghost' | 'break' | 'answer';
  size?: 'sm' | 'md' | 'lg' | 'xl';
  fullWidth?: boolean;
  icon?: React.ReactNode;
}

export const Button: React.FC<ButtonProps> = ({
  children,
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  icon,
  className = '',
  disabled = false,
  ...props
}) => {
  const baseStyles =
    'inline-flex items-center justify-center font-medium rounded-xl transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed select-none active:scale-[0.98]';

  const sizeStyles = {
    sm: 'text-xs px-3 py-1.5 gap-1.5 min-h-[36px]',
    md: 'text-sm px-4 py-2 gap-2 min-h-[44px]',
    lg: 'text-base px-6 py-3 gap-2.5 min-h-[52px]',
    xl: 'text-lg font-semibold px-8 py-4 gap-3 min-h-[64px]'
  };

  const variantStyles = {
    primary:
      'bg-[#3CC172] text-white hover:bg-[#2EA75F] focus-visible:ring-[#3CC172] shadow-sm hover:shadow active:bg-[#258B4E]',
    secondary:
      'bg-slate-100 text-slate-800 hover:bg-slate-200 focus-visible:ring-slate-400 border border-slate-200',
    outline:
      'border-2 border-slate-200 text-slate-700 bg-white hover:bg-slate-50 focus-visible:ring-slate-400 hover:border-slate-300',
    danger:
      'bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500 shadow-sm',
    ghost:
      'text-slate-600 hover:text-slate-900 hover:bg-slate-100 focus-visible:ring-slate-300',
    break:
      'bg-amber-100 text-amber-900 border-2 border-amber-300 hover:bg-amber-200 focus-visible:ring-amber-500 font-semibold shadow-sm',
    answer:
      'bg-white border-2 border-slate-200 text-slate-900 hover:border-[#3CC172] hover:bg-emerald-50/50 focus-visible:ring-[#3CC172] text-xl font-bold rounded-2xl shadow-sm hover:shadow-md'
  };

  return (
    <button
      className={`${baseStyles} ${sizeStyles[size]} ${variantStyles[variant]} ${
        fullWidth ? 'w-full' : ''
      } ${className}`}
      disabled={disabled}
      {...props}
    >
      {icon && <span className="flex-shrink-0">{icon}</span>}
      {children}
    </button>
  );
};
