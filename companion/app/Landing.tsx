// Public front door (signed-out visitors). Generic on purpose: no matter, party or paper
// names ever appear here, since this page needs no sign-in.
export default function Landing() {
  return (
    <main className="landing">
      <section className="wrap land-hero">
        <div>
          <h1>The papers, read to the page.</h1>
          <p className="lede">
            A private study companion for the advocate. Drop in a court volume and it comes back as separate papers,
            each page readable beside its scan and searchable by what it says.
          </p>
          <div className="row" style={{ flex: "0 0 auto", alignItems: "center" }}>
            <a href="/login" className="btn" style={{ flex: "0 0 auto" }}>Sign in</a>
            <span className="subtle" style={{ flex: "0 0 auto" }}>Invitation only.</span>
          </div>
        </div>
        <div className="split-art" aria-hidden>
          <div className="vol"><span>Volume I</span><i /><i /><i /><i /><i /></div>
          <div className="arrow" />
          <ol>
            <li>Synopsis</li>
            <li>Petition</li>
            <li>Exhibit A</li>
            <li>Exhibit B</li>
            <li>Order</li>
          </ol>
        </div>
      </section>

      <section className="wrap land-points">
        <article>
          <h2>Split into papers</h2>
          <p>An eight-hundred-page compilation becomes the petition, each exhibit and each order, filed by stage with its own page numbers.</p>
        </article>
        <article>
          <h2>Ask, and see the page</h2>
          <p>Every answer quotes the exact words and the page they sit on. If the papers don&apos;t say it, it says so.</p>
        </article>
        <article>
          <h2>Walk in prepared</h2>
          <p>Your notes stay in your own ink, apart from the record. Hearings, chronology and the prep brief come only from what you have confirmed.</p>
        </article>
      </section>

      <footer className="wrap land-foot subtle">Clerk of the papers, not a legal opinion.</footer>
    </main>
  );
}
