# Nextcloud Preparation

Using a dedicated Nextcloud app password is recommended for performance and account isolation.

## Recommended Setup

1. Open your Nextcloud user settings.
2. Go to `Security`.
3. Create a new app password for MagicMirror.
4. In the Tasks app, create a private link for the task list you want to display.

## Why This Matters

- App passwords reduce side effects from normal web sessions.
- Private list URLs make it easier to target a specific task list.
- Separate credentials simplify revocation if the mirror device is replaced.

Once you have the private link, username, and app password, continue with [Quick Start](Quick-Start).