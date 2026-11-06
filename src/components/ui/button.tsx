import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2563EB] focus-visible:ring-offset-2 focus-visible:ring-offset-paper disabled:pointer-events-none disabled:opacity-50 min-h-10 px-3.5",
  {
    variants: {
      variant: {
        default: "border border-[#2563EB] bg-[#2563EB] text-white hover:border-[#1D4ED8] hover:bg-[#1D4ED8]",
        outline: "border border-[#D1D5DB] bg-white text-[#374151] hover:bg-[#F3F4F6]",
        ghost: "border border-transparent text-[#374151] hover:bg-[#F3F4F6]",
        destructive: "border border-[#DC2626] bg-white text-[#DC2626] hover:bg-[#FEF2F2]",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export function Button({
  className,
  variant,
  asChild = false,
  type = "button",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      className={cn(buttonVariants({ variant }), className)}
      type={asChild ? undefined : type}
      {...props}
    />
  );
}
