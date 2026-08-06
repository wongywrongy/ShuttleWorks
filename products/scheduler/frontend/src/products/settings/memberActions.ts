/**
 * Which member-management actions are offered on a row, and why not.
 *
 * Pure logic, deliberately separate from the component: the last-owner
 * rule is the one piece of this surface that is easy to get subtly wrong
 * and expensive to notice, so it lives somewhere it can be tested
 * directly rather than only through rendered output.
 *
 * **This is a courtesy, not enforcement.** Every rule here is duplicated
 * server-side — `MEMBER_LAST_OWNER` (409) is the real invariant, held
 * under concurrency on both dialects. What this buys is that the common
 * case explains itself before the user clicks, instead of after.
 *
 * Two conventions worth knowing:
 * - A **hidden** action and a **disabled** action mean different things.
 *   Hidden = you could never do this (a viewer managing members).
 *   Disabled = you normally could, but not right now, and here is why.
 *   Rendering disabled controls a user can never enable is noise, so
 *   insufficient-role hides rather than disables.
 * - On your own row, "Remove" is not disabled — it is **"Leave
 *   workspace"**, a different action with different copy.
 */
import type { TournamentMemberDTO } from '../../api/dto';

export type MemberRole = 'viewer' | 'operator' | 'owner';

const ROLE_ORDER: MemberRole[] = ['viewer', 'operator', 'owner'];

/** Why the last-owner rule blocks something, plus the way out. Naming
 *  the escape hatch matters: "you can't" without "instead, do this" is
 *  where users get stuck. */
export const LAST_OWNER_REASON =
  'A workspace must always have at least one owner. Transfer ownership to someone else first.';

export interface ActionState {
  /** Render it at all? False = the user could never perform this. */
  shown: boolean;
  /** Rendered but not actionable right now. Always paired with a reason. */
  disabled: boolean;
  reason?: string;
}

export interface RowActions {
  changeRole: ActionState;
  transfer: ActionState;
  remove: ActionState;
  leave: ActionState;
}

const HIDDEN: ActionState = { shown: false, disabled: false };
const ENABLED: ActionState = { shown: true, disabled: false };

function blocked(reason: string): ActionState {
  return { shown: true, disabled: true, reason };
}

function ownerCount(members: TournamentMemberDTO[]): number {
  return members.filter((m) => m.role === 'owner').length;
}

/** True when removing or demoting this member would leave no owner.
 *
 *  Negative control (2026-08-04): stubbing this to `return false` makes
 *  exactly three tests in `PeopleAccessTab.test.tsx` fail — the inline
 *  reason, the aria-disabled demotion, and the blocked sole-owner leave.
 *  Verified rather than assumed, because Phase 1's backend concurrency
 *  test originally passed with its guard removed. If you change this
 *  function, re-run that check. */
function isLastOwner(
  members: TournamentMemberDTO[],
  member: TournamentMemberDTO,
): boolean {
  return member.role === 'owner' && ownerCount(members) <= 1;
}

export function memberActionsFor(
  members: TournamentMemberDTO[],
  member: TournamentMemberDTO,
  currentUserId: string | null,
  currentUserRole: MemberRole | null,
): RowActions {
  const isSelf = currentUserId != null && member.userId === currentUserId;
  const viewerIsOwner = currentUserRole === 'owner';
  const lastOwner = isLastOwner(members, member);

  // Leaving is available to any member on their own row, regardless of
  // role — you do not need permission to stop participating. The sole
  // owner is the one exception, and it is the invariant, not a
  // permission.
  const leave: ActionState = !isSelf
    ? HIDDEN
    : lastOwner
      ? blocked(LAST_OWNER_REASON)
      : ENABLED;

  if (!viewerIsOwner) {
    // A non-owner gets no management affordances at all. Showing them
    // greyed out would imply they are one setting away from working.
    return { changeRole: HIDDEN, transfer: HIDDEN, remove: HIDDEN, leave };
  }

  return {
    // Promotion is always safe; only demoting the last owner is not.
    // The menu offers the whole role list and the demote targets carry
    // the block, so the reason lands on the specific unavailable choice.
    changeRole: lastOwner ? blocked(LAST_OWNER_REASON) : ENABLED,
    // Transferring to yourself is a no-op server-side; hide rather than
    // disable, since "transfer to me" is not a thing anyone means.
    transfer: isSelf ? HIDDEN : ENABLED,
    // On your own row this is "Leave", handled above.
    remove: isSelf ? HIDDEN : lastOwner ? blocked(LAST_OWNER_REASON) : ENABLED,
    leave,
  };
}

/** Roles a given member can be moved to, with per-target blocking.
 *  Demoting the last owner is refused on the *target* role rather than
 *  on the menu as a whole, so "Owner" stays selectable and only the
 *  downgrades explain themselves. */
export function roleOptionsFor(
  members: TournamentMemberDTO[],
  member: TournamentMemberDTO,
): { role: MemberRole; disabled: boolean; reason?: string }[] {
  const lastOwner = isLastOwner(members, member);
  return ROLE_ORDER.map((role) => {
    const isDemotion = member.role === 'owner' && role !== 'owner';
    return isDemotion && lastOwner
      ? { role, disabled: true, reason: LAST_OWNER_REASON }
      : { role, disabled: false };
  });
}
