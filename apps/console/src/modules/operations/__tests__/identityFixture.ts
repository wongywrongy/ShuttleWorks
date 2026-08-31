/**
 * F-UNI-21 test fixture adapter. Most Operations tests exercise scheduling
 * behavior, not source-specific identity grammar; representing their old
 * arbitrary labels as a decomposed Meet code keeps those fixtures focused
 * without restoring a production opaque-label seam.
 */
import { meetMatchIdentity, type MatchIdentity } from '../../../platform/domain/matchIdentity';

export function identityFixture(label: string): MatchIdentity {
  return meetMatchIdentity({ event_code: label });
}
