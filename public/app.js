let DATA = null;
let menuOpen = false;
const menuOpenRef = { current: false };
let menuLock = 0;

function path() {
  const p = (location.pathname || "/").replace(/\/+$/, "");
  return p || "/";
}
function go(href) {
  history.pushState({}, "", href);
  window.scrollTo(0, 0);
  render();
}
function isFileHref(href) {
  return /\.(md|zip|docx|pdf|jpg|jpeg|png|js|css|svg|gz)(\?.*)?$/i.test(href);
}
function isAppHref(href) {
  if (!href || href.startsWith("http") || href.startsWith("mailto:") || href.startsWith("#")) return false;
  if (isFileHref(href)) return false;
  return href.startsWith("/");
}
async function fetchText(url) {
  const res = await fetch(url, { cache: "no-cache" });
  if (!res.ok) throw new Error(String(res.status));
  return res.text();
}
function saveBlob(filename, blob) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
async function downloadUrl(url, filename) {
  const targets = [url];
  if (/\.(pdf|jpe?g|zip)$/i.test(url) || url.startsWith("/pages/") || url.startsWith("/downloads/")) {
    targets.push(SUPABASE_ASSET + url, GITHUB_ASSET + url);
  }
  for (const target of targets) {
    try {
      const res = await fetch(target);
      if (res.ok) {
        saveBlob(filename, await res.blob());
        return;
      }
    } catch (_) {}
  }
  const a = document.createElement("a");
  a.href = targets[targets.length - 1];
  a.download = filename;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function docs() {
  return (DATA.docs || []).filter((d) => d.transcribed === true);
}
function docById(id) {
  return docs().find((d) => d.id === id);
}
const SUPABASE_ASSET = "https://mnsmfobozohejvnmnalw.supabase.co/storage/v1/object/public/archive";
const GITHUB_ASSET = "https://raw.githubusercontent.com/edenbuilds/vikram-shah-archive/main/public";
function assetUrl(path) {
  if (path.startsWith("/pages/") || /\.pdf$/i.test(path) || /-transcripts\.zip$/i.test(path)) {
    return SUPABASE_ASSET + path;
  }
  return path;
}
function fileUrl(path) {
  return assetUrl(path);
}
function pageSrc(doc, n) {
  return assetUrl(`/pages/${doc.id}/page-${String(n).padStart(3, "0")}.jpg`);
}
function pageSrcFallback(doc, n) {
  return `${GITHUB_ASSET}/pages/${doc.id}/page-${String(n).padStart(3, "0")}.jpg`;
}
function setActive() {
  const p = path();
  document.querySelectorAll("nav a").forEach((a) => {
    const href = a.getAttribute("href") || "/";
    a.classList.toggle("active", href === "/" ? p === "/" : p === href || p.startsWith(href + "/"));
  });
}
function preprocess(source) {
  return source
    .replace(/\[ILLEGIBLE:([^\]]*)\]/g, "> ILLEGIBLE $1")
    .replace(/\[ILLEGIBLE\]/g, "> ILLEGIBLE")
    .replace(/\[([A-Z][A-Z /]+):\s*([^\]]*)\]/g, "> $1 $2");
}
function mdToHtml(source, query) {
  let html = window.marked.parse(preprocess(source));
  if (query) {
    const q = query.toLowerCase();
    const wrap = document.createElement("div");
    wrap.innerHTML = html;
    [...wrap.children].forEach((n) => {
      if (!n.textContent.toLowerCase().includes(q)) n.remove();
    });
    html = wrap.innerHTML || "<p class='err'>No matching passages.</p>";
  }
  return html;
}
function closeMenu() {
  menuOpen = false;
  menuOpenRef.current = false;
  const d = document.getElementById("drawer");
  if (d) {
    d.classList.remove("open");
    d.hidden = true;
  }
  document.body.style.overflow = "";
  const btn = document.getElementById("menuBtn");
  if (btn) btn.setAttribute("aria-expanded", "false");
}
function openMenu() {
  menuOpen = true;
  menuOpenRef.current = true;
  const d = document.getElementById("drawer");
  if (d) {
    d.hidden = false;
    d.classList.add("open");
  }
  document.body.style.overflow = "hidden";
  const btn = document.getElementById("menuBtn");
  if (btn) btn.setAttribute("aria-expanded", "true");
}
function toggleMenu() {
  const now = Date.now();
  if (now - menuLock < 280) return;
  menuLock = now;
  if (menuOpenRef.current) closeMenu();
  else openMenu();
}

