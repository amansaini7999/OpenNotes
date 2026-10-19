# Contributing to OpenNotes

Thank you for helping make handwriting and PDF annotation more accessible.
Code, documentation, accessibility feedback, reproducible bug reports and
physical-device testing are all welcome. Please keep discussions respectful
and focused on the work.

## Find a starting point

- Read the [README](./README.md) and [user guide](./docs/USER_GUIDE.md).
- Browse [open issues](https://github.com/amansaini7999/OpenNotes/issues).
  For a substantial feature or architectural change, open an issue first to
  agree on scope. Small, focused fixes can go directly to a pull request.
- For a security vulnerability, follow [SECURITY.md](./SECURITY.md) instead of
  posting a public issue.

## Set up locally

1. Fork this repository and clone your fork.
2. Use Node.js 24.11+ in the 24.x line and npm.
3. Run `npm ci`, then `npm run dev`.
4. Create a branch for your change.

The [development guide](./docs/DEVELOPMENT.md) explains production-preview
setup, architecture, browser dependencies and project-relative builds.
[AGENTS.md](./AGENTS.md) contains the repository rules for coding assistants;
human contributors should observe the same data-safety and offline guarantees.

Use throwaway notebooks on localhost. Export a backup before testing against
notes you care about; never clear site data as a recovery shortcut.

## Make and validate a change

- Keep the change focused and preserve existing behavior outside its scope.
- Add a regression test for a bug fix and tests for new behavior. Include
  migration and older-backup tests when changing stored data.
- Keep original imports and notebook identities intact. Do not add runtime
  network dependencies to an offline feature.
- Update directly related documentation, reusing existing guides rather than
  copying them into several places.

Start with the smallest relevant test selection. Before submitting code,
run the applicable checks:

```text
npm test
npm run check
npm run build
npm run test:e2e
```

Browser tests run against the production build. See
[validation instructions](./docs/DEVELOPMENT.md#validation) for browser setup,
isolated ports, focused test selection and the `/OpenNotes/` deployment path.
Documentation-only changes need link/template checks, not a local app rebuild.

For input changes, distinguish Pencil, finger, mouse, hand-tool and read-mode
testing. Include device/OS/browser details and say whether testing was on
physical hardware or emulation. Automated WebKit tests cannot certify Apple
Pencil feel, iPadOS system menus or every clipboard permission flow.

## Open a pull request

1. Target `main` and link the related issue, if any.
2. Explain the problem, the behavior change and how you tested it.
3. For UI changes, include screenshots or a short recording with private
   content removed. For data changes, explain compatibility and recovery.
4. Fill out the PR template, including checks not run and known limitations.
5. Wait for required CI and maintainer review; address feedback in the PR.
   Do not bypass failing checks.

See [CODEOWNERS](./.github/CODEOWNERS) for review ownership. Passing PR builds
do not publish a preview or deploy production; validated changes merged into
`main` are deployed by the existing GitHub Pages workflow.

## Report bugs safely

Use the [bug-report form](https://github.com/amansaini7999/OpenNotes/issues/new?template=bug_report.yml).
Provide minimal reproduction steps, expected/actual behavior, device and
browser versions, installed-PWA versus browser-tab mode, and the save status.
For PDF problems, include file size/page count and whether the issue affects
import, display, annotation or export.

Do not upload personal notebooks, medical/student records, unpublished
research, secrets or copyrighted books without permission. Prefer a small
synthetic document that reproduces the problem. Redact screenshots and browser
diagnostics before sharing them.

## License

Contributions are made under the project's [MIT License](./LICENSE).
Only contribute code and assets you have permission to share. AI-assisted
contributions are welcome, but contributors remain responsible for reviewing,
understanding and testing the result.
