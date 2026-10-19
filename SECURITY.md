# Security policy

## Supported version

Security fixes target the latest `main` revision and current
[GitHub Pages release](https://amansaini7999.github.io/OpenNotes/).
Older revisions do not have a guaranteed backport or support schedule.

## Report a vulnerability privately

Use GitHub's
[Report a vulnerability](https://github.com/amansaini7999/OpenNotes/security/advisories/new)
form, also available under **Security -> Advisories**. Private vulnerability
reporting is enabled for this repository. A GitHub account is required.

Do not post exploit details in a public issue or pull request before the
maintainer has had an opportunity to investigate and coordinate disclosure.
For ordinary bugs without a security impact, use the
[bug-report form](https://github.com/amansaini7999/OpenNotes/issues/new?template=bug_report.yml).

Include:

- Affected revision or deployment, browser/OS and reproduction steps.
- Expected versus observed behavior and the possible security impact.
- A minimal proof of concept using synthetic data, if available.
- Relevant redacted logs and any suggested mitigation.

Do not attach real notebooks, credentials, personal records or private
clipboard contents. Test only with data and systems you are authorized to use.

This is a volunteer-maintained project, so there is no guaranteed response
time or security-service SLA. Reports are reviewed privately; fix and
disclosure timing will be coordinated through the advisory.

## Local data

OpenNotes stores notebooks in browser-managed storage, not an OpenNotes
server. Browser persistence does not protect against device loss, clearing
site data or uninstalling the app. Export editable backups regularly. See
[saving and backups](./docs/USER_GUIDE.md#saving-and-backups) for recovery
limitations and storage behavior.