function leaf() {
  return `<div class="page"><p class="eyebrow">Not found</p><h1>This leaf is not in the papers</h1><p><a class="btn btn-solid" href="/">Return to overview</a></p></div>`;
}

function overview() {
  const c = DATA.case;
  const figures = DATA.figures || [];
  const bundles = DATA.bundles || [];
  const all = docs();
  const mapRows = all
    .map(
      (d) =>
        `<tr><td class="mark">${d.kind}</td><td><a href="/docs/${d.id}">${d.title}</a><div class="subtle">${d.bundleTitle} · ${d.pages} pp.</div></td><td>${d.pages}</td></tr>`
    )
    .join("");
  return `<div class="page">
    <div class="grid-2">
      <div>
        <p class="eyebrow">${c.forum}</p>
        <h1>${c.title}<span class="sub">${c.claimant}</span></h1>
        <p class="lede">${c.docCount} documents, ${c.pageCount} pages, arranged in the order an Indian arbitration brief is usually read — appointment, pleadings, s.16 / s.17 applications, then title and money papers. ${c.disclaimer}</p>
        <p class="muted" style="max-width:42rem">${c.lawNote || ""}</p>
        <div class="row">
          <a class="btn btn-solid" href="/docs">Read the transcript</a>
          <a class="btn btn-ghost" href="/downloads/shah-v-trindade-archive.zip" download="shah-v-trindade-archive.zip" data-dl="shah-v-trindade-archive.zip">Download Markdown &amp; Word</a>
        </div>
      </div>
      <aside class="card">
        <p class="eyebrow">Cause title</p>
        <dl class="dl">
          <dt>Forum</dt><dd>${c.forum}</dd>
          <dt>Venue</dt><dd>${c.venue}</dd>
          <dt>Claimant</dt><dd>${c.claimant}</dd>
          <dt>Respondents 1–3</dt><dd>${c.respondents13}</dd>
          <dt>Respondent No. 4</dt><dd>${c.respondent4}</dd>
          <dt>Posture</dt><dd>${c.cause}</dd>
        </dl>
      </aside>
    </div>
    <h2>Figures as stated in the papers</h2>
    <div class="figures">${figures
      .map(
        (f) =>
          `<article class="card fig"><p class="label">${f.label}</p><p class="val">${f.value}</p><p class="note">${f.note}</p></article>`
      )
      .join("")}</div>
    <div class="cards3" style="margin-top:2rem">
      <a class="card" href="/map"><h3>Case mindmap</h3><p class="muted">Expand the branches — parties, Act stages, and every paper.</p></a>
      <a class="card" href="/docs"><h3>Open all sections</h3><p class="muted">One card per PDF, grouped in the filing tree.</p></a>
      <a class="card" href="/summary"><h3>Editorial summary</h3><p class="muted">How the papers relate. Not a finding.</p></a>
    </div>
    <h2 id="tree">Navigation tree</h2>
    <p class="lede">Stages follow Indian arbitral practice. Expand a stage, then open a paper. Each paper keeps its own transcript, scans, and downloads — nothing is merged into one blob.</p>
    <input class="search" id="docq" placeholder="Filter by title, stage, kind, or Act section" />
    <div class="tree" id="treeList">
      ${bundles
        .map((b) => {
          const kids = all.filter((d) => d.bundle === b.id);
          return `<details class="bundle" ${b.id === "list-of-dates" || b.id === "soc-sod" ? "open" : ""}>
            <summary><span>${b.title}</span><span class="subtle">${kids.length} documents · ${b.pages} pages</span></summary>
            <p class="bundle-note">${b.note}</p>
            <div class="kids">${kids
              .map(
                (d) =>
                  `<a class="doc-card" data-filter="${(d.title + " " + d.kind + " " + d.folder + " " + b.title).toLowerCase()}" href="/docs/${d.id}"><p class="mark">${d.kind} · ${d.pages} pp.</p><h3>${d.title}</h3><p class="muted">${d.note || b.note}</p></a>`
              )
              .join("")}</div>
          </details>`;
        })
        .join("")}
    </div>
    <h2>Map</h2>
    <div class="table-wrap">
      <table><thead><tr><th>Mark</th><th>Section</th><th>Pages</th></tr></thead><tbody>${mapRows}</tbody></table>
    </div>
  </div>`;
}

