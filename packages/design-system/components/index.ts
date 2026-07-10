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
export { Select, type SelectProps, type SelectOption } from './Select';
export { Separator } from './Separator';
export { StatusPill, type PillTone } from './StatusPill';
export {
  StatusBar,
  StatusCount,
  type StatusCountItem,
} from './StatusBar';
export { Modal } from './Modal';
export { Notice, type NoticeProps, type NoticeTone } from './Notice';
export { Hint, useHint } from './Hint';
export { Toast, ToastStack, type ToastData, type ToastLevel } from './Toast';
export {
  GanttTimeline,
  GANTT_GEOMETRY,
  placementBox,
  type GanttDensity,
  type GanttLaneOrientation,
  type GanttGeometryTier,
  type Placement,
  type GanttCell,
  type GanttBlockBox,
  type GanttTimelineProps,
} from './GanttTimeline';
