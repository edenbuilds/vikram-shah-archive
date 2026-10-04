"use client";
import { motion } from "motion/react";
import { Circle } from "lucide-react";
import { signIn } from "./actions";
import Submit from "./Submit";

// 04-10-2026: the sign-in and front door, after the "Aurora" two-column layout Omkar sent: the video
// plays with no overlay (its lower half is dark, so the white type reads), steps on the left, the form on
// the right. Aurora's Google and GitHub buttons are left out: sign-in is an emailed link and nothing else,
// and a button that does nothing is worse than no button. Generic copy only; no matter is named here.
const VIDEO = "https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260506_081238_406ed0e3-5d83-436e-a512-0bbff7ec5b95.mp4";
const item = { hidden: { opacity: 0, y: 10 }, show: { opacity: 1, y: 0, transition: { duration: 0.5 } } };

export default function Entry({ sent, error }: { sent?: string; error?: string }) {
  return (
    <main className="entry">
      <section className="entry-hero" aria-hidden={false}>
        <video autoPlay muted loop playsInline aria-hidden>
          <source src={VIDEO} type="video/mp4" />
        </video>
        <motion.div className="entry-hero-copy" initial="hidden" animate="show"
          variants={{ hidden: { opacity: 0 }, show: { opacity: 1, transition: { staggerChildren: 0.15, delayChildren: 0.2 } } }}>
          <motion.div variants={item} className="entry-brand"><Circle size={18} fill="currentColor" aria-hidden /> Case Companion</motion.div>
          <motion.div variants={item}>
            <h2>The papers, read to the page.</h2>
            <p>Three steps to your matters.</p>
          </motion.div>
          <motion.ol variants={item} className="entry-steps">
            <Step n={1} text="Enter your email" active={!sent} />
            <Step n={2} text="Open the link we send" active={!!sent} />
            <Step n={3} text="Read, ask, and walk in prepared" />
          </motion.ol>
        </motion.div>
      </section>

      <section className="entry-form">
        <motion.div className="entry-form-inner" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.8, ease: "easeOut" }}>
          <div className="entry-brand entry-brand-small"><Circle size={14} fill="currentColor" aria-hidden /> Case Companion</div>
          {sent ? (
            <>
              <header>
                <h1>Check your email</h1>
                <p>If <b>{sent}</b> has access, a sign-in link is on its way by email (and Telegram, if linked). Open it on this device.</p>
              </header>
              <a className="btn ghost" href="/login">Use a different address</a>
            </>
          ) : (
            <>
              <header>
                <h1>Sign in</h1>
                <p>No password. We email you a one-click link.</p>
              </header>
              {error && <p className="err">{error}</p>}
              <form action={signIn} className="stack">
                <label className="entry-field">Email
                  <input type="email" name="email" required autoComplete="username" autoFocus placeholder="you@chambers.in" />
                </label>
                <Submit pending="Sending the link…" className="btn entry-submit">Email me a sign-in link</Submit>
              </form>
              <p className="entry-foot">Invitation only. A clerk of the papers, not a legal opinion.</p>
            </>
          )}
        </motion.div>
      </section>
    </main>
  );
}

function Step({ n, text, active }: { n: number; text: string; active?: boolean }) {
  return <li className={active ? "on" : undefined} aria-current={active ? "step" : undefined}><span>{n}</span>{text}</li>;
}
