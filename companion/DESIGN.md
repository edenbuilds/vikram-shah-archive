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
iron `#414141`, muted `#585858`, subtle `#888888`. Violet `#0007cb` fills the primary button and toasts; there are no large black surfaces.

Colour is semantic, never decoration:

| Colour | Means |
|---|---|
| Violet `#0007cb` | her own layer (notes, her chronology), the focus ring, the active nav icon, "Pick up where you left off" |
| Green `#1a7f4b` | filed / done |
| Amber wash `#fdf4e3` | a hearing within the week |
| Red `#b42318` | an error |
| One muted hue per matter kind | writ violet, arbitration amber, RERA appeal green, civil terracotta, so the matter list scans by forum |
| One hue per matter tab and per stat tile | the tab underline and the tile top border take the tab's colour (Papers violet, Explainer purple, Reading teal, Brief amber, Compare pink, Chronology green, Map olive, Hearings orange, Collections rose, Upload slate); the nav icons take their own |
| Highlighter yellow, green, blue, pink, orange | her highlights on the words and on the scan; the colour is stored on the note (`color:#hex`), so the app, her AI app and the PDF export agree |

Violet never fills a button.

## Components

- **Top nav**: pill nav from the React Bits portfolio template, now 4px, linen track with a white sliding thumb. The thumb
  rests on the page you are on and glides (380ms) only when you navigate; hovering another link only washes it. On a phone
  it is a second header row, never fixed to the bottom.
- **Matter tabs**: one underline that slides; edge fades only where tabs are hidden.
- **Explainer**: every sentence and its number open the paper at the cited page; each footnote also opens the PDF at that page.
  A name the paper spells differently from the matter ("Vikarm" for "Vikram") is shown as filed with a line saying so, never corrected.
- **Paper text**: rows spaced into columns (a List of Dates) keep their stored spaces, show each gap as a hairline and wrap like
  prose. Pipe tables stay fixed-width and scroll.
- **Highlights and notes**: select words for the colour toolbar; draw on the scan with the colour bar; every note is editable in place.
- **Toasts**: tone by outcome (done, warning, error), with a link when there is somewhere to go; server actions toast on their own.
- **Primary action**: violet, 4px. **Secondary**: linen (`.btn.ghost`).
- **Bookmarks | Annotations**: RubberSegment. **Remove a bookmark**: HoldButton, 700ms.
- **Filing status**: StatusMark (green done, red error). **Ask thinking**: LatticeLoader. **Toasts**: violet (ok green, warn amber, error red), after a save returns.
- **Sign in**: the 21st.dev SignInPage ported to plain CSS (`components/ui/sign-in.tsx`): form left, the supplied video
  right, no overlay or cards. Email link only: no password, Google, reset or create-account controls, no testimonials.
- **Home**: linen "Pick up where you left off" band, then Recent activity (automatic memory, `lib/activity.ts`).
- **Settings**: one line per section, the rest behind a "How it works" disclosure; section chips scroll in one row on a phone.

## Motion

Ease-out only, UI under 300ms. One library per element. `prefers-reduced-motion` turns it off.

## Don't

- Radius above 4px (circles excepted), shadows, gradients, hard dividers between sections.
- Large black surfaces.
- Status pills, fake record numbers, glitter icons, emojis, em dashes. A dark theme.

## Mark, greeting, loading, share, touch (04-10-2026)
- **Mark** (`components/Logo.tsx`, `app/icon.svg`): a C opening to the right with one dot beside it, cream on a violet 7/32 rounded square. Same SVG draws the tab icon, `favicon.ico`, the iOS and install icons (`app/apple-icon.tsx`, `app/pwa/[size]`) and the link preview (`app/opengraph-image.tsx`, which can only use next/og's sans face). The old circle with "CC" is no longer used.
- **Greeting**: home opens with a serif line, "Hello, Arya", the mark drawing on once beside it. The name is the account's name, else the first word of the email (`lib/name.ts`).
- **Loading** (`app/loading.tsx`): the mark's C draws on, the dot settles, it wipes and repeats; it fades in after 250 ms so quick pages never show it. Reduced motion shows it still.
- **Share and export** (`components/ShareMenu.tsx`): one "Share and export" button on a matter, a paper and the explainer: the phone's share sheet where there is one, Copy link, and the downloads for that page.
- **Touch** (`components/Touch.tsx`, `lib/haptic.ts`): a tick under a finger on controls, a stronger one on a saved toast and on a board drop, press and hold on a matter, paper or hearing for Open, Open in a new tab, Copy link and Share, double-click or double-tap a note or explainer part to edit it, double-click a board column to add a task. Off with Settings, Display, "Touch feedback". Hover washes are plain CSS; touch cancels the card lift so none sticks.
- **Metadata**: root title template "%s · Case Companion", description, Open Graph and Twitter large card, `manifest.webmanifest`, robots.txt. Every page is noindex (private papers) and there is no sitemap on purpose; only the sign-in page is open to crawlers so link previews work.
