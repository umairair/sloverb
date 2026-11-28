# Accessibility

sloverb aims for WCAG 2.2 at level AA, the standard most laws and audits point to, and follows the ARIA Authoring Practices for its custom controls. Umair asked for the whole app to be brought up to it on 2026-11-26 (D25 in `decisions.md`). This page says what each part does for that, why, and how to check it after a change, so the next change doesn't quietly undo it.

## What is in place

**Keyboard.** Everything can be done without a mouse or a touch screen.

- Tab reaches every control in the order it is drawn, top to bottom, and then the bottom line.
- The sliders (`Slider` in `src/ui.tsx`) take the arrow keys (one step, ten with Shift), Page Up and Page Down (ten steps), and Home and End (all the way). The waveform takes the arrows (10 seconds), Page Up and Page Down (30 seconds), and Home and End (the start, and just before the end).
- On `theme`, the glows and the two themes are each a radio group with one stop for Tab, on the one being worn. A glow's tile shows no word since 2026-11-27 (D36), so its name is its `aria-label` (`classic`, `vapor` and so on); to someone looking, a glow is told from the others by the still of it on its tile, and the one being worn by the line round it. The arrows, Home and End choose another and take the focus to it, wrapping round (`radioKeys` in `src/ui.tsx`).
- Space plays and pauses and the left and right arrows move through the song from anywhere that isn't a control. Escape closes `info`, `theme` and the start screen opened from the player.

**Focus is never left on nothing.** A screen change in sloverb usually removes the very button that was pressed, which drops the focus to the top of the page, so a keyboard or screen reader user would start again from the beginning. `App.tsx` puts it somewhere useful instead:

- `info` and `theme` take the focus as they open (the page itself, which has `tabIndex={-1}`, so a screen reader starts reading at its top), and give it back on closing to whatever opened them.
- If the focus went away with the old screen, it lands on what the new one is for: the song's name at the top of the player (`.player .title`) when the first song opens, `browse files` on the start screen opened from the player, and the sloverb button (`.bar .home`) on coming back from there.
- `reset` hides itself once pressed, so it hands the focus to the speed slider. `save` uses `aria-disabled` rather than `disabled` while it works, because a disabled button drops the focus. The YouTube box hands the focus to `cancel` while a link is fetched, and back to its button (not the box, so a phone doesn't open its keyboard) if it fails.
- Nothing is moved when the page first loads.
- What the focus is put on but can't be pressed (a page, the song's name) has no ring, `[tabindex="-1"]:focus` in `src/styles.css`. Everything that can be pressed has the 2px ring in the colour of the page's words.

**Screen readers.**

- Every control has a name, and where a control shows a word its name starts with that word, so speech control finds it by what it says (WCAG 2.5.3): the sloverb button at the bottom is `sloverb, add songs`, the drop box is `browse files`, or `opening` while a song opens.
- There is one polite live region, always on the page (`Announcer` and `announce()` in `src/ui.tsx`). A region that appears with its words already in it is often not read, so anything that changes without the focus moving says so there: `opening`, `added`, `saving`, `saved`, `cancelled` (a save stopped), each step of a YouTube import, and the next song's name when the song changes. Errors are the toasts with `role="alert"`, which are read as they appear.
- The YouTube box is marked invalid and points at its error (`aria-invalid`, `aria-describedby`) while one is showing.
- The waveform says where you are in words (`1:12 of 3:40`) and which song of how many (`song 2 of 5`). The links on `info` say they open in a new tab. Anything drawn only for the eye (the glyphs, the light, the canvas, the second copy of a word on a slider) is `aria-hidden`.
- `.unseen` in `src/styles.css` is the class for words only a screen reader hears. `.sr` is something else: it keeps the file input laid out but out of sight, because some phones won't open the picker for an input that isn't laid out.

**Contrast.** Measured on 2026-11-26 for every theme and glow:

