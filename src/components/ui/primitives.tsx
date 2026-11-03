/**
 * shadcn/ui-style primitives built on Radix, themed for the dark CAD workspace.
 */
import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import {
  Accordion as AccordionPrimitive,
  Dialog as DialogPrimitive,
  Label as LabelPrimitive,
  Popover as PopoverPrimitive,
  Progress as ProgressPrimitive,
  Select as SelectPrimitive,
  Separator as SeparatorPrimitive,
  Slider as SliderPrimitive,
  Slot,
  Switch as SwitchPrimitive,
  Tabs as TabsPrimitive,
  ToggleGroup as ToggleGroupPrimitive,
  Tooltip as TooltipPrimitive,
} from 'radix-ui';
import { Check, ChevronDown, X } from 'lucide-react';
import { cn } from '@/utils';

// ---------------------------------------------------------------- Button
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md text-[12.5px] font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-[15px] [&_svg]:shrink-0 select-none active:scale-[0.98]',
  {
    variants: {
      variant: {
        primary:
          'bg-gradient-to-b from-glow-300 to-glow-500 text-ink-950 shadow-[0_1px_0_rgb(255_255_255/0.35)_inset,0_6px_20px_-6px_rgb(235_166_48/0.55)] hover:from-glow-200 hover:to-glow-400',
        secondary: 'bg-ink-700 text-ink-100 border border-ink-600 hover:bg-ink-600 hover:border-ink-500',
        ghost: 'text-ink-200 hover:bg-ink-700/70 hover:text-ink-100',
        outline: 'border border-ink-600 text-ink-200 hover:border-glow-500/60 hover:text-glow-200 bg-transparent',
        danger: 'bg-bad/15 text-bad border border-bad/30 hover:bg-bad/25',
      },
      size: {
        sm: 'h-7 px-2.5',
        md: 'h-8 px-3',
        lg: 'h-10 px-4 text-[13.5px]',
        icon: 'h-8 w-8',
        'icon-sm': 'h-7 w-7',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot.Root : 'button';
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = 'Button';

// ---------------------------------------------------------------- Label
export const Label = React.forwardRef<
  React.ElementRef<typeof LabelPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof LabelPrimitive.Root>
>(({ className, ...props }, ref) => (
  <LabelPrimitive.Root ref={ref} className={cn('text-[11.5px] font-medium text-ink-300 select-none', className)} {...props} />
));
Label.displayName = 'Label';

// ---------------------------------------------------------------- Slider
export const Slider = React.forwardRef<
  React.ElementRef<typeof SliderPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SliderPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SliderPrimitive.Root ref={ref} className={cn('relative flex w-full touch-none select-none items-center py-1.5', className)} {...props}>
    <SliderPrimitive.Track className="relative h-[3px] w-full grow overflow-hidden rounded-full bg-ink-600">
      <SliderPrimitive.Range className="absolute h-full bg-gradient-to-r from-glow-600 to-glow-400" />
    </SliderPrimitive.Track>
    {(props.value ?? props.defaultValue ?? [0]).map((_, i) => (
      <SliderPrimitive.Thumb
        key={i}
        className="block h-3.5 w-3.5 rounded-full border-2 border-glow-400 bg-ink-900 shadow-[0_0_0_3px_rgb(247_189_82/0.12)] transition-transform hover:scale-110 focus-visible:outline-none focus-visible:shadow-[0_0_0_4px_rgb(247_189_82/0.3)] disabled:opacity-50"
      />
    ))}
  </SliderPrimitive.Root>
));
Slider.displayName = 'Slider';

// ---------------------------------------------------------------- Switch
export const Switch = React.forwardRef<
  React.ElementRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      'peer inline-flex h-[18px] w-8 shrink-0 cursor-pointer items-center rounded-full border border-ink-500 bg-ink-700 transition-colors data-[state=checked]:border-glow-500 data-[state=checked]:bg-glow-500/90 disabled:cursor-not-allowed disabled:opacity-50',
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb className="pointer-events-none block h-3 w-3 translate-x-[2px] rounded-full bg-ink-200 shadow transition-transform data-[state=checked]:translate-x-[15px] data-[state=checked]:bg-ink-950" />
  </SwitchPrimitive.Root>
));
Switch.displayName = 'Switch';

// ---------------------------------------------------------------- Select
export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export const SelectTrigger = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Trigger>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Trigger
    ref={ref}
    className={cn(
      'flex h-7 w-full items-center justify-between gap-2 rounded-md border border-ink-600 bg-ink-800 px-2 text-[12px] text-ink-100 hover:border-ink-500 data-[placeholder]:text-ink-400 [&>span]:truncate',
      className,
    )}
    {...props}
  >
    {children}
    <SelectPrimitive.Icon asChild>
      <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
    </SelectPrimitive.Icon>
  </SelectPrimitive.Trigger>
));
SelectTrigger.displayName = 'SelectTrigger';

