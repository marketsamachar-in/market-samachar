/**
 * Market Samachar Admin Dashboard HTML template.
 * Rendered server-side by Express; protected by requireAdmin middleware.
 */

export function renderAdminDashboard(): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1.0"/>
<title>Market Samachar — Admin</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07070e;--card:#0d0d1e;--border:#1a1a2e;
  --green:#00ff88;--red:#ff4466;--gold:#ffcc44;--blue:#3b9eff;--orange:#ff9f3b;
  --text:#e8eaf0;--sub:#8899aa;--dim:#334466;--dimmer:#1e2840;
  --mono:'DM Mono',monospace;--sans:'DM Sans',sans-serif;
}
body{background:var(--bg);color:var(--text);font-family:var(--sans);display:flex;min-height:100vh}
a{color:inherit;text-decoration:none}

/* ── Sidebar ── */
.sidebar{
  width:200px;min-height:100vh;background:#050508;border-right:1px solid var(--border);
  display:flex;flex-direction:column;flex-shrink:0;position:fixed;top:0;left:0;bottom:0;
  overflow-y:auto;z-index:100;
}
.sidebar-logo{
  padding:18px 16px 14px;border-bottom:1px solid var(--border);
  font-family:var(--mono);font-size:11px;letter-spacing:2px;color:var(--green);
}
.sidebar-logo span{display:block;color:var(--dim);font-size:9px;margin-top:3px;letter-spacing:1px}
.nav-item{
  display:flex;align-items:center;gap:8px;padding:10px 16px;
  font-size:12px;color:var(--sub);cursor:pointer;border-left:2px solid transparent;
  transition:all .15s;font-family:var(--mono);letter-spacing:.5px;
}
.nav-item:hover{color:var(--text);background:#0a0a18}
.nav-item.active{color:var(--green);border-left-color:var(--green);background:#00ff8808}
.nav-item svg{flex-shrink:0}
.nav-sep{height:1px;background:var(--border);margin:8px 12px}
.logout{color:var(--red)!important;margin-top:auto;padding-bottom:20px}

/* ── Main ── */
.main{margin-left:200px;flex:1;padding:24px;min-height:100vh}
.section{display:none}
.section.active{display:block}

/* ── Page header ── */
.page-title{
  font-family:var(--mono);font-size:13px;color:var(--green);letter-spacing:2px;
  margin-bottom:20px;display:flex;align-items:center;gap:10px;
}
.page-title::before{content:'';display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.4}}

/* ── Stat cards ── */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:12px;margin-bottom:24px}
.stat-card{
  background:var(--card);border:1px solid var(--border);border-radius:8px;padding:14px 16px;
}
.stat-label{font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:1px;margin-bottom:6px}
.stat-value{font-family:var(--mono);font-size:22px;font-weight:500;color:var(--text)}
.stat-value.green{color:var(--green)}.stat-value.gold{color:var(--gold)}
.stat-value.red{color:var(--red)}.stat-value.blue{color:var(--blue)}
.stat-sub{font-family:var(--mono);font-size:9px;color:var(--dim);margin-top:4px}

