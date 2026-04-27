interface SetupGuideProps {
  isOpen: boolean;
  onClose: () => void;
}

export function SetupGuide({ isOpen, onClose }: SetupGuideProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-card rounded shadow p-4 max-w-3xl w-full mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-3">
          <h3 className="text-lg font-semibold">Tournament Setup Guide</h3>
          <button
            onClick={onClose}
            className="text-muted-foreground hover:text-foreground text-xl font-bold"
          >
            x
          </button>
        </div>

        <div className="space-y-3 text-sm">
          {/* TIME CONFIGURATION */}
          <section>
            <h4 className="font-semibold text-foreground mb-2 pb-1 border-b border-border">
              Time Configuration
            </h4>
            <div className="space-y-2">
              <div>
                <h5 className="font-medium text-foreground mb-1">Day Start / Day End</h5>
                <p className="text-foreground">
                  The operating hours for your tournament in 24-hour format (HH:mm). All matches must be scheduled within this window.
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  <strong>Example:</strong> Day Start: 09:00, Day End: 18:00 allows matches from 9 AM to 6 PM.
                </p>
              </div>

              <div>
                <h5 className="font-medium text-foreground mb-1">Tournament Date</h5>
                <p className="text-foreground">
                  The calendar date of the tournament. Used for display purposes and when exporting schedule data.
                </p>
              </div>

              <div>
                <h5 className="font-medium text-foreground mb-1">Interval Minutes</h5>
                <p className="text-foreground">
                  The duration of each scheduling slot in minutes. This determines how granular your schedule will be. Shorter intervals allow more precise timing but increase solver complexity.
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  <strong>Example:</strong> If set to 30, each slot represents 30 minutes (9:00-9:30, 9:30-10:00, etc.)
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  <strong>Common values:</strong> 15, 30, 45, or 60 minutes
                </p>
              </div>

              <div>
                <h5 className="font-medium text-foreground mb-1">Breaks</h5>
                <p className="text-foreground">
                  Time windows when no matches should be scheduled. Use for meal breaks, ceremonies, or facility constraints.
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  <strong>Example:</strong> A break from 12:00 to 13:00 blocks the lunch hour from scheduling.
                </p>
              </div>
            </div>
          </section>

          {/* VENUE */}
          <section>
            <h4 className="font-semibold text-foreground mb-2 pb-1 border-b border-border">
              Venue
            </h4>
            <div>
              <h5 className="font-medium text-foreground mb-1">Court Count</h5>
              <p className="text-foreground">
                The total number of courts available for simultaneous match play. This directly affects how many matches can run in parallel and the overall tournament duration.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                <strong>Example:</strong> With 4 courts, up to 4 matches can run simultaneously.
              </p>
            </div>
          </section>

          {/* PLAYER CONSTRAINTS */}
          <section>
            <h4 className="font-semibold text-foreground mb-2 pb-1 border-b border-border">
              Player Constraints
            </h4>
            <div>
              <h5 className="font-medium text-foreground mb-1">Default Rest Minutes</h5>
              <p className="text-foreground">
                The minimum recovery time required between a player's consecutive matches. The solver enforces this gap to ensure players have adequate rest.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                <strong>Example:</strong> 30 minutes means a player finishing at 10:00 cannot start another match before 10:30.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                <strong>Note:</strong> Individual players can specify longer rest requirements in their profile.
              </p>
            </div>
          </section>

          {/* EVENT STRUCTURE */}
          <section>
            <h4 className="font-semibold text-foreground mb-2 pb-1 border-b border-border">
              Event Structure
            </h4>
            <div>
              <h5 className="font-medium text-foreground mb-1">Rank Counts</h5>
              <p className="text-foreground">
                The number of positions per event type that each school will field. This defines the structure of your tournament brackets.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                <strong>Event types:</strong> MS (Men's Singles), WS (Women's Singles), MD (Men's Doubles), WD (Women's Doubles), XD (Mixed Doubles)
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                <strong>Example:</strong> MS=3 means each school has 3 Men's Singles positions (MS1, MS2, MS3).
              </p>
            </div>
          </section>

          {/* LIVE TOURNAMENT */}
          <section>
            <h4 className="font-semibold text-foreground mb-2 pb-1 border-b border-border">
              Live Tournament
            </h4>
            <div>
              <h5 className="font-medium text-foreground mb-1">Freeze Horizon Slots</h5>
              <p className="text-foreground">
                The number of upcoming time slots that are protected from changes during rescheduling. This prevents disruption to matches that are about to begin or are in progress.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                <strong>Example:</strong> If set to 2 and interval is 30 minutes, matches in the next hour (2 slots) will not be moved.
              </p>
              <p className="text-muted-foreground mt-1 text-xs">
                <strong>Tip:</strong> Set to 0 for maximum flexibility when generating the initial schedule. Increase during live tournament to protect imminent matches.
              </p>
            </div>
          </section>

          {/* OPTIMIZATION */}
          <section>
            <h4 className="font-semibold text-foreground mb-2 pb-1 border-b border-border">
              Optimization Settings
            </h4>
            <div className="space-y-2">
              <div>
                <h5 className="font-medium text-foreground mb-1">Maximize Court Utilization</h5>
                <p className="text-foreground">
                  When enabled, the solver prefers schedules that keep all courts active, reducing idle gaps between matches and finishing the tournament earlier.
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  <strong>Utilization Weight:</strong> Controls how strongly court usage is prioritized. Higher values create tighter schedules.
                </p>
              </div>

              <div>
                <h5 className="font-medium text-foreground mb-1">Game Spacing Constraint</h5>
                <p className="text-foreground">
                  Adds soft constraints on the time between a player's consecutive matches. Useful for ensuring adequate recovery or keeping a player's matches within a compact time window.
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  <strong>Minimum Spacing:</strong> Penalizes matches that are too close together.
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  <strong>Maximum Spacing:</strong> Penalizes matches that are too far apart.
                </p>
                <p className="text-muted-foreground mt-1 text-xs">
                  <strong>Note:</strong> These are soft constraints - violations are penalized but allowed if no better solution exists.
                </p>
              </div>
            </div>
          </section>

          {/* TIPS */}
          <div className="mt-3 p-2 bg-blue-50 border border-blue-200 rounded-sm">
            <h4 className="font-semibold text-blue-900 mb-1 text-sm">Quick Reference</h4>
            <ul className="list-disc list-inside space-y-0.5 text-blue-800 text-xs">
              <li>Total available time = Day End minus Day Start (in minutes)</li>
              <li>Number of slots = Total time divided by Interval Minutes</li>
              <li>More courts = more simultaneous matches = shorter overall schedule</li>
              <li>Shorter intervals = more precise timing but more complex scheduling</li>
              <li>All settings can be adjusted and the schedule regenerated at any time</li>
              <li>Break times must fall within your Day Start and Day End window</li>
            </ul>
          </div>
        </div>

        <div className="mt-3 flex justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 bg-blue-600 text-white rounded-sm text-sm hover:bg-blue-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