export const SelectContent = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Content>
>(({ className, children, position = 'popper', ...props }, ref) => (
  <SelectPrimitive.Portal>
    <SelectPrimitive.Content
      ref={ref}
      position={position}
      sideOffset={4}
      className={cn(
        'relative z-50 max-h-80 min-w-[8rem] overflow-hidden rounded-md border border-ink-600 bg-ink-800 p-1 text-ink-100 shadow-2xl shadow-black/60 animate-fade-in',
        position === 'popper' && 'w-[var(--radix-select-trigger-width)]',
        className,
      )}
      {...props}
    >
      <SelectPrimitive.Viewport>{children}</SelectPrimitive.Viewport>
    </SelectPrimitive.Content>
  </SelectPrimitive.Portal>
));
SelectContent.displayName = 'SelectContent';

export const SelectItem = React.forwardRef<
  React.ElementRef<typeof SelectPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof SelectPrimitive.Item>
>(({ className, children, ...props }, ref) => (
  <SelectPrimitive.Item
    ref={ref}
    className={cn(
      'relative flex w-full cursor-default select-none items-center rounded py-1.5 pl-6 pr-2 text-[12px] outline-none data-[highlighted]:bg-ink-700 data-[highlighted]:text-glow-200',
      className,
    )}
    {...props}
  >
    <span className="absolute left-1.5 flex h-3.5 w-3.5 items-center justify-center">
      <SelectPrimitive.ItemIndicator>
        <Check className="h-3 w-3 text-glow-400" />
      </SelectPrimitive.ItemIndicator>
    </span>
    <SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
  </SelectPrimitive.Item>
));
SelectItem.displayName = 'SelectItem';

// ---------------------------------------------------------------- Tabs
export const Tabs = TabsPrimitive.Root;

export const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.List ref={ref} className={cn('inline-flex items-center gap-0.5 rounded-lg bg-ink-950/60 p-0.5 border border-ink-700', className)} {...props} />
));
TabsList.displayName = 'TabsList';

export const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-[12px] font-medium text-ink-300 transition-all hover:text-ink-100 data-[state=active]:bg-ink-700 data-[state=active]:text-glow-200 data-[state=active]:shadow-sm [&_svg]:size-3.5',
      className,
    )}
    {...props}
  />
));
TabsTrigger.displayName = 'TabsTrigger';

export const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => <TabsPrimitive.Content ref={ref} className={cn('outline-none animate-fade-in', className)} {...props} />);
TabsContent.displayName = 'TabsContent';

// ---------------------------------------------------------------- Accordion
export const Accordion = AccordionPrimitive.Root;

export const AccordionItem = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Item>
>(({ className, ...props }, ref) => <AccordionPrimitive.Item ref={ref} className={cn('border-b border-ink-700/80', className)} {...props} />);
AccordionItem.displayName = 'AccordionItem';

export const AccordionTrigger = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Trigger> & { icon?: React.ReactNode; badge?: React.ReactNode }
>(({ className, children, icon, badge, ...props }, ref) => (
  <AccordionPrimitive.Header className="flex">
    <AccordionPrimitive.Trigger
      ref={ref}
      className={cn(
        'group flex flex-1 items-center gap-2.5 px-4 py-3 text-left text-[12.5px] font-semibold tracking-wide text-ink-200 transition-colors hover:text-ink-100 data-[state=open]:text-glow-200',
        className,
      )}
      {...props}
    >
      {icon && <span className="text-ink-400 group-data-[state=open]:text-glow-400 [&_svg]:size-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {badge}
      <ChevronDown className="h-3.5 w-3.5 shrink-0 text-ink-400 transition-transform duration-200 group-data-[state=open]:rotate-180" />
    </AccordionPrimitive.Trigger>
  </AccordionPrimitive.Header>
));
AccordionTrigger.displayName = 'AccordionTrigger';

export const AccordionContent = React.forwardRef<
  React.ElementRef<typeof AccordionPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof AccordionPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <AccordionPrimitive.Content ref={ref} className="overflow-hidden" {...props}>
    <div className={cn('px-4 pb-4 pt-0.5 animate-slide-up', className)}>{children}</div>
  </AccordionPrimitive.Content>
));
AccordionContent.displayName = 'AccordionContent';

