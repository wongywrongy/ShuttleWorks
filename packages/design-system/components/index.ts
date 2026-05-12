/**
 * @scheduler/design-system/components — barrel export
 *
 * Phase-4 primitives. More to come in subsequent passes:
 *   - Modal (depends on @radix-ui/react-dialog)
 *   - Hint  (depends on @phosphor-icons/react)
 *   - Toast (notification stack)
 *
 * All exports here are framework-agnostic React components that consume
 * only this package's tokens.css + tailwind-preset.js. They never reach
 * back into product-specific code.
 */

export { Button, buttonVariants, type ButtonProps } from './Button';
export {
  Card,
  CardHeader,
  CardFooter,
  CardTitle,
  CardDescription,
  CardContent,
  type CardProps,
} from './Card';
export { Input } from './Input';
export { Label } from './Label';
export { Separator } from './Separator';
export { PageHeader } from './PageHeader';
export { StatusPill, type PillTone } from './StatusPill';
export { Loader, LoadingSpinner } from './Loader';
