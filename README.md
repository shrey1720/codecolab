# CodeCollab Frontend

This repository contains the static web client for the CodeCollab platform. It connects to the Java backend API and provides the discussion dashboard, authentication flows, question feed, and notifications UI.

## Local development

1. Start the backend service from the `ajt_be` repository.
2. Serve the frontend locally with any static web server, for example:
   ```bash
   python -m http.server 8000
   ```
3. Open `http://localhost:8000` in a browser.

The frontend defaults to `http://localhost:8080/api` when served from a local host and falls back to the Render deployment when accessed from a remote host.

## Repository hygiene

- Keep generated logs and local editor state out of source control.
- Treat secrets as backend-only configuration and never add them to the frontend repository.
- Prefer the deployed API URL in production; do not hardcode local credentials or tokens in the client.
