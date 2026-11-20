# At-Home Kitchen

[Open the app](https://at-home-kitchen-web.onrender.com/#/journal)

Desktop-focused recipe menu, food journal, saved homemade meals, restaurant orders,
favorites, shopping lists and weekly menu reviews. The original 70-meal menu and
its embedded photos remain available without an account.

## Food journal

- **Menu meals:** choose a recipe and the amount eaten. The form only shows
  substitutions for ingredients in that recipe: milk or other dairy, relevant
  gluten-free products, and individual optional ingredients.
- Choices are stored with the entry. You can optionally remember choices for
  that recipe; changing a default does not rewrite previous entries.
- Supported ingredient substitutions recalculate the nutrition estimate using
  the selected product profile. Unknown product nutrition or an unknown portion
  stays unknown and is not counted as zero.
- **Outside the menu:** homemade descriptions are linked to Made Meals;
  restaurant orders are linked to Restaurants. The original food eaten remains
  separate from later recipe drafts and suggested alternatives.
- Existing journal data, favorites, ratings and backups remain compatible.

The food journal records what was actually eaten. The main menu still follows the
original preferences: no seafood, broccoli, zucchini or tofu; gluten-free dinners;
at most two dinner soups, stews or chilis.

## Assistant connection

The public Render deployment is a static website. **An in-app ChatGPT model is not
connected.** Being signed in on ChatGPT.com does not authorize this website to use
that session. It does not open hidden ChatGPT sessions or return canned keyword
matches as conversational AI answers.

The optional personal ChatGPT handoff preserves the exact question and chosen
context for review. Copying or opening ChatGPT happens only when selected; the
person pastes and sends the question there. Responses remain in ChatGPT. Prepared
question drafts are kept in this browser tab's session storage, not sent to a
server. No paid API-key fallback is enabled.

Genuine hosted subscription-backed answers require an approved hosted integration
and a secure backend with isolated user sessions. See
[the authorization brief](docs/hosted-chatgpt-authorization.md). The original local
Python server is single-user and must not be published as-is.

## Data and storage

Each person's journal and preferences remain in their own browser. There is no
account-based cross-device sync. Export a backup in Settings before clearing site
data or changing browsers. Never commit journal backups, private credentials, or
OAuth tokens to this repository.

## Development and deployment

Application source lives in `source/`. `site/index.html` contains the reviewed
recipe data, image bank, and built JavaScript. The build updates only the app
scripts, journal styles and versioned assistant script links; it preserves the
recipe and image payloads.

```sh
python3 scripts/inject_hosted_assistant.py
node scripts/test-hosted-assistant.js
node scripts/test-chatgpt-bridge.cjs
node scripts/test-journal-customizations.cjs
```

GitHub Actions checks the JavaScript, builds the HTML, runs these behavioral
regressions, and commits the verified HTML when it changes. Render publishes
`site/` from `main`. Confirm the built commit is live before reporting a release.