function mindmapPage() {
  const c = DATA.case;
  const bundles = DATA.bundles || [];
  const all = docs();
  const branches = bundles
    .map((b, idx) => {
      const kids = all.filter((d) => d.bundle === b.id);
      const open = idx < 2 ? " open" : "";
      return `<details class="mm-branch"${open}>
        <summary>
          <span class="dot" aria-hidden="true"></span>
          <span>
            <strong>${b.title}</strong>
            <div class="subtle">${b.note || ""}</div>
          </span>
          <span class="mm-count">${kids.length} docs · ${b.pages} pp.</span>
        </summary>
        <div class="mm-docs">${kids
          .map(
            (d) =>
              `<a href="/docs/${d.id}"><span class="mm-kind">${d.kind} · ${d.pages} pp.</span><strong>${d.title}</strong><span>${d.note || b.note || ""}</span></a>`
          )
          .join("")}</div>
      </details>`;
    })
    .join("");
  return `<div class="page">
    <p class="eyebrow">Case structure</p>
    <h1>Mindmap<span class="sub">Branches of the paper tree</span></h1>
    <p class="lede">Read the cause from the centre outward: parties, then Arbitration &amp; Conciliation Act stages, then each PDF leaf. Expand a branch to open its papers. ${c.disclaimer}</p>
    <div class="mindmap-shell">
      <div class="mindmap-toolbar">
        <p class="hint">Tap a stage to expand its documents. Links open that paper’s transcript.</p>
        <div class="mindmap-actions">
          <button type="button" class="chip" id="mmExpand">Expand all</button>
          <button type="button" class="chip" id="mmCollapse">Collapse all</button>
          <a class="chip" href="#tree">Jump to filing tree</a>
        </div>
      </div>
      <div class="mindmap-scroll">
        <div class="mindmap">
          <div class="mm-root">
            <div class="mm-node seal">
              <span class="mm-label">Cause</span>
              <h3>${c.short || c.title}</h3>
              <p class="mm-meta">${c.forum}<br>${c.venue}</p>
            </div>
          </div>
          <div class="mm-spine">Parties</div>
          <div class="mm-parties">
            <div class="mm-node">
              <span class="mm-label">Claimant</span>
              <h3>${c.claimant}</h3>
              <p class="mm-meta">As named in the papers</p>
            </div>
            <div class="mm-node">
              <span class="mm-label">Respondents 1–3</span>
              <h3>${c.respondents13}</h3>
              <p class="mm-meta">Trindade side, as stated</p>
            </div>
            <div class="mm-node">
              <span class="mm-label">Respondent No. 4</span>
              <h3>${c.respondent4}</h3>
              <p class="mm-meta">As named in the papers</p>
            </div>
          </div>
          <div class="mm-spine">Act stages &amp; leaves</div>
          <div class="mm-branches" id="mmBranches">${branches}</div>
          <p class="mm-legend"><span><i></i>Expandable stage under A&amp;C Act / civil papers</span><span>${all.length} documents · ${c.pageCount} pages</span></p>
        </div>
      </div>
    </div>
    <h2 id="tree">Same tree as a filing list</h2>
    <p class="lede">If you prefer the clerk’s expandable list, it lives on the overview.</p>
    <p class="row"><a class="btn btn-solid" href="/#tree">Open filing tree</a><a class="btn btn-ghost" href="/docs">Browse all documents</a></p>
  </div>`;
}

