import { ImageResponse } from "next/og";
import Logo from "@/components/Logo";

// iOS rounds the corners itself, so the square is full bleed.
export const size = { width: 180, height: 180 };
export const contentType = "image/png";
export default function AppleIcon() {
  return new ImageResponse(<div style={{ display: "flex", width: "100%", height: "100%", background: "#0007cb" }}><Logo size={180} box={false} ink="#faf9f6" /></div>, size);
}
