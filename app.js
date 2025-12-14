
/* FinSight v3 — Universal parsing + PDF.js integration
   Runs 100% client-side; reads PDF/CSV/TXT, detects credits/debits,
   totals, and visualizes categories.
*/

// ---------- DOM References ----------
const fileInput = document.getElementById("file");
const parseBtn = document.getElementById("parse");
const exampleBtn = document.getElementById("example");
const statusEl = document.getElementById("status");
const creditsEl = document.getElementById("credits");
const debitsEl = document.getElementById("debits");
const netEl = document.getElementById("net");
const txTableBody = document.querySelector("#txTable tbody");
const catlist = document.getElementById("catlist");
const insight = document.getElementById("insight");
const pie = document.getElementById("pie");

// ---------- Category mapping ----------
const CATEGORY_KEYWORDS = {
  Food: ["zomato", "swiggy", "restaurant", "hungry", "cafe", "dominos"],
  Groceries: ["bigbasket", "dmart", "grocery", "supermarket", "reliance"],
  Transport: ["uber", "ola", "irctc", "metro", "bus", "flight", "indigo"],
  Bills: ["electricity", "water", "bill", "gtpl", "hathway", "broadband"],
  Salary: ["salary", "credited", "payroll", "deposit", "freelance"],
  Shopping: ["amazon", "flipkart", "myntra", "ajio", "store", "shopping"],
  Rent: ["rent", "landlord"],
  Health: ["clinic", "hospital", "pharmacy", "doctor"],
  Entertainment: ["movie", "cinema", "spotify", "bookmyshow"]
};

// ---------- Helpers ----------
function normalize(s) {
  return (s || "").toString().toLowerCase().replace(/[,₹]/g, "").trim();
}
function extractAmount(s) {
  if (!s) return null;
  const m = s.match(
    /(?:rs\.?\s?)?([0-9]{1,3}(?:,[0-9]{3})*(?:\.\d+)?|\d+\.?\d*)/i
  );
  if (!m) return null;
  return Number(m[1].replace(/,/g, ""));
}
function detectType(s) {
  const t = normalize(s);
  if (/\b(cr|credit|credited|received|deposit)\b/.test(t)) return "credit";
  if (/\b(dr|debit|paid|purchased|spent|withdrawn|payment)\b/.test(t))
    return "debit";
  return null;
}
function categorize(desc) {
  const s = normalize(desc);
  for (const [cat, kws] of Object.entries(CATEGORY_KEYWORDS)) {
    for (const k of kws) if (s.includes(k)) return cat;
  }
  return "Other";
}

// ---------- Date splitting ----------
const DATE_RE =
  /\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s*\d{1,2},?\s*\d{2,4}\b|\b\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}\b|\b\d{4}[\/\-.]\d{1,2}[\/\-.]\d{1,2}\b/gi;

function splitIntoBlocks(fullText) {
  // Normalize spacing
  let cleaned = fullText
    .replace(/\r/g, '\n')
    .replace(/\u00a0/g, ' ')
    .replace(/Page \d+ of \d+/gi, '')
    .replace(/Date\s+Transaction\s+Details\s+Type\s+Amount/gi, '')
    .replace(/\n{2,}/g, '\n');

  // 🧹 Remove recurring PhonePe disclaimers and footers (on every page)
  cleaned = cleaned.replace(/This is a system generated statement[^\n]*(?:\n|$)/gi, '');
  cleaned = cleaned.replace(/This is an automatically generated statement[^\n]*(?:\n|$)/gi, '');
  cleaned = cleaned.replace(/Customer\(s\)[^\n]*(?:\n|$)/gi, '');
  cleaned = cleaned.replace(/Disclaimer\s*:\s*Do not fall prey[^\n]*(?:\n|$)/gi, '');

  // Now detect start of transactions
  const txnStartRe = /\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}\s*\n?\s*(?:\d{1,2}:\d{2}\s*(?:am|pm))?/gi;
  const idxs = [];
  let match;
  while ((match = txnStartRe.exec(cleaned)) !== null) {
    idxs.push({ index: match.index, text: match[0] });
  }

  const blocks = [];
  for (let i = 0; i < idxs.length; i++) {
    const start = idxs[i].index;
    const end = i + 1 < idxs.length ? idxs[i + 1].index : cleaned.length;
    const block = cleaned.slice(start, end).trim();
    if (block && !/Date\s+Transaction\s+Details/i.test(block)) blocks.push(block);
  }

  console.log("🧩 Found", blocks.length, "transactions");
  return blocks;
}



