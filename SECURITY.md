# Security policy

## Reporting a vulnerability

Please report security problems **privately** through GitHub security advisories:

1. Open the repository's **Security** tab.
2. Choose **Report a vulnerability** (or go to
   <https://github.com/ss251/kesenmemento-v2/security/advisories/new>).
3. Describe the problem, how to reproduce it and what it could affect.

Please do not open a public issue or pull request for a vulnerability, and do not include secrets or other people's
personal data in a report. We will acknowledge a report as soon as we can, work on a fix, and credit you in the advisory
if you wish.

## Scope

This is a static browser app plus a small local server (`scripts/serve.js`, which listens on 127.0.0.1 and serves the
built page, the data files and one `/api/live` endpoint that reads public weather and port pages). Reports about the
app, the server, the data scripts or the build are welcome. Problems in a dependency are best reported to that project;
tell us as well if it affects this one.

## Secrets

The repository holds no credentials, and the app needs none. If you find a key, token or personal data in the
repository or its history, report it privately in the same way.

## Supported versions

Only the latest commit on the default branch is supported.
