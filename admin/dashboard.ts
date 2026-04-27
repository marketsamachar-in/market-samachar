/**
 * Market Samachar — Admin Dashboard
 * Redesigned based on full project analysis (April 2026)
 *
 * Sections: Overview · News · Trading · Payments · Users · Quiz · IPOs · Rewards
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * NEW BACKEND ROUTE REQUIRED — add to server.ts before "End admin routes":
 * ─────────────────────────────────────────────────────────────────────────────
 *
 *   // GET /api/admin/news — paginated article browser with AI status
 *   app.get('/api/admin/news', requireAdmin, (req, res) => {
 *     const page     = Math.max(1, parseInt(req.query.page as string) || 1);
 *     const limit    = Math.min(100, parseInt(req.query.limit as string) || 50);
 *     const offset   = (page - 1) * limit;
 *     const category = (req.query.category as string) || '';
 *     const ai       = (req.query.ai as string) || 'all';
 *     let where = '1=1';
 *     const params: any[] = [];
 *     if (category) { where += ' AND category = ?'; params.push(category); }
 *     if (ai === 'processed') { where += ' AND ai_processed_at IS NOT NULL'; }
 *     if (ai === 'pending')   { where += ' AND ai_processed_at IS NULL'; }
 *     const total     = (rawDb.prepare('SELECT COUNT(*) as c FROM news_items WHERE ' + where).get(...params) as any).c;
 *     const processed = (rawDb.prepare('SELECT COUNT(*) as c FROM news_items WHERE ai_processed_at IS NOT NULL').get() as any).c;
 *     const articles  = rawDb.prepare(
 *       'SELECT id,title,link,source,category,pub_date,fetched_at,content_snippet,' +
 *       'ai_summary,summary_bullets,sentiment,impact_sectors,key_numbers,ai_processed_at ' +
 *       'FROM news_items WHERE ' + where + ' ORDER BY fetched_at DESC LIMIT ? OFFSET ?'
 *     ).all(...params, limit, offset);
 *     res.json({ articles, total, processed, pending: total - processed, page, pages: Math.ceil(total / limit) });
 *   });
 *
 *   // GET /api/admin/trading — virtual trading overview
 *   app.get('/api/admin/trading', requireAdmin, (req, res) => {
 *     const totalOrders  = (rawDb.prepare('SELECT COUNT(*) as c FROM virtual_orders').get() as any).c;
 *     const totalBuys    = (rawDb.prepare('SELECT COUNT(*) as c FROM virtual_orders WHERE order_type="BUY"').get() as any).c;
 *     const totalSells   = (rawDb.prepare('SELECT COUNT(*) as c FROM virtual_orders WHERE order_type="SELL"').get() as any).c;
 *     const totalTraders = (rawDb.prepare('SELECT COUNT(DISTINCT user_id) as c FROM virtual_orders').get() as any).c;
 *     const leaderboard  = rawDb.prepare(
 *       'SELECT user_id, total_invested_coins, current_value_coins, realised_pnl_coins, updated_at ' +
 *       'FROM virtual_portfolio ORDER BY current_value_coins DESC LIMIT 20'
 *     ).all();
 *     const recentOrders = rawDb.prepare(
 *       'SELECT * FROM virtual_orders ORDER BY created_at DESC LIMIT 30'
 *     ).all();
 *     res.json({ totalOrders, totalBuys, totalSells, totalTraders, leaderboard, recentOrders });
 *   });
 *
 *   // GET /api/admin/predictions — prediction management
 *   app.get('/api/admin/predictions', requireAdmin, (req, res) => {
 *     const predictions = rawDb.prepare(
 *       'SELECT * FROM daily_predictions ORDER BY created_at DESC LIMIT 30'
 *     ).all();
 *     const votes = rawDb.prepare('SELECT COUNT(*) as c FROM user_predictions').get() as any;
 *     const correct = rawDb.prepare('SELECT COUNT(*) as c FROM user_predictions WHERE is_correct=1').get() as any;
 *     res.json({ predictions, totalVotes: votes.c, correctVotes: correct.c });
 *   });
 *
 *   // GET /api/admin/coins — samachar coins ledger
 *   app.get('/api/admin/coins', requireAdmin, (req, res) => {
 *     const limit  = Math.min(100, parseInt(req.query.limit as string) || 50);
 *     const offset = parseInt(req.query.offset as string) || 0;
 *     const total  = (rawDb.prepare('SELECT COUNT(*) as c FROM samachar_coins').get() as any).c;
 *     const totalCoinsIssued = (rawDb.prepare('SELECT COALESCE(SUM(amount),0) as s FROM samachar_coins WHERE amount > 0').get() as any).s;
 *     const ledger = rawDb.prepare(
 *       'SELECT * FROM samachar_coins ORDER BY created_at DESC LIMIT ? OFFSET ?'
 *     ).all(limit, offset);
 *     res.json({ ledger, total, totalCoinsIssued });
 *   });
 * ─────────────────────────────────────────────────────────────────────────────
 */

