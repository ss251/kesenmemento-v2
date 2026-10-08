# KesenMemento: instructions for agents

1. **Read [docs/CRAFT.md](docs/CRAFT.md) (ものづくり基準) before any change.** Run its 出荷前チェック before reporting done, and attach the screenshots. Everything gets Japanese-level polish: detail and craftsmanship in every pixel, word, frame and millisecond.
2. **Boil the ocean.** Finish it, test it, document it. The answer is the finished product, not a plan. Never leave a dangling thread or a workaround where the real fix is within reach.
3. **Content rules:**
   - The town is shown as the living place it is today. Nothing in sources, docs or the UI may match `SENSITIVE` in `scripts/anime/enrich/fold.js`.
   - No Google Maps, Street View, listing or other third-party photos.
   - Only shops that have consented appear.
   - No faces from real photos.
   - ホヤぼーや only as Kesennuma City's design manual allows: official stills as published, with the credit. Animation, 3D or commercial use needs the city's approval.
   - Never commit `raw/`, photos, secrets or symlinks.
4. **Commits:**
   - Conventional, atomic, with explicit paths.
   - End each message with exactly one attribution line:
     - Claude agents: `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`;
     - Grok agents (including Grok through Cursor): `Agent: grok-4.7-xhigh`.
   - Never add session links.
5. **Tooling:**
   - Run bun as `env -u NODE_OPTIONS bun …`.
   - Heavy jobs go through `tools/anime/gate.sh run …`.
   - Headless Chrome only through `tools/anime/gate.sh chrome …`, held for short stretches.
   - Never open the desktop Chrome app.
   - Leave no servers or browsers running.
