import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-sm text-sm font-medium " +
    "ring-offset-background " +
    "transition-[background-color,color,box-shadow,transform,opacity] duration-fast ease-brand " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "active:scale-[0.97] " +
    "disabled:pointer-events-none disabled:opacity-50 " +
    "select-none " +
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        outline:
          "border border-input bg-background hover:bg-muted/40 hover:text-foreground",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost: "hover:bg-muted/40 hover:text-foreground",
        // `link` variant uses the brand accent (Signal Orange) so links
        // stand out from body. `text-primary` (shadcn default) would
        // resolve to --ink and render the same color as paragraph text.
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        // xs / icon-xs / icon-sm get an invisible 44x44 hit area via a
        // ::before pseudo-element so the visual chrome stays compact
        // while touch / pointer targets meet WCAG 2.5.5 (24x24 Level A,
        // 44x44 Level AAA). The pseudo-element is positioned-absolute,
        // pointer-events-auto inheritance, and visually hidden — purely
        // a hit-region extension.
        xs: "relative h-7 rounded px-2 text-xs gap-1 [&_svg]:size-3.5 before:absolute before:-inset-2 before:content-['']",
        default: "h-10 px-4 py-2",
        sm: "h-9 rounded-sm px-3",
        lg: "h-11 rounded-sm px-8",
        icon: "h-10 w-10",
        'icon-sm': "relative h-8 w-8 [&_svg]:size-4 before:absolute before:-inset-2 before:content-['']",
        'icon-xs': "relative h-7 w-7 [&_svg]:size-3.5 before:absolute before:-inset-[10px] before:content-['']",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button"
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = "Button"

export { Button, buttonVariants }
