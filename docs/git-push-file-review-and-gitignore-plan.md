# Git commit selection and .gitignore implementation plan

Prepared for GoldenHour on 25 October 2026.

## Scope

This is a plan for a later implementation run. Creating this document does not edit `.gitignore`, stage files, commit, delete files or push to a remote.

Git pushes commits, not individual working files. First select and review files, stage them, create a commit, and then push the intended branch. A changed file is a candidate for review, not automatically safe to publish.

## Stage 1 ? Establish the current baseline

1. Work from the repository root.
2. Run these read-only checks individually:

```powershell
git status --short
git branch --show-current
git remote -v
git diff --stat
git diff --check
git diff --cached --stat
```

3. Inspect local remote output without posting access tokens that might be embedded in URLs.
4. Preserve existing changes. Do not run `git reset --hard`, `git clean`, or broad deletion commands.
5. Review both tracked modifications and untracked files. `git diff` does not show untracked file contents; open those separately.
6. Confirm the intended remote and branch before the eventual push. Do not assume `main` or force-push.

### Findings from this workspace

- `.gitignore` currently excludes `node_modules/`, `dist/`, `.env`, `.env.local`, OS metadata, `coverage/` and `*.log`.
- The unanchored `dist/` rule already covers nested package builds, including `packages/scenario-fixtures/dist/`. Its generated `index.js` and declaration maps should not be committed.
- Root `.env`, `apps/api/.env` and `apps/web/.env` are ignored. Their contents were not read for this audit.
- `.env.example` is tracked and should remain tracked, with placeholder values only.
- `pnpm-lock.yaml` and the workspace configuration belong in Git.
- `packages/scenario-fixtures/src/data/nitk_facilities.synthetic.json` is tracked and is a required source dataset, not disposable database output.
- Two generated PDFs under `output/pdf/` are tracked. Adding an ignore rule alone will not remove them from Git.
- No tracked dependency directories, build directories or coverage directories were found in the filename audit. This does not certify the repository or its history as secret-free.

## Stage 2 ? Decide what belongs in the commit

### Commit these categories after review

| Category | Paths / examples | Why |
| --- | --- | --- |
| Application source | `apps/api/src/`, `apps/web/src/` | API, agent, map, patient form and demo functionality |
| Shared contracts | `packages/contracts/src/` | Keeps frontend/backend request and response types aligned |
| Scenario source | `packages/scenario-fixtures/src/` | Canonical identities, importer, operational overlays and teaching fixtures |
| Required dataset | `packages/scenario-fixtures/src/data/nitk_facilities.synthetic.json` | Fresh clones must contain the same hospital identities and coordinates |
| Regression tests | `apps/api/test/`, `apps/web/src/test/` | Verifies pin refresh, current NITK data and isolated New York demo |
| Build and dependency definitions | Root/package `package.json`, `pnpm-lock.yaml`, `pnpm-workspace.yaml`, TypeScript/Vite/Vitest configs | Reproducible install and compilation |
| Database definitions | `migrations/*.sql`, migration/seed source | Rebuilds schema and synthetic data without sharing local databases |
| Deployment definitions | Dockerfiles and compose YAML | Reproducible deployment, provided no credentials are embedded |
| Documentation | `README.md`, reviewed `docs/*.md` | Setup and implementation context |
| Environment template | `.env.example` | Documents variable names using dummy values |
| Ignore policy | `.gitignore` | Prevents accidental inclusion of local artifacts |

Unchanged tracked files do not need to be staged again: they are already part of the next commit's repository snapshot.

### Recent files that must travel together

1. Patient-aware agent changes: review the modified agent modules, case routes, store, recommendation UI, contract changes and scenario overlays as one connected feature. Include the new `packages/contracts/src/pathway.ts`, `packages/scenario-fixtures/src/scenarios.ts` and patient-state regression test. Missing these new files can break imports in a fresh clone.
2. Map/patient reset changes: include `LiveMap.tsx`, `MapPanel.tsx`, `AmbulancePage.tsx`, relevant store changes and origin/map tests.
3. Current NITK test data: include `apps/web/src/test/nitk-fixtures.ts` with the changed map/ambulance tests and `apps/api/test/nitk-directory-ranking.test.ts`. The web test helper imports the canonical JSON dataset.
4. Separate New York demo: include `apps/web/src/lib/legacy-demo.ts`, `apps/web/src/pages/LegacyDemoPage.tsx`, route/header changes and `LegacyDemoPage.test.tsx`. Do not replace the canonical NITK dataset with these fictional hospitals.
5. Documentation: include the patient-state handoff and this plan if they are intended project documentation.

These changes overlap within files. Prefer one coherent, reviewed feature commit unless you can use `git add -p` to create independently buildable commits. Do not split shared types away from their consumers.

### Working-tree inventory at audit time

`M` means modified tracked file; `??` means untracked. This inventory will change after this document is created or further work occurs; rerun status before staging.

