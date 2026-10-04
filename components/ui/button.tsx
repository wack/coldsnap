import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

const buttonVariants = cva(
  // Pixel buttons: square, a hard 1-bit drop shadow, and a press that moves
  // the button into its shadow.
  "inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 border-2 border-transparent text-sm font-medium whitespace-nowrap transition-[transform,box-shadow,background-color] duration-75 outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-50 aria-invalid:border-destructive [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "border-primary bg-primary text-primary-foreground shadow-pixel hover:bg-[#ff5c8f] active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-sm",
        destructive:
          "border-destructive bg-destructive text-black shadow-pixel hover:bg-[#ff7380] active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-sm",
        outline:
          "border-border bg-card text-foreground shadow-pixel-sm hover:border-accent hover:text-accent active:translate-x-[1px] active:translate-y-[1px] active:shadow-none",
        secondary:
          "border-accent bg-accent text-accent-foreground shadow-pixel hover:bg-[#4ee7f2] active:translate-x-[2px] active:translate-y-[2px] active:shadow-pixel-sm",
        ghost: "hover:border-border hover:bg-secondary",
        link: "text-accent underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 px-3 has-[>svg]:px-2.5",
        lg: "h-11 px-6 text-base has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
