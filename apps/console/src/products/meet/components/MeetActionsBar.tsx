/**
 * MeetActionsBar — kept as a stable import for the Meet surfaces. The
 * 44px actions-bar pattern is now the shared, module-agnostic
 * `ActionsBar` in control-plane; this re-exports it under the original
 * name so Meet pages need no churn.
 */
export { ActionsBar as MeetActionsBar } from '../../../components/control-plane/ActionsBar';
