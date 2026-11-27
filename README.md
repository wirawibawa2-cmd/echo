# Kira (Echo)

Live app: Kira video mascot at the site root. Previous Echo v6 (3D ghost) is archived in `archive/old-root/`. Preview builds also stay under `/preview/app/`.

- Open `index.html` via any static server (GitHub Pages works as-is, no build step).
- AI: tap ⚙️, paste a free Gemini key from https://aistudio.google.com/apikey. The key is stored only in this browser's localStorage, never in the repo.
- iPhone: open in Safari, Share › Add to Home Screen for a full-screen app.
- Cache-busting query is `?v=85`.

---

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

## Voice
- Default: natural Gemini TTS (`gemini-3.8-flash-lite-tts`, falls back to `gemini-3.8-flash-tts`) via `POST /v1beta/interactions` with the same key; 13 prebuilt voices (default Leda – youthful; style "playful, warm and teasing, a little sultry"); iPhone fallback prefers young bright voices (Zoe, Nicky, Ava, Samantha) at pitch 1.18, rate 1.05.
- Falls back automatically to the best on-device voice (prefers Premium/Enhanced/Siri voices, skips robotic novelty voices), spoken sentence by sentence at natural rate/pitch.
- Settings › Voice: choose engine + voice, "Test" button.

## Persona (v4)
Adult, personal-use persona: cheeky, sarcastic, blunt best friend and shameless flirt (suggestive, never explicit), swearing in EN/ID slang allowed, no moralising or "as an AI" disclaimers, follows the user's language. Edit `SYSTEM_PROMPT` in `js/main.js` to change it.
Gemini `safetySettings` are sent at the most permissive levels the API accepts (`OFF` for harassment, hate speech, sexually explicit, dangerous, plus civic integrity if supported; steps down to `BLOCK_NONE` or defaults if the API rejects a level). Google's core protections still apply; blocked replies get a snarky fallback line.

## Language (v6)
Echo is English-only: UI, greetings, chips, demo and tap lines are English; the persona always replies in English (even to Indonesian input); speech recognition is en-US; Gemini TTS is styled as American English and the iPhone backup voice prefers en-US voices (Zoe, Nicky, Ava, Samantha).