// ---------- Parse one block ----------
function parseBlock(block) {
  block = block.replace(/This is (a system|an automatically) generated statement[\s\S]*$/i, '');

  
  const dateMatch = block.match(/\b(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{1,2},?\s+\d{4}/i);
  const date = dateMatch ? dateMatch[0] : "Unknown";

  const amountMatch = block.match(/₹\s*([\d,]+)/);
  const amount = amountMatch ? parseFloat(amountMatch[1].replace(/,/g, '')) : 0;

  const type = /CREDIT/i.test(block) ? "credit" : /DEBIT/i.test(block) ? "debit" : "unknown";

  let desc = "";
  const descMatch = block.match(/(?:Paid to|Received from|Payment to|Transfer to|Transfer from)[^\n]+/i);
  if (descMatch) desc = descMatch[0].trim();
  else desc = block.split('\n')[2]?.trim() || "N/A";

  return {
    date,
    desc,
    type,
    amount,
    category: categorize(desc)
  };
}


// ---------- Summarize ----------
function summarize(trans) {
  let credits = 0,
    debits = 0,
    catMap = {};
  for (const t of trans) {
    const type = (t.type || "").toLowerCase().trim();
    if (type.includes("credit")) credits += t.amount;
    else debits += t.amount;
    catMap[t.category] = (catMap[t.category] || 0) + t.amount;
  }
  return { credits, debits, catMap };
}

// ---------- Rendering ----------
function renderTransactions(trans) {
  txTableBody.innerHTML = "";
  for (const t of trans) {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${t.date || "—"}</td>
      <td>${escapeHtml(t.desc || "")}</td>
      <td>${t.category}</td>
      <td>${t.type}</td>
      <td>₹${formatNumber(t.amount)}</td>`;
    txTableBody.appendChild(tr);
  }
}
function escapeHtml(s) {
  return (s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;");
}
function formatNumber(n) {
  return Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 });
}
function renderSummary({ credits, debits }) {
  creditsEl.textContent = "₹" + formatNumber(credits);
  debitsEl.textContent = "₹" + formatNumber(debits);
  const net = credits - debits;
  netEl.textContent =
    (net >= 0 ? "₹" + formatNumber(net) : "-₹" + formatNumber(Math.abs(net)));
  netEl.style.color = net >= 0 ? "var(--good)" : "var(--bad)";
}
function renderCategories(catMap) {
  const arr = Object.entries(catMap)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);
  catlist.innerHTML = arr.length
    ? arr.map(([c, a]) => `${c}: ₹${formatNumber(a)}`).join("<br>")
    : "—";
  drawPie(catMap);
}
function makeInsight({ credits, debits, catMap }) {
  const top = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];
  if (!top) return "No transactions detected.";
  const [cat, amt] = top;
  const pct = Math.round((amt / Math.max(debits, 1)) * 100);
  return `Largest spending category: ${cat} (₹${formatNumber(
    amt
  )} — ${pct}% of total debits).`;
}

// ---------- Pie chart ----------
function drawPie(catMap) {
  pie.innerHTML = "";
  const data = Object.entries(catMap)
    .filter(([k, v]) => v > 0)
    .sort((a, b) => b[1] - a[1]);
  if (!data.length) {
    pie.innerHTML = `<text x="170" y="170" text-anchor="middle" fill="#9fbff5" class="small">No spending</text>`;
    return;
  }

  const total = data.reduce((s, [k, v]) => s + v, 0);
  let start = -Math.PI / 2;
  const cx = 170,
    cy = 170,
    r = 120;
  const colors = [
    "#60a5fa",
    "#06d6a4",
    "#ef476f",
    "#ffd166",
    "#8b5cf6",
    "#fb7185",
    "#34d399"
  ];

  data.forEach(([k, v], i) => {
    const angle = (v / total) * Math.PI * 2;
    const end = start + angle;
    const x1 = cx + r * Math.cos(start);
    const y1 = cy + r * Math.sin(start);
    const x2 = cx + r * Math.cos(end);
    const y2 = cy + r * Math.sin(end);
    const large = angle > Math.PI ? 1 : 0;

    const d = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} Z`;
    const path = document.createElementNS(
      "http://www.w3.org/2000/svg",
      "path"
    );
    path.setAttribute("d", d);
    path.setAttribute("fill", colors[i % colors.length]);
    pie.appendChild(path);
    start = end;
  });
}


