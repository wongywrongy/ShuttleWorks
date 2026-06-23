/** The three suite product modes inside an open workspace. */
export type ProductId = 'meet' | 'bracket' | 'display';

/** One entry in the product switcher. Disabled entries carry a reason
 *  (shown as a tooltip) explaining why this workspace can't enter them yet. */
export interface ProductSwitcherItem {
  id: ProductId;
  label: string;
  available: boolean;
  disabledReason?: string;
}

/** Identity of the open workspace, as the shell displays it. Fields are
 *  nullable because they hydrate asynchronously. */
export interface WorkspaceIdentity {
  name: string | null;
  date: string | null; // ISO date string
  status: 'draft' | 'active' | 'archived' | null;
  kind: 'meet' | 'bracket' | null;
}
