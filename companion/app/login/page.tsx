import { SignInPage } from "@/components/ui/sign-in";
import { signIn } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string; sent?: string }> }) {
  const { e, sent } = await searchParams;
  return <SignInPage action={signIn} sent={sent} error={e} />;
}
