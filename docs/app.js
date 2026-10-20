// Fire Service Daily — page logic
const NEWS_ORDER = ["All","Local","Florida","LODD","News","Training","EMS","Research","Publications","Apparatus & Gear"];
const SPECIAL = ["Union", "24/72"];
const SHIFT_RE = /24\s*\/\s*72|d[- ]shift|delta shift|fourth (shift|platoon)|42[- ]hour/i;
const STATUS = [
  { key: "on", label: "On 24/72" },
  { key: "staffing", label: "Approved & staffing up" },
  { key: "talks", label: "In talks" },
];

let news = { items: [], sources: [] }, tracker = null;
let tab = "news", cat = "All", query = "";

try {
  const p = new URLSearchParams(location.search);
  if (p.get("tab")) tab = p.get("tab");
  if (p.get("cat")) cat = p.get("cat");
} catch (e) {}

const $ = id => document.getElementById(id);
const esc = s => String(s || "").replace(/[&<>"]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));

function dayLabel(iso) {
  if (!iso) return "Recent";
  const d = new Date(iso), now = new Date();
  const diff = Math.round((new Date(now.toDateString()) - new Date(d.toDateString())) / 864e5);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  const opts = { weekday: "long", month: "short", day: "numeric" };
  if (d.getFullYear() !== now.getFullYear()) opts.year = "numeric";
  return d.toLocaleDateString(undefined, opts);
}
const shortDate = iso => new Date(iso + "T12:00:00").toLocaleDateString(undefined, { month: "short", year: "numeric" });

function matches(i) {
  const q = query.toLowerCase();
  return !q || (i.title + " " + i.summary + " " + i.source).toLowerCase().includes(q);
}

function cardsByDay(items, emptyMsg) {
  if (!items.length) return `<div class="empty">${emptyMsg}</div>`;
  let html = "", last = null;
  items.forEach(i => {
    const lbl = dayLabel(i.date);
    if (lbl !== last) { html += (last ? "</div>" : "") + `<div class="day">${esc(lbl)}</div><div class="grid">`; last = lbl; }
    html += `<a class="card" href="${esc(i.link)}" target="_blank" rel="noopener">
      <div class="meta"><span class="tag">${esc(i.category)}</span><span>${esc(i.source)}</span></div>
      <h2>${esc(i.title)}</h2>${i.summary ? `<p>${esc(i.summary)}</p>` : ""}</a>`;
  });
  return html + "</div>";
}

function renderChips() {
  const chips = $("chips");
  if (tab !== "news") { chips.innerHTML = ""; chips.hidden = true; return; }
  chips.hidden = false;
  const items = news.items.filter(i => !SPECIAL.includes(i.category));
  const counts = {};
  items.forEach(i => counts[i.category] = (counts[i.category] || 0) + 1);
  const cats = NEWS_ORDER.filter(c => c === "All" || counts[c])
    .concat(Object.keys(counts).filter(c => !NEWS_ORDER.includes(c)));
  if (!cats.includes(cat)) cat = "All";
  chips.innerHTML = cats.map(c =>
    `<button class="chip" aria-pressed="${c === cat}" data-c="${esc(c)}">${esc(c)}<small>${c === "All" ? items.length : counts[c]}</small></button>`
  ).join("");
}

function renderNews() {
  const items = news.items.filter(i => !SPECIAL.includes(i.category) && (cat === "All" || i.category === cat) && matches(i));
  return cardsByDay(items, "No articles match.");
}

function renderUnion() {
  const items = news.items.filter(i => i.category === "Union" && matches(i));
  return `<p class="intro">Union and labor news for Central Florida fire departments, plus statewide
    Florida Professional Firefighters news. Pulled from news coverage every morning; stories stay for six months.</p>` +
    cardsByDay(items, "No union stories match.");
}

function renderShift() {
  if (!tracker) return `<div class="empty">Tracker couldn't load.</div>`;
  const q = query.toLowerCase();
  const depts = tracker.departments.filter(d => !q || (d.name + d.detail + d.region).toLowerCase().includes(q));
  let html = `<p class="intro">Florida departments on a 24-on / 72-off schedule, those hiring toward one, and those
    negotiating for it. ${esc(tracker.note)} Last reviewed ${esc(new Date(tracker.lastReviewed + "T12:00:00").toLocaleDateString(undefined, { month: "long", day: "numeric", year: "numeric" }))}.</p><div class="cols">`;
  STATUS.forEach(s => {
    const list = depts.filter(d => d.status === s.key);
    html += `<section class="col s-${s.key}"><h3>${s.label}<span class="count">${list.length}</span></h3>`;
    html += list.map(d => `<div class="dept"><b>${esc(d.name)}</b><span class="rg">${esc(d.region)} · as of ${esc(shortDate(d.updated))}</span>
      <p>${esc(d.detail)}</p><a href="${esc(d.source)}" target="_blank" rel="noopener">Source ↗</a></div>`).join("")
      || `<div class="empty" style="padding:20px 0">None</div>`;
    html += `</section>`;
  });
  html += `</div><div class="day" style="margin-top:34px">Latest 24/72 headlines</div>`;
  const items = news.items.filter(i => (i.category === "24/72" || SHIFT_RE.test(i.title + " " + i.summary)) && matches(i));
  const seen = new Set();
  const uniq = items.filter(i => !seen.has(i.link) && seen.add(i.link));
  return html + (uniq.length ? cardsByDay(uniq, "") : `<div class="empty">No recent 24/72 headlines.</div>`);
}

function render() {
  document.querySelectorAll(".tab").forEach(b => b.setAttribute("aria-selected", b.dataset.t === tab));
  renderChips();
  $("q").placeholder = tab === "shift" ? "Search departments and headlines…" : "Search headlines…";
  $("list").innerHTML = tab === "union" ? renderUnion() : tab === "shift" ? renderShift() : renderNews();
}

function setUrl() {
  try {
    const p = new URLSearchParams();
    if (tab !== "news") p.set("tab", tab);
    if (tab === "news" && cat !== "All") p.set("cat", cat);
    history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""));
  } catch (e) {}
}

document.querySelector(".tabs").addEventListener("click", e => {
  const b = e.target.closest(".tab"); if (!b) return;
  tab = b.dataset.t; setUrl(); render(); window.scrollTo(0, 0);
});
$("chips").addEventListener("click", e => {
  const b = e.target.closest(".chip"); if (!b) return;
  cat = b.dataset.c; setUrl(); render();
});
$("q").addEventListener("input", e => { query = e.target.value; render(); });

const bust = "?v=" + Date.now();
Promise.all([
  fetch("news.json" + bust).then(r => r.json()),
  fetch("shift-tracker.json" + bust).then(r => r.json()).catch(() => null),
]).then(([n, t]) => {
  news = n; tracker = t;
  $("updated").textContent = "Updated " + new Date(n.updated).toLocaleString(undefined,
    { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const ok = n.sources.filter(s => s.ok).length;
  $("srcs").textContent = `${ok} of ${n.sources.length} sources checked in today.`;
  render();
}).catch(() => {
  $("updated").textContent = "";
  $("list").innerHTML = `<div class="empty">News couldn't load. Try again shortly.</div>`;
});
