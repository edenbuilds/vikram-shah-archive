# Case Companion design

04-10-2026, v2. Intercom's warm-cream editorial system (style reference Omkar supplied), adapted. Light only.
Tokens live at the end of `app/globals.css` under "DESIGN.md v2" and override everything above them.

## Character

An editorial spread on warm cream paper. Flat surfaces, hairline borders, no shadows, 4px corners on every
control. Depth comes from surface tone only: canvas, then linen, then stone. Headings whisper at weight 300.

## Type

| Role | Face | Notes |
|---|---|---|
| Headings (h1 to h3), paper and matter titles | Newsreader 300 (Omkar kept it as the primary voice; it is also Intercom's suggested Serrif substitute) | h1 -0.03em, line-height 1.02 |
| UI and body | Switzer 400 to 500 (close to Saans) | 16px / 1.5, tabular numbers |
| Labels: eyebrows, matter kinds, counts, section chips | IBM Plex Mono (SaansMono substitute) | 12px uppercase, 0.1em tracking |

Scale from 16px: 12, 14, 16, 19, 23, 27, 32, 45. Headings `text-wrap: balance`, prose `pretty`: no widows or orphans.
Transcripts and quotes keep their own type rules: the record is never restyled.

## Colour

Neutrals: canvas `#faf9f6`, linen `#f1eee9`, stone `#d3cec6`, hairline `#dedbd6`, white cards, ink `#111111`,
iron `#414141`, muted `#585858`, subtle `#888888`. Black `#000000` fills the primary button and toasts, nothing else.

Colour is semantic, never decoration:

| Colour | Means |
|---|---|
| Violet `#0007cb` | her own layer (notes, her chronology), the focus ring, the active nav icon, "Pick up where you left off" |
| Green `#1a7f4b` | filed / done |
| Amber wash `#fdf4e3` | a hearing within the week |
| Red `#b42318` | an error |
| One muted hue per matter kind | writ violet, arbitration amber, RERA appeal green, civil terracotta, so the matter list scans by forum |

Violet never fills a button.

## Components

- **Top nav**: pill nav from the React Bits portfolio template, now 4px, linen track with a white sliding thumb. On a
  phone it is a second header row, never fixed to the bottom.
- **Matter tabs**: one underline that slides; edge fades only where tabs are hidden.
- **Primary action**: black, 4px. **Secondary**: linen (`.btn.ghost`).
- **Bookmarks | Annotations**: RubberSegment. **Remove a bookmark**: HoldButton, 700ms.
- **Filing status**: StatusMark (green done, red error). **Ask thinking**: LatticeLoader. **Toasts**: black, after a save returns.
- **Sign in**: the 21st.dev SignInPage ported to plain CSS (`components/ui/sign-in.tsx`): form left, the supplied video
  right, no overlay or cards. Email link only: no password, Google, reset or create-account controls, no testimonials.
- **Home**: linen "Pick up where you left off" band, then Recent activity (automatic memory, `lib/activity.ts`).
- **Settings**: one line per section, the rest behind a "How it works" disclosure; section chips scroll in one row on a phone.

## Motion

Ease-out only, UI under 300ms. One library per element. `prefers-reduced-motion` turns it off.

## Don't

- Radius above 4px (circles excepted), shadows, gradients, hard dividers between sections.
- Large black surfaces. Black is for the primary button only.
- Status pills, fake record numbers, glitter icons, emojis, em dashes. A dark theme.
