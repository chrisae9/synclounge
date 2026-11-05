# Dependency maintenance

Application and server manifests use exact stable versions. Keep the root lockfile committed and regenerate it with the oldest supported CI toolchain (Node 22/npm 10). `.npmrc` requires peer compatibility and preserves exact versions for future installs. Dependabot remains responsible for proposing updates; review and merge them through the normal source workflow.

Validate a candidate with clean installs, `npm run check:dependencies`, lint, build, server/frontend tests, expanded sync fuzzing, audit, and the complete CI matrix. Use browser playback checks for player updates and route/settings checks for UI framework updates. CI and fixtures do not prove live two-client Plex or physical-device playback.

## Deliberate compatibility choices

- `eslint-plugin-import-x` replaces the incompatible legacy import plugin and resolver. Load the enabled rules through its public rule exports: its aggregate entry also loads an unused rule that depends on a removed minimatch API. Keep the complete enabled rule set, patched minimatch, native alias resolution, and negative lint fixtures. If an update adds a recommended rule, register it before merging rather than disabling it.
- The root Vue devtools SDK must satisfy Vuetify's peer requirement while Vuex retains its own older compatible SDK. Verify the installed graph on every supported Node/npm version; a successful install alone can miss a bad optional-peer hoist.
- Keep the separate Chromecast mux package until a receiver/device test proves it can be replaced. Shaka handles browser transmuxing without the old browser mux global.
- Keep CAF, Vuex, and the ASS subtitle renderer while their existing playback behavior is required. Replacing cancellation, state management, or subtitle rendering is a behavior migration that needs dedicated acceptance, not an age-based package swap.
- Keep production on an LTS Node line. Pin the multi-platform base image to a reviewed patch tag and index digest; let Dependabot propose version and digest updates. Preserve the browser compilation targets when changing build tools.

## Promotion

Integrate changes into `dev`, promote the tested source to `main`, and keep release publication separate from deployment. Production rollout requires its own authorization and fresh checks of actual SyncLounge activity; unrelated Plex traffic does not establish SyncLounge usage. Preserve room-state backups, storage, signing identity, and rollback configuration.
