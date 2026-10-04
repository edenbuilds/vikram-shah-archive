import Logo from "@/components/Logo";

// Shown while a page's data loads (the nav stays). It fades in after a beat, so a quick page never flashes it.
export default function Loading() {
  return <div className="loading-page" role="status" aria-label="Loading"><Logo size={52} draw /></div>;
}
