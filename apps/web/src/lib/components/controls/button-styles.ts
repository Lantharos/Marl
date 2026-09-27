export type ButtonVariant =
  'primary' | 'secondary' | 'danger' | 'danger-soft' | 'ghost' | 'success-soft' | 'warning-soft';
export type ButtonSize = 'small' | 'medium' | 'large';

const variants: Record<ButtonVariant, string> = {
  primary: 'bg-brand text-on-brand hover:not-disabled:bg-brand-hover',
  secondary:
    'bg-surface-raised text-ink shadow-surface hover:not-disabled:bg-surface-muted hover:not-disabled:text-ink-strong',
  danger: 'bg-danger text-on-danger hover:not-disabled:brightness-110',
  'danger-soft':
    'bg-danger-soft text-danger hover:not-disabled:ring-1 hover:not-disabled:ring-danger hover:not-disabled:ring-inset',
  ghost: 'bg-transparent text-ink-muted hover:not-disabled:bg-surface-hover hover:not-disabled:text-ink-strong',
  'success-soft':
    'bg-success-soft text-success hover:not-disabled:ring-1 hover:not-disabled:ring-success/60 hover:not-disabled:ring-inset',
  'warning-soft':
    'bg-warning-soft text-warning hover:not-disabled:ring-1 hover:not-disabled:ring-warning/60 hover:not-disabled:ring-inset'
};

const sizes: Record<ButtonSize, string> = {
  small: 'h-8 px-2.5 text-xs pointer-coarse:h-10',
  medium: 'h-9.5 px-3.5 text-sm pointer-coarse:h-10',
  large: 'h-11 px-4.5 text-sm'
};

const iconSizes: Record<ButtonSize, string> = {
  small: 'size-8 pointer-coarse:size-10',
  medium: 'size-9.5 pointer-coarse:size-10',
  large: 'size-11'
};

export function buttonClass(variant: ButtonVariant, size: ButtonSize, icon = false, block = false) {
  return [
    'inline-flex shrink-0 items-center justify-center gap-1.5 rounded-md font-semibold leading-none whitespace-nowrap no-underline transition-[background-color,color,box-shadow,filter] duration-150 select-none',
    'focus-visible:outline-2 focus-visible:outline-offset-3 focus-visible:outline-brand active:not-disabled:brightness-95',
    'disabled:cursor-not-allowed disabled:opacity-45 aria-busy:cursor-wait aria-busy:opacity-80',
    variants[variant],
    icon ? `${iconSizes[size]} p-0` : sizes[size],
    block && 'w-full'
  ];
}