```text
 M apps/api/src/db/store.ts
 M apps/api/src/modules/agents/agent1.ts
 M apps/api/src/modules/agents/agent2.ts
 M apps/api/src/modules/agents/agent3.ts
 M apps/api/src/modules/agents/agentCoordinator.ts
 M apps/api/src/modules/agents/gemini.ts
 M apps/api/src/modules/agents/tools.ts
 M apps/api/src/modules/cases/routes.ts
 M apps/api/test/hospital-directory-origin-fix.test.ts
 M apps/web/src/App.tsx
 M apps/web/src/components/Header.tsx
 M apps/web/src/components/LiveMap.tsx
 M apps/web/src/components/MapPanel.tsx
 M apps/web/src/components/RecommendationPanel.tsx
 M apps/web/src/pages/AmbulancePage.tsx
 M apps/web/src/test/AmbulancePage.test.tsx
 M apps/web/src/test/LiveMap.test.tsx
 M packages/contracts/src/case.ts
 M packages/contracts/src/hospital.ts
 M packages/contracts/src/index.ts
 M packages/contracts/src/recommendation.ts
 M packages/scenario-fixtures/src/index.ts
 M packages/scenario-fixtures/src/scenario-overlay.ts
?? apps/api/test/nitk-directory-ranking.test.ts
?? apps/api/test/patient-state-aware-hospital-selection.test.ts
?? apps/web/src/lib/legacy-demo.ts
?? apps/web/src/pages/LegacyDemoPage.tsx
?? apps/web/src/test/LegacyDemoPage.test.tsx
?? apps/web/src/test/nitk-fixtures.ts
?? docs/codex-patient-state-aware-hospital-selection-plan.md
?? packages/contracts/src/pathway.ts
?? packages/scenario-fixtures/src/scenarios.ts

```

### Do not commit

- Real environment files, API keys, passwords, session cookies or credential-bearing logs.
- `node_modules`, build `dist`, coverage, test traces, local caches or TypeScript incremental caches.
- Local database snapshots, dumps and backup archives containing runtime data.
- The supplied Downloads `database.zip` itself. It is outside the repository; retain the reviewed, necessary canonical source dataset in Git instead.
- Temporary screenshots, renders and scratch files unless specifically chosen as documentation assets.
- Unrelated personal IDE settings.

Do not use broad exclusions for `*.json`, `*.sql`, all images or all Markdown: they would hide necessary dataset, migration or documentation files.

## Stage 3 ? Update .gitignore in a later implementation run

Replace the short current file with the following reviewed baseline, or merge it while avoiding duplicate rules:

```gitignore
# Installed dependencies and local package caches
node_modules/
.pnpm-store/

# Generated builds and compiler caches
dist/
build/
*.tsbuildinfo
.vite/
.cache/
.turbo/

# Local environment files at any package depth
.env
.env.*
!.env.example
!.env.*.example

# Test output
coverage/
playwright-report/
test-results/

# Generated exports and temporary output
/output/
/tmp/
/temp/

# Local database/backup files; SQL migration source remains tracked
*.sqlite
*.sqlite3
*.db
*.db-journal
*.sqlite-wal
*.sqlite-shm
*.sqlite3-wal
*.sqlite3-shm
*.db-wal
*.db-shm
*.dump
*.bak
/backups/

# Logs and machine-specific files
*.log
.DS_Store
Thumbs.db
.idea/
```

Implementation notes:

1. Do not put real values in an allowed example file. Exceptions permit filenames, not secrets.
2. `/output/` intentionally ignores generated report exports. It does not ignore every PDF in the repository.
3. Keep shared VS Code settings only if intentionally maintained. This plan does not blanket-ignore `.vscode/`.
4. These database extensions are a preventive policy, not evidence those files currently exist. If an intentional test database fixture is needed later, review and explicitly allow that exact fixture.
5. Do not add `pnpm-lock.yaml` to ignore rules.
6. Git ignore rules are not a security boundary: tracked files remain tracked, and ignored files can still be force-added.

## Stage 4 ? Resolve already tracked generated PDFs

The current tracked exports are:

```text
output/pdf/goldenhour-current-tech-stack-and-techniques.pdf
output/pdf/goldenhour-rag-architecture-and-implementation-guide.pdf
```

Recommended repository policy: retain editable documentation in `docs/` and keep generated PDFs as local exports or release attachments.

If applying that policy later, remove only these paths from the Git index, keeping local files:

```powershell
git rm --cached -- output/pdf/goldenhour-current-tech-stack-and-techniques.pdf output/pdf/goldenhour-rag-architecture-and-implementation-guide.pdf
```

Then inspect the staged deletions. This command is an instruction for the future run; it was not executed while preparing this plan.

If the PDFs are deliberately published documentation, keep them tracked instead and add narrowly scoped exceptions for those exact files under `/output/`. Do not silently remove deliverables that the team intends to ship. Keep their generated content current with the implementation.

Removing a tracked file or adding an ignore rule does not remove earlier commits. If a real secret is found in history, revoke/rotate it first and separately coordinate any history rewrite. Do not rewrite shared history as part of routine cleanup.

## Stage 5 ? Validate ignore rules and inspect the proposed commit

After applying the rules, check known paths:

