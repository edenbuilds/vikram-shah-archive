"use client";
import Submit from "@/app/Submit";

// 04-10-2026: the 21st.dev "SignInPage" Omkar chose, ported from Tailwind to this app's plain CSS
// (globals.css "sign-in"); adding Tailwind's reset would restyle every other screen. Kept: the two
// columns, the glass inputs, the blur-in stagger, the media panel on the right. Changed to fit
// how she actually signs in: an emailed link, so no password, Google, reset or create-account controls
// (each would be a button that does nothing). The testimonial cards are dropped:
// no invented people or quotes on a legal product.

// 04-10-2026: Omkar replaced the library photo with this clip ("don't add such a picture"); no overlay, no cards on it.
const HERO = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260815_034306_229eccbe-fd8f-40fb-8002-9868ef2bb1a8.mp4";

export function SignInPage({ action, sent, error }: { action: (f: FormData) => Promise<void>; sent?: string; error?: string }) {
  return (
    <div className="si">
      <section className="si-form">
        <div className="si-inner">
          <div className="si-brand si-in d1"><span className="brand-mark" aria-hidden>CC</span> Case Companion</div>
          {sent ? (
            <>
              <h1 className="si-in d2">Check your email</h1>
              <p className="si-lede si-in d3">If <b>{sent}</b> has access, a sign-in link is on its way by email, and Telegram if linked. Open it on this device.</p>
              <a className="btn ghost si-in d4" href="/login">Use a different address</a>
            </>
          ) : (
            <>
              <h1 className="si-in d2">Welcome back</h1>
              <p className="si-lede si-in d3">No password. We email you a one-click link.</p>
              {error && <p className="err">{error}</p>}
              <form action={action} className="si-fields">
                <label className="si-in d4">
                  <span>Email address</span>
                  <span className="si-glass"><input name="email" type="email" required autoComplete="username" autoFocus placeholder="you@chambers.in" /></span>
                </label>
                <Submit pending="Sending the link…" className="btn si-submit si-in d5">Email me a sign-in link</Submit>
              </form>
              <p className="si-foot si-in d6">Invitation only. A clerk of the papers, not a legal opinion.</p>
            </>
          )}
        </div>
      </section>

      <section className="si-hero" aria-hidden>
        <video className="si-photo" src={HERO} autoPlay muted loop playsInline preload="auto" />
      </section>
    </div>
  );
}