// ---------------------------------------------------------------- Tooltip
export const TooltipProvider = TooltipPrimitive.Provider;

export function Tip({ content, children, side = 'top' }: { content: React.ReactNode; children: React.ReactNode; side?: 'top' | 'bottom' | 'left' | 'right' }) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={side}
          sideOffset={6}
          className="z-50 max-w-64 rounded-md border border-ink-600 bg-ink-800 px-2.5 py-1.5 text-[11.5px] leading-snug text-ink-100 shadow-xl shadow-black/50 animate-fade-in"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ---------------------------------------------------------------- ToggleGroup
export const ToggleGroup = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Root>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Root ref={ref} className={cn('inline-flex w-full rounded-md border border-ink-600 bg-ink-800 p-0.5 gap-0.5', className)} {...props} />
));
ToggleGroup.displayName = 'ToggleGroup';

export const ToggleGroupItem = React.forwardRef<
  React.ElementRef<typeof ToggleGroupPrimitive.Item>,
  React.ComponentPropsWithoutRef<typeof ToggleGroupPrimitive.Item>
>(({ className, ...props }, ref) => (
  <ToggleGroupPrimitive.Item
    ref={ref}
    className={cn(
      'flex flex-1 items-center justify-center gap-1 rounded px-2 py-1 text-[11.5px] font-medium text-ink-300 transition-colors hover:text-ink-100 data-[state=on]:bg-ink-600 data-[state=on]:text-glow-200 [&_svg]:size-3.5',
      className,
    )}
    {...props}
  />
));
ToggleGroupItem.displayName = 'ToggleGroupItem';

// ---------------------------------------------------------------- Separator / Progress / Badge
export const Separator = ({ className, ...props }: React.ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>) => (
  <SeparatorPrimitive.Root className={cn('shrink-0 bg-ink-700 data-[orientation=horizontal]:h-px data-[orientation=horizontal]:w-full data-[orientation=vertical]:h-full data-[orientation=vertical]:w-px', className)} {...props} />
);

export const Progress = ({ value, className }: { value: number; className?: string }) => (
  <ProgressPrimitive.Root className={cn('relative h-1 w-full overflow-hidden rounded-full bg-ink-700', className)} value={value}>
    <ProgressPrimitive.Indicator className="h-full bg-gradient-to-r from-glow-600 to-glow-300 transition-transform duration-300" style={{ transform: `translateX(-${100 - value}%)` }} />
  </ProgressPrimitive.Root>
);

const badgeVariants = cva('inline-flex items-center gap-1 rounded px-1.5 py-[1px] text-[10.5px] font-semibold uppercase tracking-wider', {
  variants: {
    tone: {
      ok: 'bg-ok/12 text-ok',
      warn: 'bg-warn/12 text-warn',
      bad: 'bg-bad/12 text-bad',
      info: 'bg-cool-400/12 text-cool-400',
      neutral: 'bg-ink-700 text-ink-300',
      glow: 'bg-glow-400/15 text-glow-300',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
export const Badge = ({ tone, className, ...props }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) => (
  <span className={cn(badgeVariants({ tone }), className)} {...props} />
);

// ---------------------------------------------------------------- Popover
export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverContent = React.forwardRef<
  React.ElementRef<typeof PopoverPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(({ className, align = 'end', sideOffset = 6, ...props }, ref) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      ref={ref}
      align={align}
      sideOffset={sideOffset}
      className={cn('z-50 w-60 rounded-lg border border-ink-600 bg-ink-800/95 p-3 text-ink-100 shadow-2xl shadow-black/60 backdrop-blur animate-fade-in', className)}
      {...props}
    />
  </PopoverPrimitive.Portal>
));
PopoverContent.displayName = 'PopoverContent';

// ---------------------------------------------------------------- Dialog
export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

export function DialogContent({ className, children, title, description, ...props }: React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & { title: string; description?: string }) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm animate-fade-in" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 z-50 flex max-h-[88vh] w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-ink-600 bg-ink-850 shadow-2xl shadow-black/70 animate-slide-up',
          className,
        )}
        {...props}
      >
        <div className="flex items-start justify-between gap-4 border-b border-ink-700 px-5 py-4">
          <div>
            <DialogPrimitive.Title className="text-[15px] font-semibold text-ink-100">{title}</DialogPrimitive.Title>
            {description && <DialogPrimitive.Description className="mt-0.5 text-[12px] text-ink-300">{description}</DialogPrimitive.Description>}
          </div>
          <DialogPrimitive.Close className="rounded p-1 text-ink-400 hover:bg-ink-700 hover:text-ink-100">
            <X className="h-4 w-4" />
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}
