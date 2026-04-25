# Release Site Sync

1. Ask the user whether the change is a new version or a refinement.
2. If the work will be visible on staging, update `lib/releases.ts` so the version badge and `/changenotes` stay aligned with the repo source of truth.
3. Verify that the expected version and changelog are visible on staging.
4. Update `plan.bossuyt.fixassistant.com/changenotes` only after staging matches.
5. Ask the user whether to commit and push the finished version to GitHub.
