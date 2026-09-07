# Runtime findings resolved during final integration

These three rows were found in current-build verification after the reviewed books. They are separate runtime findings, have no baseline severity, and do not change the 74-row historical finding register.

| ID | Observed issue | Resolution and evidence | Actual files and tests |
| --- | --- | --- | --- |
| RT-12 | Setup persistence could issue phantom/redundant writes around hydration, retries, and state/section versions. | Separate ETags, synchronous hydration guard, dirty-unmount flush, clean-unmount no-PUT, failed-save retry, reload persistence, and restore without phantom PUT are verified. | apps/console/src/hooks/useTournamentState.ts; apps/console/src/modules/setup/SetupProduct.tsx; tests/backend/test_tournament_setup.py; tests/backend/test_concurrent_state_writes.py; evidence/operator/setup-failure-retry.png and evidence/operator/session-layout.png. |
| RT-13 | Session court input could lose the opaque stored court ID during raw input and option round trips. | Explicit court options preserve the opaque ID while retaining the user-visible court label; raw input and round-trip tests pass. | apps/console/src/modules/setup/SetupRowsEditor.tsx; apps/console/src/modules/setup/SetupProduct.tsx; apps/console/src/modules/setup/__tests__/SetupProduct.test.tsx. |
| RT-14 | Receipt signup could lose the intended entry return context. | Safe return context is retained through signup, confirmation, and sign-in; controlled human-check success and valid-token journeys pass. | apps/entrant/app/lib/nextTarget.ts; apps/entrant/app/routes/signup.tsx; apps/entrant/app/routes/login.tsx; apps/entrant/app/routes/receipt.tsx; evidence/account-journey/11-human-check-controlled-complete.png. |

These runtime checks do not claim external email/payment delivery, cloud reconnect, full WCAG/AT coverage, or production provider behavior.
