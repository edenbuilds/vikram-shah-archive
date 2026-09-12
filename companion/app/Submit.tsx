"use client";
import { useFormStatus } from "react-dom";

export default function Submit({ children, pending, className = "btn" }: { children: React.ReactNode; pending: string; className?: string }) {
  const s = useFormStatus();
  return <button className={className} disabled={s.pending}>{s.pending ? pending : children}</button>;
}