export function renderAdminDashboard(): string {
  // NOTE: All JS strings below intentionally avoid apostrophes to prevent
  // TypeScript template literal escape issues. "Quiz" not "Quiz's", etc.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Market Samachar — Admin Terminal</title>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=DM+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<style>
*{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#07070e;--card:#0d0d1e;--card2:#0a0a16;--card3:#060610;
  --border:#1a1a2e;--border2:#0f0f20;
  --green:#00ff88;--red:#ff4466;--gold:#ffcc44;--blue:#3b9eff;
  --orange:#ff9f3b;--purple:#b57dff;--cyan:#3bffee;--pink:#ff3bff;
  --text:#e8eaf0;--sub:#8899aa;--dim:#444466;--dimmer:#1a1a30;
  --mono:"DM Mono",monospace;--sans:"DM Sans",sans-serif;
  --r4:4px;--r6:6px;--r8:8px;--r10:10px;
}
html,body{height:100%}
body{background:var(--bg);color:var(--text);font-family:var(--sans);display:flex;min-height:100vh;overflow-x:hidden}
a{color:inherit;text-decoration:none}
button{font-family:var(--sans);cursor:pointer}

/* ─── SIDEBAR ──────────────────────────────────────────────────── */
.sidebar{
  width:210px;background:var(--card3);border-right:1px solid var(--border);
  display:flex;flex-direction:column;flex-shrink:0;
  position:fixed;top:0;left:0;bottom:0;overflow-y:auto;z-index:200;
}
.sb-logo{
  padding:20px 18px 16px;border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:10px;
}
.sb-logo-mark{
  width:32px;height:32px;background:linear-gradient(135deg,#00ff8830,#00ff8808);
  border:1px solid #00ff8830;border-radius:var(--r6);
  display:flex;align-items:center;justify-content:center;flex-shrink:0;
}
.sb-logo-mark svg{width:16px;height:16px}
.sb-logo-text{font-family:var(--mono);font-size:10px;color:var(--green);letter-spacing:2px;line-height:1.4}
.sb-logo-text span{display:block;color:var(--dim);font-size:8px;letter-spacing:1px;margin-top:1px}

.sb-section{padding:10px 0 4px;border-bottom:1px solid var(--border2)}
.sb-section-label{
  font-family:var(--mono);font-size:8px;color:var(--dim);letter-spacing:2px;
  padding:0 18px 6px;
}
.nav-item{
  display:flex;align-items:center;gap:9px;padding:9px 18px;
  font-size:12px;font-family:var(--mono);color:var(--sub);
  cursor:pointer;border-left:2px solid transparent;transition:all .12s;
  letter-spacing:.3px;
}
.nav-item:hover{color:var(--text);background:rgba(255,255,255,.02)}
.nav-item.active{color:var(--green);border-left-color:var(--green);background:#00ff8806}
.nav-item .ni-icon{width:14px;text-align:center;font-size:13px;flex-shrink:0}
.nav-item .ni-badge{
  margin-left:auto;font-size:8px;padding:1px 5px;border-radius:3px;
  background:#00ff8815;border:1px solid #00ff8830;color:var(--green);
}

.sb-bottom{margin-top:auto;border-top:1px solid var(--border);padding:8px 0}
.sb-meta{padding:8px 18px;font-family:var(--mono);font-size:8px;color:var(--dim);line-height:1.8}
.sb-meta .dot{
  display:inline-block;width:5px;height:5px;border-radius:50%;
  background:var(--green);margin-right:5px;animation:pulse 2s infinite;
}
@keyframes pulse{0%,100%{opacity:1}50%{opacity:.3}}

/* ─── MAIN ─────────────────────────────────────────────────────── */
.main{margin-left:210px;flex:1;min-height:100vh;display:flex;flex-direction:column}
.top-bar{
  height:48px;background:var(--card3);border-bottom:1px solid var(--border);
  display:flex;align-items:center;padding:0 24px;gap:16px;flex-shrink:0;
  position:sticky;top:0;z-index:100;
}
.top-bar-title{font-family:var(--mono);font-size:11px;color:var(--sub);letter-spacing:1px}
.top-bar-title strong{color:var(--text)}
.top-bar-sep{flex:1}
.top-bar-time{font-family:var(--mono);font-size:10px;color:var(--dim)}
.top-bar-status{
  display:flex;align-items:center;gap:5px;
  font-family:var(--mono);font-size:9px;color:var(--green);
}

.content{padding:24px;flex:1}
.section{display:none}
.section.active{display:block}

/* ─── PAGE HEADER ──────────────────────────────────────────────── */
.page-hd{display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:22px;gap:12px;flex-wrap:wrap}
.page-hd-left{}
.page-title{font-family:var(--mono);font-size:14px;color:var(--green);letter-spacing:2px;display:flex;align-items:center;gap:8px}
.page-title::before{content:"";display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--green);animation:pulse 2s infinite}
.page-sub{font-size:12px;color:var(--dim);margin-top:4px;font-family:var(--mono)}
.page-actions{display:flex;gap:6px;flex-wrap:wrap}

/* ─── STAT GRID ────────────────────────────────────────────────── */
.stat-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(155px,1fr));gap:10px;margin-bottom:20px}
.stat-card{
  background:var(--card);border:1px solid var(--border);border-radius:var(--r8);
  padding:14px 16px;position:relative;overflow:hidden;
}
.stat-card::before{
  content:"";position:absolute;top:0;left:0;right:0;height:2px;
  background:linear-gradient(90deg,var(--accent,#00ff88),transparent);
}
.stat-card.red{--accent:#ff4466}
.stat-card.gold{--accent:#ffcc44}
.stat-card.blue{--accent:#3b9eff}
.stat-card.purple{--accent:#b57dff}
.stat-card.orange{--accent:#ff9f3b}
.stat-label{font-family:var(--mono);font-size:8px;color:var(--dim);letter-spacing:1.5px;margin-bottom:8px}
.stat-value{font-family:var(--mono);font-size:24px;font-weight:500;color:var(--text);line-height:1}
.stat-value.green{color:var(--green)}.stat-value.red{color:var(--red)}
.stat-value.gold{color:var(--gold)}.stat-value.blue{color:var(--blue)}
.stat-value.purple{color:var(--purple)}.stat-value.orange{color:var(--orange)}
.stat-meta{font-family:var(--mono);font-size:9px;color:var(--dim);margin-top:5px}

/* ─── TABLES ───────────────────────────────────────────────────── */
.table-wrap{background:var(--card);border:1px solid var(--border);border-radius:var(--r8);overflow:hidden;margin-bottom:20px}
.table-hd{
  padding:10px 16px;background:var(--card3);border-bottom:1px solid var(--border);
  display:flex;align-items:center;gap:10px;flex-wrap:wrap;
}
.table-hd-title{font-family:var(--mono);font-size:9px;color:var(--green);letter-spacing:1.5px;flex:1}
.table-hd-meta{font-family:var(--mono);font-size:9px;color:var(--dim)}
.tbl{width:100%;border-collapse:collapse;font-size:12px}
.tbl thead tr{background:#00ff8808;border-bottom:1px solid #00ff8820}
.tbl th{font-family:var(--mono);font-size:8px;color:var(--green);letter-spacing:1px;padding:8px 12px;text-align:left;white-space:nowrap}
.tbl td{padding:8px 12px;border-bottom:1px solid var(--border2);color:var(--sub);vertical-align:middle}
.tbl tr:last-child td{border-bottom:none}
.tbl tbody tr:hover td{background:rgba(255,255,255,.018);color:var(--text)}
.mono{font-family:var(--mono)}

/* ─── BADGES ───────────────────────────────────────────────────── */
.badge{display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:3px;font-family:var(--mono);font-size:8px;font-weight:500;letter-spacing:.5px;white-space:nowrap}
.bg{background:#00ff8815;border:1px solid #00ff8830;color:var(--green)}
.br{background:#ff446615;border:1px solid #ff446630;color:var(--red)}
.bb{background:#3b9eff15;border:1px solid #3b9eff30;color:var(--blue)}
.bo{background:#ff9f3b15;border:1px solid #ff9f3b30;color:var(--orange)}
.bp{background:#b57dff15;border:1px solid #b57dff30;color:var(--purple)}
.bgd{background:#1a1a3015;border:1px solid var(--dimmer);color:var(--dim)}
.bgo{background:#ffcc4415;border:1px solid #ffcc4430;color:var(--gold)}
.bcy{background:#3bffee15;border:1px solid #3bffee30;color:var(--cyan)}
.bpk{background:#ff3bff15;border:1px solid #ff3bff30;color:var(--pink)}

/* ─── BUTTONS ──────────────────────────────────────────────────── */
.btn{
  font-family:var(--mono);font-size:10px;padding:6px 13px;border-radius:var(--r4);
  cursor:pointer;border:1px solid;transition:all .12s;
  display:inline-flex;align-items:center;gap:5px;white-space:nowrap;
}
.btn:disabled{opacity:.4;cursor:default;pointer-events:none}
.btn-g{background:#00ff8810;border-color:#00ff8835;color:var(--green)}
.btn-g:hover{background:#00ff8820}
.btn-r{background:#ff446610;border-color:#ff446635;color:var(--red)}
.btn-r:hover{background:#ff446620}
.btn-b{background:#3b9eff10;border-color:#3b9eff35;color:var(--blue)}
.btn-b:hover{background:#3b9eff20}
.btn-p{background:#b57dff10;border-color:#b57dff35;color:var(--purple)}
.btn-p:hover{background:#b57dff20}
.btn-o{background:#ff9f3b10;border-color:#ff9f3b35;color:var(--orange)}
.btn-o:hover{background:#ff9f3b20}
.btn-gd{background:#1a1a3020;border-color:var(--dimmer);color:var(--sub)}
.btn-gd:hover{color:var(--text);border-color:#334466}
.btn-go{background:#ffcc4410;border-color:#ffcc4435;color:var(--gold)}
.btn-go:hover{background:#ffcc4420}

/* ─── INPUTS ───────────────────────────────────────────────────── */
.inp{
  background:#0a0a18;border:1px solid var(--border);color:var(--text);
  font-family:var(--mono);font-size:12px;padding:8px 12px;border-radius:var(--r4);
  outline:none;
}
.inp:focus{border-color:#334466}
.inp::placeholder{color:var(--dim)}
select.inp{cursor:pointer}
.filter-row{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap;align-items:center}

/* ─── MODALS ───────────────────────────────────────────────────── */
.overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:1000;align-items:center;justify-content:center;backdrop-filter:blur(4px)}
.overlay.open{display:flex}
.modal{
  background:var(--card);border:1px solid var(--border);border-radius:var(--r10);
  padding:24px;width:min(560px,95vw);max-height:90vh;overflow-y:auto;
}
.modal-title{font-family:var(--mono);font-size:10px;color:var(--green);letter-spacing:2px;margin-bottom:18px;display:flex;align-items:center;gap:8px}
.modal-title::before{content:"";width:6px;height:6px;border-radius:50%;background:var(--green);flex-shrink:0}
.form-grid{display:grid;grid-template-columns:1fr 1fr;gap:10px}
.form-group{margin-bottom:12px}
.form-label{font-family:var(--mono);font-size:8px;color:var(--dim);letter-spacing:1px;display:block;margin-bottom:5px}
.modal-footer{display:flex;gap:8px;justify-content:flex-end;margin-top:18px;padding-top:14px;border-top:1px solid var(--border)}

/* ─── PROGRESS ─────────────────────────────────────────────────── */
.prog-wrap{background:var(--dimmer);border-radius:3px;height:3px;overflow:hidden;margin-top:6px}
.prog-bar{height:100%;border-radius:3px;transition:width .4s}
.prog-bar.green{background:var(--green)}
.prog-bar.gold{background:var(--gold)}
.prog-bar.blue{background:var(--blue)}

/* ─── PAGINATION ───────────────────────────────────────────────── */
.pg{display:flex;gap:5px;align-items:center;padding:12px 16px;border-top:1px solid var(--border);flex-wrap:wrap}
.pg-btn{font-family:var(--mono);font-size:9px;padding:4px 9px;border-radius:3px;cursor:pointer;background:var(--card2);border:1px solid var(--border);color:var(--sub);transition:all .12s}
.pg-btn:hover:not(:disabled){border-color:#334466;color:var(--text)}
.pg-btn.cur{background:#00ff8812;border-color:#00ff8840;color:var(--green)}
.pg-btn:disabled{opacity:.3;cursor:default}
.pg-info{font-family:var(--mono);font-size:9px;color:var(--dim);margin:0 4px}

/* ─── DETAIL PANEL ─────────────────────────────────────────────── */
.detail-panel{background:var(--card2);border:1px solid var(--border);border-radius:var(--r8);padding:16px;margin-bottom:16px;display:none}
.detail-panel.open{display:block}
.detail-title{font-size:14px;font-weight:600;color:var(--text);margin-bottom:10px;line-height:1.4}
.detail-meta{display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px}
.detail-ai{background:var(--card3);border:1px solid var(--border);border-radius:var(--r6);padding:12px}
.detail-ai-label{font-family:var(--mono);font-size:8px;color:var(--green);letter-spacing:1px;margin-bottom:6px}
.detail-ai-text{font-size:12px;color:var(--sub);line-height:1.6}
.detail-sectors{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px}

/* ─── ARTICLE TITLE CELL ───────────────────────────────────────── */
.art-cell{max-width:280px}
.art-cell strong{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text);font-size:12px}
.art-snip{font-size:10px;color:var(--dim);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:270px}

/* ─── QUIZ CARD ────────────────────────────────────────────────── */
.quiz-card{background:var(--card3);border:1px solid var(--border);border-radius:var(--r6);padding:14px;margin-bottom:10px}
.quiz-q-num{font-family:var(--mono);font-size:8px;color:var(--dim);margin-bottom:6px;letter-spacing:1px}
.quiz-q-text{font-size:13px;color:var(--text);margin-bottom:10px;line-height:1.5}
.quiz-opts{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.quiz-opt{font-family:var(--mono);font-size:10px;color:var(--sub);padding:6px 10px;background:#0a0a18;border-radius:var(--r4);border:1px solid var(--border)}
.quiz-opt.ok{color:var(--green);background:#00ff8808;border-color:#00ff8830}

/* ─── CATEGORY DOT ─────────────────────────────────────────────── */
.cat-dot{display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:5px;flex-shrink:0}

/* ─── TOAST ────────────────────────────────────────────────────── */
.toast{
  position:fixed;bottom:24px;right:24px;z-index:9999;
  font-family:var(--mono);font-size:10px;padding:10px 16px;border-radius:var(--r6);
  display:none;animation:slideup .18s ease;max-width:360px;line-height:1.4;
  background:#00ff8815;border:1px solid #00ff8840;color:var(--green);
}
.toast.err{background:#ff446615;border-color:#ff446640;color:var(--red)}
.toast.info{background:#3b9eff15;border-color:#3b9eff40;color:var(--blue)}
@keyframes slideup{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}

/* ─── MISC ─────────────────────────────────────────────────────── */
.empty{color:var(--dim);font-family:var(--mono);font-size:10px;text-align:center;padding:32px}
.loading{color:var(--dim);font-family:var(--mono);font-size:9px;padding:24px;text-align:center}
.hl-green{color:var(--green)}.hl-red{color:var(--red)}.hl-gold{color:var(--gold)}
.hl-blue{color:var(--blue)}.hl-orange{color:var(--orange)}.hl-purple{color:var(--purple)}
.row-g{display:flex;gap:10px;margin-bottom:20px;flex-wrap:wrap}
.col-half{flex:1;min-width:280px}
.divider{height:1px;background:var(--border);margin:20px 0}
.fn{font-size:10px}.sub{color:var(--sub)}
/* ─── CARD GENERATOR ───────────────────────────────────────────── */
.card-overlay{display:none;position:fixed;inset:0;background:rgba(0,0,0,.85);z-index:2000;align-items:center;justify-content:center;backdrop-filter:blur(6px)}
.card-overlay.open{display:flex}
.card-shell{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:20px;width:min(500px,95vw);max-height:95vh;overflow-y:auto;display:flex;flex-direction:column;gap:14px}
.card-shell-title{font-family:var(--mono);font-size:10px;color:var(--green);letter-spacing:2px;display:flex;align-items:center;justify-content:space-between}
.card-format-tabs{display:flex;gap:6px}
.fmt-btn{font-family:var(--mono);font-size:9px;padding:5px 12px;border-radius:4px;cursor:pointer;border:1px solid;transition:all .12s}
.fmt-btn.active{background:#00ff8818;border-color:#00ff8840;color:var(--green)}
.fmt-btn:not(.active){background:#0a0a18;border-color:var(--border);color:var(--dim)}
.fmt-btn:not(.active):hover{border-color:#334466;color:var(--sub)}
.card-preview-wrap{display:flex;justify-content:center;align-items:flex-start;background:#04040a;border:1px solid var(--border);border-radius:6px;padding:16px;min-height:200px}
.card-actions{display:flex;gap:8px;justify-content:flex-end}
/* inline card design */
.ms-c{background:#07070e;display:flex;flex-direction:column;overflow:hidden;font-family:"DM Mono",monospace;border:1px solid #1a1a2e;border-radius:4px}
.ms-c *{box-sizing:border-box}
.ms-hd{background:linear-gradient(90deg,rgba(0,255,136,.09),rgba(0,255,136,.04));border-bottom:1px solid rgba(0,255,136,.14);display:flex;justify-content:space-between;align-items:center;flex-shrink:0}
.ms-cat{display:flex;gap:3px;flex-wrap:wrap}
.ms-badge{display:inline-flex;align-items:center;gap:2px;border-radius:2px;letter-spacing:.6px;font-weight:500;white-space:nowrap}
.ms-hl{color:#00ff88;line-height:1.35;font-weight:500;letter-spacing:.3px}
.ms-div{background:rgba(0,255,136,.25);border-radius:1px}
.ms-sec{background:#0d0d1e;border:1px solid #1a1a2e;border-radius:3px;display:flex;flex-direction:column}
.ms-slbl{color:#334466;letter-spacing:1px;display:flex;align-items:center;gap:3px;font-weight:400}
.ms-blt{display:flex;gap:4px;align-items:flex-start}
.ms-arr{color:#00ff88;flex-shrink:0;line-height:1.45}
.ms-bt{color:#8899aa;line-height:1.45}
.ms-num{color:#00ff88;flex-shrink:0;min-width:14px;line-height:1.45}
.ms-dg3{display:grid;grid-template-columns:1fr 1fr 1fr}
.ms-dg2{display:grid;grid-template-columns:1fr 1fr}
.ms-dc{background:#0d0d1e;border:1px solid #1a1a2e;border-radius:3px;text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center}
.ms-dl{color:#334466;letter-spacing:.7px;display:flex;align-items:center;justify-content:center;gap:2px}
.ms-dv{color:#00ff88;font-weight:500;line-height:1}
.ms-dv.b{color:#3b9eff}.ms-dv.o{color:#ff9f3b}.ms-dv.gd{color:#ffcc44}
.ms-ds{color:#334466;line-height:1}
.ms-ds.up{color:#00ff88}.ms-ds.dn{color:#ff4466}.ms-ds.ne{color:#8899aa}
.ms-irow{background:#0d0d1e;border:1px solid #1a1a2e;border-radius:3px;display:flex;align-items:center}
.ms-itxt{color:#8899aa;line-height:1.4}
.ms-wm{display:flex;align-items:center}
.ms-wml{flex:1;height:1px;background:rgba(0,255,136,.18)}
.ms-wmt{color:rgba(0,255,136,.35);letter-spacing:1.5px;white-space:nowrap}
.ms-ft{background:rgba(0,255,136,.03);border-top:1px solid rgba(0,255,136,.1);flex-shrink:0}
.ms-ftrow{display:flex;justify-content:space-between;align-items:center}
.ms-ftb{background:rgba(59,158,255,.1);border:1px solid rgba(59,158,255,.2);color:#3b9eff;border-radius:2px;letter-spacing:.4px}
.ms-fts{color:#00ff88;letter-spacing:.8px}
.ms-disc{color:#1a3040;line-height:1.45}
.ms-dg2-info{display:grid;grid-template-columns:1fr 1fr}
.ms-dval{color:#e8eaf0}
.btn-gen{font-family:var(--mono);font-size:9px;padding:3px 8px;border-radius:3px;cursor:pointer;border:1px solid;transition:all .12s;white-space:nowrap}
.btn-11{background:#00ff8810;border-color:#00ff8835;color:var(--green)}
.btn-11:hover{background:#00ff8820}
.btn-45{background:#3b9eff10;border-color:#3b9eff35;color:#3b9eff}
.btn-45:hover{background:#3b9eff20}
.btn-916{background:#b57dff10;border-color:#b57dff35;color:#b57dff}
.btn-916:hover{background:#b57dff20}

</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js"></script>
</head>
<body>

<!-- ─── SIDEBAR ──────────────────────────────────────────────── -->
<nav class="sidebar">
  <div class="sb-logo">
    <div class="sb-logo-mark">
      <svg viewBox="0 0 16 16" fill="none">
        <polyline points="1,12 4,6 7,9 10,4 13,7 15,5" stroke="#00ff88" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
      </svg>
    </div>
    <div class="sb-logo-text">MS ADMIN<span>MARKET SAMACHAR</span></div>
  </div>

  <div class="sb-section">
    <div class="sb-section-label">DASHBOARD</div>
    <a class="nav-item active" data-section="overview" href="#overview"><span class="ni-icon">◈</span>Overview</a>
  </div>

  <div class="sb-section">
    <div class="sb-section-label">CONTENT</div>
    <a class="nav-item" data-section="news" href="#news"><span class="ni-icon">◉</span>News</a>
    <a class="nav-item" data-section="ipos" href="#ipos"><span class="ni-icon">⬡</span>IPOs</a>
    <a class="nav-item" data-section="quiz" href="#quiz"><span class="ni-icon">?</span>Quiz</a>
    <a class="nav-item" data-section="predictions" href="#predictions"><span class="ni-icon">◎</span>Predictions</a>
  </div>

  <div class="sb-section">
    <div class="sb-section-label">ENGAGEMENT</div>
    <a class="nav-item" data-section="trading" href="#trading"><span class="ni-icon">⬆</span>Trading</a>
    <a class="nav-item" data-section="coins" href="#coins"><span class="ni-icon">⚡</span>Coins</a>
  </div>

  <div class="sb-section">
    <div class="sb-section-label">USERS</div>
    <a class="nav-item" data-section="users" href="#users"><span class="ni-icon">◎</span>Users</a>
    <a class="nav-item" data-section="payments" href="#payments"><span class="ni-icon">₹</span>Payments</a>
    <a class="nav-item" data-section="rewards" href="#rewards"><span class="ni-icon">★</span>Rewards</a>
  </div>

  <div class="sb-bottom">
    <div class="sb-meta">
      <div><span class="dot"></span>LIVE</div>
      <div>marketsamachar.in</div>
      <div id="sb-time" style="margin-top:2px"></div>
    </div>
    <a class="nav-item" style="color:var(--red)!important" href="/admin/logout"><span class="ni-icon">⏻</span>Logout</a>
  </div>
</nav>

<!-- ─── MAIN ──────────────────────────────────────────────────── -->
<div class="main">
  <div class="top-bar">
    <span class="top-bar-title"><strong id="tb-section">OVERVIEW</strong></span>
    <span class="top-bar-sep"></span>
    <span class="top-bar-status"><span style="animation:pulse 2s infinite;display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--green)"></span>SERVER ONLINE</span>
    <span class="top-bar-time" id="tb-time"></span>
  </div>

  <div class="content">

<!-- ══════════════════════════════════════════════════════════════
     1. OVERVIEW
════════════════════════════════════════════════════════════════ -->
<section class="section active" id="s-overview">
  <div class="page-hd">
    <div class="page-hd-left">
      <div class="page-title">OVERVIEW</div>
      <div class="page-sub">Platform health &amp; key metrics</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-g" onclick="loadStats()">↻ Refresh</button>
      <button class="btn btn-b" onclick="triggerFetch()">⚡ Fetch News</button>
    </div>
  </div>

  <div class="stat-grid" id="ov-stats"><div class="loading">Loading stats…</div></div>

  <div class="row-g">
    <div class="col-half">
      <div class="table-wrap">
        <div class="table-hd">
          <span class="table-hd-title">RECENT BATCHES</span>
          <button class="btn btn-gd" style="padding:3px 8px;font-size:9px" onclick="loadBatches()">↻</button>
        </div>
        <div id="ov-batches"><div class="loading">Loading…</div></div>
      </div>
    </div>
    <div class="col-half">
      <div class="table-wrap">
        <div class="table-hd"><span class="table-hd-title">COIN ECONOMY SNAPSHOT</span></div>
        <div id="ov-coin-snap"><div class="loading">Loading…</div></div>
      </div>
    </div>
  </div>

  <div class="table-wrap">
    <div class="table-hd">
      <span class="table-hd-title">GEMINI KEY STATUS</span>
      <button class="btn btn-gd" style="padding:3px 8px;font-size:9px" onclick="loadGeminiStatus()">↻</button>
    </div>
    <div id="ov-gemini"><div class="loading">Loading…</div></div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════
     2. NEWS
════════════════════════════════════════════════════════════════ -->
<section class="section" id="s-news">
  <div class="page-hd">
    <div class="page-hd-left">
      <div class="page-title">NEWS ARTICLES</div>
      <div class="page-sub">SQLite news_items — 30-day rolling retention</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-b" onclick="triggerFetch()">⚡ Fetch News</button>
    </div>
  </div>

  <div class="filter-row">
    <select class="inp" style="width:150px" id="nw-cat" onchange="loadNews(1)">
      <option value="">All Categories</option>
      <option value="indian">Indian Market</option>
      <option value="companies">Companies</option>
      <option value="global">Global</option>
      <option value="commodity">Commodity</option>
      <option value="crypto">Crypto</option>
      <option value="ipo">IPO</option>
      <option value="economy">Economy</option>
      <option value="banking">Banking</option>
      <option value="sebi">SEBI</option>
      <option value="rbi">RBI</option>
    </select>
    <select class="inp" style="width:100px" id="nw-limit" onchange="loadNews(1)">
      <option value="25">25/page</option>
      <option value="50" selected>50/page</option>
      <option value="100">100/page</option>
    </select>
    <button class="btn btn-gd" onclick="loadNews(1)">↻ Refresh</button>
  </div>

  <div class="stat-grid" id="nw-stats" style="grid-template-columns:repeat(3,1fr)">
    <div class="loading" style="grid-column:1/-1">Loading…</div>
  </div>

  <div class="detail-panel" id="nw-detail"></div>

  <div class="table-wrap">
    <div class="table-hd">
      <span class="table-hd-title">ARTICLES</span>
      <span class="table-hd-meta" id="nw-count"></span>
    </div>
    <div id="nw-table"><div class="loading">Loading…</div></div>
    <div class="pg" id="nw-pg" style="display:none"></div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════
     3. TRADING
════════════════════════════════════════════════════════════════ -->
<section class="section" id="s-trading">
  <div class="page-hd">
    <div class="page-hd-left">
      <div class="page-title">VIRTUAL TRADING</div>
      <div class="page-sub">Paper trading activity — 1 coin = ₹1</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-gd" onclick="loadTrading()">↻ Refresh</button>
    </div>
  </div>
  <div class="stat-grid" id="tr-stats"><div class="loading">Loading…</div></div>
  <div class="row-g">
    <div class="col-half">
      <div class="table-wrap">
        <div class="table-hd"><span class="table-hd-title">PORTFOLIO LEADERBOARD</span></div>
        <div id="tr-leaderboard"><div class="loading">Loading…</div></div>
      </div>
    </div>
    <div class="col-half">
      <div class="table-wrap">
        <div class="table-hd"><span class="table-hd-title">RECENT ORDERS</span></div>
        <div id="tr-orders"><div class="loading">Loading…</div></div>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════
     4. PAYMENTS
════════════════════════════════════════════════════════════════ -->
<section class="section" id="s-payments">
  <div class="page-hd">
    <div class="page-hd-left">
      <div class="page-title">PAYMENTS</div>
      <div class="page-sub">Pro subscription management</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-gd" onclick="loadPayments()">↻ Refresh</button>
    </div>
  </div>
  <div class="filter-row">
    <select class="inp" style="width:160px" id="pay-filter" onchange="loadPayments()">
      <option value="all">All Payments</option>
      <option value="pending">Pending</option>
      <option value="success">Success</option>
      <option value="failed">Failed</option>
    </select>
  </div>
  <div class="table-wrap">
    <div class="table-hd">
      <span class="table-hd-title">PAYMENT RECORDS</span>
      <span class="table-hd-meta" id="pay-count"></span>
    </div>
    <div id="pay-table"><div class="loading">Loading…</div></div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════
     5. USERS
════════════════════════════════════════════════════════════════ -->
<section class="section" id="s-users">
  <div class="page-hd">
    <div class="page-hd-left">
      <div class="page-title">USERS</div>
      <div class="page-sub">Search Supabase profiles</div>
    </div>
  </div>
  <div class="filter-row">
    <input class="inp" style="flex:1;max-width:400px" id="usr-q" placeholder="Email, phone, or user ID…" oninput="debouncedSearch()"/>
    <button class="btn btn-g" onclick="searchUsers()">Search</button>
  </div>
  <div class="table-wrap">
    <div class="table-hd">
      <span class="table-hd-title">USERS</span>
      <span class="table-hd-meta" id="usr-count"></span>
    </div>
    <div id="usr-table"><div class="empty">Search for a user above</div></div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════
     6. QUIZ
════════════════════════════════════════════════════════════════ -->
<section class="section" id="s-quiz">
  <div class="page-hd">
    <div class="page-hd-left">
      <div class="page-title">MARKET QUIZ</div>
      <div class="page-sub">Daily quiz management — 5 questions per day</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-go" id="regen-btn" onclick="regenQuiz()">↻ Regenerate Quiz</button>
      <button class="btn btn-gd" onclick="loadQuiz()">↻ Refresh</button>
    </div>
  </div>
  <div class="row-g">
    <div class="col-half">
      <div class="table-wrap">
        <div class="table-hd"><span class="table-hd-title">TODAY QUESTIONS</span><span class="table-hd-meta" id="quiz-date"></span></div>
        <div id="quiz-qs" style="padding:12px"><div class="loading">Loading…</div></div>
      </div>
    </div>
    <div class="col-half">
      <div class="table-wrap">
        <div class="table-hd">
          <span class="table-hd-title">TODAY ATTEMPTS</span>
          <span class="table-hd-meta" id="quiz-att-count"></span>
        </div>
        <div id="quiz-atts"><div class="loading">Loading…</div></div>
      </div>
    </div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════
     7. PREDICTIONS
════════════════════════════════════════════════════════════════ -->
<section class="section" id="s-predictions">
  <div class="page-hd">
    <div class="page-hd-left">
      <div class="page-title">DAILY PREDICTIONS</div>
      <div class="page-sub">Market Forecast — Gemini-generated questions</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-gd" onclick="loadPredictions()">↻ Refresh</button>
    </div>
  </div>
  <div class="stat-grid" id="pred-stats"><div class="loading">Loading…</div></div>
  <div class="table-wrap">
    <div class="table-hd"><span class="table-hd-title">RECENT PREDICTIONS</span></div>
    <div id="pred-table"><div class="loading">Loading…</div></div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════
     8. IPOs
════════════════════════════════════════════════════════════════ -->
<section class="section" id="s-ipos">
  <div class="page-hd">
    <div class="page-hd-left">
      <div class="page-title">IPO MANAGEMENT</div>
      <div class="page-sub">Add, edit, delete IPO records</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-g" onclick="openIpoModal(null)">+ Add IPO</button>
      <button class="btn btn-b" onclick="scrapeIpos()">⬇ Scrape Chittorgarh</button>
      <button class="btn btn-gd" onclick="loadIpos()">↻ Refresh</button>
    </div>
  </div>
  <div class="table-wrap">
    <div class="table-hd">
      <span class="table-hd-title">IPO RECORDS</span>
      <span class="table-hd-meta" id="ipo-count"></span>
    </div>
    <div id="ipo-table"><div class="loading">Loading…</div></div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════
     9. COINS
════════════════════════════════════════════════════════════════ -->
<section class="section" id="s-coins">
  <div class="page-hd">
    <div class="page-hd-left">
      <div class="page-title">COIN LEDGER</div>
      <div class="page-sub">samachar_coins audit trail — every coin event</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-gd" onclick="loadCoins(1)">↻ Refresh</button>
    </div>
  </div>
  <div class="stat-grid" id="coin-stats"><div class="loading">Loading…</div></div>
  <div class="table-wrap">
    <div class="table-hd">
      <span class="table-hd-title">COIN EVENTS</span>
      <span class="table-hd-meta" id="coin-count"></span>
    </div>
    <div id="coin-table"><div class="loading">Loading…</div></div>
    <div class="pg" id="coin-pg" style="display:none"></div>
  </div>
</section>

<!-- ══════════════════════════════════════════════════════════════
     10. REWARDS
════════════════════════════════════════════════════════════════ -->
<section class="section" id="s-rewards">
  <div class="page-hd">
    <div class="page-hd-left">
      <div class="page-title">PRO REWARDS</div>
      <div class="page-sub">Pro access grants log</div>
    </div>
    <div class="page-actions">
      <button class="btn btn-g" onclick="openGrantModal()">+ Manual Grant</button>
      <button class="btn btn-gd" onclick="loadRewards()">↻ Refresh</button>
    </div>
  </div>
  <div class="table-wrap">
    <div class="table-hd">
      <span class="table-hd-title">REWARD HISTORY</span>
      <span class="table-hd-meta" id="rwd-count"></span>
    </div>
    <div id="rwd-table"><div class="loading">Loading…</div></div>
  </div>
</section>

  </div><!-- end content -->
</div><!-- end main -->

<!-- ══════════════════════════════════════════════════════════════
     MODALS
════════════════════════════════════════════════════════════════ -->

<!-- IPO Modal -->
<div class="overlay" id="ipo-modal">
  <div class="modal">
    <div class="modal-title" id="ipo-modal-title">ADD IPO</div>
    <input type="hidden" id="ipo-id"/>
    <div class="form-grid">
      <div class="form-group" style="grid-column:1/-1"><label class="form-label">COMPANY NAME *</label><input class="inp" style="width:100%" id="ipo-company" placeholder="Acme Corp Ltd"/></div>
      <div class="form-group"><label class="form-label">NSE SYMBOL</label><input class="inp" style="width:100%" id="ipo-symbol" placeholder="ACME"/></div>
      <div class="form-group"><label class="form-label">CATEGORY</label><select class="inp" style="width:100%" id="ipo-cat"><option value="mainboard">Mainboard</option><option value="sme">SME</option></select></div>
      <div class="form-group"><label class="form-label">OPEN DATE</label><input class="inp" style="width:100%" type="date" id="ipo-open"/></div>
      <div class="form-group"><label class="form-label">CLOSE DATE</label><input class="inp" style="width:100%" type="date" id="ipo-close"/></div>
      <div class="form-group"><label class="form-label">ALLOTMENT DATE</label><input class="inp" style="width:100%" type="date" id="ipo-allot"/></div>
      <div class="form-group"><label class="form-label">LISTING DATE</label><input class="inp" style="width:100%" type="date" id="ipo-list"/></div>
      <div class="form-group"><label class="form-label">PRICE BAND LOW (Rs)</label><input class="inp" style="width:100%" type="number" id="ipo-plow" placeholder="120"/></div>
      <div class="form-group"><label class="form-label">PRICE BAND HIGH (Rs)</label><input class="inp" style="width:100%" type="number" id="ipo-phigh" placeholder="135"/></div>
      <div class="form-group"><label class="form-label">LOT SIZE</label><input class="inp" style="width:100%" type="number" id="ipo-lot" placeholder="100"/></div>
      <div class="form-group"><label class="form-label">GMP (Rs)</label><input class="inp" style="width:100%" type="number" id="ipo-gmp" placeholder="15"/></div>
      <div class="form-group"><label class="form-label">SUBSCRIPTION (x)</label><input class="inp" style="width:100%" type="number" step="0.01" id="ipo-sub" placeholder="12.5"/></div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-gd" onclick="closeIpoModal()">Cancel</button>
      <button class="btn btn-g" onclick="saveIpo()">Save IPO</button>
    </div>
  </div>
</div>

<!-- Grant Pro Modal -->
<div class="overlay" id="grant-modal">
  <div class="modal">
    <div class="modal-title">GRANT PRO ACCESS</div>
    <div class="form-group"><label class="form-label">USER ID / EMAIL / PHONE</label><input class="inp" style="width:100%" id="grant-user" placeholder="Enter user identifier…"/></div>
    <div class="form-grid">
      <div class="form-group"><label class="form-label">DAYS</label><input class="inp" style="width:100%" type="number" id="grant-days" value="30" min="1" max="365"/></div>
      <div class="form-group"><label class="form-label">REASON</label>
        <select class="inp" style="width:100%" id="grant-reason">
          <option value="admin_grant">Admin Grant</option>
          <option value="quiz_win">Quiz Win</option>
          <option value="contest">Contest</option>
          <option value="other">Other</option>
        </select>
      </div>
    </div>
    <div class="modal-footer">
      <button class="btn btn-gd" onclick="closeGrantModal()">Cancel</button>
      <button class="btn btn-g" onclick="submitGrant()">Grant Pro</button>
    </div>
  </div>
</div>

<!-- Coin Adjust Modal -->
<div class="overlay" id="coin-modal">
  <div class="modal">
    <div class="modal-title">ADJUST COINS</div>
    <input type="hidden" id="cm-uid"/>
    <div class="form-group"><label class="form-label">USER</label><div id="cm-label" style="font-family:var(--mono);font-size:11px;color:var(--text);padding:6px 0"></div></div>
    <div class="form-group"><label class="form-label">COIN DELTA (positive or negative)</label><input class="inp" style="width:100%" type="number" id="cm-delta" placeholder="+500 or -200"/></div>
    <div class="modal-footer">
      <button class="btn btn-gd" onclick="closeCoinModal()">Cancel</button>
      <button class="btn btn-go" onclick="submitCoin()">Apply</button>
    </div>
  </div>
</div>


<!-- ─── CARD GENERATOR MODAL ──────────────────────────────────── -->
<div class="card-overlay" id="card-overlay">
  <div class="card-shell">
    <div class="card-shell-title">
      <span>◈ CARD GENERATOR</span>
      <button class="btn btn-gd" style="padding:3px 9px" onclick="closeCardModal()">✕ Close</button>
    </div>
    <div id="card-article-title" style="font-size:11px;color:var(--sub);line-height:1.4;max-height:40px;overflow:hidden;text-overflow:ellipsis;font-family:var(--sans)"></div>
    <div class="card-format-tabs">
      <button class="fmt-btn active" id="fmt-1x1" onclick="switchFmt('1x1')">📐 1:1 Square</button>
      <button class="fmt-btn" id="fmt-4x5" onclick="switchFmt('4x5')">📱 4:5 Portrait</button>
      <button class="fmt-btn" id="fmt-9x16" onclick="switchFmt('9x16')">🎬 9:16 Story</button>
    </div>
    <div style="background:var(--card2);border:1px solid var(--border);border-radius:6px;padding:10px 14px;display:flex;align-items:center;gap:12px;flex-wrap:wrap">
      <span style="font-family:var(--mono);font-size:9px;color:var(--dim);letter-spacing:1px;white-space:nowrap">🔡 FONT SIZE</span>
      <input type="range" id="font-scale" min="0.7" max="1.6" step="0.05" value="1" style="flex:1;min-width:100px" oninput="onFontScale(this.value)"/>
      <span id="font-scale-lbl" style="font-family:var(--mono);font-size:10px;color:var(--green);min-width:32px">1.0×</span>
      <button class="btn btn-gd" style="padding:3px 8px;font-size:9px" onclick="resetFontScale()">Reset</button>
    </div>
    <div class="card-preview-wrap">
      <div id="card-preview-inner"></div>
    </div>
    <div class="card-actions">
      <button class="btn btn-gd" onclick="closeCardModal()">Cancel</button>
      <button class="btn btn-g" id="dl-btn" onclick="downloadCard()">⬇ Download PNG</button>
    </div>
  </div>
</div>

<!-- Toast -->
<div class="toast" id="toast"></div>

<script>
// ═══════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════
var _section = "overview";
var _ipos = [];
var _articles = {};
var _cardArticle = null;
var _cardFmt = "1x1";
var _fontScale = 1.0;
var _searchTimer = null;
var _newsPage = 1, _newsPages = 0, _newsTotal = 0;
var _coinPage = 1, _coinPages = 0, _coinTotal = 0;
var _expandedArt = null;

// Category colors (from CLAUDE.md)
var CAT_COLORS = {
  indian:"#00ff88", companies:"#ffdd3b", global:"#3bffee",
  commodity:"#ff6b3b", crypto:"#b366ff", ipo:"#ff3bff",
  economy:"#3b9eff", banking:"#3b9eff", sebi:"#ff9f3b", rbi:"#3b9eff"
};

// ═══════════════════════════════════════════════════════════════
// CLOCK
// ═══════════════════════════════════════════════════════════════
function updateClock() {
  var now = new Date();
  var ist = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  var ts  = ist.toISOString().replace("T", " ").slice(0, 19) + " IST";
  var el  = document.getElementById("tb-time");
  var sb  = document.getElementById("sb-time");
  if (el) el.textContent = ts;
  if (sb) sb.textContent = ts.slice(11);
}
setInterval(updateClock, 1000);
updateClock();

// ═══════════════════════════════════════════════════════════════
// NAV
// ═══════════════════════════════════════════════════════════════
var SECTION_LABELS = {
  overview:"OVERVIEW", news:"NEWS ARTICLES", trading:"VIRTUAL TRADING",
  payments:"PAYMENTS", users:"USERS", quiz:"MARKET QUIZ",
  predictions:"PREDICTIONS", ipos:"IPO MANAGEMENT",
  coins:"COIN LEDGER", rewards:"PRO REWARDS"
};

document.querySelectorAll(".nav-item[data-section]").forEach(function(el) {
  el.addEventListener("click", function(e) {
    e.preventDefault();
    switchSection(el.getAttribute("data-section"));
  });
});

function switchSection(name) {
  document.querySelectorAll(".section").forEach(function(s) { s.classList.remove("active"); });
  document.querySelectorAll(".nav-item[data-section]").forEach(function(n) { n.classList.remove("active"); });
  var sec = document.getElementById("s-" + name);
  if (sec) sec.classList.add("active");
  var nav = document.querySelector("[data-section=" + name + "]");
  if (nav) nav.classList.add("active");
  _section = name;
  var tb = document.getElementById("tb-section");
  if (tb) tb.textContent = SECTION_LABELS[name] || name.toUpperCase();
  loadSection(name);
}

function loadSection(name) {
  if (name === "overview")    { loadStats(); loadBatches(); loadCoinSnap(); loadGeminiStatus(); }
  if (name === "news")        loadNews(1);
  if (name === "trading")     loadTrading();
  if (name === "payments")    loadPayments();
  if (name === "quiz")        loadQuiz();
  if (name === "predictions") loadPredictions();
  if (name === "ipos")        loadIpos();
  if (name === "coins")       loadCoins(1);
  if (name === "rewards")     loadRewards();
}

// ═══════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════
function toast(msg, type) {
  var t = document.getElementById("toast");
  t.textContent = msg;
  t.className = "toast" + (type ? " " + type : "");
  t.style.display = "block";
  clearTimeout(t._timer);
  t._timer = setTimeout(function() { t.style.display = "none"; }, 3500);
}

// ═══════════════════════════════════════════════════════════════
// API
// ═══════════════════════════════════════════════════════════════
async function api(path, opts) {
  opts = opts || {};
  var res = await fetch(path, Object.assign({ credentials: "include" }, opts));
  if (!res.ok) {
    var e = await res.json().catch(function() { return { error: res.statusText }; });
    throw new Error(e.error || res.statusText);
  }
  return res.json();
}

function fmt(n) {
  if (n == null) return "—";
  if (typeof n === "number") return n.toLocaleString("en-IN");
  return String(n);
}
function fmtDate(ts) {
  if (!ts) return "—";
  return new Date(ts).toLocaleString("en-IN", { dateStyle:"short", timeStyle:"short" });
}
function fmtAgo(ts) {
  if (!ts) return "—";
  var d = Date.now() - new Date(ts).getTime();
  var h = Math.floor(d / 3600000);
  if (h < 1) return Math.floor(d / 60000) + "m ago";
  if (h < 24) return h + "h ago";
  return Math.floor(h / 24) + "d ago";
}
function esc(s) {
  return String(s || "").replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
}
function catDot(cat) {
  var c = CAT_COLORS[cat] || "#888";
  return "<span class=\\"cat-dot\\" style=\\"background:" + c + "\\"></span>";
}
function sCard(label, value, cls, meta, accent) {
  return "<div class=\\"stat-card" + (accent ? " " + accent : "") + "\\">" +
    "<div class=\\"stat-label\\">" + label + "</div>" +
    "<div class=\\"stat-value " + (cls || "") + "\\">" + value + "</div>" +
    (meta ? "<div class=\\"stat-meta\\">" + meta + "</div>" : "") +
  "</div>";
}
function statusBadge(s) {
  var map = { success:"bg", posted:"bg", active:"bg", pending:"bo", generating:"bb", failed:"br", banned:"br", free:"bgd" };
  return "<span class=\\"badge " + (map[s] || "bgd") + "\\">" + esc(String(s || "—").toUpperCase()) + "</span>";
}

// ═══════════════════════════════════════════════════════════════
// 1. OVERVIEW
// ═══════════════════════════════════════════════════════════════
async function loadStats() {
  try {
    var d = await api("/api/admin/stats");
    var g = document.getElementById("ov-stats");
    g.innerHTML =
      sCard("TOTAL USERS",    fmt(d.totalUsers),    "text",  null, null) +
      sCard("PRO USERS",      fmt(d.proUsers),      "gold",  null, "gold") +
      sCard("ACTIVE TODAY",   fmt(d.activeToday),   "green", null, null) +
      sCard("TODAY REVENUE",  "Rs" + fmt(d.revenueToday), "green", null, null) +
      sCard("QUIZZES TODAY",  fmt(d.quizzesToday),  "blue",  null, "blue") +
      sCard("CACHED ARTICLES",fmt(d.articlesCached),"text",  null, null) +
      sCard("PIPELINE",       esc(d.pipelineStatus), d.pipelineStatus === "posted" ? "green" : d.pipelineStatus === "failed" ? "red" : "text", null, d.pipelineStatus === "failed" ? "red" : null) +
      sCard("LAST FETCH",     esc(d.lastFetchAgo),  "text",  null, null);
  } catch(e) { toast("Stats error: " + e.message, "err"); }
}

async function loadBatches() {
  try {
    var d = await api("/api/admin/batches");
    var el = document.getElementById("ov-batches");
    if (!d.length) { el.innerHTML = "<div class=\\"empty\\">No batches yet</div>"; return; }
    el.innerHTML = "<table class=\\"tbl\\"><thead><tr><th>BATCH ID</th><th>FETCHED</th><th>ITEMS</th><th>NEW</th><th>STATUS</th></tr></thead><tbody>" +
      d.slice(0, 10).map(function(b) {
        return "<tr>" +
          "<td class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + esc(b.id.slice(0, 20)) + "</td>" +
          "<td>" + fmtAgo(b.fetched_at) + "</td>" +
          "<td class=\\"mono hl-blue\\">" + fmt(b.item_count) + "</td>" +
          "<td class=\\"mono hl-green\\">" + fmt(b.new_item_count) + "</td>" +
          "<td>" + statusBadge(b.status) + "</td>" +
        "</tr>";
      }).join("") + "</tbody></table>";
  } catch(e) {}
}

async function loadCoinSnap() {
  try {
    var d = await api("/api/admin/coins?limit=1");
    var el = document.getElementById("ov-coin-snap");
    el.innerHTML = "<div style=\\"padding:16px\\">" +
      "<div style=\\"display:flex;gap:20px;flex-wrap:wrap\\">" +
        "<div><div class=\\"stat-label\\">TOTAL EVENTS</div><div class=\\"stat-value blue mono fn\\">" + fmt(d.total) + "</div></div>" +
        "<div><div class=\\"stat-label\\">COINS ISSUED</div><div class=\\"stat-value gold mono fn\\">+" + fmt(d.totalCoinsIssued) + "</div></div>" +
      "</div>" +
      "<div style=\\"margin-top:12px;font-family:var(--mono);font-size:10px;color:var(--dim)\\">X = 100 base unit. 1 coin = Rs 1 trading value.</div>" +
    "</div>";
  } catch(e) {
    document.getElementById("ov-coin-snap").innerHTML = "<div class=\\"empty\\">Add /api/admin/coins route to server.ts</div>";
  }
}

async function loadGeminiStatus() {
  try {
    var d = await api("/api/test-gemini");
    var el = document.getElementById("ov-gemini");
    if (!d || !d.keys) { el.innerHTML = "<div class=\\"empty\\">No key data</div>"; return; }
    el.innerHTML = "<table class=\\"tbl\\"><thead><tr><th>#</th><th>TYPE</th><th>STATUS</th><th>CALLS</th><th>COOLDOWN</th></tr></thead><tbody>" +
      d.keys.map(function(k, i) {
        return "<tr>" +
          "<td class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + (i+1) + "</td>" +
          "<td><span class=\\"badge " + (k.type === "paid" ? "bgo" : "bgd") + "\\">" + esc(k.type || "free").toUpperCase() + "</span></td>" +
          "<td>" + (k.available ? "<span class=\\"badge bg\\">ACTIVE</span>" : "<span class=\\"badge br\\">COOLDOWN</span>") + "</td>" +
          "<td class=\\"mono\\">" + fmt(k.calls || 0) + "</td>" +
          "<td class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + (k.cooldownUntil ? fmtAgo(k.cooldownUntil) : "—") + "</td>" +
        "</tr>";
      }).join("") + "</tbody></table>";
  } catch(e) {
    document.getElementById("ov-gemini").innerHTML = "<div class=\\"empty\\">Gemini status unavailable</div>";
  }
}

async function triggerFetch() {
  try { await api("/api/news/refresh", { method:"POST" }); toast("News fetch triggered"); setTimeout(loadStats, 4000); }
  catch(e) { toast(e.message, "err"); }
}


// ═══════════════════════════════════════════════════════════════
// 2. NEWS
// ═══════════════════════════════════════════════════════════════
async function loadNews(page) {
  _newsPage = page || 1;
  var cat   = document.getElementById("nw-cat").value;
  var limit = document.getElementById("nw-limit").value;
  document.getElementById("nw-table").innerHTML = "<div class=\\"loading\\">Loading articles…</div>";
  document.getElementById("nw-pg").style.display = "none";
  document.getElementById("nw-detail").classList.remove("open");
  _expandedArt = null;
  try {
    var params = new URLSearchParams({ page:_newsPage, limit:limit, category:cat });
    var d = await api("/api/admin/news?" + params.toString());
    _newsPages = d.pages; _newsTotal = d.total;

    var sg = document.getElementById("nw-stats");
    sg.innerHTML =
      sCard("TOTAL (30 DAYS)", fmt(d.total), "text", "30-day rolling retention", null) +
      sCard("THIS PAGE", fmt(d.articles.length), "blue", null, "blue") +
      sCard("PAGES", fmt(d.pages), "text", null, null);

    document.getElementById("nw-count").textContent = d.total + " articles — page " + _newsPage + " of " + _newsPages;

    var el = document.getElementById("nw-table");
    if (!d.articles.length) { el.innerHTML = "<div class=\\"empty\\">No articles found</div>"; return; }

    el.innerHTML = "<table class=\\"tbl\\"><thead><tr>" +
      "<th style=\\"width:32px\\"></th><th>TITLE</th><th>SOURCE</th><th>CATEGORY</th><th>AGE</th><th>↗</th><th>GENERATE CARD</th>" +
      "</tr></thead><tbody id=\\"nw-tbody\\">" +
      d.articles.map(function(a) { return newsRow(a); }).join("") +
      "</tbody></table>";

    renderNewsPg();
  } catch(e) {
    document.getElementById("nw-table").innerHTML =
      "<div class=\\"empty\\">Load failed: " + esc(e.message) + "<br><br><span style=\\"font-size:10px;color:var(--dim)\\">Add GET /api/admin/news to server.ts — see dashboard.ts header.</span></div>";
  }
}

function newsRow(a) {
  _articles[a.id] = a;
  var cc = CAT_COLORS[a.category] || "#888";
  return "<tr id=\\"ar-"+esc(a.id)+"\\">"+
    "<td><button class=\\"btn btn-gd\\" style=\\"padding:2px 6px;font-size:10px\\" onclick=\\"expandArt('"+esc(a.id)+"')\\" >▸</button></td>"+
    "<td class=\\"art-cell\\"><strong title=\\""+esc(a.title)+"\\">"+esc(a.title.slice(0,72))+(a.title.length>72?"…":"")+"</strong>"+
      (a.content_snippet?"<div class=\\"art-snip\\">"+esc((a.content_snippet||"").slice(0,88))+"</div>":"")+"</td>"+
    "<td><span class=\\"badge bb\\">"+esc((a.source||"").toUpperCase().slice(0,12))+"</span></td>"+
    "<td><span class=\\"badge bgd\\" style=\\"border-left:2px solid "+cc+"\\">"+esc((a.category||"").toUpperCase())+"</span></td>"+
    "<td class=\\"mono fn\\" style=\\"white-space:nowrap\\">"+fmtAgo(a.pub_date)+"</td>"+
    "<td><a class=\\"btn btn-gd\\" style=\\"padding:3px 7px\\" href=\\""+esc(a.link||"#")+"\\" target=\\"_blank\\" rel=\\"noopener\\">↗</a></td>"+
    "<td style=\\"display:flex;gap:3px;align-items:center\\">"+
      "<button class=\\"btn-gen btn-11\\" onclick=\\"genCard('"+esc(a.id)+"','1x1')\\" title=\\"Generate 1:1 square card\\">1:1</button>"+
      "<button class=\\"btn-gen btn-45\\" onclick=\\"genCard('"+esc(a.id)+"','4x5')\\" title=\\"Generate 4:5 portrait card\\">4:5</button>"+
      "<button class=\\"btn-gen btn-916\\" onclick=\\"genCard('"+esc(a.id)+"','9x16')\\" title=\\"Generate 9:16 story card\\">9:16</button>"+
    "</td>"+
  "</tr>";
}


async function expandArt(id) {
  var panel = document.getElementById("nw-detail");
  document.querySelectorAll("#nw-tbody button").forEach(function(b) { if (b.textContent === "▾") b.textContent = "▸"; });
  if (_expandedArt === id) { panel.classList.remove("open"); _expandedArt = null; return; }
  _expandedArt = id;
  var btn = document.querySelector("#ar-" + id + " button");
  if (btn) btn.textContent = "▾";
  panel.classList.add("open");
  panel.innerHTML = "<div class=\\"loading\\">Loading…</div>";
  var row = document.getElementById("ar-" + id);
  if (row && row.parentNode) row.parentNode.insertBefore(panel, row.nextSibling);
  try {
    var d = await api("/api/news/article?id=" + encodeURIComponent(id));

    panel.innerHTML =
      "<div class=\\"detail-meta\\">" +
        "<span class=\\"badge bb\\">" + esc((d.source || "").toUpperCase()) + "</span>" +
        (d.category ? "<span class=\\"badge bgd\\" style=\\"border-left:2px solid " + (CAT_COLORS[d.category] || "#888") + "\\">" + esc(d.category.toUpperCase()) + "</span>" : "") +
        "<span class=\\"fn\\" style=\\"color:var(--dim);font-family:var(--mono)\\">" + fmtAgo(d.pubDate || d.pub_date) + "</span>" +
        "<a class=\\"btn btn-gd\\" style=\\"margin-left:auto;padding:3px 8px\\" href=\\"" + esc(d.link || "#") + "\\" target=\\"_blank\\">Read Source ↗</a>" +
      "</div>" +
      "<div class=\\"detail-title\\">" + esc(d.title || "") + "</div>" +
      ((d.contentSnippet || d.content_snippet) ? "<div style=\\"font-size:12px;color:var(--sub);margin-bottom:10px;line-height:1.6\\">" + esc(((d.contentSnippet || d.content_snippet) || "").slice(0, 400)) + "</div>" : "");
  } catch(e) {
    panel.innerHTML = "<div style=\\"font-family:var(--mono);font-size:10px;color:var(--dim)\\">Detail unavailable: " + esc(e.message) + "</div>";
  }
}



function renderNewsPg() {
  if (_newsPages <= 1) return;
  var el = document.getElementById("nw-pg");
  el.style.display = "flex";
  var html = "<button class=\\"pg-btn\\" onclick=\\"loadNews(" + (_newsPage-1) + ")\\" " + (_newsPage <= 1 ? "disabled" : "") + ">← Prev</button>";
  var s = Math.max(1, _newsPage-2), e = Math.min(_newsPages, _newsPage+2);
  if (s > 1) html += "<span class=\\"pg-info\\">1…</span>";
  for (var p = s; p <= e; p++) html += "<button class=\\"pg-btn " + (p === _newsPage ? "cur" : "") + "\\" onclick=\\"loadNews(" + p + ")\\">" + p + "</button>";
  if (e < _newsPages) html += "<span class=\\"pg-info\\">…" + _newsPages + "</span>";
  html += "<button class=\\"pg-btn\\" onclick=\\"loadNews(" + (_newsPage+1) + ")\\" " + (_newsPage >= _newsPages ? "disabled" : "") + ">Next →</button>";
  html += "<span class=\\"pg-info\\">" + _newsTotal + " total</span>";
  el.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════
// 3. TRADING
// ═══════════════════════════════════════════════════════════════
async function loadTrading() {
  try {
    var d = await api("/api/admin/trading");
    document.getElementById("tr-stats").innerHTML =
      sCard("TOTAL ORDERS",  fmt(d.totalOrders),  "blue",  null, "blue") +
      sCard("BUY ORDERS",    fmt(d.totalBuys),     "green", null, null) +
      sCard("SELL ORDERS",   fmt(d.totalSells),    "orange",null, "orange") +
      sCard("TRADERS",       fmt(d.totalTraders),  "purple",null, "purple");

    var lb = document.getElementById("tr-leaderboard");
    if (!d.leaderboard || !d.leaderboard.length) {
      lb.innerHTML = "<div class=\\"empty\\">No trading data yet</div>";
    } else {
      lb.innerHTML = "<table class=\\"tbl\\"><thead><tr><th>#</th><th>USER</th><th>INVESTED</th><th>VALUE</th><th>PNL</th></tr></thead><tbody>" +
        d.leaderboard.map(function(u, i) {
          var pnl = (u.current_value_coins || 0) - (u.total_invested_coins || 0) + (u.realised_pnl_coins || 0);
          return "<tr>" +
            "<td class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + (i+1) + "</td>" +
            "<td class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + esc(u.user_id.slice(0, 14)) + "…</td>" +
            "<td class=\\"mono\\">⚡" + fmt(u.total_invested_coins) + "</td>" +
            "<td class=\\"mono hl-blue\\">⚡" + fmt(u.current_value_coins) + "</td>" +
            "<td class=\\"mono " + (pnl >= 0 ? "hl-green" : "hl-red") + "\\">" + (pnl >= 0 ? "+" : "") + fmt(pnl) + "</td>" +
          "</tr>";
        }).join("") + "</tbody></table>";
    }

    var ord = document.getElementById("tr-orders");
    if (!d.recentOrders || !d.recentOrders.length) {
      ord.innerHTML = "<div class=\\"empty\\">No orders yet</div>";
    } else {
      ord.innerHTML = "<table class=\\"tbl\\"><thead><tr><th>TYPE</th><th>SYMBOL</th><th>QTY</th><th>PRICE</th><th>TOTAL</th><th>WHEN</th></tr></thead><tbody>" +
        d.recentOrders.map(function(o) {
          return "<tr>" +
            "<td><span class=\\"badge " + (o.order_type === "BUY" ? "bg" : "br") + "\\">" + esc(o.order_type) + "</span></td>" +
            "<td class=\\"mono hl-blue\\">" + esc(o.symbol) + "</td>" +
            "<td class=\\"mono\\">" + fmt(o.quantity) + "</td>" +
            "<td class=\\"mono\\">" + fmt(o.price_coins) + "</td>" +
            "<td class=\\"mono\\">" + fmt(o.total_coins) + "</td>" +
            "<td>" + fmtAgo(o.created_at) + "</td>" +
          "</tr>";
        }).join("") + "</tbody></table>";
    }
  } catch(e) {
    document.getElementById("tr-stats").innerHTML = "<div class=\\"empty\\">Add /api/admin/trading route to server.ts — see dashboard.ts header.</div>";
  }
}

// ═══════════════════════════════════════════════════════════════
// 4. PAYMENTS
// ═══════════════════════════════════════════════════════════════
async function loadPayments() {
  var filter = document.getElementById("pay-filter").value;
  try {
    var d = await api("/api/admin/payments?status=" + filter);
    document.getElementById("pay-count").textContent = d.length + " records";
    var el = document.getElementById("pay-table");
    if (!d.length) { el.innerHTML = "<div class=\\"empty\\">No payments found</div>"; return; }
    el.innerHTML = "<table class=\\"tbl\\"><thead><tr><th>EMAIL</th><th>PHONE</th><th>PLAN</th><th>AMOUNT</th><th>UTR</th><th>DATE</th><th>STATUS</th><th>ACTION</th></tr></thead><tbody>" +
      d.map(function(p) {
        return "<tr>" +
          "<td>" + esc(p.email || "—") + "</td>" +
          "<td class=\\"mono fn\\">" + esc(p.phone || "—") + "</td>" +
          "<td><span class=\\"badge bb\\">" + esc((p.plan || "—").toUpperCase()) + "</span></td>" +
          "<td class=\\"mono hl-green\\">Rs" + fmt(p.amount) + "</td>" +
          "<td class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + esc(p.utr_number || "—") + "</td>" +
          "<td>" + fmtDate(p.created_at) + "</td>" +
          "<td>" + statusBadge(p.status) + "</td>" +
          "<td>" + (p.status !== "success"
            ? "<button class=\\"btn btn-g\\" style=\\"padding:3px 9px\\" onclick=\\"activatePay('" + esc(p.id) + "',this)\\">Activate</button>"
            : "<span class=\\"badge bgd\\">DONE</span>") + "</td>" +
        "</tr>";
      }).join("") + "</tbody></table>";
  } catch(e) { toast("Payments error: " + e.message, "err"); }
}
async function activatePay(id, btn) {
  btn.disabled = true; btn.textContent = "…";
  try { await api("/api/admin/payments/" + id + "/activate", { method:"POST" }); toast("Pro activated!"); loadPayments(); }
  catch(e) { toast(e.message, "err"); btn.disabled = false; btn.textContent = "Activate"; }
}

// ═══════════════════════════════════════════════════════════════
// 5. USERS
// ═══════════════════════════════════════════════════════════════
function debouncedSearch() {
  clearTimeout(_searchTimer);
  _searchTimer = setTimeout(searchUsers, 500);
}
async function searchUsers() {
  var q = document.getElementById("usr-q").value.trim();
  if (!q) return;
  document.getElementById("usr-table").innerHTML = "<div class=\\"loading\\">Searching…</div>";
  try {
    var d = await api("/api/admin/users?q=" + encodeURIComponent(q));
    document.getElementById("usr-count").textContent = d.length + " found";
    if (!d.length) { document.getElementById("usr-table").innerHTML = "<div class=\\"empty\\">No users found</div>"; return; }
    document.getElementById("usr-table").innerHTML = "<table class=\\"tbl\\"><thead><tr><th>NAME</th><th>EMAIL/PHONE</th><th>IQ</th><th>STREAK</th><th>COINS</th><th>PRO</th><th>ACTIONS</th></tr></thead><tbody>" +
      d.map(function(u) {
        return "<tr>" +
          "<td>" + esc(u.name || "—") + "</td>" +
          "<td class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + esc(u.email || u.phone || u.id.slice(0,14) + "…") + "</td>" +
          "<td class=\\"mono hl-gold\\">" + fmt(u.investor_iq) + "</td>" +
          "<td class=\\"mono hl-orange\\">🔥" + fmt(u.streak_count) + "</td>" +
          "<td class=\\"mono hl-green\\">⚡" + fmt(u.coins) + "</td>" +
          "<td>" + (u.is_pro ? "<span class=\\"badge bgo\\">PRO</span>" : "<span class=\\"badge bgd\\">FREE</span>") + "</td>" +
          "<td style=\\"display:flex;gap:4px;flex-wrap:wrap\\">" +
            "<button class=\\"btn btn-go\\" style=\\"padding:3px 8px\\" onclick=\\"grantProUser('" + esc(u.id) + "')\\">Pro</button>" +
            (u.is_pro ? "<button class=\\"btn btn-r\\" style=\\"padding:3px 8px\\" onclick=\\"removeProUser('" + esc(u.id) + "',this)\\">-Pro</button>" : "") +
            "<button class=\\"btn btn-b\\" style=\\"padding:3px 8px\\" onclick=\\"openCoinModal('" + esc(u.id) + "','" + esc(u.name || u.email || u.id.slice(0,8)) + "')\\">Coins</button>" +
            "<button class=\\"btn btn-r\\" style=\\"padding:3px 8px;opacity:.7\\" onclick=\\"banUser('" + esc(u.id) + "',this)\\">Ban</button>" +
          "</td>" +
        "</tr>";
      }).join("") + "</tbody></table>";
  } catch(e) { toast("Search error: " + e.message, "err"); }
}
function grantProUser(uid) { document.getElementById("grant-user").value = uid; openGrantModal(); }
async function removeProUser(uid, btn) {
  if (!confirm("Remove Pro from this user?")) return;
  btn.disabled = true;
  try { await api("/api/admin/users/" + uid + "/remove-pro", { method:"POST" }); toast("Pro removed"); searchUsers(); }
  catch(e) { toast(e.message, "err"); btn.disabled = false; }
}
async function banUser(uid, btn) {
  if (!confirm("Ban this user permanently?")) return;
  btn.disabled = true;
  try { await api("/api/admin/users/" + uid + "/ban", { method:"POST" }); toast("User banned"); searchUsers(); }
  catch(e) { toast(e.message, "err"); btn.disabled = false; }
}

// ═══════════════════════════════════════════════════════════════
// 6. QUIZ
// ═══════════════════════════════════════════════════════════════
async function loadQuiz() {
  try {
    var d = await api("/api/admin/quiz/today");
    document.getElementById("quiz-date").textContent = d.date || "";
    var qs = d.questions || [];
    var el = document.getElementById("quiz-qs");
    el.innerHTML = !qs.length ? "<div class=\\"empty\\">No quiz generated today</div>" :
      qs.map(function(q, i) {
        return "<div class=\\"quiz-card\\">" +
          "<div class=\\"quiz-q-num\\">Q" + (i+1) + " · " + esc((q.category || "").toUpperCase()) + "</div>" +
          "<div class=\\"quiz-q-text\\">" + esc(q.question) + "</div>" +
          "<div class=\\"quiz-opts\\">" +
            (q.options || []).map(function(opt, oi) {
              return "<div class=\\"quiz-opt " + (oi === q.correct_index ? "ok" : "") + "\\">" +
                (oi === q.correct_index ? "✓ " : "") + esc(opt) + "</div>";
            }).join("") +
          "</div>" +
        "</div>";
      }).join("");

    var att = d.attempts || [];
    document.getElementById("quiz-att-count").textContent = att.length + " attempts";
    var ae = document.getElementById("quiz-atts");
    ae.innerHTML = !att.length ? "<div class=\\"empty\\">No attempts today</div>" :
      "<table class=\\"tbl\\"><thead><tr><th>USER</th><th>SCORE</th><th>TIME</th><th>COINS</th><th>IQ DELTA</th><th>AT</th></tr></thead><tbody>" +
      att.map(function(a) {
        return "<tr>" +
          "<td class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + esc(a.user_id.slice(0,14)) + "…</td>" +
          "<td class=\\"mono hl-green\\">" + a.score + "/5</td>" +
          "<td class=\\"mono\\">" + a.time_secs + "s</td>" +
          "<td class=\\"mono hl-gold\\">+" + fmt(a.coins_earned) + "</td>" +
          "<td class=\\"mono " + (a.iq_change >= 0 ? "hl-green" : "hl-red") + "\\">" + (a.iq_change >= 0 ? "+" : "") + a.iq_change + "</td>" +
          "<td>" + fmtAgo(a.created_at) + "</td>" +
        "</tr>";
      }).join("") + "</tbody></table>";
  } catch(e) { toast("Quiz load error: " + e.message, "err"); }
}
async function regenQuiz() {
  var btn = document.getElementById("regen-btn");
  if (!confirm("Regenerate the quiz? This overwrites existing questions.")) return;
  btn.disabled = true; btn.textContent = "Regenerating…";
  try { await api("/api/admin/quiz/regenerate", { method:"POST" }); toast("Quiz regenerated!"); loadQuiz(); }
  catch(e) { toast(e.message, "err"); }
  finally { btn.disabled = false; btn.textContent = "↻ Regenerate Quiz"; }
}

// ═══════════════════════════════════════════════════════════════
// 7. PREDICTIONS
// ═══════════════════════════════════════════════════════════════
async function loadPredictions() {
  try {
    var d = await api("/api/admin/predictions");
    document.getElementById("pred-stats").innerHTML =
      sCard("TOTAL PREDICTIONS", fmt((d.predictions || []).length), "blue", null, "blue") +
      sCard("TOTAL VOTES", fmt(d.totalVotes), "green", null, null) +
      sCard("CORRECT VOTES", fmt(d.correctVotes), "gold", null, "gold") +
      sCard("ACCURACY", d.totalVotes > 0 ? Math.round(d.correctVotes / d.totalVotes * 100) + "%" : "—", "purple", null, "purple");
    var el = document.getElementById("pred-table");
    if (!d.predictions || !d.predictions.length) { el.innerHTML = "<div class=\\"empty\\">No predictions yet</div>"; return; }
    el.innerHTML = "<table class=\\"tbl\\"><thead><tr><th>DATE</th><th>QUESTION</th><th>A</th><th>B</th><th>ANSWER</th><th>RESOLVES</th></tr></thead><tbody>" +
      d.predictions.map(function(p) {
        return "<tr>" +
          "<td class=\\"mono fn\\">" + esc(p.date) + "</td>" +
          "<td style=\\"max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\\">" + esc(p.question) + "</td>" +
          "<td class=\\"fn\\" style=\\"color:var(--sub)\\">" + esc(p.option_a) + "</td>" +
          "<td class=\\"fn\\" style=\\"color:var(--sub)\\">" + esc(p.option_b) + "</td>" +
          "<td>" + (p.correct_answer ? "<span class=\\"badge bg\\">" + esc(p.correct_answer) + "</span>" : "<span class=\\"badge bgd\\">TBD</span>") + "</td>" +
          "<td>" + fmtAgo(p.resolves_at) + "</td>" +
        "</tr>";
      }).join("") + "</tbody></table>";
  } catch(e) {
    document.getElementById("pred-stats").innerHTML = "<div class=\\"empty\\">Add /api/admin/predictions to server.ts — see dashboard.ts header.</div>";
  }
}

// ═══════════════════════════════════════════════════════════════
// 8. IPOs
// ═══════════════════════════════════════════════════════════════
async function loadIpos() {
  try {
    var d = await api("/api/ipos");
    _ipos = d;
    document.getElementById("ipo-count").textContent = d.length + " IPOs";
    var el = document.getElementById("ipo-table");
    if (!d.length) { el.innerHTML = "<div class=\\"empty\\">No IPO records</div>"; return; }
    el.innerHTML = "<table class=\\"tbl\\"><thead><tr><th>COMPANY</th><th>OPEN</th><th>CLOSE</th><th>PRICE BAND</th><th>LOT</th><th>GMP</th><th>SUB</th><th>CAT</th><th>ACTIONS</th></tr></thead><tbody>" +
      d.map(function(ipo) {
        return "<tr>" +
          "<td><strong style=\\"font-size:12px\\">" + esc(ipo.company_name) + "</strong><br/><span class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + esc(ipo.symbol || "—") + "</span></td>" +
          "<td>" + esc(ipo.open_date || "—") + "</td>" +
          "<td>" + esc(ipo.close_date || "—") + "</td>" +
          "<td class=\\"mono\\">Rs" + (ipo.price_band_low || "?") + "–" + (ipo.price_band_high || "?") + "</td>" +
          "<td class=\\"mono\\">" + fmt(ipo.lot_size) + "</td>" +
          "<td class=\\"mono " + (ipo.gmp > 0 ? "hl-green" : ipo.gmp < 0 ? "hl-red" : "") + "\\">" + (ipo.gmp != null ? "Rs" + ipo.gmp : "—") + "</td>" +
          "<td class=\\"mono\\">" + (ipo.subscription_status != null ? ipo.subscription_status + "x" : "—") + "</td>" +
          "<td><span class=\\"badge " + (ipo.category === "sme" ? "bb" : "bgd") + "\\">" + esc((ipo.category || "mainboard").toUpperCase()) + "</span></td>" +
          "<td style=\\"display:flex;gap:4px\\">" +
            "<button class=\\"btn btn-b\\" style=\\"padding:3px 8px\\" onclick=\\"openIpoModal('" + esc(ipo.id) + "')\\">Edit</button>" +
            "<button class=\\"btn btn-r\\" style=\\"padding:3px 8px\\" onclick=\\"deleteIpo('" + esc(ipo.id) + "',this)\\">Del</button>" +
          "</td>" +
        "</tr>";
      }).join("") + "</tbody></table>";
  } catch(e) { toast("IPO error: " + e.message, "err"); }
}
function openIpoModal(id) {
  var ipo = id ? _ipos.find(function(i) { return i.id === id; }) : null;
  document.getElementById("ipo-modal-title").textContent = ipo ? "EDIT IPO" : "ADD IPO";
  document.getElementById("ipo-id").value = id || "";
  var fv = function(fid, val) { var e = document.getElementById(fid); if (e) e.value = val || ""; };
  fv("ipo-company", ipo && ipo.company_name);
  fv("ipo-symbol",  ipo && ipo.symbol);
  fv("ipo-open",    ipo && ipo.open_date);
  fv("ipo-close",   ipo && ipo.close_date);
  fv("ipo-allot",   ipo && ipo.allotment_date);
  fv("ipo-list",    ipo && ipo.listing_date);
  fv("ipo-plow",    ipo && ipo.price_band_low);
  fv("ipo-phigh",   ipo && ipo.price_band_high);
  fv("ipo-lot",     ipo && ipo.lot_size);
  fv("ipo-gmp",     ipo && ipo.gmp);
  fv("ipo-sub",     ipo && ipo.subscription_status);
  document.getElementById("ipo-cat").value = (ipo && ipo.category) || "mainboard";
  document.getElementById("ipo-modal").classList.add("open");
}
function closeIpoModal() { document.getElementById("ipo-modal").classList.remove("open"); }
async function saveIpo() {
  var id = document.getElementById("ipo-id").value;
  var company = document.getElementById("ipo-company").value.trim();
  if (!company) { toast("Company name required", "err"); return; }
  var payload = {
    id: id || undefined,
    company_name: company,
    symbol: document.getElementById("ipo-symbol").value.trim() || null,
    open_date: document.getElementById("ipo-open").value || null,
    close_date: document.getElementById("ipo-close").value || null,
    allotment_date: document.getElementById("ipo-allot").value || null,
    listing_date: document.getElementById("ipo-list").value || null,
    price_band_low: +document.getElementById("ipo-plow").value || null,
    price_band_high: +document.getElementById("ipo-phigh").value || null,
    lot_size: +document.getElementById("ipo-lot").value || null,
    gmp: document.getElementById("ipo-gmp").value !== "" ? +document.getElementById("ipo-gmp").value : null,
    subscription_status: document.getElementById("ipo-sub").value !== "" ? +document.getElementById("ipo-sub").value : null,
    category: document.getElementById("ipo-cat").value,
  };
  try {
    await api(id ? "/api/admin/ipo/" + id : "/api/admin/ipo",
      { method: id ? "PUT" : "POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify(payload) });
    toast(id ? "IPO updated" : "IPO added");
    closeIpoModal(); loadIpos();
  } catch(e) { toast(e.message, "err"); }
}
async function deleteIpo(id, btn) {
  if (!confirm("Delete this IPO?")) return;
  btn.disabled = true;
  try { await api("/api/admin/ipo/" + id, { method:"DELETE" }); toast("IPO deleted"); loadIpos(); }
  catch(e) { toast(e.message, "err"); btn.disabled = false; }
}
async function scrapeIpos() {
  try { await api("/api/admin/ipo/scrape", { method:"POST" }); toast("Scrape triggered — refresh in 30s"); setTimeout(loadIpos, 32000); }
  catch(e) { toast(e.message, "err"); }
}

// ═══════════════════════════════════════════════════════════════
// 9. COINS
// ═══════════════════════════════════════════════════════════════
async function loadCoins(page) {
  _coinPage = page || 1;
  var limit = 50;
  var offset = (_coinPage - 1) * limit;
  document.getElementById("coin-table").innerHTML = "<div class=\\"loading\\">Loading ledger…</div>";
  document.getElementById("coin-pg").style.display = "none";
  try {
    var d = await api("/api/admin/coins?limit=" + limit + "&offset=" + offset);
    _coinTotal = d.total;
    _coinPages = Math.ceil(d.total / limit);

    document.getElementById("coin-stats").innerHTML =
      sCard("TOTAL EVENTS", fmt(d.total), "blue", null, "blue") +
      sCard("COINS ISSUED", "+" + fmt(d.totalCoinsIssued), "gold", "X=100 base unit", "gold");

    document.getElementById("coin-count").textContent = d.total + " events";
    var el = document.getElementById("coin-table");
    if (!d.ledger || !d.ledger.length) { el.innerHTML = "<div class=\\"empty\\">No coin events yet</div>"; return; }

    var ACTION_COLORS = {
      FIRST_LOGIN:"bg", DAILY_LOGIN:"bgd", DAILY_STREAK:"bgd",
      QUIZ_CORRECT:"bb", QUIZ_BONUS:"bp", QUIZ_PODIUM_DAILY:"bgo", QUIZ_PODIUM_WEEKLY:"bgo", QUIZ_PODIUM_MONTHLY:"bgo",
      PREDICTION_VOTE:"bb", PREDICTION_CORRECT:"bg",
      VIRTUAL_TRADE:"bgd", PORTFOLIO_PROFIT:"bg",
      REFERRAL:"bpk", NEWS_IMPACT_CORRECT:"bb",
      IPO_PREDICTION:"bb", IPO_CORRECT:"bg",
      ADMIN_GRANT:"bo", PURCHASE:"bgo"
    };

    el.innerHTML = "<table class=\\"tbl\\"><thead><tr><th>USER</th><th>ACTION</th><th>AMOUNT</th><th>BALANCE AFTER</th><th>NOTE</th><th>WHEN</th></tr></thead><tbody>" +
      d.ledger.map(function(c) {
        var cls = ACTION_COLORS[c.action_type] || "bgd";
        return "<tr>" +
          "<td class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + esc(c.user_id.slice(0, 14)) + "…</td>" +
          "<td><span class=\\"badge " + cls + "\\">" + esc(c.action_type) + "</span></td>" +
          "<td class=\\"mono " + (c.amount > 0 ? "hl-green" : "hl-red") + "\\">" + (c.amount > 0 ? "+" : "") + fmt(c.amount) + "</td>" +
          "<td class=\\"mono\\">⚡" + fmt(c.balance_after) + "</td>" +
          "<td class=\\"fn\\" style=\\"color:var(--sub);max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap\\">" + esc(c.note || "—") + "</td>" +
          "<td>" + fmtAgo(c.created_at) + "</td>" +
        "</tr>";
      }).join("") + "</tbody></table>";

    if (_coinPages > 1) {
      var pg = document.getElementById("coin-pg");
      pg.style.display = "flex";
      var html = "<button class=\\"pg-btn\\" onclick=\\"loadCoins(" + (_coinPage-1) + ")\\" " + (_coinPage <= 1 ? "disabled" : "") + ">← Prev</button>";
      html += "<span class=\\"pg-info\\">Page " + _coinPage + " of " + _coinPages + "</span>";
      html += "<button class=\\"pg-btn\\" onclick=\\"loadCoins(" + (_coinPage+1) + ")\\" " + (_coinPage >= _coinPages ? "disabled" : "") + ">Next →</button>";
      html += "<span class=\\"pg-info\\">" + _coinTotal + " total</span>";
      pg.innerHTML = html;
    }
  } catch(e) {
    document.getElementById("coin-stats").innerHTML = "<div class=\\"empty\\">Add /api/admin/coins to server.ts — see dashboard.ts header.</div>";
  }
}

// ═══════════════════════════════════════════════════════════════
// 10. REWARDS
// ═══════════════════════════════════════════════════════════════
async function loadRewards() {
  try {
    var d = await api("/api/admin/rewards");
    document.getElementById("rwd-count").textContent = d.length + " entries";
    var el = document.getElementById("rwd-table");
    if (!d.length) { el.innerHTML = "<div class=\\"empty\\">No rewards granted yet</div>"; return; }
    el.innerHTML = "<table class=\\"tbl\\"><thead><tr><th>USER</th><th>DAYS</th><th>REASON</th><th>GRANTED BY</th><th>DATE</th></tr></thead><tbody>" +
      d.map(function(r) {
        return "<tr>" +
          "<td class=\\"mono fn\\" style=\\"color:var(--sub)\\">" + esc(r.email || r.user_id.slice(0,20) + "…") + "</td>" +
          "<td class=\\"mono hl-gold\\">+" + r.days + "d</td>" +
          "<td><span class=\\"badge bb\\">" + esc(r.reason.replace(/_/g," ").toUpperCase()) + "</span></td>" +
          "<td class=\\"mono fn\\" style=\\"color:var(--dim)\\">" + esc(r.granted_by) + "</td>" +
          "<td>" + fmtDate(r.created_at) + "</td>" +
        "</tr>";
      }).join("") + "</tbody></table>";
  } catch(e) { toast("Rewards error: " + e.message, "err"); }
}

function openGrantModal() { document.getElementById("grant-modal").classList.add("open"); }
function closeGrantModal() { document.getElementById("grant-modal").classList.remove("open"); }
async function submitGrant() {
  var userId = document.getElementById("grant-user").value.trim();
  var days   = parseInt(document.getElementById("grant-days").value) || 30;
  var reason = document.getElementById("grant-reason").value;
  if (!userId) { toast("User ID required", "err"); return; }
  try {
    await api("/api/admin/users/" + encodeURIComponent(userId) + "/grant-pro",
      { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ days:days, reason:reason }) });
    toast("Pro granted for " + days + " days");
    closeGrantModal(); loadRewards();
  } catch(e) { toast(e.message, "err"); }
}

// COIN MODAL
function openCoinModal(uid, label) {
  document.getElementById("cm-uid").value = uid;
  document.getElementById("cm-label").textContent = label;
  document.getElementById("cm-delta").value = "";
  document.getElementById("coin-modal").classList.add("open");
}
function closeCoinModal() { document.getElementById("coin-modal").classList.remove("open"); }
async function submitCoin() {
  var uid   = document.getElementById("cm-uid").value;
  var delta = parseInt(document.getElementById("cm-delta").value);
  if (!delta) { toast("Enter a non-zero delta", "err"); return; }
  try {
    await api("/api/admin/users/" + uid + "/adjust-coins",
      { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ delta:delta }) });
    toast("Coins adjusted by " + (delta >= 0 ? "+" : "") + delta);
    closeCoinModal(); searchUsers();
  } catch(e) { toast(e.message, "err"); }
}

// ═══════════════════════════════════════════════════════════════
// OVERLAY CLOSE + INIT
// ═══════════════════════════════════════════════════════════════
document.querySelectorAll(".overlay").forEach(function(o) {
  o.addEventListener("click", function(e) { if (e.target === o) o.classList.remove("open"); });
});




// ═══════════════ CARD GENERATOR ═══════════════
var CAT_EMOJI = {
  indian:"📈", companies:"🏢", global:"🌍", commodity:"⛽",
  crypto:"₿", ipo:"🚀", economy:"🏦", banking:"🏛️", sebi:"⚖️", rbi:"🏦"
};
var CAT_LABEL = {
  indian:"INDIAN MARKET", companies:"COMPANIES", global:"GLOBAL",
  commodity:"COMMODITY", crypto:"CRYPTO", ipo:"IPO",
  economy:"ECONOMY", banking:"BANKING", sebi:"SEBI", rbi:"RBI"
};

function onFontScale(val) {
  _fontScale = parseFloat(val);
  document.getElementById("font-scale-lbl").textContent = _fontScale.toFixed(2)+"x";
  if (_cardArticle) renderCardPreview(_cardArticle, _cardFmt);
}
function resetFontScale() {
  _fontScale = 1.0;
  document.getElementById("font-scale").value = "1";
  document.getElementById("font-scale-lbl").textContent = "1.0x";
  if (_cardArticle) renderCardPreview(_cardArticle, _cardFmt);
}
function genCard(id, fmt) {
  var a = _articles[id];
  if (!a) { toast("Article not found", "err"); return; }
  _cardArticle = a;
  _cardFmt = fmt;
  document.getElementById("card-article-title").textContent = a.title || "";
  ["1x1","4x5","9x16"].forEach(function(f) {
    document.getElementById("fmt-"+f).className = "fmt-btn"+(f===fmt?" active":"");
  });
  renderCardPreview(a, fmt);
  document.getElementById("card-overlay").classList.add("open");
}
function switchFmt(fmt) {
  if (!_cardArticle) return;
  _cardFmt = fmt;
  ["1x1","4x5","9x16"].forEach(function(f) {
    document.getElementById("fmt-"+f).className = "fmt-btn"+(f===fmt?" active":"");
  });
  renderCardPreview(_cardArticle, fmt);
}
function closeCardModal() {
  document.getElementById("card-overlay").classList.remove("open");
  _cardArticle = null;
}
function renderCardPreview(a, fmt) {
  document.getElementById("card-preview-inner").innerHTML = buildCard(a, fmt, _fontScale);
}

function buildCard(a, fmt, scale) {
  scale = scale || 1.0;
  var W  = 360;
  var AR = fmt==="1x1" ? 1 : fmt==="4x5" ? 1.25 : 1.778;
  var H  = Math.round(W * AR);

  var title   = (a.title || "").toUpperCase();
  var snippet = a.content_snippet || a.contentSnippet || "";
  var cat     = a.category || "indian";
  var ce      = CAT_EMOJI[cat]  || "📊";
  var cl      = CAT_LABEL[cat]  || cat.toUpperCase();

  // Font sizes - all scaled
  function fs(base) { return (base * scale).toFixed(1)+"px"; }

  // Headline truncation
  var maxC = 72;
  var sTitle = title.length > maxC ? title.slice(0, maxC)+"…" : title;

  // Summary text
  var summary = snippet.length > 180 ? snippet.slice(0,177)+"…" : snippet;

  // Bullet extraction - use simple split to avoid regex escaping issues in template
  var bullets = [];
  var parts = snippet.split(". ");
  for (var i=0; i<parts.length; i++) {
    var s = parts[i].replace(/[.!?]+$/, "").trim();
    if (s.length > 20) bullets.push(s);
    if (bullets.length >= (fmt==="1x1" ? 3 : 4)) break;
  }
  if (!bullets.length && snippet) bullets = [snippet.slice(0, 120)];

  var bIcons = ["📌","📊","💡","🔍"];

  // Date formatting
  var dateStr = "—";
  try {
    var dd = new Date(a.pub_date || a.pubDate || Date.now());
    var MM = ["JAN","FEB","MAR","APR","MAY","JUN","JUL","AUG","SEP","OCT","NOV","DEC"];
    dateStr = ("0"+dd.getDate()).slice(-2)+"-"+MM[dd.getMonth()]+"-"+dd.getFullYear();
  } catch(ex) {}

  // Category badges
  var catBadge = '<span style="font-size:'+fs(5.5)+';padding:2px 8px;border-radius:2px;letter-spacing:.8px;display:inline-flex;align-items:center;gap:2px;background:rgba(0,255,136,.1);border:1px solid rgba(0,255,136,.25);color:#00ff88">'+ce+' '+cl+'</span>';
  var extra2ndBadge = (cat==='ipo') ? ' <span style="font-size:'+fs(5.5)+';padding:2px 8px;border-radius:2px;letter-spacing:.8px;background:rgba(255,70,102,.1);border:1px solid rgba(255,70,102,.25);color:#ff4466">🔥 TRENDING</span>'
    : (cat==='companies') ? ' <span style="font-size:'+fs(5.5)+';padding:2px 8px;border-radius:2px;letter-spacing:.8px;background:rgba(255,204,68,.1);border:1px solid rgba(255,204,68,.25);color:#ffcc44">📋 Q4 RESULTS</span>'
    : (cat==='economy'||cat==='rbi'||cat==='sebi') ? ' <span style="font-size:'+fs(5.5)+';padding:2px 8px;border-radius:2px;letter-spacing:.8px;background:rgba(59,158,255,.1);border:1px solid rgba(59,158,255,.25);color:#3b9eff">📢 POLICY</span>' : '';

  // Bullets HTML
  var bHtml = '';
  for (var bi=0; bi<bullets.length; bi++) {
    bHtml += '<div style="display:flex;gap:5px;margin-bottom:'+(fmt==="1x1"?"6":"7")+'px;align-items:flex-start">'+
      '<span style="font-size:'+fs(7)+';color:#00ff88;flex-shrink:0;min-width:16px;line-height:1.5;font-weight:700">'+('0'+(bi+1)).slice(-2)+'</span>'+
      '<span style="font-size:'+fs(7.5)+';color:#aabbcc;line-height:1.5">'+bIcons[bi]+' '+esc(bullets[bi])+'</span>'+
    '</div>';
  }

  // Market data cell builder
  function mCell(l, v, s, vc, sc) {
    return '<div style="background:#0d0d1e;border:1px solid #1a1a2e;border-radius:3px;padding:5px;text-align:center">'+
      '<div style="font-size:'+fs(5.5)+';color:#334466;letter-spacing:.7px;margin-bottom:3px">'+l+'</div>'+
      '<div style="font-size:'+fs(12)+';color:'+vc+';font-weight:700;line-height:1.1">'+v+'</div>'+
      '<div style="font-size:'+fs(6)+';color:'+sc+';margin-top:2px">'+s+'</div>'+
    '</div>';
  }
  var mktRow1 = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px">'+
    mCell('📈 NIFTY 50','24,200','▲0.91%','#00ff88','#00ff88')+
    mCell('📊 SENSEX','79,600','▲0.87%','#00ff88','#00ff88')+
    mCell('💱 ₹/USD','84.21','▼0.12%','#3b9eff','#ff4466')+
  '</div>';
  var mktRow2 = '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:3px;margin-top:3px">'+
    mCell('🏦 BANK NIFTY','51,200','▲1.12%','#00ff88','#00ff88')+
    mCell('🥇 GOLD','₹92,400','▲0.31%','#ffcc44','#00ff88')+
    mCell('🛢️ CRUDE','$82.4','▼0.65%','#ff9f3b','#ff4466')+
  '</div>';

  // IPO grid
  var ipoExtra = (cat==='ipo') ?
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:3px;margin-bottom:4px;flex-shrink:0">'+
      '<div style="background:#0d0d1e;border:1px solid #1a1a2e;border-radius:3px;padding:5px">'+
        '<div style="font-size:'+fs(5)+';color:#334466;margin-bottom:2px">💰 PRICE BAND</div>'+
        '<div style="font-size:'+fs(9)+';color:#e8eaf0">₹120 – ₹135</div>'+
      '</div>'+
      '<div style="background:#0d0d1e;border:1px solid #1a1a2e;border-radius:3px;padding:5px">'+
        '<div style="font-size:'+fs(5)+';color:#334466;margin-bottom:2px">📦 LOT SIZE</div>'+
        '<div style="font-size:'+fs(9)+';color:#e8eaf0">111 shares</div>'+
      '</div>'+
    '</div>' : '';

  // Common structural elements
  var header = '<div style="background:linear-gradient(90deg,rgba(0,255,136,.1),rgba(0,255,136,.04));border-bottom:1px solid rgba(0,255,136,.15);padding:7px 11px;display:flex;justify-content:space-between;align-items:center;flex-shrink:0">'+
    '<div style="display:flex;align-items:center;gap:5px">'+
      '<div style="width:7px;height:7px;border-radius:50%;background:#00ff88;flex-shrink:0"></div>'+
      '<span style="font-size:'+fs(6.5)+';color:#00ff88;letter-spacing:1.5px;font-weight:700">📊 MARKET SAMACHAR</span>'+
    '</div>'+
    '<div style="display:flex;align-items:center;gap:4px">'+
      '<span style="font-size:10px">🇮🇳</span>'+
      '<span style="font-size:'+fs(6)+';color:#334466">'+dateStr+' · IST</span>'+
    '</div>'+
  '</div>';

  var summaryBar = summary ?
    '<div style="font-size:'+fs(7.5)+';color:#5580aa;line-height:1.55;margin-top:6px;padding:6px 9px;background:rgba(0,255,136,.04);border-left:2px solid rgba(0,255,136,.35);border-radius:0 3px 3px 0">'+esc(summary)+'</div>' : '';

  var divider = '<div style="width:28px;height:2px;background:rgba(0,255,136,.45);margin:7px 0 0;border-radius:1px"></div>';

  var wm = '<div style="display:flex;align-items:center;gap:4px;padding:3px 11px">'+
    '<div style="flex:1;height:1px;background:rgba(0,255,136,.15)"></div>'+
    '<div style="font-size:'+fs(5)+';color:rgba(0,255,136,.3);letter-spacing:1.5px">◈ MARKETSAMACHAR.IN</div>'+
    '<div style="flex:1;height:1px;background:rgba(0,255,136,.15)"></div>'+
  '</div>';

  var footer = '<div style="background:rgba(0,255,136,.03);border-top:1px solid rgba(0,255,136,.1);padding:6px 11px;flex-shrink:0">'+
    '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">'+
      '<span style="font-size:'+fs(5)+';background:rgba(59,158,255,.1);border:1px solid rgba(59,158,255,.2);color:#3b9eff;border-radius:2px;padding:1px 5px">ℹ️ NOT INVESTMENT ADVICE · FOR INFO ONLY</span>'+
      '<span style="font-size:'+fs(6.5)+';color:#00ff88;letter-spacing:.8px;font-weight:700">marketsamachar.in</span>'+
    '</div>'+
    '<div style="font-size:'+fs(4.5)+';color:#1a3040;line-height:1.4">⚠ Investment in securities market are subject to market risks. Read all related documents carefully before investing.</div>'+
  '</div>';

  // ─── 1:1 SQUARE ────────────────────────────────────────────────────
  if (fmt==="1x1") {
    var summSum1 = summary ? '<div style="font-size:'+fs(8)+';color:#5580aa;line-height:1.5;margin-top:6px;padding:6px 9px;background:rgba(0,255,136,.04);border-left:2px solid rgba(0,255,136,.35);border-radius:0 3px 3px 0">'+esc(summary.slice(0,110))+'</div>' : '';
    return '<div style="width:'+W+'px;height:'+H+'px;background:#07070e;border-radius:6px;display:flex;flex-direction:column;overflow:hidden;font-family:DM Mono,monospace">'+
      header+
      '<div style="padding:8px 11px 4px;flex-shrink:0">'+
        '<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:6px">'+catBadge+extra2ndBadge+'</div>'+
        '<div style="font-size:'+fs(14)+';color:#00ff88;line-height:1.3;font-weight:700;letter-spacing:.3px">'+esc(sTitle)+'</div>'+
        summSum1+divider+
      '</div>'+
      '<div style="padding:4px 11px 0;flex:1;display:flex;flex-direction:column;gap:4px;min-height:0">'+
        '<div style="background:#0d0d1e;border:1px solid #1a1a2e;border-radius:4px;padding:8px;flex:1;overflow:hidden">'+
          '<div style="font-size:'+fs(6)+';color:#334466;letter-spacing:1px;margin-bottom:7px">💡 KEY HIGHLIGHTS</div>'+
          bHtml+
        '</div>'+
        '<div style="flex-shrink:0">'+mktRow1+'</div>'+
      '</div>'+
      wm+footer+
    '</div>';
  }

  // ─── 4:5 PORTRAIT ──────────────────────────────────────────────────
  if (fmt==="4x5") {
    var summSum45 = summary ? '<div style="font-size:'+fs(8)+';color:#5580aa;line-height:1.55;margin-top:6px;padding:6px 9px;background:rgba(0,255,136,.04);border-left:2px solid rgba(0,255,136,.35);border-radius:0 3px 3px 0">'+esc(summary.slice(0,140))+'</div>' : '';
    return '<div style="width:'+W+'px;height:'+H+'px;background:#07070e;border-radius:6px;display:flex;flex-direction:column;overflow:hidden;font-family:DM Mono,monospace">'+
      header+
      '<div style="padding:9px 11px 4px;flex-shrink:0">'+
        '<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:6px">'+catBadge+extra2ndBadge+'</div>'+
        '<div style="font-size:'+fs(15)+';color:#00ff88;line-height:1.3;font-weight:700;letter-spacing:.3px">'+esc(sTitle)+'</div>'+
        summSum45+divider+
      '</div>'+
      '<div style="padding:5px 11px 0;flex:1;display:flex;flex-direction:column;gap:4px;min-height:0">'+
        ipoExtra+
        '<div style="background:#0d0d1e;border:1px solid #1a1a2e;border-radius:4px;padding:8px;flex:1;overflow:hidden">'+
          '<div style="font-size:'+fs(6)+';color:#334466;letter-spacing:1px;margin-bottom:7px">💡 KEY HIGHLIGHTS</div>'+
          bHtml+
        '</div>'+
        '<div style="flex-shrink:0">'+mktRow1+mktRow2+'</div>'+
      '</div>'+
      wm+footer+
    '</div>';
  }

  // ─── 9:16 STORY ────────────────────────────────────────────────────
  var summSum9 = summary ? '<div style="font-size:'+fs(8)+';color:#5580aa;line-height:1.55;margin-top:6px;padding:6px 9px;background:rgba(0,255,136,.04);border-left:2px solid rgba(0,255,136,.35);border-radius:0 3px 3px 0">'+esc(summary.slice(0,160))+'</div>' : '';

  var contextBox = '<div style="background:#0d0d1e;border:1px solid #1a1a2e;border-radius:4px;padding:8px;flex-shrink:0">'+
    '<div style="font-size:'+fs(6)+';color:#334466;letter-spacing:1px;margin-bottom:7px">📌 MARKET CONTEXT — '+dateStr+'</div>'+
    '<div style="display:grid;grid-template-columns:1fr 1fr;gap:4px">'+
      '<div style="background:#070710;border-radius:3px;padding:6px">'+
        '<div style="font-size:'+fs(5.5)+';color:#334466;margin-bottom:2px">🕐 TRADING SESSION</div>'+
        '<div style="font-size:'+fs(8.5)+';color:#00ff88;font-weight:700">NSE/BSE</div>'+
        '<div style="font-size:'+fs(6)+';color:#334466">9:15 – 15:30 IST</div>'+
      '</div>'+
      '<div style="background:#070710;border-radius:3px;padding:6px">'+
        '<div style="font-size:'+fs(5.5)+';color:#334466;margin-bottom:2px">📅 MARKET DATE</div>'+
        '<div style="font-size:'+fs(8.5)+';color:#ffcc44;font-weight:700">'+dateStr+'</div>'+
        '<div style="font-size:'+fs(6)+';color:#334466">NSE/BSE India</div>'+
      '</div>'+
      '<div style="background:#070710;border-radius:3px;padding:6px">'+
        '<div style="font-size:'+fs(5.5)+';color:#334466;margin-bottom:2px">🥇 MCX GOLD</div>'+
        '<div style="font-size:'+fs(8.5)+';color:#ffcc44;font-weight:700">₹92,400</div>'+
        '<div style="font-size:'+fs(6)+';color:#00ff88">▲ 0.31% today</div>'+
      '</div>'+
      '<div style="background:#070710;border-radius:3px;padding:6px">'+
        '<div style="font-size:'+fs(5.5)+';color:#334466;margin-bottom:2px">🛢️ CRUDE OIL</div>'+
        '<div style="font-size:'+fs(8.5)+';color:#ff9f3b;font-weight:700">$82.40</div>'+
        '<div style="font-size:'+fs(6)+';color:#ff4466">▼ 0.65% today</div>'+
      '</div>'+
    '</div>'+
  '</div>';

  return '<div style="width:'+W+'px;height:'+H+'px;background:#07070e;border-radius:6px;display:flex;flex-direction:column;overflow:hidden;font-family:DM Mono,monospace">'+
    header+
    '<div style="padding:9px 11px 4px;flex-shrink:0">'+
      '<div style="display:flex;gap:3px;flex-wrap:wrap;margin-bottom:6px">'+catBadge+extra2ndBadge+'</div>'+
      '<div style="font-size:'+fs(15.5)+';color:#00ff88;line-height:1.3;font-weight:700;letter-spacing:.3px">'+esc(sTitle)+'</div>'+
      summSum9+divider+
    '</div>'+
    '<div style="padding:5px 11px 0;flex:1;display:flex;flex-direction:column;gap:4px;min-height:0">'+
      ipoExtra+
      '<div style="background:#0d0d1e;border:1px solid #1a1a2e;border-radius:4px;padding:8px;flex:1;overflow:hidden">'+
        '<div style="font-size:'+fs(6)+';color:#334466;letter-spacing:1px;margin-bottom:7px">💡 KEY HIGHLIGHTS</div>'+
        bHtml+
      '</div>'+
      contextBox+
      '<div style="flex-shrink:0">'+mktRow1+mktRow2+'</div>'+
    '</div>'+
    wm+footer+
  '</div>';
}

async function downloadCard() {
  if (!_cardArticle) return;
  var btn = document.getElementById("dl-btn");
  btn.disabled = true;
  btn.textContent = "⏳ Rendering…";

  var wrapper = document.createElement("div");
  wrapper.setAttribute("style", "position:fixed;top:-9999px;left:-9999px;z-index:-1");
  wrapper.innerHTML = buildCard(_cardArticle, _cardFmt, _fontScale);
  document.body.appendChild(wrapper);

  try {
    if (typeof html2canvas === "undefined") {
      toast("Downloading via fallback…");
      var svgEl = wrapper.firstElementChild;
      var xml = new XMLSerializer().serializeToString(svgEl);
      var blob = new Blob([wrapper.innerHTML], {type:"text/html"});
      var url  = URL.createObjectURL(blob);
      var a    = document.createElement("a");
      a.href = url; a.download = "ms-card-"+_cardFmt+".html"; a.click();
      URL.revokeObjectURL(url);
      toast("Saved as HTML (open in browser to screenshot)");
    } else {
      var cardEl = wrapper.firstElementChild;
      var canvas = await html2canvas(cardEl, {
        scale:3, useCORS:true, allowTaint:true,
        backgroundColor:"#07070e", logging:false
      });
      var link = document.createElement("a");
      var safe = (_cardArticle.title||"card").slice(0,30).replace(/[^a-z0-9]/gi,"-").toLowerCase();
      link.download = "ms-"+_cardFmt+"-"+safe+".png";
      link.href = canvas.toDataURL("image/png");
      link.click();
      toast("Card downloaded at 1080px!");
    }
  } catch(ex) {
    toast("Download failed: "+ex.message, "err");
  } finally {
    document.body.removeChild(wrapper);
    btn.disabled = false;
    btn.textContent = "⬇ Download PNG";
  }
}

document.getElementById("card-overlay").addEventListener("click", function(e) {
  if (e.target === this) closeCardModal();
});

loadSection("overview");
</script>
</body>
</html>`;
}
