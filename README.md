# Echo – 3D ghost assistant (static, GitHub Pages ready)

- Open `index.html` via any static server (GitHub Pages works as-is, no build step).
- Rename the mascot: edit `BOT_NAME` at the top of `js/main.js` (also `apple-mobile-web-app-title` / manifest name).
- AI: tap ⚙️, paste a free Gemini key from https://aistudio.google.com/apikey. The key is stored only in this browser's localStorage, never in the repo.
- Endpoint: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` (header `x-goog-api-key`). Default model `gemini-3.5-flash-lite`; falls back automatically to the next model if one is retired.
- No key = demo mode with canned replies.
- iPhone: open in Safari, Share › Add to Home Screen for a full-screen app.
- three.js r187 is vendored in `vendor/` (no CDN needed).

## Switches (URL params)
- Default = Echo particle ghost (`e`) on the premium black UI (`4`), orange theme (`4` white/silver).
- `?ghost=cute|a|b|c|d|e|f|g|h` · `?ui=1|2|3|4` · `?theme=1` orange · `2` icy cyan · `3` violet/magenta · `4` white/silver mono.
- Change defaults via `DEFAULT_GHOST` / `DEFAULT_UI` in `js/main.js`.
