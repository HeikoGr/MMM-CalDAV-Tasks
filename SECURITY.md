# Security Policy

## Supported versions

Only the latest release on `master` receives fixes.

## Reporting a vulnerability

Please do **not** open a public issue for a security problem. Report it privately through GitHub:
**Security → Report a vulnerability** on
[this repository](https://github.com/HeikoGr/MMM-CalDAV-Tasks/security/advisories/new).

Include what an attacker can reach (the mirror's web port, the local machine, the CalDAV account),
the steps to reproduce and the module version. Never attach your `config.js`, passwords or
unredacted logs.

You will get an answer within two weeks. Fixes are released as a patch version, and the advisory is
published once a fixed version is available.

## Sensitive data the module handles

- the CalDAV user name and password (use a dedicated Nextcloud app password, never the account
  password)
- the content of your task lists
- write access: a long press on the mirror completes or reopens a task on the server

See [Nextcloud Preparation](https://github.com/HeikoGr/MMM-CalDAV-Tasks/wiki/Nextcloud-Preparation)
in the wiki for how to set up a separate app password.