- The page's words are 16.6:1 or more (on `dark`'s charcoal since 2026-11-28, D45, worked out from the colours: words 16.6:1, grey words 6.2:1, `--edge` 4.5:1), the grey words (`--mute`) 6.1:1 or more, and the words on the bare part of a slider 14:1 or more.
- Words on a glow's colours (inside a slider's fill and in the YouTube import bar) are between 3.1:1 and 19:1, because the colours are the look and some, like `classic`'s blue and pink under white, are too bright for 4.5:1. So those words are 19px bold, which is large text in WCAG's terms and needs 3:1. Don't make them smaller or lighter than that without measuring every glow on both themes.
- The buttons (play, `browse files`, `paste` and `open`, save) are the white of the page's words on `dark` and their ink on `light` (`--key`, D38), and what is on them (`--on-key`) is 19:1 on `dark` and 18:1 on `light`, worked out from the colours. The line round the YouTube link box and the box to drop a song on (`--edge`) is 3.2:1 against paper and 4.5:1 against `dark`'s charcoal (4.4:1 against the black it was), which is what WCAG 1.4.11 asks of the edge of a control.
- Where a slider is set stands out by at least 3:1 on every look, which is what WCAG 1.4.11 asks of a control's state. On `dark` the colour itself is 4.4:1 or more against the bare track (the white grip is not, against the brighter glows). On `light` the colour is too pale against the paper for that, and the dark grip carries it instead, 3:1 or more against the colour and 14:1 against the track.
- Someone who asks their device for more contrast (`prefers-contrast: more`) gets the grey words in the full colour of the page's words.

**Windows high contrast (`forced-colors`).** The browser paints everything in the system's few colours and drops gradients and shadows, which left the sliders, `save` and the tiles on `theme` without a shape. The `forced-colors` block at the end of `src/styles.css` gives them an edge, fills them with the system's highlight colour, marks the chosen tile, and lets a glow's tile keep its colours since it is a picture of them. The waveform is drawn in the same system colours (`looks.paint()` in `src/look.ts`).

**Motion and flashing.**

- The light never flashes. That is a safety rule with its own section in `CLAUDE.md` (no more than about three hits a second, no change of brightness on a hit, nothing moving in one frame).
- Anyone who asks their device for less motion gets no animations and no dance in the light. Nobody gets an effect between screens since 2026-11-27 (D39). There is no Web Animation in sloverb since the light along the speed slider went on 2026-11-27 (D35); if one is ever added it has to check `calm()` in `src/ui.tsx` itself, because the stylesheet's rule can't stop one.
- The `glow effect` slider on `theme` at `off` also holds still everything that moves on its own, the lights' drift and the colours in the small `sloverb` (`data-still` on `<html>`, set by `src/look.ts` and by the script in `index.html`). That is the way to stop the page moving that WCAG 2.2.2 asks for, and it doesn't depend on a device setting. With JavaScript off there is no slider, so the page shown then (the `<noscript>` in `index.html`) has the name's colours still from the start. Everything else that moves (the bars, a long name sliding) moves only while a song plays, and stops with it.

**Size, zoom and reflow.** Nothing pressable is smaller than 24 by 24px (WCAG 2.5.8), and the page can be zoomed. At 400% zoom, a 320 by 256 window, the player scrolls up and down and nothing is cut off or needs scrolling sideways. Every slider and the waveform also answer a single tap, so nothing needs a drag (WCAG 2.5.7).

## How to check it after a change

1. `npm run dev`, then with Playwright (installed in cloud sessions) or by hand:
2. Tab through the start screen, the player, `info`, `theme` and the start screen opened from the player. The focus should always be visible and never land on nothing, and closing a page should put it back where it was.
3. Run axe (`npm i axe-core` somewhere outside the repo, inject `axe.min.js` into the page and call `axe.run()` with the `wcag2a`, `wcag2aa`, `wcag21aa` and `wcag22aa` tags) on each screen, on `light` with `rose` and on `dark` with `classic`. On 2026-11-26 it found nothing. It can't measure words over gradients and lists them as incomplete; those are the ones measured above.
4. Emulate `forcedColors: "active"` and `reducedMotion: "reduce"` in Playwright and look at the player and `theme`.
5. Look at a 320 by 256 window and check everything can still be reached by scrolling.

## Not done yet

- On `dark` the veil over a resting player (`--rest` in `src/styles.css`, 30%) takes the grey words down to about 3.7:1 (3.5:1 when the page was black), under the 4.5:1 AA asks, while a song is paused or quiet or the glow effect is `off`. Worked out on 2026-11-27 from the colours, when `dark` became what a first visit gets. The contrast figures above are for the bare page, without the veil. A veil of 17% or less would meet it; the number is Umair's (Known gaps in `CLAUDE.md`).
- Nobody has listened to sloverb with VoiceOver on an iPhone, TalkBack or NVDA. The checks above are with axe and the accessibility tree in Chromium. Umair or a future agent with a real device should try it, and record what they find here.
- The grey words on the bottom line sit over the light behind the page, and how readable they are at the loudest moment of a bright glow depends on the song. They are designed to lift with the glow (see `--mute` in `CLAUDE.md`), but no one has measured them there.
- The waveform's shape isn't described to a screen reader, only where you are in it.
