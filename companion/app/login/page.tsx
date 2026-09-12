import { signIn } from "../actions";

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const { e } = await searchParams;
  return (
    <main className="wrap" style={{ maxWidth: "26rem", marginTop: "10vh" }}>
      <div className="card stack">
        <h1>Sign in</h1>
        <p className="muted">Private workspace. Accounts are created by the owner in Supabase; there is no public sign-up.</p>
        {e && <p className="err">{e}</p>}
        <form action={signIn} className="stack">
          <label>Email<input type="email" name="email" required autoComplete="username" /></label>
          <label>Password<input type="password" name="password" required autoComplete="current-password" /></label>
          <button className="btn">Sign in</button>
        </form>
      </div>
    </main>
  );
}