function bindMindmap() {
  const root = document.getElementById("mmBranches");
  if (!root) return;
  const nodes = [...root.querySelectorAll("details.mm-branch")];
  const expand = document.getElementById("mmExpand");
  const collapse = document.getElementById("mmCollapse");
  if (expand) expand.addEventListener("click", () => nodes.forEach((d) => (d.open = true)));
  if (collapse) collapse.addEventListener("click", () => nodes.forEach((d) => (d.open = false)));
}

function docsIndex() {
  const all = docs();
  return `<div class="page">
    <p class="eyebrow">Case papers</p>
    <h1>Documents</h1>
    <p class="lede">Each PDF is its own document. Open a card for transcript, sections, original scans, and files.</p>
    <input class="search" id="docq" placeholder="Filter documents" />
    <ol class="secgrid" id="grid">${all
      .map(
        (d) =>
          `<li data-filter="${(d.title + " " + d.kind + " " + d.folder).toLowerCase()}"><a class="card" href="/docs/${d.id}"><p class="mark">${d.kind} · ${d.pages} pp.</p><h3 style="margin:.35rem 0">${d.title}</h3><p class="muted">${d.folder}</p></a></li>`
      )
      .join("")}</ol>
  </div>`;
}

function bindFilter() {
  const input = document.getElementById("docq");
  if (!input) return;
  const nodes = [...document.querySelectorAll("[data-filter]")];
  const run = () => {
    const q = input.value.trim().toLowerCase();
    let n = 0;
    nodes.forEach((el) => {
      const show = !q || (el.getAttribute("data-filter") || "").includes(q);
      el.style.display = show ? "" : "none";
      if (show) n++;
    });
  };
  input.addEventListener("input", run);
}

function docOverview(d) {
  const zip = `/downloads/${d.id}-transcripts.zip`;
  return `<div class="page">
    <p class="eyebrow">${d.bundleTitle}</p>
    <h1>${d.title}</h1>
    <p class="lede">${d.pages} pages · ${d.kind}. ${DATA.case.disclaimer}</p>
    <div class="row">
      <a class="btn btn-solid" href="/docs/${d.id}/transcript">Read the transcript</a>
      <a class="btn btn-ghost" href="${zip}" download="${d.id}-transcripts.zip" data-dl="${d.id}-transcripts.zip">Download Markdown &amp; Word</a>
    </div>
    <div class="cards3" style="margin-top:2rem">
      <a class="card" href="/docs/${d.id}/sections"><h3>Sections</h3><p class="muted">${d.sections.length} legal joint${d.sections.length === 1 ? "" : "s"} pulled from this file.</p></a>
      <a class="card" href="/docs/${d.id}/pages"><h3>Original scans</h3><p class="muted">${d.pages} page images of this PDF only.</p></a>
      <a class="card" href="/docs/${d.id}/summary"><h3>Summary</h3><p class="muted">Editorial map of this document. Not a finding.</p></a>
    </div>
    <h2>Map</h2>
    <div class="card" style="padding:0;overflow:auto">
      <table><thead><tr><th>Mark</th><th>Section</th><th>Pages</th></tr></thead>
      <tbody>${d.sections
        .map(
          (s) =>
            `<tr><td class="mark">${s.mark}</td><td><a href="/docs/${d.id}/sections/${s.id}">${s.title}</a><div class="subtle">${s.short}</div></td><td>${s.pages}</td></tr>`
        )
        .join("")}</tbody></table>
    </div>
  </div>`;
}

function sectionIndex(d) {
  return `<div class="page">
    <p class="eyebrow">${d.title}</p>
    <h1>Sections</h1>
    <p class="lede">Split along the joints in this paper.</p>
    <ol class="secgrid">${d.sections
      .map(
        (s) =>
          `<li><a class="card" href="/docs/${d.id}/sections/${s.id}"><p class="mark">${s.numeral} · pp. ${s.pages}</p><h3 style="margin:.35rem 0">${s.title}</h3><p class="muted">${s.short}</p></a></li>`
      )
      .join("")}</ol>
  </div>`;
}

