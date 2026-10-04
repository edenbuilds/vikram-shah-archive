import { ImageResponse } from "next/og";
import Logo from "@/components/Logo";

// The preview a link shows in WhatsApp, Slack, iMessage and the like. next/og ships one sans face, so the
// wordmark here is not the Newsreader of the app; the layout and colours are.
export const alt = "Case Companion: private case papers, every answer tied to its page";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export default function OpenGraph() {
  return new ImageResponse(
    (
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", width: "100%", height: "100%", background: "#faf9f6", padding: 84, color: "#1a1a17" }}>
        <Logo size={112} />
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 96, letterSpacing: -3, lineHeight: 1.04 }}>Case Companion</div>
          <div style={{ marginTop: 22, fontSize: 38, color: "#5d5b54", lineHeight: 1.3, maxWidth: 1000 }}>Your case papers, with every answer tied to its page.</div>
        </div>
      </div>
    ),
    size,
  );
}
