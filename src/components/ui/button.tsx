import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex h-9 shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-md border px-3 text-sm font-medium shadow-sm transition-[background-color,border-color,color,box-shadow,transform] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-45 [&_svg]:size-4",
  {
    variants: {
      variant: {
        default: "border-primary/40 bg-primary text-primary-foreground hover:bg-primary/95",
        secondary: "border-border bg-secondary text-secondary-foreground hover:bg-accent hover:text-accent-foreground",
        ghost: "border-transparent bg-transparent text-muted-foreground shadow-none hover:bg-secondary hover:text-foreground",
        outline: "border-border bg-background text-foreground hover:bg-secondary",
        destructive: "border-destructive/40 bg-destructive text-destructive-foreground hover:bg-destructive/95",
      },
      size: {
        default: "h-9 px-3",
        sm: "h-8 px-2.5 text-xs",
        icon: "h-9 w-9 px-0",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp data-motion="control" data-motion-hover="lift" className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />;
});
Button.displayName = "Button";

export { Button, buttonVariants };