```powershell
git check-ignore -v -- .env apps/api/.env apps/web/.env apps/web/dist/index.html packages/scenario-fixtures/dist/index.js
git check-ignore -v --no-index -- .env.production apps/api/.env.production output/pdf/goldenhour-current-tech-stack-and-techniques.pdf
git status --short --untracked-files=all
git ls-files -- .env apps/api/.env apps/web/.env
git ls-files -- .env.example pnpm-lock.yaml packages/scenario-fixtures/src/data/nitk_facilities.synthetic.json
```

Expected results:

- Real `.env` files, environment variants, builds and generated exports are covered by ignore rules.
- The `git ls-files` command for real environment files prints nothing.
- The template, lockfile and canonical dataset remain tracked.
- Required new source modules/tests remain visible as untracked until staged.
- `git check-ignore` can return exit code 1 when a path is not ignored; interpret the result rather than treating every nonzero exit as failure.

Review all proposed source and documentation for real credentials, private data and machine-specific absolute paths. A browser Google Maps key is visible to users by design; never reuse an unrestricted server key there. Local environment values still stay out of Git.

Stage only reviewed paths. Examples for the new modules and their consumers:

```powershell
git add -- apps/web/src/App.tsx apps/web/src/components/Header.tsx apps/web/src/lib/legacy-demo.ts apps/web/src/pages/LegacyDemoPage.tsx apps/web/src/test/LegacyDemoPage.test.tsx
git add -- packages/contracts/src/pathway.ts packages/scenario-fixtures/src/scenarios.ts apps/api/test/patient-state-aware-hospital-selection.test.ts
git add -- apps/web/src/test/nitk-fixtures.ts apps/api/test/nitk-directory-ranking.test.ts
```

These examples are NOT the complete commit: also stage the reviewed modified consumers and tests listed in Stage 2, the revised `.gitignore`, and intended docs. Use explicit paths or `git add -p`; avoid blind `git add .` and never force-add environment files.

Inspect the final index:

```powershell
git diff --cached --name-status
git diff --cached --stat
git diff --cached --check
git diff --cached
git status --short
```

Read the staged diff locally; do not paste secrets into chat if one is found. Unstage unwanted files using `git restore --staged -- <exact-path>` without discarding the working copy.

## Stage 6 ? Verify, commit and push

Run appropriate checks after implementation, not while merely writing this document:

```powershell
pnpm install --frozen-lockfile
pnpm typecheck
pnpm build
pnpm --filter @goldenhour/web test -- src/test/LiveMap.test.tsx src/test/AmbulancePage.test.tsx src/test/LegacyDemoPage.test.tsx
pnpm --filter @goldenhour/api test -- test/hospital-directory-origin-fix.test.ts test/nitk-directory-ranking.test.ts test/patient-state-aware-hospital-selection.test.ts
```

1. Prefer a fresh checkout or clean CI runner to prove no ignored local files are required. Supply environment variables through local/CI configuration, never by committing real `.env` files.
2. Run the broader test suite before calling the entire project green. Existing legacy test assumptions may require separate migration; report failing suites rather than claiming targeted checks cover everything.
3. Some current integration tests may contact Gemini when credentials are present. Prefer configured test doubles for offline repeatability, and record fallback/quota behavior separately from live-agent validation.
4. Ensure a clean-clone build resolves the new pathway, scenario and legacy demo imports.
5. Check that non-admin users cannot access the New York demo and that demo actions do not modify NITK state.
6. Recheck staged files after verification. Build output must not appear in the commit.
7. Create a clear commit only when authorized for the implementation/publish run. Example subject: `Use canonical NITK scenarios and add isolated admin 2D demo`.
8. Push to the intended remote and current branch. Do not invent the remote or branch; after confirming `origin` is correct, `git push -u origin HEAD` is suitable for an intended new branch. Do not force-push.
9. Verify remote CI and report the commit hash and remaining limitations.

## Completion checklist

- [ ] All new imports have their source files committed.
- [ ] Current canonical hospital identities and coordinates remain in the repository.
- [ ] New York demo data stays separate from the NITK source dataset.
- [ ] Lockfile, package manifests, workspace config and migrations are retained.
- [ ] No actual environment files, secrets, dependencies or generated builds are staged.
- [ ] Generated PDF policy is explicit; tracked-file handling matches that policy.
- [ ] Staged diff has been reviewed, including documentation and fixtures.
- [ ] Targeted checks pass; broader failures and live-service limitations are reported honestly.
- [ ] Push destination is verified and no destructive cleanup or history rewrite was used.

## Copy-ready instruction for a later Codex run

> Apply the reviewed ignore policy from this document. Inspect the current Git status again because the recorded inventory may be stale. Preserve all existing source changes. Review source, tests, contracts, canonical NITK data and documentation together so new imports are included. Exclude local secrets, dependencies, caches, build products and generated exports. Handle tracked PDFs according to the agreed documentation policy using index-only removal if appropriate. Validate the rules and run relevant checks. Report the exact proposed commit contents and any unresolved issues. Do not commit or push unless that action is explicitly authorized in the implementation request.
