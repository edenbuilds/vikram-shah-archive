import { signIn } from "../actions";
import Submit from "../Submit";

export default async function Login({ searchParams }: { searchParams: Promise<{ e?: string; sent?: string }> }) {
  const { e, sent } = await searchParams;
  return (
    <main className="wrap" style={{ maxWidth: "26rem", marginTop: "10vh" }}>
      <div className="card stack">
        <h1>Sign in</h1>
        {sent ? (
          <>
            <p className="muted" style={{ margin: 0 }}>If <b>{sent}</b> has access, a sign-in link is on its way by email (and Telegram, if linked). Open it on this device.</p>
            <a className="link" href="/login">Use a different address</a>
          </>
        ) : (
          <>
            <p className="muted" style={{ margin: 0 }}>No password. Enter your email and we&apos;ll send you a one-click sign-in link.</p>
            {e && <p className="err">{e}</p>}
            <form action={signIn} className="stack">
              <label>Email<input type="email" name="email" required autoComplete="username" autoFocus /></label>
              <Submit pending="Sending…">Email me a sign-in link</Submit>
            </form>
          </>
        )}
      </div>
    </main>
  );
}