/* ── Tables ── */
.table-wrap{background:var(--card);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:24px}
.table-header{
  padding:10px 16px;background:#07070e;border-bottom:1px solid var(--border);
  display:flex;align-items:center;justify-content:space-between;gap:10px;
}
.table-title{font-family:var(--mono);font-size:10px;color:var(--green);letter-spacing:1.5px}
table{width:100%;border-collapse:collapse;font-size:12px}
thead tr{background:#00ff8810;border-bottom:1px solid #00ff8830}
th{font-family:var(--mono);font-size:9px;color:var(--green);letter-spacing:1px;padding:9px 12px;text-align:left;white-space:nowrap}
td{padding:9px 12px;border-bottom:1px solid #0d0d1e;color:var(--sub);vertical-align:middle}
tr:last-child td{border-bottom:none}
tr:hover td{background:#ffffff04;color:var(--text)}
.badge{
  display:inline-block;padding:2px 7px;border-radius:3px;font-family:var(--mono);font-size:9px;
  font-weight:500;letter-spacing:.5px;
}
.badge-green{background:#00ff8818;border:1px solid #00ff8830;color:var(--green)}
.badge-red{background:#ff446618;border:1px solid #ff446630;color:var(--red)}
.badge-gold{background:#ffcc4418;border:1px solid #ffcc4430;color:var(--gold)}
.badge-blue{background:#3b9eff18;border:1px solid #3b9eff30;color:var(--blue)}
.badge-dim{background:#1e284018;border:1px solid var(--dimmer);color:var(--dim)}

/* ── Buttons ── */
.btn{
  font-family:var(--mono);font-size:10px;padding:5px 12px;border-radius:4px;
  cursor:pointer;border:1px solid;transition:all .15s;display:inline-flex;align-items:center;gap:5px;
  white-space:nowrap;
}
.btn:disabled{opacity:.45;cursor:default}
.btn-green{background:#00ff8812;border-color:#00ff8840;color:var(--green)}
.btn-green:hover:not(:disabled){background:#00ff8825}
.btn-red{background:#ff446612;border-color:#ff446640;color:var(--red)}
.btn-red:hover:not(:disabled){background:#ff446625}
.btn-gold{background:#ffcc4412;border-color:#ffcc4440;color:var(--gold)}
.btn-gold:hover:not(:disabled){background:#ffcc4425}
.btn-blue{background:#3b9eff12;border-color:#3b9eff40;color:var(--blue)}
.btn-blue:hover:not(:disabled){background:#3b9eff25}
.btn-dim{background:#1e284020;border-color:var(--dimmer);color:var(--sub)}
.btn-dim:hover:not(:disabled){color:var(--text)}

/* ── Search / form ── */
.search-row{display:flex;gap:8px;margin-bottom:16px;align-items:center}
.input{
  background:#0a0a18;border:1px solid var(--border);color:var(--text);
  font-family:var(--mono);font-size:12px;padding:8px 12px;border-radius:5px;
  outline:none;flex:1;
}
.input:focus{border-color:#334466}
.input::placeholder{color:var(--dim)}
select.input{cursor:pointer}

/* ── Modal ── */
.overlay{
  display:none;position:fixed;inset:0;background:rgba(0,0,0,.75);
  z-index:1000;align-items:center;justify-content:center;
}
.overlay.open{display:flex}
.modal{
  background:var(--card);border:1px solid var(--border);border-radius:10px;
  padding:24px;width:min(500px,95vw);max-height:90vh;overflow-y:auto;
}
.modal-title{font-family:var(--mono);font-size:11px;color:var(--green);letter-spacing:1.5px;margin-bottom:18px}
.form-group{margin-bottom:14px}
.form-label{font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:1px;display:block;margin-bottom:5px}
.form-row{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.modal-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--border)}

/* ── Misc ── */
.empty{color:var(--dim);font-family:var(--mono);font-size:11px;text-align:center;padding:28px}
.loading{color:var(--dim);font-family:var(--mono);font-size:10px;padding:20px;text-align:center}
.toast{
  position:fixed;bottom:24px;right:24px;z-index:9999;
  background:#00ff8818;border:1px solid #00ff8840;color:var(--green);
  font-family:var(--mono);font-size:11px;padding:10px 18px;border-radius:6px;
  display:none;animation:slideup .2s ease;
}
.toast.err{background:#ff446618;border-color:#ff446640;color:var(--red)}
@keyframes slideup{from{transform:translateY(10px);opacity:0}to{transform:translateY(0);opacity:1}}
.quiz-q{background:#07070e;border:1px solid var(--border);border-radius:6px;padding:12px 14px;margin-bottom:10px}
.quiz-q-text{font-size:13px;color:var(--text);margin-bottom:8px}
.quiz-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.quiz-opt{font-family:var(--mono);font-size:10px;color:var(--sub);padding:5px 8px;background:#0a0a18;border-radius:4px}
.quiz-opt.correct{color:var(--green);background:#00ff8810}
</style>
</head>
<body>

<!-- ── Sidebar ─────────────────────────────────────────────── -->
<nav class="sidebar">
  <div class="sidebar-logo">
    MS ADMIN
    <span>MARKET SAMACHAR</span>
  </div>
  ${[
    ['overview',  'Overview',  '◈'],
    ['payments',  'Payments',  '₹'],
    ['users',     'Users',     '◎'],
    ['quiz',      'Quiz',      '?'],
    ['ipos',      'IPOs',      '⬡'],
    ['rewards',   'Rewards',   '★'],
  ].map(([id, label, icon]) =>
    `<a class="nav-item" data-section="${id}" href="#${id}">
      <span>${icon}</span>${label}
    </a>`
  ).join('')}
  <div class="nav-sep"></div>
  <a class="nav-item logout" href="/admin/logout">⏻ Logout</a>
</nav>

<!-- ── Main content ────────────────────────────────────────── -->
<main class="main">

<!-- 1. OVERVIEW -->
<section class="section active" id="s-overview">
  <div class="page-title">OVERVIEW STATS</div>
  <div class="stat-grid" id="stat-grid"><div class="loading">Loading stats…</div></div>
  <div style="display:flex;gap:8px;margin-bottom:20px">
    <button class="btn btn-green" onclick="loadStats()">↻ Refresh Stats</button>
    <button class="btn btn-blue" onclick="triggerNewsRefresh()">⚡ Fetch News</button>
  </div>
  <div class="table-wrap">
    <div class="table-header">
      <span class="table-title">RECENT BATCHES</span>
    </div>
    <div id="batches-table"><div class="loading">Loading…</div></div>
  </div>
</section>

<!-- 2. PAYMENTS -->
<section class="section" id="s-payments">
  <div class="page-title">PAYMENT VERIFICATION</div>
  <div style="display:flex;gap:8px;margin-bottom:16px;align-items:center">
    <select class="input" style="width:160px" id="pay-filter" onchange="loadPayments()">
      <option value="all">All Payments</option>
      <option value="pending">Pending</option>
      <option value="success">Success</option>
      <option value="failed">Failed</option>
    </select>
    <button class="btn btn-dim" onclick="loadPayments()">↻ Refresh</button>
  </div>
  <div class="table-wrap">
    <div class="table-header">
      <span class="table-title">PAYMENT RECORDS</span>
      <span id="pay-count" style="font-family:var(--mono);font-size:9px;color:var(--dim)"></span>
    </div>
    <div id="payments-table"><div class="loading">Loading…</div></div>
  </div>
</section>

<!-- 3. USERS -->
<section class="section" id="s-users">
  <div class="page-title">USER MANAGEMENT</div>
  <div class="search-row">
    <input class="input" id="user-search" placeholder="Search by phone, email or user ID…" oninput="debouncedUserSearch()"/>
    <button class="btn btn-green" onclick="searchUsers()">Search</button>
  </div>
  <div class="table-wrap">
    <div class="table-header">
      <span class="table-title">USERS</span>
      <span id="user-count" style="font-family:var(--mono);font-size:9px;color:var(--dim)"></span>
    </div>
    <div id="users-table"><div class="empty">Search for a user above</div></div>
  </div>
</section>

<!-- 4. QUIZ -->
<section class="section" id="s-quiz">
  <div class="page-title">QUIZ MANAGEMENT</div>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <button class="btn btn-gold" id="regen-btn" onclick="regenerateQuiz()">↻ Regenerate Today's Quiz</button>
    <button class="btn btn-dim" onclick="loadQuiz()">↻ Refresh</button>
  </div>
  <div class="table-wrap" style="margin-bottom:16px">
    <div class="table-header"><span class="table-title">TODAY'S QUESTIONS</span></div>
    <div id="quiz-questions" style="padding:12px"><div class="loading">Loading…</div></div>
  </div>
  <div class="table-wrap">
    <div class="table-header">
      <span class="table-title">TODAY'S ATTEMPTS</span>
      <span id="attempt-count" style="font-family:var(--mono);font-size:9px;color:var(--dim)"></span>
    </div>
    <div id="quiz-attempts"><div class="loading">Loading…</div></div>
  </div>
</section>

<!-- 5. IPOs -->
<section class="section" id="s-ipos">
  <div class="page-title">IPO MANAGEMENT</div>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <button class="btn btn-green" onclick="openIPOModal(null)">+ Add IPO</button>
    <button class="btn btn-dim" onclick="loadIPOs()">↻ Refresh</button>
    <button class="btn btn-blue" onclick="scrapeIPOs()">⬇ Scrape Chittorgarh</button>
  </div>
  <div class="table-wrap">
    <div class="table-header">
      <span class="table-title">IPO RECORDS</span>
      <span id="ipo-count" style="font-family:var(--mono);font-size:9px;color:var(--dim)"></span>
    </div>
    <div id="ipos-table"><div class="loading">Loading…</div></div>
  </div>
</section>

<!-- 6. REWARDS -->
<section class="section" id="s-rewards">
  <div class="page-title">PRO REWARDS LOG</div>
  <div style="display:flex;gap:8px;margin-bottom:16px">
    <button class="btn btn-green" onclick="openGrantModal()">+ Manual Grant</button>
    <button class="btn btn-dim" onclick="loadRewards()">↻ Refresh</button>
  </div>
  <div class="table-wrap">
    <div class="table-header">
      <span class="table-title">REWARD HISTORY</span>
      <span id="reward-count" style="font-family:var(--mono);font-size:9px;color:var(--dim)"></span>
    </div>
    <div id="rewards-table"><div class="loading">Loading…</div></div>
  </div>
</section>

</main>

<!-- ── IPO Modal ─────────────────────────────────────────────── -->
<div class="overlay" id="ipo-modal">
  <div class="modal">
    <div class="modal-title" id="ipo-modal-title">ADD IPO</div>
    <input type="hidden" id="ipo-edit-id"/>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">COMPANY NAME *</label>
        <input class="input" id="ipo-company" placeholder="Acme Corp Ltd"/>
      </div>
      <div class="form-group">
        <label class="form-label">NSE SYMBOL</label>
        <input class="input" id="ipo-symbol" placeholder="ACME"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">OPEN DATE</label>
        <input class="input" type="date" id="ipo-open"/>
      </div>
      <div class="form-group">
        <label class="form-label">CLOSE DATE</label>
        <input class="input" type="date" id="ipo-close"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">ALLOTMENT DATE</label>
        <input class="input" type="date" id="ipo-allotment"/>
      </div>
      <div class="form-group">
        <label class="form-label">LISTING DATE</label>
        <input class="input" type="date" id="ipo-listing"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">PRICE BAND LOW (₹)</label>
        <input class="input" type="number" id="ipo-low" placeholder="120"/>
      </div>
      <div class="form-group">
        <label class="form-label">PRICE BAND HIGH (₹)</label>
        <input class="input" type="number" id="ipo-high" placeholder="135"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">LOT SIZE</label>
        <input class="input" type="number" id="ipo-lot" placeholder="100"/>
      </div>
      <div class="form-group">
        <label class="form-label">GMP (₹)</label>
        <input class="input" type="number" id="ipo-gmp" placeholder="15"/>
      </div>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">CATEGORY</label>
        <select class="input" id="ipo-category">
          <option value="mainboard">Mainboard</option>
          <option value="sme">SME</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">SUBSCRIPTION (×)</label>
        <input class="input" type="number" step="0.01" id="ipo-sub" placeholder="12.5"/>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-dim" onclick="closeIPOModal()">Cancel</button>
      <button class="btn btn-green" onclick="saveIPO()">Save IPO</button>
    </div>
  </div>
</div>

<!-- ── Grant Pro Modal ────────────────────────────────────────── -->
<div class="overlay" id="grant-modal">
  <div class="modal">
    <div class="modal-title">GRANT PRO ACCESS</div>
    <div class="form-group">
      <label class="form-label">USER ID / EMAIL / PHONE</label>
      <input class="input" id="grant-user" placeholder="Enter user ID, email or phone…"/>
    </div>
    <div class="form-row">
      <div class="form-group">
        <label class="form-label">DAYS</label>
        <input class="input" type="number" id="grant-days" value="30" min="1" max="365"/>
      </div>
      <div class="form-group">
        <label class="form-label">REASON</label>
        <select class="input" id="grant-reason">
          <option value="admin_grant">Admin Grant</option>
          <option value="quiz_win">Quiz Win</option>
          <option value="contest">Contest</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
    <div class="modal-actions">
      <button class="btn btn-dim" onclick="closeGrantModal()">Cancel</button>
      <button class="btn btn-green" onclick="submitGrant()">Grant Pro</button>
    </div>
  </div>
</div>

<!-- ── Coin Adjust Modal ──────────────────────────────────────── -->
<div class="overlay" id="coin-modal">
  <div class="modal">
    <div class="modal-title">ADJUST COINS</div>
    <input type="hidden" id="coin-user-id"/>
    <div class="form-group">
      <label class="form-label">USER</label>
      <div id="coin-user-label" style="font-family:var(--mono);font-size:11px;color:var(--text);padding:6px 0"></div>
    </div>
    <div class="form-group">
      <label class="form-label">COIN DELTA (positive or negative)</label>
      <input class="input" type="number" id="coin-delta" placeholder="+100 or -50"/>
    </div>
    <div class="modal-actions">
      <button class="btn btn-dim" onclick="closeCoinModal()">Cancel</button>
      <button class="btn btn-gold" onclick="submitCoinAdjust()">Apply</button>
    </div>
  </div>
</div>

<!-- ── Toast ─────────────────────────────────────────────────── -->
<div class="toast" id="toast"></div>

<script>
// ── State ──────────────────────────────────────────────────────────────────────
let _currentSection = 'overview';
let _users = [];
let _ipos  = [];
let _searchTimer = null;

// ── Navigation ─────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-item[data-section]').forEach(el => {
  el.addEventListener('click', e => {
    e.preventDefault();
    switchSection(el.dataset.section);
  });
});

function switchSection(name) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + name).classList.add('active');
  document.querySelector('[data-section="' + name + '"]').classList.add('active');
  _currentSection = name;
  loadSection(name);
}

function loadSection(name) {
  if (name === 'overview')  { loadStats(); loadBatches(); }
  if (name === 'payments')  loadPayments();
  if (name === 'users')     {} // wait for search
  if (name === 'quiz')      loadQuiz();
  if (name === 'ipos')      loadIPOs();
  if (name === 'rewards')   loadRewards();
}

// ── Toast ──────────────────────────────────────────────────────────────────────
function toast(msg, err=false) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast' + (err?' err':'');
  t.style.display = 'block';
  setTimeout(() => t.style.display = 'none', 3000);
}

// ── Fetch helpers ──────────────────────────────────────────────────────────────
async function api(path, opts={}) {
  const res = await fetch(path, { credentials: 'include', ...opts });
  if (!res.ok) {
    const e = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(e.error || res.statusText);
  }
  return res.json();
}

function fmt(n) {
  if (n == null) return '—';
  if (typeof n === 'number') return n.toLocaleString('en-IN');
  return n;
}
function fmtDate(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-IN', { dateStyle:'short', timeStyle:'short' });
}
function istNow() {
  return new Date(Date.now() + 5.5*3600000).toISOString().slice(0,10);
}

// ── 1. OVERVIEW ────────────────────────────────────────────────────────────────
async function loadStats() {
  try {
    const d = await api('/api/admin/stats');
    const g = document.getElementById('stat-grid');
    const cards = [
      { label:'TOTAL USERS',       value: fmt(d.totalUsers),       cls:'text'  },
      { label:'PRO USERS',          value: fmt(d.proUsers),          cls:'gold'  },
      { label:'ACTIVE TODAY',       value: fmt(d.activeToday),       cls:'green' },
      { label:"TODAY'S REVENUE ₹",  value: '₹'+fmt(d.revenueToday), cls:'green' },
      { label:'QUIZZES TODAY',      value: fmt(d.quizzesToday),      cls:'blue'  },
      { label:'ARTICLES CACHED',    value: fmt(d.articlesCached),    cls:'text'  },
      { label:'PIPELINE STATUS',    value: d.pipelineStatus,         cls: d.pipelineStatus==='posted'?'green':d.pipelineStatus==='failed'?'red':'text' },
      { label:'LAST FETCH',         value: d.lastFetchAgo,           cls:'text'  },
    ];
    g.innerHTML = cards.map(c =>
      '<div class="stat-card">' +
        '<div class="stat-label">' + c.label + '</div>' +
        '<div class="stat-value ' + c.cls + '">' + c.value + '</div>' +
      '</div>'
    ).join('');
  } catch(e) { toast('Stats failed: ' + e.message, true); }
}

async function loadBatches() {
  try {
    const d = await api('/api/admin/batches');
    const el = document.getElementById('batches-table');
    if (!d.length) { el.innerHTML = '<div class="empty">No batches yet</div>'; return; }
    el.innerHTML = '<table><thead><tr>' +
      '<th>BATCH ID</th><th>FETCHED AT</th><th>ITEMS</th><th>NEW</th><th>STATUS</th>' +
      '</tr></thead><tbody>' +
      d.map(b =>
        '<tr><td style="font-family:var(--mono);font-size:10px;color:var(--dim)">' + b.id + '</td>' +
        '<td>' + fmtDate(b.fetched_at) + '</td>' +
        '<td>' + fmt(b.item_count) + '</td>' +
        '<td>' + fmt(b.new_item_count) + '</td>' +
        '<td>' + badge(b.status) + '</td></tr>'
      ).join('') +
      '</tbody></table>';
  } catch(e) {}
}

async function triggerNewsRefresh() {
  try {
    await api('/api/news/refresh', { method:'POST' });
    toast('News fetch triggered');
    setTimeout(loadStats, 4000);
  } catch(e) { toast('Failed: ' + e.message, true); }
}

// ── 2. PAYMENTS ────────────────────────────────────────────────────────────────
async function loadPayments() {
  const filter = document.getElementById('pay-filter').value;
  try {
    const d = await api('/api/admin/payments?status=' + filter);
    document.getElementById('pay-count').textContent = d.length + ' records';
    const el = document.getElementById('payments-table');
    if (!d.length) { el.innerHTML = '<div class="empty">No payments found</div>'; return; }
    el.innerHTML = '<table><thead><tr>' +
      '<th>EMAIL</th><th>PHONE</th><th>PLAN</th><th>AMOUNT</th><th>UTR</th><th>DATE</th><th>STATUS</th><th>ACTION</th>' +
      '</tr></thead><tbody>' +
      d.map(p =>
        '<tr><td>' + (p.email||'—') + '</td>' +
        '<td style="font-family:var(--mono)">' + (p.phone||'—') + '</td>' +
        '<td><span class="badge badge-blue">' + (p.plan||'—').toUpperCase() + '</span></td>' +
        '<td style="font-family:var(--mono);color:var(--green)">₹' + fmt(p.amount) + '</td>' +
        '<td style="font-family:var(--mono);font-size:10px;color:var(--dim)">' + (p.utr_number||'—') + '</td>' +
        '<td>' + fmtDate(p.created_at) + '</td>' +
        '<td>' + badge(p.status) + '</td>' +
        '<td>' +
          (p.status !== 'success'
            ? '<button class="btn btn-green" onclick="activatePayment(\'' + p.id + '\',this)">Activate Pro</button>'
            : '<span class="badge badge-dim">DONE</span>'
          ) +
        '</td></tr>'
      ).join('') +
      '</tbody></table>';
  } catch(e) { toast('Payments failed: ' + e.message, true); }
}

async function activatePayment(id, btn) {
  btn.disabled = true; btn.textContent = '…';
  try {
    await api('/api/admin/payments/' + id + '/activate', { method:'POST' });
    toast('Pro activated!');
    loadPayments();
  } catch(e) { toast(e.message, true); btn.disabled = false; btn.textContent = 'Activate Pro'; }
}

// ── 3. USERS ───────────────────────────────────────────────────────────────────
function debouncedUserSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(searchUsers, 500);
}

async function searchUsers() {
  const q = document.getElementById('user-search').value.trim();
  if (!q) return;
  document.getElementById('users-table').innerHTML = '<div class="loading">Searching…</div>';
  try {
    const d = await api('/api/admin/users?q=' + encodeURIComponent(q));
    _users = d;
    document.getElementById('user-count').textContent = d.length + ' found';
    renderUsersTable(d);
  } catch(e) { toast('Search failed: ' + e.message, true); }
}

function renderUsersTable(users) {
  const el = document.getElementById('users-table');
  if (!users.length) { el.innerHTML = '<div class="empty">No users found</div>'; return; }
  el.innerHTML = '<table><thead><tr>' +
    '<th>NAME</th><th>EMAIL/PHONE</th><th>IQ</th><th>STREAK</th><th>COINS</th><th>PRO</th><th>ACTIONS</th>' +
    '</tr></thead><tbody>' +
    users.map(u =>
      '<tr>' +
      '<td>' + (u.name||'—') + '</td>' +
      '<td style="font-family:var(--mono);font-size:10px">' + (u.email||u.phone||u.id.slice(0,12)+'…') + '</td>' +
      '<td style="font-family:var(--mono);color:var(--gold)">' + fmt(u.investor_iq) + '</td>' +
      '<td style="font-family:var(--mono);color:var(--orange)">🔥' + fmt(u.streak_count) + '</td>' +
      '<td style="font-family:var(--mono);color:var(--green)">⚡' + fmt(u.coins) + '</td>' +
      '<td>' + (u.is_pro ? '<span class="badge badge-gold">PRO</span>' : '<span class="badge badge-dim">FREE</span>') + '</td>' +
      '<td style="display:flex;gap:5px;flex-wrap:wrap">' +
        '<button class="btn btn-gold" style="padding:3px 8px" onclick="grantProUser(\'' + u.id + '\',\'' + (u.email||u.phone||'') + '\')">Grant Pro</button>' +
        (u.is_pro ? '<button class="btn btn-red" style="padding:3px 8px" onclick="removeProUser(\'' + u.id + '\',this)">Remove Pro</button>' : '') +
        '<button class="btn btn-blue" style="padding:3px 8px" onclick="openCoinModal(\'' + u.id + '\',\'' + (u.name||u.email||u.id.slice(0,8)) + '\')">Coins</button>' +
        '<button class="btn btn-red" style="padding:3px 8px;opacity:.7" onclick="banUser(\'' + u.id + '\',this)">Ban</button>' +
      '</td></tr>'
    ).join('') +
    '</tbody></table>';
}

function grantProUser(userId, identity) {
  document.getElementById('grant-user').value = userId;
  openGrantModal();
}

async function removeProUser(userId, btn) {
  if (!confirm('Remove Pro from this user?')) return;
  btn.disabled = true;
  try {
    await api('/api/admin/users/' + userId + '/remove-pro', { method:'POST' });
    toast('Pro removed');
    searchUsers();
  } catch(e) { toast(e.message, true); btn.disabled = false; }
}

async function banUser(userId, btn) {
  if (!confirm('Ban this user? They will be locked out permanently.')) return;
  btn.disabled = true;
  try {
    await api('/api/admin/users/' + userId + '/ban', { method:'POST' });
    toast('User banned');
    searchUsers();
  } catch(e) { toast(e.message, true); btn.disabled = false; }
}

// ── 4. QUIZ ────────────────────────────────────────────────────────────────────
async function loadQuiz() {
  try {
    const d = await api('/api/admin/quiz/today');
    const qs = d.questions || [];
    const el = document.getElementById('quiz-questions');
    if (!qs.length) {
      el.innerHTML = '<div class="empty">No quiz generated yet for today</div>';
    } else {
      el.innerHTML = qs.map((q,i) =>
        '<div class="quiz-q">' +
          '<div style="font-family:var(--mono);font-size:9px;color:var(--dim);margin-bottom:4px">Q' + (i+1) + ' · ' + (q.category||'').toUpperCase() + '</div>' +
          '<div class="quiz-q-text">' + q.question + '</div>' +
          '<div class="quiz-opts">' +
            (q.options||[]).map((opt,oi) =>
              '<div class="quiz-opt' + (oi===q.correct_index?' correct':'') + '">' +
                (oi===q.correct_index?'✓ ':'') + opt +
              '</div>'
            ).join('') +
          '</div>' +
        '</div>'
      ).join('');
    }

    // Attempts
    const att = d.attempts || [];
    document.getElementById('attempt-count').textContent = att.length + ' attempts';
    const atEl = document.getElementById('quiz-attempts');
    if (!att.length) {
      atEl.innerHTML = '<div class="empty">No attempts today</div>';
    } else {
      atEl.innerHTML = '<table><thead><tr>' +
        '<th>USER ID</th><th>SCORE</th><th>TIME</th><th>COINS</th><th>IQ Δ</th><th>AT</th>' +
        '</tr></thead><tbody>' +
        att.map(a =>
          '<tr><td style="font-family:var(--mono);font-size:10px;color:var(--dim)">' + a.user_id.slice(0,16) + '…</td>' +
          '<td style="font-family:var(--mono);color:var(--green)">' + a.score + '/5</td>' +
          '<td style="font-family:var(--mono)">' + a.time_secs + 's</td>' +
          '<td style="font-family:var(--mono);color:var(--gold)">+' + a.coins_earned + '</td>' +
          '<td style="font-family:var(--mono);color:' + (a.iq_change>=0?'var(--green)':'var(--red)') + '">' + (a.iq_change>=0?'+':'') + a.iq_change + '</td>' +
          '<td>' + fmtDate(a.created_at) + '</td></tr>'
        ).join('') +
        '</tbody></table>';
    }
  } catch(e) { toast('Quiz load failed: ' + e.message, true); }
}

async function regenerateQuiz() {
  const btn = document.getElementById('regen-btn');
  if (!confirm('Regenerate today\\'s quiz? This overwrites existing questions.')) return;
  btn.disabled = true; btn.textContent = '↻ Regenerating…';
  try {
    await api('/api/admin/quiz/regenerate', { method:'POST' });
    toast('Quiz regenerated!');
    loadQuiz();
  } catch(e) { toast(e.message, true); }
  finally { btn.disabled = false; btn.textContent = '↻ Regenerate Today\\'s Quiz'; }
}

// ── 5. IPOs ────────────────────────────────────────────────────────────────────
async function loadIPOs() {
  try {
    const d = await api('/api/ipos');
    _ipos = d;
    document.getElementById('ipo-count').textContent = d.length + ' IPOs';
    const el = document.getElementById('ipos-table');
    if (!d.length) { el.innerHTML = '<div class="empty">No IPO records</div>'; return; }
    el.innerHTML = '<table><thead><tr>' +
      '<th>COMPANY</th><th>OPEN</th><th>CLOSE</th><th>PRICE BAND</th><th>LOT</th><th>GMP</th><th>SUB</th><th>CAT</th><th>ACTIONS</th>' +
      '</tr></thead><tbody>' +
      d.map(ipo =>
        '<tr>' +
        '<td><strong>' + ipo.company_name + '</strong><br/><span style="font-family:var(--mono);font-size:9px;color:var(--dim)">' + (ipo.symbol||'—') + '</span></td>' +
        '<td>' + (ipo.open_date||'—') + '</td>' +
        '<td>' + (ipo.close_date||'—') + '</td>' +
        '<td style="font-family:var(--mono)">₹' + (ipo.price_band_low||'?') + '–' + (ipo.price_band_high||'?') + '</td>' +
        '<td style="font-family:var(--mono)">' + fmt(ipo.lot_size) + '</td>' +
        '<td style="font-family:var(--mono);color:' + (ipo.gmp>0?'var(--green)':ipo.gmp<0?'var(--red)':'var(--dim)') + '">' + (ipo.gmp!=null?'₹'+ipo.gmp:'—') + '</td>' +
        '<td style="font-family:var(--mono)">' + (ipo.subscription_status!=null?ipo.subscription_status+'×':'—') + '</td>' +
        '<td><span class="badge ' + (ipo.category==='sme'?'badge-blue':'badge-dim') + '">' + (ipo.category||'mainboard').toUpperCase() + '</span></td>' +
        '<td style="display:flex;gap:5px">' +
          '<button class="btn btn-blue" style="padding:3px 8px" onclick="openIPOModal(\'' + ipo.id + '\')">Edit</button>' +
          '<button class="btn btn-red" style="padding:3px 8px" onclick="deleteIPO(\'' + ipo.id + '\',this)">Del</button>' +
        '</td></tr>'
      ).join('') +
      '</tbody></table>';
  } catch(e) { toast('IPO load failed: ' + e.message, true); }
}

function openIPOModal(id) {
  const ipo = id ? _ipos.find(i => i.id === id) : null;
  document.getElementById('ipo-modal-title').textContent = ipo ? 'EDIT IPO' : 'ADD IPO';
  document.getElementById('ipo-edit-id').value = id || '';
  const f = (fid, val) => { const el = document.getElementById(fid); if(el) el.value = val||''; };
  f('ipo-company', ipo?.company_name); f('ipo-symbol', ipo?.symbol);
  f('ipo-open', ipo?.open_date);       f('ipo-close', ipo?.close_date);
  f('ipo-allotment', ipo?.allotment_date); f('ipo-listing', ipo?.listing_date);
  f('ipo-low', ipo?.price_band_low);   f('ipo-high', ipo?.price_band_high);
  f('ipo-lot', ipo?.lot_size);         f('ipo-gmp', ipo?.gmp);
  f('ipo-sub', ipo?.subscription_status);
  document.getElementById('ipo-category').value = ipo?.category || 'mainboard';
  document.getElementById('ipo-modal').classList.add('open');
}
function closeIPOModal() { document.getElementById('ipo-modal').classList.remove('open'); }

async function saveIPO() {
  const id = document.getElementById('ipo-edit-id').value;
  const company = document.getElementById('ipo-company').value.trim();
  if (!company) { toast('Company name required', true); return; }
  const payload = {
    id:                  id || undefined,
    company_name:        company,
    symbol:              document.getElementById('ipo-symbol').value.trim() || null,
    open_date:           document.getElementById('ipo-open').value || null,
    close_date:          document.getElementById('ipo-close').value || null,
    allotment_date:      document.getElementById('ipo-allotment').value || null,
    listing_date:        document.getElementById('ipo-listing').value || null,
    price_band_low:      +document.getElementById('ipo-low').value || null,
    price_band_high:     +document.getElementById('ipo-high').value || null,
    lot_size:            +document.getElementById('ipo-lot').value || null,
    gmp:                 document.getElementById('ipo-gmp').value !== '' ? +document.getElementById('ipo-gmp').value : null,
    subscription_status: document.getElementById('ipo-sub').value !== '' ? +document.getElementById('ipo-sub').value : null,
    category:            document.getElementById('ipo-category').value,
  };
  try {
    const method = id ? 'PUT' : 'POST';
    const url    = id ? '/api/admin/ipo/' + id : '/api/admin/ipo';
    await api(url, { method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(payload) });
    toast(id ? 'IPO updated' : 'IPO added');
    closeIPOModal(); loadIPOs();
  } catch(e) { toast(e.message, true); }
}

async function deleteIPO(id, btn) {
  if (!confirm('Delete this IPO?')) return;
  btn.disabled = true;
  try {
    await api('/api/admin/ipo/' + id, { method:'DELETE' });
    toast('IPO deleted'); loadIPOs();
  } catch(e) { toast(e.message, true); btn.disabled = false; }
}

async function scrapeIPOs() {
  try {
    await api('/api/admin/ipo/scrape', { method:'POST' });
    toast('Scrape triggered — check back in ~30s');
    setTimeout(loadIPOs, 35000);
  } catch(e) { toast(e.message, true); }
}

// ── 6. REWARDS ─────────────────────────────────────────────────────────────────
async function loadRewards() {
  try {
    const d = await api('/api/admin/rewards');
    document.getElementById('reward-count').textContent = d.length + ' entries';
    const el = document.getElementById('rewards-table');
    if (!d.length) { el.innerHTML = '<div class="empty">No rewards granted yet</div>'; return; }
    el.innerHTML = '<table><thead><tr>' +
      '<th>USER ID / EMAIL</th><th>DAYS</th><th>REASON</th><th>GRANTED BY</th><th>DATE</th>' +
      '</tr></thead><tbody>' +
      d.map(r =>
        '<tr>' +
        '<td style="font-family:var(--mono);font-size:10px">' + (r.email||r.user_id.slice(0,20)+'…') + '</td>' +
        '<td style="font-family:var(--mono);color:var(--gold)">+' + r.days + 'd</td>' +
        '<td><span class="badge badge-blue">' + r.reason.replace(/_/g,' ').toUpperCase() + '</span></td>' +
        '<td style="font-family:var(--mono);font-size:10px;color:var(--dim)">' + r.granted_by + '</td>' +
        '<td>' + fmtDate(r.created_at) + '</td>' +
        '</tr>'
      ).join('') +
      '</tbody></table>';
  } catch(e) { toast('Rewards load failed: ' + e.message, true); }
}

function openGrantModal()  { document.getElementById('grant-modal').classList.add('open'); }
function closeGrantModal() { document.getElementById('grant-modal').classList.remove('open'); }

async function submitGrant() {
  const userId = document.getElementById('grant-user').value.trim();
  const days   = parseInt(document.getElementById('grant-days').value) || 30;
  const reason = document.getElementById('grant-reason').value;
  if (!userId) { toast('User ID required', true); return; }
  try {
    await api('/api/admin/users/' + encodeURIComponent(userId) + '/grant-pro',
      { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ days, reason }) });
    toast('Pro granted for ' + days + ' days');
    closeGrantModal(); loadRewards();
  } catch(e) { toast(e.message, true); }
}

// ── Coin modal ─────────────────────────────────────────────────────────────────
function openCoinModal(userId, label) {
  document.getElementById('coin-user-id').value = userId;
  document.getElementById('coin-user-label').textContent = label;
  document.getElementById('coin-delta').value = '';
  document.getElementById('coin-modal').classList.add('open');
}
function closeCoinModal() { document.getElementById('coin-modal').classList.remove('open'); }

async function submitCoinAdjust() {
  const userId = document.getElementById('coin-user-id').value;
  const delta  = parseInt(document.getElementById('coin-delta').value);
  if (!delta) { toast('Enter a non-zero delta', true); return; }
  try {
    await api('/api/admin/users/' + userId + '/adjust-coins',
      { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({ delta }) });
    toast('Coins adjusted by ' + (delta>=0?'+':'') + delta);
    closeCoinModal(); searchUsers();
  } catch(e) { toast(e.message, true); }
}

// ── Helpers ────────────────────────────────────────────────────────────────────
function badge(status) {
  const map = {
    success:'badge-green', posted:'badge-green', pending:'badge-gold',
    generating:'badge-blue', failed:'badge-red',
    active:'badge-green', banned:'badge-red', free:'badge-dim',
  };
  const cls = map[status] || 'badge-dim';
  return '<span class="badge ' + cls + '">' + (status||'—').toUpperCase() + '</span>';
}

// Close overlays on backdrop click
document.querySelectorAll('.overlay').forEach(o => {
  o.addEventListener('click', e => { if(e.target===o) o.classList.remove('open'); });
});

// ── Init ───────────────────────────────────────────────────────────────────────
loadSection('overview');
</script>
</body>
</html>`;
}
