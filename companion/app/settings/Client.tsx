"use client";
import dynamic from "next/dynamic";

// 08-10-2026: Firefox and WebKit logged React #418 (server HTML and first client render disagree) on /settings. These
// panels draw after the page loads, so no server HTML of theirs has to match a client render.
export const Control = dynamic(() => import("./Control"), { ssr: false });
export const Memory = dynamic(() => import("./Memory"), { ssr: false });
export const Prompts = dynamic(() => import("./Prompts"), { ssr: false });
export const Reports = dynamic(() => import("./Reports"), { ssr: false });
export const Skills = dynamic(() => import("./Skills"), { ssr: false });
export const CopyButton = dynamic(() => import("../CopyButton"), { ssr: false });
export const A11yPrefs = dynamic(() => import("@/components/A11yPrefs"), { ssr: false });