function pagesIndex(d) {
  const cards = [];
  for (let n = 1; n <= d.pages; n++) {
    const s = d.sections.find((x) => n >= x.pageStart && n <= x.pageEnd);
    cards.push(
      `<a class="page-card" href="/docs/${d.id}/pages/${n}"><img src="${pageSrc(d, n)}" alt="Page ${n}" loading="lazy" onerror="this.onerror=null;this.src='${pageSrcFallback(d, n)}'" /><span>${n}${s ? " · " + s.mark : ""}</span></a>`
    );
  }
  return `<div class="page"><p class="eyebrow">Source scans</p><h1>Original pages</h1><p class="lede">${d.pages} scans from this PDF only.</p><div class="pagegrid">${cards.join("")}</div></div>`;
}

function downloadsPage() {
  const all = docs();
  const packs = all
    .map((d) => {
      const zip = assetUrl(`/downloads/${d.id}-transcripts.zip`);
      const pdf = assetUrl(`/downloads/${d.file}`);
      return `<a href="${zip}" download="${d.id}-transcripts.zip" data-dl="${d.id}-transcripts.zip"><strong>${d.title}</strong> <span class="subtle">ZIP</span><div class="muted">Transcript, Word, summary, section files, original PDF</div></a>
      <a href="${pdf}" download="${d.file}" data-dl="${d.file}"><strong>${d.title}</strong> <span class="subtle">PDF</span><div class="muted">Original scan as filed</div></a>
      <a href="/downloads/${d.id}-FULL-TRANSCRIPT.md" download="${d.id}-FULL-TRANSCRIPT.md" data-dl="${d.id}-FULL-TRANSCRIPT.md"><strong>${d.title}</strong> <span class="subtle">Markdown</span><div class="muted">Full typed transcript</div></a>
      <a href="/downloads/${d.id}-FULL-TRANSCRIPT.docx" download="${d.id}-FULL-TRANSCRIPT.docx" data-dl="${d.id}-FULL-TRANSCRIPT.docx"><strong>${d.title}</strong> <span class="subtle">Word</span><div class="muted">A4 transcript</div></a>`;
    })
    .join("");
  const sections = all
    .flatMap((d) =>
      d.sections.map(
        (s) =>
          `<a href="/downloads/${d.id}-${s.file}" download="${d.id}-${s.file}" data-dl="${d.id}-${s.file}"><strong>${d.title} — ${s.title}</strong> <span class="subtle">Markdown</span><div class="muted">Pages ${s.pages}</div></a>`
      )
    )
    .join("");
  return `<div class="page narrow">
    <p class="eyebrow">Deliverables</p>
    <h1>Downloads</h1>
    <p class="lede">Real files. Master Markdown/Word pack on Vercel. Original PDFs, page scans, and per-document ZIPs from object storage. Filenames match the registry — no 404 stubs.</p>
    <div class="row" style="margin-bottom:1rem">
      <a class="btn btn-solid" href="/downloads/shah-v-trindade-archive.zip" download="shah-v-trindade-archive.zip" data-dl="shah-v-trindade-archive.zip">Download Markdown &amp; Word (.zip)</a>
      <a class="btn btn-ghost" href="/downloads/CASE-SUMMARY.md" download="CASE-SUMMARY.md" data-dl="CASE-SUMMARY.md">Case summary</a>
    </div>
    <div class="list">${packs}</div>
    <h2>Section files</h2>
    <div class="list">${sections}</div>
  </div>`;
}

async function renderMarkdown(url, fallback) {
  const box = document.getElementById("md");
  try {
    box.innerHTML = mdToHtml(await fetchText(url));
  } catch (e) {
    box.innerHTML = `<p class="err">${fallback || e.message}</p>`;
  }
}

