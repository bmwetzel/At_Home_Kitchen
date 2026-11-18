# At-Home Kitchen — Hosted Sign in with ChatGPT application brief

**Status:** Preliminary application materials only. OpenAI has not approved or issued a hosted client ID. No live ChatGPT-plan authentication has been enabled on Render.

## Project
- **Product:** At-Home Kitchen
- **Developer:** Independent individual / personal project (not representing a company)
- **Public website:** https://at-home-kitchen-web.onrender.com
- **Source repository:** https://github.com/bmwetzel/At_Home_Kitchen
- **Hosting:** Render static website; a secure backend would be required for hosted OAuth.
- **Goal:** Enable each eligible visitor to explicitly sign in with their **own personal ChatGPT account** and authorize eligible AI requests using their existing ChatGPT plan, without an API key or separately billed API credits.

## Intended AI features
- Explain and personalize recipes from the 70-item menu
- Turn voluntarily supplied homemade-meal descriptions into editable recipe suggestions
- Compare restaurant orders with verifiable menu information where accessible
- Suggest optional weekly menu updates from saved favorites, dislikes, and food logs, subject to user approval
- Respect ingredient exclusions and gluten-free dinners, and preserve opt-in control of any personal journal data

## Requested integration
Hosted **Sign in with ChatGPT** with the **ChatGPT plan use for AI requests** capability, not identity-only sign-in. OpenAI documentation says hosted applications require approval and an issued OAuth client registration; the locally hosted OSS dynamic-registration process is not authorization for a public Render website.

**Current request:** Guidance for an independent, non-company developer on applying for hosted access, and on availability/eligibility with personal ChatGPT subscriptions.

## Proposed security architecture (not yet implemented)
1. Obtain an OpenAI-authorized OAuth client and exact registered HTTPS callback URI.
2. Add an authenticated server backend; the current public static site cannot securely operate hosted OAuth sessions on its own.
3. Use authorization code + PKCE, verify ID tokens with official discovery/JWKS and secure state/nonces, with independent sessions per user.
4. Protect any access/refresh tokens on the backend, not in browser localStorage, URLs, logs, or public GitHub.
5. Request explicit permission for both identity and eligible plan usage; do not request users' ChatGPT conversations.
6. Separate each visitor's food journal, ratings, and AI authorization; never share the developer's personal ChatGPT account or credentials.
7. Keep AI features unavailable until the authorized integration is verified; no API-key fallback or paid API billing.
8. Make all menu changes require confirmation, with safe reversibility and clear labels for estimated nutrition.

## Current public app
The public hosted Kitchen Assistant is browser-local, not a live ChatGPT model. The separately available local desktop integration does not establish hosted-website approval.

## Official sources
- Hosted interest form: https://openai.com/form/sign-in-with-chatgpt-interest/
- Quickstart: https://developers.openai.com/siwc/quickstart
- Website guide: https://developers.openai.com/siwc/website
- Open-source plan use overview: https://developers.openai.com/siwc/token-sharing-open-source
- OpenAI support: https://help.openai.com/en/articles/6614161-how-can-i-contact-support

Do not place personal contact information or any token in this public repository. For account-specific eligibility, contact OpenAI Support privately through help.openai.com.