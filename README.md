# At-Home Kitchen — Render website

This repository has a Render static site configuration in `render.yaml`.

## One-time upload of the website

1. Download and extract the **At_Home_Kitchen_Render_Ready.zip** from ChatGPT.
2. Inside it, find `site/index.html`. This is the full 70-recipe website with embedded images.
3. In GitHub, select **Add file → Upload files** and upload the `site` folder with `index.html` in it. Keep the exact path `site/index.html` and **Commit changes**.
4. Render can then create a Static Site from this repository, using the included `render.yaml`, or use the settings **Build command:** `echo "Static Kitchen site ready"`, **Publish directory:** `site`.

## Public preview limitations

The static site supports recipes, food journaling, favorites, ratings, Made Meals, restaurant order records and local recommendations. Each person's data is saved in *their own browser*, without cross-device synchronization.

The desktop Python server is local-only and **must not** be published as-is. Subscription-powered AI and live restaurant lookup are not activated in the static deployment. They require secure, isolated per-user cloud authorization first. Never commit private backups, session tokens, or OAuth credentials to GitHub.

The previously discussed smart food log customization controls have not yet been implemented.