async function render() {
  const p = path();
  setActive();
  closeMenu();
  const root = document.getElementById("main");
  if (!root) return;
  if (!DATA) {
    try {
      DATA = JSON.parse(await fetchText("/archive.json"));
    } catch (e) {
      root.innerHTML = `<div class="page"><h1>This leaf is not in the papers</h1><p class="err">Could not load the registry.</p></div>`;
      return;
    }
  }

  if (p === "/") {
    root.innerHTML = overview();
    bindFilter();
    return;
  }
  if (p === "/map") {
    root.innerHTML = mindmapPage();
    bindMindmap();
    return;
  }
  if (p === "/docs") {
    root.innerHTML = docsIndex();
    bindFilter();
    return;
  }
  if (p === "/downloads") {
    root.innerHTML = downloadsPage();
    return;
  }
  if (p === "/summary") {
    root.innerHTML = `<div class="page narrow"><p class="eyebrow">Editorial only</p><h1>Summary</h1><p class="lede">A clerk's map of how these papers sit together. It is not a finding and does not replace the transcript.</p><p><a class="btn btn-ghost" href="/downloads/CASE-SUMMARY.md" download="CASE-SUMMARY.md" data-dl="CASE-SUMMARY.md">Download summary (.md)</a></p><article class="sheet legal" id="md">Loading...</article></div>`;
    await renderMarkdown("/downloads/CASE-SUMMARY.md");
    return;
  }

  const docMatch = p.match(/^\/docs\/([^/]+)(?:\/(.*))?$/);
  if (docMatch) {
    const d = docById(docMatch[1]);
    if (!d) {
      root.innerHTML = leaf();
      return;
    }
    const rest = docMatch[2] || "";
    if (!rest) {
      root.innerHTML = docOverview(d);
      return;
    }
    if (rest === "sections") {
      root.innerHTML = sectionIndex(d);
      return;
    }
    if (rest === "pages") {
      root.innerHTML = pagesIndex(d);
      return;
    }
    if (rest === "summary") {
      root.innerHTML = `<div class="page narrow"><p class="eyebrow">Editorial only</p><h1>Summary</h1><p class="lede">${DATA.case.disclaimer}</p><p><a class="btn btn-ghost" href="/downloads/${d.id}-SUMMARY.md" download="${d.id}-SUMMARY.md" data-dl="${d.id}-SUMMARY.md">Download summary (.md)</a></p><article class="sheet legal" id="md">Loading...</article></div>`;
      await renderMarkdown(`/transcripts/${d.id}/SUMMARY.md`);
      return;
    }
    if (rest === "transcript") {
      root.innerHTML = `<div class="page narrow"><p class="eyebrow">Full file</p><h1>Complete transcript</h1><p class="lede">Verbatim structured Markdown of this PDF. Search filters heading-blocks. Empty query shows the full file.</p>
        <div class="row" style="margin:0 0 1rem">
          <a class="btn btn-ghost" href="/downloads/${d.id}-FULL-TRANSCRIPT.md" download="${d.id}-FULL-TRANSCRIPT.md" data-dl="${d.id}-FULL-TRANSCRIPT.md">Markdown</a>
          <a class="btn btn-ghost" href="/downloads/${d.id}-FULL-TRANSCRIPT.docx" download="${d.id}-FULL-TRANSCRIPT.docx" data-dl="${d.id}-FULL-TRANSCRIPT.docx">Word</a>
          <a class="btn btn-solid" href="/downloads/${d.id}-transcripts.zip" download="${d.id}-transcripts.zip" data-dl="${d.id}-transcripts.zip">All files (ZIP)</a>
        </div>
        <input class="search" id="q" placeholder="Search names, amounts, dates..." />
        <article class="sheet legal" id="md" style="margin-top:1rem">Loading...</article></div>`;
      const box = document.getElementById("md");
      const input = document.getElementById("q");
      let source = "";
      try {
        source = await fetchText(`/transcripts/${d.id}/FULL-TRANSCRIPT.md`);
      } catch (e) {
        box.innerHTML = `<p class="err">${e.message}</p>`;
        return;
      }
      const run = () => {
        box.innerHTML = mdToHtml(source, input.value.trim());
      };
      input.addEventListener("input", () => {
        clearTimeout(input._t);
        input._t = setTimeout(run, 180);
      });
      run();
      return;
    }
    const pm = rest.match(/^pages\/(\d+)$/);
    if (pm) {
      const n = Number(pm[1]);
      if (n < 1 || n > d.pages) {
        root.innerHTML = leaf();
        return;
      }
      const s = d.sections.find((x) => n >= x.pageStart && n <= x.pageEnd);
      const prev = n > 1 ? n - 1 : null;
      const next = n < d.pages ? n + 1 : null;
      root.innerHTML = `<div class="page"><p class="eyebrow">Page ${n} of ${d.pages}${s ? " · " + s.mark : ""}</p>
        <h1>${s ? s.title : d.title}</h1>
        <p class="row">
          ${prev ? `<a class="btn btn-ghost" href="/docs/${d.id}/pages/${prev}">← p. ${prev}</a>` : ""}
          ${next ? `<a class="btn btn-ghost" href="/docs/${d.id}/pages/${next}">p. ${next} →</a>` : ""}
          ${s ? `<a class="btn btn-solid" href="/docs/${d.id}/sections/${s.id}">Typed transcript</a>` : ""}
        </p>
        <figure class="scan"><img src="${pageSrc(d, n)}" alt="Scanned page ${n}" onerror="this.onerror=null;this.src='${pageSrcFallback(d, n)}'" /></figure>
      </div>`;
      return;
    }
    const sm = rest.match(/^sections\/([^/]+)$/);
    if (sm) {
      const s = d.sections.find((x) => x.id === sm[1]);
      if (!s) {
        root.innerHTML = leaf();
        return;
      }
      const thumbs = [];
      for (let n = s.pageStart; n <= s.pageEnd; n++) {
        thumbs.push(
          `<a href="/docs/${d.id}/pages/${n}"><img src="${pageSrc(d, n)}" alt="Page ${n}" loading="lazy" onerror="this.onerror=null;this.src='${pageSrcFallback(d, n)}'" /></a>`
        );
      }
      root.innerHTML = `<div class="page narrow"><p class="eyebrow">${s.mark} · pages ${s.pages}</p>
        <h1>${s.title}</h1>
        <p class="lede">${s.short}</p>
        <p class="row">
          <a class="btn btn-ghost" href="/downloads/${d.id}-${s.file}" download="${d.id}-${s.file}" data-dl="${d.id}-${s.file}">Download this section (.md)</a>
          <a class="btn btn-ghost" href="/docs/${d.id}/pages/${s.pageStart}">Original pages</a>
        </p>
        <div class="thumbs">${thumbs.join("")}</div>
        <article class="sheet legal" id="md">Loading...</article></div>`;
      await renderMarkdown(`/transcripts/${d.id}/sections/${s.file}`);
      return;
    }
  }

  if (p === "/transcript" || p === "/sections" || p === "/pages") {
    root.innerHTML = `<div class="page"><p class="eyebrow">Many documents</p><h1>This archive is a case, not one PDF</h1><p class="lede">Open the document tree, then the transcript for that paper.</p><p><a class="btn btn-solid" href="/docs">Open all sections</a></p></div>`;
    return;
  }
  root.innerHTML = leaf();
}

