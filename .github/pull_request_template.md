## What changed and why



## Speed

See "Keeping it fast" in `CLAUDE.md`. `npm test` and CI run `scripts/check-speed.mjs`.

- [ ] Every tap, hover and screen change this touches still answers instantly (presses `--press`, hovers `--quick`, nothing over about 0.2s)
- [ ] Nothing new restyles, relayouts or repaints the page every frame, and no new `backdrop-filter` or whole-page styles from script
- [ ] Checked in a browser if it changes what is on screen

## Docs

See "Keeping the documentation true" in `CLAUDE.md`. The `docs` CI check fails if code changes without docs.

- [ ] `CLAUDE.md` if rules, hosting, commands or known gaps changed
- [ ] `README.md` if what it does, how to run it, or which file does what changed
- [ ] `docs/` pages for the parts this touches
- [ ] `docs/decisions.md` if something was decided, changed or reversed
- [ ] `docs/changelog.md` with a dated line
