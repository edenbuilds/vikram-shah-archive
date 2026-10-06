import { redirect } from "next/navigation";

// Connect moved into Settings; old links keep working.
export const metadata = { title: "Connect an app" };

export default function Connect() {
  redirect("/settings#connections");
}