document.addEventListener("click", (e) => {
  const a = e.target.closest && e.target.closest("a");
  if (!a) return;
  const href = a.getAttribute("href") || "";
  if (a.hasAttribute("data-dl") || a.hasAttribute("download")) {
    if (isFileHref(href) || href.includes("/downloads/")) {
      e.preventDefault();
      downloadUrl(href, a.getAttribute("data-dl") || a.getAttribute("download") || "download");
      closeMenu();
      return;
    }
  }
  if (isAppHref(href) && !e.metaKey && !e.ctrlKey && !e.shiftKey && a.target !== "_blank") {
    e.preventDefault();
    closeMenu();
    go(href);
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key === "Escape") closeMenu();
});
window.addEventListener("popstate", render);
window.addEventListener("resize", () => {
  if (window.matchMedia("(min-width: 800px)").matches) closeMenu();
});
const menuBtn = document.getElementById("menuBtn");
if (menuBtn)
  menuBtn.addEventListener("click", (e) => {
    e.preventDefault();
    toggleMenu();
  });
const drawerBg = document.getElementById("drawerBg");
if (drawerBg) drawerBg.addEventListener("click", closeMenu);
const drawerClose = document.getElementById("drawerClose");
if (drawerClose) drawerClose.addEventListener("click", closeMenu);
const hdr = document.getElementById("hdrDl");
if (hdr)
  hdr.addEventListener("click", (e) => {
    e.preventDefault();
    downloadUrl("/downloads/shah-v-trindade-archive.zip", "shah-v-trindade-archive.zip");
  });
closeMenu();
render();
