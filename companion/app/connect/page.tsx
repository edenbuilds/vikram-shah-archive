import { redirect } from "next/navigation";

// Connect moved into Settings; old links keep working.
export default function Connect() {
  redirect("/settings#connections");
}