// ---------- PDF.js extraction (fixed single version) ----------
async function extractTextFromPDF(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const totalPages = pdf.numPages;
  let fullText = "";

  statusEl.textContent = `Loading ${totalPages} pages...`;
  for (let i = 1; i <= totalPages; i++) {
    const page = await pdf.getPage(i);
    const txt = await page.getTextContent();
    const strings = txt.items.map((it) => it.str);
    fullText += strings.join(" ") + "\n";
    page.cleanup();
    if (i % 10 === 0) statusEl.textContent = `Processed ${i}/${totalPages}`;
    await new Promise((r) => setTimeout(r, 20));
  }

  console.log("Extracted text length:", fullText.length);
  console.log("Sample text:", fullText.slice(0, 2000));
  console.log("✅ Finished extracting", totalPages, "pages");
  console.log("🧾 Extracted text length:", fullText.length);
  console.log("🧾 First 500 chars:\n", fullText.slice(0, 500));
  console.log("🧾 Last 500 chars:\n", fullText.slice(-500));

  return fullText;
}

// ---------- Main handler ----------
async function processFile(file) {
  try {
    const name = (file.name || "").toLowerCase();
    let text = "";
    if (name.endsWith(".pdf")) text = await extractTextFromPDF(file);
    else text = await file.text();

    statusEl.textContent = "Parsing text...";
    const blocks = splitIntoBlocks(text);
    const transactions = blocks.map(parseBlock).filter((t) => t.amount);
    const filtered = transactions.filter(
      (t) => t.amount > 0 && t.amount < 1e9
    );

    renderTransactions(filtered);
    const summary = summarize(filtered);
    renderSummary(summary);
    renderCategories(summary.catMap);
    insight.textContent = makeInsight(summary);
    statusEl.textContent = `Parsed ${filtered.length} transactions`;
  } catch (e) {
    console.error(e);
    statusEl.textContent = "Error parsing file — see console";
  }
}

// ---------- Events ----------
parseBtn.addEventListener("click", () => {
  const f = fileInput.files[0];
  if (!f) {
    alert("Choose a file first");
    return;
  }
  processFile(f);
});

exampleBtn.addEventListener("click", () => {
  const sample = `Nov 01, 2025
06:05 pm
DEBIT ₹1,500 Paid to GTPL HATHWAY LIMITED
Nov 01, 2025
06:04 pm
CREDIT ₹1,500 Received from Dad
Oct 10, 2025
06:30 pm
DEBIT ₹7,000 Paid to Gouri Aunty
Oct 09, 2025
08:34 pm
DEBIT ₹1,101 Paid to HUNGRY BIRDS
`;
  processFile(new File([sample], "sample.txt", { type: "text/plain" }));
});

// ---------- PDF.js Worker ----------
pdfjsLib.GlobalWorkerOptions.workerSrc =
  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.9.179/pdf.worker.min.js";
