# Case Companion design

04-10-2026. Gleap's warm-paper system (style reference Omkar supplied), with Fraunces kept as the voice.
Light only. Tokens live at the end of `app/globals.css` under "DESIGN.md".

## Character

A linen workspace with graphite ink. Flat surfaces, no decorative shadow, depth by surface tone
(canvas, then white card, then warm stone). Fraunces gives the papers a printed, considered voice; Switzer
keeps the controls quiet. One colour only, Lime Pulse, and only for status.

## Type

| Role | Face | Size | Notes |
|---|---|---|---|
| Page title (h1) | Fraunces 400, SOFT 50 | 45px desktop, 27px phone | -0.01em |
| Matter title | Fraunces 400 | 32px desktop, 23px phone | |
| Section, paper title (h2) | Fraunces 400 | 27px | |
| Card heading (h3) | Fraunces 400 | 19px | |
| Body | Switzer 400 | 16px / 1.5 | |
| Lede | Switzer 400 | 19px, slate | |
| Caption, helper | Switzer 400 | 14px, slate | |
| Eyebrow (.kicker) | Switzer 500 | 12px uppercase, 0.06em | slate, never coloured |
| Buttons, labels | Switzer 500 | 14 to 16px | |

Scale is a Minor Third from 16px: 12, 14, 16, 19, 23, 27, 32, 45. Never bold a Fraunces heading.
Switzer is self-hosted (`app/fonts`, ITF Free Font License). Fraunces comes from next/font with the opsz and SOFT axes.
Transcripts and quotes keep their own type rules: the record is never restyled into display type.

## Colour

| Token | Value | Use |
|---|---|---|
| `--paper` | #edede8 | canvas |
| `--white` | #ffffff | cards, inputs |
| `--paper-deep` | #dbdbd2 | warm stone: secondary buttons, callouts, matter header band |
| `--paper-edge` | #d0d0c8 | hover on stone |
| `--graphite` | #141414 | primary capsule, toasts, brand mark |
| `--ink` | #292929 | text |
| `--muted` | #6f6f6e | secondary text, eyebrows |
| `--subtle` | #8f8f8e | quiet labels |
| `--rule` | rgba(0,0,0,.12) | hairlines |
| `--lime` | #4cc02b | status only: done mark, toast dot |
| `--note` | blue | her own notes, so they never read as the record |

## Shape and space

Cards 12px radius, 18px padding, 1px hairline, no shadow. Buttons and pills 200px radius. Inputs 10 to 12px.
Overlays (account menu) use the one soft shadow. Base unit 6px.

## Components

- **Top nav**: floating pill (React Bits portfolio template), sliding white thumb 250ms smooth-out. On a phone it
  is a second header row, full width, never fixed to the bottom (iOS floating toolbars sit there).
- **Matter tabs**: one underline that slides; edge fades only where tabs are hidden; the active tab scrolls into view.
- **Primary action**: graphite capsule. **Secondary**: warm-stone capsule (`.btn.ghost`).
- **Bookmarks | Annotations**: React Bits RubberSegment. **Remove a bookmark**: HoldButton, 700ms hold.
- **Filing status**: StatusMark ring with plain text, no status pills. **Ask thinking**: LatticeLoader.
- **Toasts**: graphite capsule with a lime dot, bottom centre, swipe to dismiss, fired only after a save returns.
- **Entry (sign in, front door)**: Aurora two-column layout. Video left at 52% with no overlay, white type on its
  dark lower half, three steps; the email form on the right. No social buttons: sign-in is an emailed link only.

## Motion

Ease-out only, UI under 300ms (page entrance 260ms, menus 180ms from scale .97, presses scale .97). Never scale
from 0. One library per element (motion for components; CSS for transitions). `prefers-reduced-motion` turns it off.

## Don't

- Colour a button or a heading. Lime never fills a button.
- Status pills, fake record numbers, glitter icons, emojis, em dashes.
- A dark theme, or anything that inverts a scan.
- Stack more than three surface tones on one screen.
