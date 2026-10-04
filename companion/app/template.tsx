// Next re-mounts a template on every navigation, so each page gets the short entrance (globals.css .page-in).
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="page-in">{children}</div>;
}
