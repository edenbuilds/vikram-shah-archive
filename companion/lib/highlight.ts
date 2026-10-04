// A highlight is an annotation row tagged "highlight" and "color:#rrggbb" (the importer tags its own "from-pdf").
// Drawn on the scan it also has a shape in ink.json (lib/ink.ts) and is tagged "drawn"; picked from the transcript
// it has the words (char offsets) and no shape. One palette for the app, the MCP and the PDF.
export const COLOURS = { yellow: "#ffe45c", green: "#7be0a6", blue: "#8cc8ff", pink: "#ff9ec7", orange: "#ffb870" } as const;
export type Colour = keyof typeof COLOURS;
export const isHighlight = (tags: string[]) => tags.includes("highlight");
export const colourOf = (tags: string[]) => tags.find((t) => t.startsWith("color:"))?.slice(6) ?? COLOURS.yellow;
export const colourTag = (hex: string) => `color:${/^#[0-9a-f]{6}$/i.test(hex) ? hex.toLowerCase() : COLOURS.yellow}`;
