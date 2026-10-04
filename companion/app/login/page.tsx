import Entry from "../Entry";

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string; sent?: string }> }) {
  const { e, sent } = await searchParams;
  return <Entry sent={sent} error={e} />;
}
