import { useEffect, useId, useState, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import { Label, Select, SelectContent, SelectItem, SelectTrigger, SelectValue, Slider, Switch, Tip } from '@/components/ui/primitives';
import { cn } from '@/utils';

function HelpTip({ help }: { help?: ReactNode }) {
  if (!help) return null;
  return (
    <Tip content={help}>
      <button type="button" className="text-ink-500 hover:text-ink-300" aria-label="Help">
        <Info className="h-3 w-3" />
      </button>
    </Tip>
  );
}

export interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  unit?: string;
  digits?: number;
  help?: ReactNode;
  disabled?: boolean;
  onChange: (v: number) => void;
  className?: string;
}

/** Slider + exact numeric entry, always clamped to [min, max]. */
export function NumberField({ label, value, min, max, step = 1, unit, digits, help, disabled, onChange, className }: NumberFieldProps) {
  const id = useId();
  const d = digits ?? (step >= 1 ? 0 : step >= 0.1 ? 1 : 2);
  const [text, setText] = useState(value.toFixed(d));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(value.toFixed(d));
  }, [value, d, focused]);
  const commit = () => {
    const v = parseFloat(text);
    if (Number.isFinite(v)) onChange(Math.min(max, Math.max(min, v)));
    else setText(value.toFixed(d));
  };
  return (
    <div className={cn('space-y-1', disabled && 'opacity-50', className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <Label htmlFor={id}>{label}</Label>
          <HelpTip help={help} />
        </div>
        <div className="flex items-center rounded border border-transparent bg-ink-800/80 focus-within:border-glow-500/60 hover:border-ink-600">
          <input
            id={id}
            disabled={disabled}
            className="num w-14 bg-transparent px-1.5 py-0.5 text-right text-[11.5px] text-ink-100 outline-none"
            value={text}
            inputMode="decimal"
            onFocus={() => setFocused(true)}
            onBlur={() => {
              setFocused(false);
              commit();
            }}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
              if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
                e.preventDefault();
                const k = (e.key === 'ArrowUp' ? 1 : -1) * step * (e.shiftKey ? 10 : 1);
                onChange(Math.min(max, Math.max(min, +(value + k).toFixed(6))));
              }
            }}
          />
          {unit && <span className="pr-1.5 text-[10.5px] text-ink-400">{unit}</span>}
        </div>
      </div>
      <Slider disabled={disabled} min={min} max={max} step={step} value={[Math.min(max, Math.max(min, value))]} onValueChange={([v]) => onChange(v)} aria-label={label} />
    </div>
  );
}

export function ToggleField({ label, checked, onChange, help, disabled }: { label: string; checked: boolean; onChange: (v: boolean) => void; help?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <div className={cn('flex items-center justify-between gap-2 py-0.5', disabled && 'opacity-50')}>
      <div className="flex items-center gap-1">
        <Label htmlFor={id} className="cursor-pointer">
          {label}
        </Label>
        <HelpTip help={help} />
      </div>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onChange} />
    </div>
  );
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  help,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  help?: ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1">
        <Label>{label}</Label>
        <HelpTip help={help} />
      </div>
      <Select value={value} onValueChange={(v) => onChange(v as T)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function SubHeading({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2 mt-4 flex items-center justify-between first:mt-1">
      <h4 className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-ink-400">{children}</h4>
      {right}
    </div>
  );
}

export function Stat({ label, value, unit, tone }: { label: string; value: ReactNode; unit?: string; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className="rounded-md border border-ink-700 bg-ink-800/60 px-2.5 py-1.5">
      <div className="text-[10.5px] text-ink-400">{label}</div>
      <div className={cn('num text-[13px] text-ink-100', tone === 'ok' && 'text-ok', tone === 'warn' && 'text-warn', tone === 'bad' && 'text-bad')}>
        {value}
        {unit && <span className="ml-0.5 text-[10.5px] text-ink-400">{unit}</span>}
      </div>
    </div>
  );
}
