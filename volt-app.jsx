import React, { useState, useEffect, useRef } from "react";

/* =========================================================
   VOLT — inventory · sales · income
   One connected app: PIN lock, saved data, live pages.
   Data persists via window.storage (survives refresh).
========================================================= */

const STORE_KEY = "volt-app-data";

const defaultDb = {
  pinHash: null,
  settings: { storeName: "VOLT ELECTRONICS", currency: "USD", openingCash: 0 },
  products: [],
  transactions: [], // {id, type:'income'|'expense', reason, amount, profit?, iso, auto}
  debts: [],        // {id, direction:'owe'|'owed', name, amount, due}
};

/* ---------- helpers ---------- */
const fmt = (n, cur) => Number(n || 0).toLocaleString("en-US", { style: "currency", currency: cur || "USD" });

async function hashPin(pin) {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode("volt::" + pin));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

const nowIso = () => new Date().toISOString();
const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();
const timeLabel = (iso) => {
  const d = new Date(iso);
  const t = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (isToday(iso)) return `Today, ${t}`;
  const yest = new Date(); yest.setDate(yest.getDate() - 1);
  if (d.toDateString() === yest.toDateString()) return `Yesterday, ${t}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + `, ${t}`;
};

async function loadDb() {
  try {
    const r = await window.storage.get(STORE_KEY);
    return r ? { ...defaultDb, ...JSON.parse(r.value) } : null;
  } catch { return null; }
}
async function saveDb(db) {
  try { await window.storage.set(STORE_KEY, JSON.stringify(db)); } catch (e) { console.error("save failed", e); }
}

function useAnimatedNumber(target, duration = 550) {
  const [display, setDisplay] = useState(target);
  const prev = useRef(target);
  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce) { setDisplay(target); prev.current = target; return; }
    const from = prev.current; prev.current = target;
    if (from === target) return;
    const start = performance.now(); let raf;
    const step = (now) => {
      const t = Math.min((now - start) / duration, 1);
      setDisplay(from + (target - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return display;
}

/* =========================================================
   APP SHELL
========================================================= */
export default function VoltApp() {
  const [phase, setPhase] = useState("splash"); // splash | setup | lock | app
  const [splashOut, setSplashOut] = useState(false);
  const [db, setDb] = useState(null);
  const [tab, setTab] = useState("home");
  const [showSettings, setShowSettings] = useState(false);
  const dirty = useRef(false);

  // boot: splash → load data → setup or lock
  useEffect(() => {
    let alive = true;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const boot = async () => {
      const existing = await loadDb();
      if (!alive) return;
      const goto = () => {
        if (!existing || !existing.pinHash) { setDb(existing || { ...defaultDb }); setPhase("setup"); }
        else { setDb(existing); setPhase("lock"); }
      };
      if (reduce) { goto(); return; }
      setTimeout(() => setSplashOut(true), 1800);
      setTimeout(goto, 2400);
    };
    boot();
    return () => { alive = false; };
  }, []);

  // autosave whenever db changes (after unlock/setup)
  useEffect(() => {
    if (!db || phase === "splash" || phase === "lock") return;
    if (!dirty.current) { dirty.current = true; return; } // skip first render
    saveDb(db);
  }, [db, phase]);

  const update = (patch) => setDb((d) => ({ ...d, ...patch }));

  /* ---------- shared mutations ---------- */
  const addTransaction = (t) =>
    update({ transactions: [{ id: Date.now(), iso: nowIso(), auto: false, ...t }, ...db.transactions] });

  const recordSale = (product) => {
    const products = db.products.map((p) =>
      p.id === product.id ? { ...p, qty: p.qty - 1 } : p
    );
    const transactions = [
      { id: Date.now(), type: "income", reason: `Sold ${product.name}`, amount: product.price, profit: product.price - product.cost, iso: nowIso(), auto: true },
      ...db.transactions,
    ];
    setDb({ ...db, products, transactions });
  };

  if (phase === "splash" || !db && phase !== "setup") {
    return (
      <Shell>
        <Splash out={splashOut} name="VOLT ELECTRONICS" />
      </Shell>
    );
  }
  if (phase === "setup") return <Shell><Setup db={db || defaultDb} onDone={(newDb) => { setDb(newDb); saveDb(newDb); setPhase("app"); }} /></Shell>;
  if (phase === "lock") return <Shell><Lock db={db} onUnlock={() => setPhase("app")} /></Shell>;

  const cur = db.settings.currency;

  return (
    <Shell>
      <header className="hdr">
        <div>
          <div className="store">{db.settings.storeName}</div>
          <div className="date">{new Date().toLocaleDateString([], { weekday: "long", month: "long", day: "numeric" })}</div>
        </div>
        <div className="hbtns">
          <button className="iconbtn" onClick={() => setShowSettings(true)} aria-label="Settings">⚙</button>
          <button className="iconbtn" onClick={() => setPhase("lock")} aria-label="Lock app">🔒</button>
        </div>
      </header>

      <div className="content" key={tab}>
        {tab === "home" && <Home db={db} update={update} cur={cur} addTransaction={addTransaction} />}
        {tab === "scan" && <Scan db={db} setDb={setDb} cur={cur} recordSale={recordSale} />}
        {tab === "money" && <Money db={db} addTransaction={addTransaction} update={update} cur={cur} />}
        {tab === "stock" && <Stock db={db} update={update} cur={cur} />}
      </div>

      <nav className="nav">
        {[["home", "🏠", "Home"], ["scan", "📷", "Scan"], ["money", "💵", "Money"], ["stock", "📦", "Stock"]].map(([id, ic, label]) => (
          <button key={id} className={`navbtn ${tab === id ? "on" : ""}`} onClick={() => setTab(id)}>
            <span className="navic">{ic}</span>{label}
          </button>
        ))}
      </nav>

      {showSettings && <Settings db={db} update={update} close={() => setShowSettings(false)} />}
    </Shell>
  );
}

const Shell = ({ children }) => (
  <div className="page"><style>{css}</style><div className="wash" />{children}</div>
);

/* =========================================================
   SPLASH
========================================================= */
function Splash({ out, name }) {
  const [a, b] = name.split(" ");
  return (
    <div className={`splash ${out ? "bye" : ""}`}>
      <div className="logo">
        {a.split("").map((ch, i) => <span className="lt bolt" style={{ animationDelay: `${0.15 + i * 0.09}s` }} key={"a" + i}>{ch}</span>)}
        <span className="lt" style={{ animationDelay: "0.55s" }}>&nbsp;</span>
        {(b || "").split("").map((ch, i) => <span className="lt" style={{ animationDelay: `${0.62 + i * 0.05}s` }} key={"b" + i}>{ch}</span>)}
      </div>
      <div className="underline" />
      <div className="tagline">inventory · sales · income</div>
    </div>
  );
}

/* =========================================================
   SETUP (first run) & LOCK
========================================================= */
function Setup({ db, onDone }) {
  const [name, setName] = useState(db.settings.storeName);
  const [currency, setCurrency] = useState(db.settings.currency);
  const [cash, setCash] = useState("");
  const [pin, setPin] = useState("");
  const [pin2, setPin2] = useState("");
  const [err, setErr] = useState("");

  const go = async () => {
    if (!name.trim()) { setErr("Give your store a name."); return; }
    if (pin.length < 4) { setErr("PIN must be at least 4 digits."); return; }
    if (pin !== pin2) { setErr("PINs don't match — try again."); return; }
    const pinHash = await hashPin(pin);
    onDone({
      ...db,
      pinHash,
      settings: { storeName: name.trim().toUpperCase(), currency, openingCash: Number(cash) || 0 },
    });
  };

  return (
    <div className="center">
      <div className="card authcard rise-now">
        <div className="shead">Welcome 👋 Let's set up your store</div>
        <div className="fcol">
          <label>Store name<input value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label>Currency
            <select value={currency} onChange={(e) => setCurrency(e.target.value)}>
              <option value="USD">USD ($)</option><option value="ZMW">ZMW (K)</option>
              <option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option>
              <option value="ZAR">ZAR (R)</option>
            </select>
          </label>
          <label>Cash you're starting with<input value={cash} onChange={(e) => setCash(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" placeholder="0.00" /></label>
          <label>Create a PIN (4+ digits)<input type="password" value={pin} onChange={(e) => setPin(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" maxLength={8} /></label>
          <label>Confirm PIN<input type="password" value={pin2} onChange={(e) => setPin2(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" maxLength={8} onKeyDown={(e) => e.key === "Enter" && go()} /></label>
        </div>
        {err && <div className="err">{err}</div>}
        <button className="btn big" onClick={go}>Open my store</button>
        <div className="note">Your PIN keeps casual snoopers out of the app on this device. For a live business version with staff accounts and bank-level security, that's a server-side build — this gets you protected while you test.</div>
      </div>
    </div>
  );
}

function Lock({ db, onUnlock }) {
  const [pin, setPin] = useState("");
  const [err, setErr] = useState("");
  const [shake, setShake] = useState(false);

  const tryPin = async (val) => {
    const h = await hashPin(val);
    if (h === db.pinHash) { onUnlock(); }
    else {
      setErr("Wrong PIN"); setPin(""); setShake(true);
      setTimeout(() => setShake(false), 450);
    }
  };

  const onChange = (e) => {
    const v = e.target.value.replace(/[^0-9]/g, "");
    setPin(v); setErr("");
    if (v.length >= 4) { /* wait for enter or button */ }
  };

  return (
    <div className="center">
      <div className={`card authcard rise-now ${shake ? "shake" : ""}`}>
        <div className="store" style={{ textAlign: "center", marginBottom: 6 }}>{db.settings.storeName}</div>
        <div className="shead" style={{ textAlign: "center" }}>Enter your PIN</div>
        <input
          className="pinin"
          type="password"
          value={pin}
          onChange={onChange}
          onKeyDown={(e) => e.key === "Enter" && pin.length >= 4 && tryPin(pin)}
          inputMode="numeric"
          maxLength={8}
          autoFocus
          placeholder="••••"
        />
        {err && <div className="err" style={{ textAlign: "center" }}>{err}</div>}
        <button className="btn big" onClick={() => tryPin(pin)} disabled={pin.length < 4}>Unlock</button>
      </div>
    </div>
  );
}

/* =========================================================
   HOME
========================================================= */
function Home({ db, update, cur, addTransaction }) {
  const { transactions, products, debts, settings } = db;
  const totalIn = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = Number(settings.openingCash) + totalIn - totalOut;
  const animBalance = useAnimatedNumber(balance);
  const todayProfit = transactions.filter((t) => t.auto && isToday(t.iso)).reduce((s, t) => s + (t.profit || 0), 0);
  const stockValue = products.reduce((s, p) => s + p.cost * p.qty, 0);
  const low = products.filter((p) => p.qty <= p.alertAt);
  const owe = debts.filter((d) => d.direction === "owe");
  const owed = debts.filter((d) => d.direction === "owed");
  const recentSales = transactions.filter((t) => t.auto).slice(0, 5);

  const [addingDebt, setAddingDebt] = useState(null); // 'owe' | 'owed' | null
  const [dName, setDName] = useState(""); const [dAmt, setDAmt] = useState(""); const [dDue, setDDue] = useState("");

  const saveDebt = () => {
    if (!dName.trim() || !Number(dAmt)) return;
    update({ debts: [...debts, { id: Date.now(), direction: addingDebt, name: dName.trim(), amount: Number(dAmt), due: dDue }] });
    setAddingDebt(null); setDName(""); setDAmt(""); setDDue("");
  };

  const settleDebt = (d) => {
    update({ debts: debts.filter((x) => x.id !== d.id) });
    addTransaction(
      d.direction === "owe"
        ? { type: "expense", reason: `Paid ${d.name}`, amount: d.amount }
        : { type: "income", reason: `${d.name} paid you`, amount: d.amount }
    );
  };

  return (
    <div className="stack">
      <section className="hero rise-now">
        <div className="klabel">Cash on hand</div>
        <div className="hero-num">{fmt(animBalance, cur)}</div>
        <div className="hero-sub">Today's profit <span className="teal b">+{fmt(todayProfit, cur)}</span></div>
      </section>

      <div className="grid3">
        <div className="card slim">
          <div className="klabel">You owe</div>
          <div className="knum red">{fmt(owe.reduce((s, d) => s + d.amount, 0), cur)}</div>
        </div>
        <div className="card slim">
          <div className="klabel">Owed to you</div>
          <div className="knum teal">{fmt(owed.reduce((s, d) => s + d.amount, 0), cur)}</div>
        </div>
        <div className="card slim">
          <div className="klabel">Stock value</div>
          <div className="knum">{fmt(stockValue, cur)}</div>
        </div>
      </div>

      <div className="card">
        <div className="sheadrow">
          <div className="shead">Payments you owe</div>
          <button className="tinybtn" onClick={() => setAddingDebt("owe")}>＋ Add</button>
        </div>
        {owe.length === 0 && <div className="note">Nothing owed. 🌿</div>}
        {owe.map((d) => (
          <div className="row" key={d.id}>
            <div><div className="rname">{d.name}</div>{d.due && <div className="rsub">Due {d.due}</div>}</div>
            <div className="rright">
              <div className="ramt red">{fmt(d.amount, cur)}</div>
              <button className="tinybtn" onClick={() => settleDebt(d)}>Paid ✓</button>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="sheadrow">
          <div className="shead">Money owed to you</div>
          <button className="tinybtn" onClick={() => setAddingDebt("owed")}>＋ Add</button>
        </div>
        {owed.length === 0 && <div className="note">No customer debts.</div>}
        {owed.map((d) => (
          <div className="row" key={d.id}>
            <div><div className="rname">{d.name}</div>{d.due && <div className="rsub">Expected {d.due}</div>}</div>
            <div className="rright">
              <div className="ramt teal">{fmt(d.amount, cur)}</div>
              <button className="tinybtn" onClick={() => settleDebt(d)}>Received ✓</button>
            </div>
          </div>
        ))}
      </div>

      {recentSales.length > 0 && (
        <div className="card">
          <div className="shead">Recent sales</div>
          {recentSales.map((t) => (
            <div className="row" key={t.id}>
              <div><div className="rname">{t.reason.replace("Sold ", "")}</div><div className="rsub">{timeLabel(t.iso)}</div></div>
              <div style={{ textAlign: "right" }}>
                <div className="ramt">{fmt(t.amount, cur)}</div>
                <div className="rsub teal">+{fmt(t.profit || 0, cur)} profit</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {low.length > 0 && (
        <div className="card warn">
          <div className="shead red">Running low</div>
          {low.map((p) => (
            <div className="row" key={p.id}>
              <div className="rname">{p.name}</div>
              <div className="ramt red">{p.qty} left</div>
            </div>
          ))}
        </div>
      )}

      {addingDebt && (
        <Overlay close={() => setAddingDebt(null)}>
          <div className="shead">{addingDebt === "owe" ? "Add a payment you owe" : "Add money owed to you"}</div>
          <div className="fcol">
            <label>{addingDebt === "owe" ? "Who / what" : "Customer"}<input value={dName} onChange={(e) => setDName(e.target.value)} placeholder={addingDebt === "owe" ? "e.g. Supplier, rent…" : "e.g. Customer name"} autoFocus /></label>
            <label>Amount<input value={dAmt} onChange={(e) => setDAmt(e.target.value.replace(/[^0-9.]/g, ""))} inputMode="decimal" /></label>
            <label>Due date (optional)<input value={dDue} onChange={(e) => setDDue(e.target.value)} placeholder="e.g. Jul 20" /></label>
          </div>
          <div className="mrow">
            <button className="btn" onClick={saveDebt}>Save</button>
            <button className="btn ghost" onClick={() => setAddingDebt(null)}>Cancel</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/* =========================================================
   SCAN
========================================================= */
const emptyForm = { barcode: "", name: "", brand: "", category: "", cost: "", price: "", qty: "1", alertAt: "2", supplier: "" };

function Scan({ db, setDb, cur, recordSale }) {
  const [mode, setMode] = useState("sell");
  const [code, setCode] = useState("");
  const [found, setFound] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState("");
  const [flash, setFlash] = useState("");
  const videoRef = useRef(null); const streamRef = useRef(null); const inputRef = useRef(null);

  useEffect(() => () => stopCamera(), []);
  const stopCamera = () => { if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; } setScanning(false); };

  const startCamera = async () => {
    setScanError("");
    if (!("BarcodeDetector" in window)) { setScanError("Camera scanning isn't supported in this browser — type the code, or use a USB scanner (it types for you)."); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setScanning(true);
      const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e", "code_128", "code_39", "qr_code"] });
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) { handleCode(codes[0].rawValue); stopCamera(); return; }
        } catch (e) {}
        if (streamRef.current) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch { setScanError("Couldn't open the camera. Check permissions, or type the code below."); }
  };

  const handleCode = (raw) => {
    const c = raw.trim(); if (!c) return;
    setCode(c); setFlash("");
    const p = db.products.find((x) => x.barcode === c);
    if (p) { setFound(p); setNotFound(false); }
    else { setFound(null); setNotFound(true); setForm({ ...emptyForm, barcode: c }); }
  };

  const doSale = () => {
    if (!found || found.qty < 1) return;
    recordSale(found);
    setFlash(`✓ Sold ${found.name} — ${fmt(found.price, cur)} (+${fmt(found.price - found.cost, cur)} profit)`);
    reset(false);
  };

  const addStock = (n) => {
    if (!found) return;
    setDb({ ...db, products: db.products.map((p) => (p.id === found.id ? { ...p, qty: p.qty + n } : p)) });
    setFlash(`✓ Added ${n} × ${found.name} to stock`);
    reset(false);
  };

  const saveNewProduct = () => {
    if (!form.barcode || !form.name || form.cost === "" || form.price === "") return;
    const prod = {
      id: Date.now(), barcode: form.barcode, name: form.name, brand: form.brand, category: form.category,
      cost: Number(form.cost), price: Number(form.price), qty: Number(form.qty) || 0,
      alertAt: Number(form.alertAt) || 0, supplier: form.supplier,
    };
    setDb({ ...db, products: [prod, ...db.products] });
    setFlash(`✓ ${prod.name} added to inventory (${prod.qty} in)`);
    reset(false);
  };

  const reset = (keepFlash) => {
    setCode(""); setFound(null); setNotFound(false); setForm(emptyForm);
    if (!keepFlash) {} 
    if (inputRef.current) inputRef.current.focus();
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className="stack">
      <div className="mode rise-now">
        <button className={`mbtn ${mode === "sell" ? "on" : ""}`} onClick={() => setMode("sell")}>Sell</button>
        <button className={`mbtn ${mode === "stock" ? "on" : ""}`} onClick={() => setMode("stock")}>Add stock</button>
      </div>

      <section className="scanbox">
        {scanning ? (
          <div className="cam">
            <video ref={videoRef} autoPlay playsInline muted />
            <div className="cam-line" />
            <button className="btn ghost" onClick={stopCamera} style={{ marginTop: 10 }}>Stop camera</button>
          </div>
        ) : (
          <button className="btn big" onClick={startCamera}>📷 Scan with camera</button>
        )}
        {scanError && <div className="err">{scanError}</div>}
        <div className="or">or type / USB-scan the code</div>
        <div className="coderow">
          <input ref={inputRef} className="codein" value={code} placeholder="Barcode number…"
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCode(code)} inputMode="numeric" />
          <button className="btn" onClick={() => handleCode(code)}>Find</button>
        </div>
      </section>

      {flash && <div className="flash">{flash}</div>}

      {found && (
        <section className="card hit">
          <div className="klabel">Product found</div>
          <div className="pname">{found.name}</div>
          <div className="rsub">{found.brand} · {found.category} · {found.barcode}</div>
          <div className="pgrid">
            <div><div className="klabel">Price</div><div className="pv">{fmt(found.price, cur)}</div></div>
            <div><div className="klabel">Profit</div><div className="pv teal">{fmt(found.price - found.cost, cur)}</div></div>
            <div><div className="klabel">In stock</div><div className={`pv ${found.qty <= found.alertAt ? "red" : ""}`}>{found.qty}</div></div>
          </div>
          {mode === "sell" ? (
            found.qty > 0
              ? <button className="btn big" onClick={doSale}>Record sale — {fmt(found.price, cur)}</button>
              : <div className="err">Out of stock — switch to "Add stock" to receive more.</div>
          ) : (
            <div className="mrow">{[1, 5, 10].map((n) => <button key={n} className="btn" onClick={() => addStock(n)}>+{n}</button>)}</div>
          )}
          <button className="link" onClick={() => reset(true)}>Cancel</button>
        </section>
      )}

      {notFound && (
        <section className="card">
          <div className="klabel red">Not in your inventory</div>
          <div className="pname">Add new product</div>
          <div className="fgrid">
            <label>Barcode<input value={form.barcode} onChange={set("barcode")} /></label>
            <label>Product name *<input value={form.name} onChange={set("name")} /></label>
            <label>Brand<input value={form.brand} onChange={set("brand")} /></label>
            <label>Category<input value={form.category} onChange={set("category")} /></label>
            <label>Cost price *<input value={form.cost} onChange={set("cost")} inputMode="decimal" /></label>
            <label>Sale price *<input value={form.price} onChange={set("price")} inputMode="decimal" /></label>
            <label>Quantity<input value={form.qty} onChange={set("qty")} inputMode="numeric" /></label>
            <label>Alert when below<input value={form.alertAt} onChange={set("alertAt")} inputMode="numeric" /></label>
            <label className="wide">Supplier<input value={form.supplier} onChange={set("supplier")} /></label>
          </div>
          {form.cost !== "" && form.price !== "" && (
            <div className="rsub">Profit per unit: <span className="teal b">{fmt(Number(form.price) - Number(form.cost), cur)}</span></div>
          )}
          <div className="mrow">
            <button className="btn" onClick={saveNewProduct}>Save product</button>
            <button className="btn ghost" onClick={() => reset(true)}>Cancel</button>
          </div>
        </section>
      )}
    </div>
  );
}

/* =========================================================
   MONEY
========================================================= */
function Money({ db, addTransaction, update, cur }) {
  const { transactions, settings } = db;
  const [type, setType] = useState("expense");
  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [error, setError] = useState("");
  const reasonRef = useRef(null);

  const totalIn = transactions.filter((t) => t.type === "income").reduce((s, t) => s + t.amount, 0);
  const totalOut = transactions.filter((t) => t.type === "expense").reduce((s, t) => s + t.amount, 0);
  const balance = Number(settings.openingCash) + totalIn - totalOut;
  const animBalance = useAnimatedNumber(balance);
  const animIn = useAnimatedNumber(totalIn);
  const animOut = useAnimatedNumber(totalOut);

  const add = () => {
    const amt = Number(amount);
    if (!reason.trim()) { setError("Add a reason so future-you knows what this was."); return; }
    if (!amt || amt <= 0) { setError("Enter an amount greater than zero."); return; }
    if (type === "expense" && amt > balance) { setError(`That's more than your balance (${fmt(balance, cur)}). Double-check the amount.`); return; }
    setError("");
    addTransaction({ type, reason: reason.trim(), amount: amt });
    setReason(""); setAmount("");
    if (reasonRef.current) reasonRef.current.focus();
  };

  const remove = (id) => update({ transactions: transactions.filter((t) => t.id !== id) });

  return (
    <div className="stack">
      <section className="hero rise-now">
        <div className="klabel">Current balance</div>
        <div className="hero-num">{fmt(animBalance, cur)}</div>
        <div className="hgrid">
          <div><div className="klabel">Money in</div><div className="knum teal">+{fmt(animIn, cur)}</div></div>
          <div><div className="klabel">Money out</div><div className="knum red">−{fmt(animOut, cur)}</div></div>
        </div>
      </section>

      <section className="card">
        <div className="shead">Add a transaction</div>
        <div className="mode">
          <button className={`mbtn ${type === "expense" ? "on-red" : ""}`} onClick={() => setType("expense")}>− Expense</button>
          <button className={`mbtn ${type === "income" ? "on" : ""}`} onClick={() => setType("income")}>＋ Income</button>
        </div>
        <div className="fgrid two">
          <label>Reason<input ref={reasonRef} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder={type === "expense" ? "Rent, transport, supplier…" : "Sold item, owner deposit…"}
            onKeyDown={(e) => e.key === "Enter" && add()} /></label>
          <label>Amount<input value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ""))}
            inputMode="decimal" placeholder="0.00" onKeyDown={(e) => e.key === "Enter" && add()} /></label>
        </div>
        {error && <div className="err">{error}</div>}
        <button className={`btn big ${type === "expense" ? "red-bg" : ""}`} onClick={add}>
          {type === "expense" ? `Record expense${amount ? ` — deducts ${fmt(Number(amount), cur)}` : ""}` : `Record income${amount ? ` — adds ${fmt(Number(amount), cur)}` : ""}`}
        </button>
        <div className="note">Sales from the Scan tab land here automatically.</div>
      </section>

      <section className="card">
        <div className="shead">History</div>
        {transactions.length === 0 && <div className="note">No transactions yet.</div>}
        {transactions.map((t) => (
          <div className="row" key={t.id}>
            <div className="rleft">
              <div className={`dot ${t.type === "income" ? "dteal" : "dred"}`} />
              <div>
                <div className="rname">{t.reason}</div>
                <div className="rsub">{timeLabel(t.iso)}{t.auto ? " · auto from sale" : ""}</div>
              </div>
            </div>
            <div className="rright">
              <div className={`ramt ${t.type === "income" ? "teal" : "red"}`}>{t.type === "income" ? "+" : "−"}{fmt(t.amount, cur)}</div>
              {!t.auto && <button className="del" onClick={() => remove(t.id)} aria-label={`Delete ${t.reason}`}>✕</button>}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

/* =========================================================
   STOCK (inventory)
========================================================= */
function Stock({ db, update, cur }) {
  const { products } = db;
  const [q, setQ] = useState("");
  const [menuFor, setMenuFor] = useState(null);
  const [editing, setEditing] = useState(null);
  const [adjusting, setAdjusting] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [adjQty, setAdjQty] = useState("1");
  const [adjReason, setAdjReason] = useState("damaged");

  const filtered = products.filter((p) => {
    const s = q.toLowerCase();
    return !s || p.name.toLowerCase().includes(s) || (p.brand || "").toLowerCase().includes(s) ||
      (p.category || "").toLowerCase().includes(s) || p.barcode.includes(s);
  });

  const stockValue = products.reduce((s, p) => s + p.cost * p.qty, 0);
  const potentialProfit = products.reduce((s, p) => s + (p.price - p.cost) * p.qty, 0);
  const lowCount = products.filter((p) => p.qty <= p.alertAt).length;

  const saveEdit = () => {
    if (!editing.name || editing.cost === "" || editing.price === "") return;
    update({
      products: products.map((p) => (p.id === editing.id ? {
        ...editing, cost: Number(editing.cost), price: Number(editing.price),
        qty: Number(editing.qty) || 0, alertAt: Number(editing.alertAt) || 0,
      } : p)),
    });
    setEditing(null);
  };

  const eSet = (k) => (ev) => setEditing({ ...editing, [k]: ev.target.value });

  return (
    <div className="stack">
      <div className="grid3 rise-now">
        <div className="card slim"><div className="klabel">Stock value</div><div className="knum">{fmt(stockValue, cur)}</div></div>
        <div className="card slim"><div className="klabel">Profit if all sells</div><div className="knum teal">{fmt(potentialProfit, cur)}</div></div>
        <div className="card slim"><div className="klabel">Low stock</div><div className={`knum ${lowCount ? "red" : ""}`}>{lowCount}</div></div>
      </div>

      <input className="codein" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, brand, category, barcode…" />

      <section className="card">
        {products.length === 0 && <div className="note">No products yet — go to the Scan tab and add your first one. 📦</div>}
        {products.length > 0 && filtered.length === 0 && <div className="note">Nothing matches "{q}".</div>}
        {filtered.map((p) => (
          <button className="prow" key={p.id} onClick={() => setMenuFor(p)}>
            <div className="pinfo">
              <div className="rname">{p.name}</div>
              <div className="rsub">{[p.brand, p.category, p.barcode].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="pnums">
              <div className="pcol"><div className="klabel">Price</div><div className="pv">{fmt(p.price, cur)}</div></div>
              <div className="pcol"><div className="klabel">Stock</div><div className={`pv ${p.qty <= p.alertAt ? "red" : ""}`}>{p.qty}</div></div>
            </div>
            <div className="chev">›</div>
          </button>
        ))}
      </section>

      {menuFor && (
        <Overlay close={() => setMenuFor(null)}>
          <div className="shead">{menuFor.name}</div>
          <div className="rsub" style={{ marginBottom: 14 }}>{fmt(menuFor.price, cur)} · {menuFor.qty} in stock</div>
          <button className="opt" onClick={() => { setEditing({ ...menuFor }); setMenuFor(null); }}>✏️ Edit product <span className="optsub">change price, name, stock, anything</span></button>
          <button className="opt" onClick={() => { setAdjusting(menuFor); setAdjQty("1"); setMenuFor(null); }}>📉 Remove stock <span className="optsub">damaged, lost, or returned items</span></button>
          <button className="opt danger" onClick={() => { setConfirmDelete(menuFor); setMenuFor(null); }}>🗑️ Delete product <span className="optsub">remove it completely</span></button>
          <button className="btn ghost full" onClick={() => setMenuFor(null)}>Cancel</button>
        </Overlay>
      )}

      {editing && (
        <Overlay close={() => setEditing(null)}>
          <div className="shead">Edit product</div>
          <div className="fgrid">
            <label>Product name<input value={editing.name} onChange={eSet("name")} /></label>
            <label>Barcode<input value={editing.barcode} onChange={eSet("barcode")} /></label>
            <label>Brand<input value={editing.brand} onChange={eSet("brand")} /></label>
            <label>Category<input value={editing.category} onChange={eSet("category")} /></label>
            <label>Cost price<input value={editing.cost} onChange={eSet("cost")} inputMode="decimal" /></label>
            <label>Sale price<input value={editing.price} onChange={eSet("price")} inputMode="decimal" /></label>
            <label>Quantity<input value={editing.qty} onChange={eSet("qty")} inputMode="numeric" /></label>
            <label>Alert when below<input value={editing.alertAt} onChange={eSet("alertAt")} inputMode="numeric" /></label>
            <label className="wide">Supplier<input value={editing.supplier || ""} onChange={eSet("supplier")} /></label>
          </div>
          {Number(editing.price) < Number(editing.cost) && (
            <div className="err">⚠ Sale price is below cost — you'd lose {fmt(Number(editing.cost) - Number(editing.price), cur)} per unit.</div>
          )}
          <div className="mrow">
            <button className="btn" onClick={saveEdit}>Save changes</button>
            <button className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </Overlay>
      )}

      {confirmDelete && (
        <Overlay>
          <div className="shead red">Delete "{confirmDelete.name}"?</div>
          <div className="note">This removes the product and its {confirmDelete.qty} units from inventory. This can't be undone.</div>
          <div className="mrow">
            <button className="btn red-bg" onClick={() => { update({ products: products.filter((p) => p.id !== confirmDelete.id) }); setConfirmDelete(null); }}>Yes, delete it</button>
            <button className="btn ghost" onClick={() => setConfirmDelete(null)}>Keep it</button>
          </div>
        </Overlay>
      )}

      {adjusting && (
        <Overlay close={() => setAdjusting(null)}>
          <div className="shead">Remove stock — {adjusting.name}</div>
          <div className="note">For items gone but NOT sold — damaged, lost, stolen, or returned. Keeps your sales numbers honest.</div>
          <div className="fgrid two">
            <label>How many<input value={adjQty} onChange={(e) => setAdjQty(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" /></label>
            <label>Reason
              <select value={adjReason} onChange={(e) => setAdjReason(e.target.value)}>
                <option value="damaged">Damaged</option><option value="lost">Lost / missing</option>
                <option value="stolen">Stolen</option><option value="returned">Returned to supplier</option>
                <option value="personal">Owner took it</option>
              </select>
            </label>
          </div>
          <div className="note">Stock after: <b>{Math.max(0, adjusting.qty - (Number(adjQty) || 0))}</b> · Written off: <b className="red">{fmt(adjusting.cost * (Number(adjQty) || 0), cur)}</b></div>
          <div className="mrow">
            <button className="btn red-bg" onClick={() => {
              const n = Number(adjQty); if (!n) return;
              update({ products: products.map((p) => (p.id === adjusting.id ? { ...p, qty: Math.max(0, p.qty - n) } : p)) });
              setAdjusting(null);
            }}>Remove {adjQty || 0} from stock</button>
            <button className="btn ghost" onClick={() => setAdjusting(null)}>Cancel</button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

/* =========================================================
   SETTINGS
========================================================= */
function Settings({ db, update, close }) {
  const [s, setS] = useState({ ...db.settings, openingCash: String(db.settings.openingCash) });
  const [newPin, setNewPin] = useState("");
  const [pinMsg, setPinMsg] = useState("");

  const save = () => {
    update({ settings: { ...s, storeName: s.storeName.toUpperCase(), openingCash: Number(s.openingCash) || 0 } });
    close();
  };

  const changePin = async () => {
    if (newPin.length < 4) { setPinMsg("PIN must be at least 4 digits."); return; }
    update({ pinHash: await hashPin(newPin) });
    setNewPin(""); setPinMsg("✓ PIN changed.");
  };

  return (
    <Overlay close={close}>
      <div className="shead">Store settings</div>
      <div className="fcol">
        <label>Store name<input value={s.storeName} onChange={(e) => setS({ ...s, storeName: e.target.value })} /></label>
        <label>Currency
          <select value={s.currency} onChange={(e) => setS({ ...s, currency: e.target.value })}>
            <option value="USD">USD ($)</option><option value="ZMW">ZMW (K)</option>
            <option value="EUR">EUR (€)</option><option value="GBP">GBP (£)</option>
            <option value="ZAR">ZAR (R)</option>
          </select>
        </label>
        <label>Opening cash<input value={s.openingCash} onChange={(e) => setS({ ...s, openingCash: e.target.value.replace(/[^0-9.]/g, "") })} inputMode="decimal" /></label>
        <label>Change PIN<input type="password" value={newPin} onChange={(e) => setNewPin(e.target.value.replace(/[^0-9]/g, ""))} inputMode="numeric" maxLength={8} placeholder="New PIN (4+ digits)" /></label>
      </div>
      {pinMsg && <div className="note b">{pinMsg}</div>}
      <div className="mrow">
        <button className="btn" onClick={save}>Save settings</button>
        <button className="btn ghost" onClick={changePin}>Update PIN</button>
        <button className="btn ghost" onClick={close}>Close</button>
      </div>
    </Overlay>
  );
}

/* ---------- shared overlay ---------- */
const Overlay = ({ children, close }) => (
  <div className="overlay" onClick={(e) => close && e.target === e.currentTarget && close()}>
    <div className="modal">{children}</div>
  </div>
);

/* =========================================================
   STYLES
========================================================= */
const css = `
@import url('https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; }

.page {
  font-family: 'Outfit', system-ui, sans-serif;
  background: #FFFFFF; color: #16232B;
  min-height: 100vh; padding: 20px 18px 90px;
  max-width: 760px; margin: 0 auto; position: relative;
}
.wash {
  position: fixed; top: -180px; left: 50%; transform: translateX(-50%);
  width: 900px; height: 420px; border-radius: 50%;
  background: radial-gradient(closest-side, rgba(47,158,68,0.10), transparent);
  pointer-events: none;
}

/* splash */
.splash {
  position: fixed; inset: 0; z-index: 60;
  background: radial-gradient(700px 420px at 50% 35%, rgba(47,158,68,0.10), transparent 70%), #FFFFFF;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  transition: opacity .6s ease, transform .6s ease;
}
.splash.bye { opacity: 0; transform: scale(1.04); pointer-events: none; }
.logo { font-weight: 800; letter-spacing: 0.22em; font-size: clamp(26px, 6vw, 44px); color: #16232B; display: flex; overflow: hidden; }
.lt { display: inline-block; opacity: 0; transform: translateY(0.9em); animation: ltUp .55s cubic-bezier(.22,.9,.3,1) forwards; }
.lt.bolt { color: #2F9E44; }
@keyframes ltUp { to { opacity: 1; transform: none; } }
.underline {
  height: 3px; width: 0; margin-top: 14px; border-radius: 3px;
  background: linear-gradient(90deg, #45C05F, #2F9E44);
  box-shadow: 0 0 16px rgba(47,158,68,0.5);
  animation: grow .7s cubic-bezier(.22,.9,.3,1) 1.1s forwards;
}
@keyframes grow { to { width: min(320px, 60vw); } }
.tagline { margin-top: 14px; font-size: 12.5px; letter-spacing: 0.3em; text-transform: uppercase; color: #7C8B94; font-weight: 600; opacity: 0; animation: fadeIn .6s ease 1.4s forwards; }
@keyframes fadeIn { to { opacity: 1; } }

/* auth */
.center { min-height: 80vh; display: flex; align-items: center; justify-content: center; position: relative; }
.authcard { width: 100%; max-width: 420px; }
.pinin {
  width: 100%; text-align: center; letter-spacing: 0.5em;
  font-family: inherit; font-size: 26px; font-weight: 800;
  padding: 14px; border-radius: 12px; border: 1.5px solid #D6E0E4; margin: 12px 0;
}
.pinin:focus { outline: none; border-color: #2F9E44; box-shadow: 0 0 0 3px rgba(47,158,68,0.15); }
.shake { animation: shake .4s ease; }
@keyframes shake { 20% { transform: translateX(-8px); } 45% { transform: translateX(7px); } 70% { transform: translateX(-4px); } 90% { transform: translateX(3px); } }

/* header + nav */
.hdr { display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px; position: relative; }
.store { font-weight: 700; letter-spacing: 0.16em; font-size: 15px; color: #2F9E44; }
.date { font-size: 13px; color: #7C8B94; margin-top: 2px; }
.hbtns { display: flex; gap: 8px; }
.iconbtn {
  border: 1.5px solid #E5EBEE; background: white; border-radius: 10px;
  width: 40px; height: 40px; font-size: 17px; cursor: pointer;
  transition: transform .15s ease, border-color .15s ease;
}
.iconbtn:hover { border-color: #2F9E44; }
.iconbtn:active { transform: scale(0.94); }
.iconbtn:focus-visible { outline: 3px solid #B7E8C3; outline-offset: 2px; }

.nav {
  position: fixed; bottom: 0; left: 0; right: 0; z-index: 30;
  display: flex; justify-content: center; gap: 4px;
  background: rgba(255,255,255,0.92); backdrop-filter: blur(10px);
  border-top: 1px solid #E5EBEE; padding: 8px 10px calc(8px + env(safe-area-inset-bottom));
}
.navbtn {
  flex: 1; max-width: 130px; border: none; background: none; font-family: inherit;
  font-size: 11.5px; font-weight: 700; color: #7C8B94; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; gap: 3px;
  padding: 7px 4px; border-radius: 12px; transition: background .2s ease, color .2s ease;
}
.navic { font-size: 20px; }
.navbtn.on { color: #2F9E44; background: rgba(47,158,68,0.09); }
.navbtn:focus-visible { outline: 3px solid #B7E8C3; outline-offset: 2px; }

/* content */
.content { position: relative; animation: tabIn .35s cubic-bezier(.22,.9,.35,1); }
@keyframes tabIn { 0% { opacity: 0; transform: translateY(10px); } 100% { opacity: 1; transform: none; } }
.stack { display: flex; flex-direction: column; gap: 14px; }
.rise-now { animation: tabIn .45s cubic-bezier(.22,.9,.35,1); }

/* hero */
.hero {
  background: linear-gradient(165deg, rgba(47,158,68,0.07), rgba(47,158,68,0.02) 65%), #FFFFFF;
  border: 1px solid rgba(47,158,68,0.18); border-radius: 20px;
  padding: 24px; box-shadow: 0 10px 34px rgba(22,40,50,0.06);
}
.hero-num { font-size: clamp(36px, 8vw, 52px); font-weight: 800; font-variant-numeric: tabular-nums; letter-spacing: -0.02em; line-height: 1.1; }
.hero-sub { margin-top: 8px; font-size: 14px; color: #6C8791; }
.hgrid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-top: 14px; max-width: 360px; }

/* cards, grids */
.grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 12px; }
.card {
  background: #FFFFFF; border: 1px solid #E5EBEE; border-radius: 16px;
  padding: 16px 18px; box-shadow: 0 3px 14px rgba(22,40,50,0.05); position: relative;
}
.card.slim { padding: 14px 16px; }
.card.warn { border-color: rgba(220,61,67,0.35); background: #FFF7F7; }
.card.hit { border-top: 3px solid #2F9E44; }

.klabel { font-size: 11px; letter-spacing: 0.16em; text-transform: uppercase; color: #7C8B94; font-weight: 600; margin-bottom: 4px; }
.knum { font-size: 20px; font-weight: 800; font-variant-numeric: tabular-nums; }
.teal { color: #2F9E44; } .red { color: #DC3D43; } .b { font-weight: 800; }

.shead { font-size: 15.5px; font-weight: 800; margin-bottom: 8px; color: #24343D; }
.shead.red { color: #C92F35; }
.sheadrow { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
.sheadrow .shead { margin-bottom: 0; }

/* rows */
.row {
  display: flex; justify-content: space-between; align-items: center;
  padding: 10px 0; border-top: 1px solid #EEF3F5; gap: 10px;
  animation: slideIn .4s cubic-bezier(.22,.9,.35,1);
}
.row:first-of-type { border-top: none; }
@keyframes slideIn { 0% { opacity: 0; transform: translateX(-14px); } 100% { opacity: 1; transform: none; } }
.rleft { display: flex; align-items: center; gap: 11px; }
.rright { display: flex; align-items: center; gap: 10px; }
.dot { width: 9px; height: 9px; border-radius: 50%; flex-shrink: 0; }
.dteal { background: #2F9E44; } .dred { background: #DC3D43; }
.rname { font-size: 14.5px; font-weight: 600; }
.rsub { font-size: 12.5px; color: #8B99A1; font-weight: 500; }
.rsub.teal { color: #2F9E44; font-weight: 600; }
.ramt { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.ramt.teal { color: #2F9E44; } .ramt.red { color: #DC3D43; }

/* product rows */
.prow {
  display: flex; align-items: center; gap: 14px; padding: 13px 10px;
  border-top: 1px solid #EEF3F5; flex-wrap: wrap;
  animation: slideIn .4s cubic-bezier(.22,.9,.35,1);
  transition: background .2s ease; border-radius: 10px;
  background: none; border-left: none; border-right: none; border-bottom: none;
  width: 100%; text-align: left; font-family: inherit; color: inherit; cursor: pointer;
}
.prow:hover { background: rgba(47,158,68,0.05); }
.prow:active { background: rgba(47,158,68,0.09); }
.prow:focus-visible { outline: 3px solid #B7E8C3; outline-offset: -3px; }
.prow:first-of-type { border-top: none; }
.pinfo { flex: 1; min-width: 160px; }
.pnums { display: flex; gap: 18px; }
.pcol { text-align: right; }
.pv { font-size: 15px; font-weight: 800; font-variant-numeric: tabular-nums; }
.pv.red { color: #DC3D43; }
.chev { font-size: 22px; color: #B9C5CB; font-weight: 700; }
.pname { font-size: 20px; font-weight: 800; }
.pgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(85px, 1fr)); gap: 12px; margin: 14px 0; }

/* scan */
.scanbox {
  background: linear-gradient(165deg, rgba(47,158,68,0.07), rgba(47,158,68,0.02) 65%), #FFFFFF;
  border: 1px solid rgba(47,158,68,0.18); border-radius: 20px;
  padding: 22px; text-align: center; box-shadow: 0 10px 34px rgba(22,40,50,0.06);
}
.cam { position: relative; }
.cam video { width: 100%; max-height: 280px; border-radius: 14px; object-fit: cover; background: #0F1B20; }
.cam-line { position: absolute; left: 8%; right: 8%; top: 45%; height: 2px; background: #45C05F; box-shadow: 0 0 12px #45C05F; border-radius: 2px; }
.or { font-size: 12.5px; color: #8B99A1; margin: 13px 0 8px; letter-spacing: 0.05em; }
.coderow { display: flex; gap: 8px; }
.codein {
  flex: 1; width: 100%; font-family: inherit; font-size: 16px; font-weight: 600;
  padding: 13px 15px; border-radius: 12px; border: 1.5px solid #D6E0E4; color: #16232B;
  letter-spacing: 0.04em;
}
.codein:focus { outline: none; border-color: #2F9E44; box-shadow: 0 0 0 3px rgba(47,158,68,0.15); }
.flash {
  background: rgba(47,158,68,0.1); border: 1px solid rgba(47,158,68,0.35);
  color: #257D3B; font-size: 14px; font-weight: 700; border-radius: 12px; padding: 12px 15px;
  animation: tabIn .35s ease;
}

/* mode toggle */
.mode { display: flex; background: #EEF3F5; border-radius: 12px; padding: 4px; }
.mbtn { flex: 1; border: none; background: transparent; font-family: inherit; font-weight: 700; font-size: 14.5px; padding: 10px; border-radius: 9px; cursor: pointer; color: #5E7C86; transition: background .2s ease; }
.mbtn.on { background: #2F9E44; color: white; box-shadow: 0 3px 10px rgba(47,158,68,0.3); }
.mbtn.on-red { background: #DC3D43; color: white; box-shadow: 0 3px 10px rgba(220,61,67,0.3); }
.mbtn:focus-visible { outline: 3px solid #B7E8C3; outline-offset: 2px; }

/* buttons */
.btn {
  background: linear-gradient(135deg, #45C05F, #2F9E44); color: white; border: none;
  border-radius: 12px; padding: 13px 20px; font-size: 15px; font-weight: 700;
  cursor: pointer; font-family: inherit;
  box-shadow: 0 6px 20px rgba(47,158,68,0.30);
  transition: transform .15s cubic-bezier(.22,.9,.35,1);
}
.btn:active { transform: scale(0.97); }
.btn:disabled { opacity: 0.5; cursor: default; }
.btn:focus-visible { outline: 3px solid #B7E8C3; outline-offset: 2px; }
.btn.big { width: 100%; padding: 15px; font-size: 16px; margin-top: 12px; }
.btn.ghost { background: white; color: #2F9E44; border: 1.5px solid #2F9E44; box-shadow: none; }
.btn.red-bg { background: linear-gradient(135deg, #E5555B, #DC3D43); box-shadow: 0 6px 20px rgba(220,61,67,0.30); }
.btn.full { width: 100%; margin-top: 4px; }

.tinybtn {
  border: 1.5px solid #2F9E44; background: white; color: #2F9E44;
  font-family: inherit; font-weight: 700; font-size: 12.5px;
  border-radius: 8px; padding: 6px 11px; cursor: pointer;
  transition: transform .15s ease, background .15s ease;
}
.tinybtn:hover { background: rgba(47,158,68,0.08); }
.tinybtn:active { transform: scale(0.95); }
.tinybtn:focus-visible { outline: 3px solid #B7E8C3; outline-offset: 2px; }

.link { background: none; border: none; font-family: inherit; font-size: 13.5px; font-weight: 700; cursor: pointer; text-decoration: underline; padding: 6px; color: #7C8B94; margin-top: 8px; }
.del { border: none; background: #F2F5F7; color: #8B99A1; border-radius: 8px; width: 28px; height: 28px; cursor: pointer; font-size: 12px; font-weight: 700; }
.del:hover { background: #FFE9EA; color: #DC3D43; }
.del:focus-visible { outline: 3px solid #B7E8C3; outline-offset: 2px; }

.note { font-size: 13px; color: #8B99A1; margin-top: 10px; font-weight: 500; line-height: 1.5; }
.err {
  margin-top: 10px; background: #FFF7F7; border: 1px solid rgba(220,61,67,0.35);
  color: #C92F35; font-size: 13.5px; font-weight: 600; border-radius: 10px; padding: 10px 14px;
}

/* forms */
.fgrid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin: 12px 0; }
.fgrid.two { grid-template-columns: 1fr 140px; }
@media (max-width: 460px) { .fgrid.two { grid-template-columns: 1fr; } }
.fcol { display: flex; flex-direction: column; gap: 12px; margin: 12px 0; }
.fgrid label, .fcol label { font-size: 12px; font-weight: 700; color: #5E7C86; display: flex; flex-direction: column; gap: 5px; }
.fgrid label.wide { grid-column: 1 / -1; }
.fgrid input, .fgrid select, .fcol input, .fcol select {
  font-family: inherit; font-size: 15px; font-weight: 500; padding: 11px 13px;
  border-radius: 10px; border: 1.5px solid #D6E0E4; color: #16232B; background: white;
}
.fgrid input:focus, .fgrid select:focus, .fcol input:focus, .fcol select:focus {
  outline: none; border-color: #2F9E44; box-shadow: 0 0 0 3px rgba(47,158,68,0.15);
}
.mrow { display: flex; gap: 10px; margin-top: 14px; flex-wrap: wrap; align-items: center; }

/* modal */
.overlay {
  position: fixed; inset: 0; z-index: 40;
  background: rgba(15, 30, 22, 0.45);
  display: flex; align-items: center; justify-content: center; padding: 18px;
  animation: fadeIn .25s ease; backdrop-filter: blur(3px);
}
.modal {
  background: white; border-radius: 18px; padding: 22px;
  width: 100%; max-width: 520px; max-height: 88vh; overflow-y: auto;
  animation: popUp .35s cubic-bezier(.22,.9,.35,1);
  box-shadow: 0 24px 60px rgba(10, 25, 15, 0.25);
}
@keyframes popUp { 0% { opacity: 0; transform: translateY(22px) scale(.97); } 100% { opacity: 1; transform: none; } }

.opt {
  display: flex; flex-direction: column; align-items: flex-start; gap: 2px;
  width: 100%; text-align: left; font-family: inherit; cursor: pointer;
  background: #F6F9F7; border: 1.5px solid #E5EBEE; border-radius: 12px;
  padding: 13px 15px; font-size: 15px; font-weight: 700; color: #16232B;
  margin-bottom: 9px; transition: transform .15s ease, background .15s ease, border-color .15s ease;
}
.opt:hover { background: rgba(47,158,68,0.07); border-color: #2F9E44; }
.opt:active { transform: scale(0.98); }
.opt:focus-visible { outline: 3px solid #B7E8C3; outline-offset: 2px; }
.opt.danger { color: #C92F35; }
.opt.danger:hover { background: #FFF1F1; border-color: #DC3D43; }
.optsub { font-size: 12px; font-weight: 500; color: #8B99A1; }

@media (prefers-reduced-motion: reduce) {
  .splash { display: none; }
  .lt, .underline, .tagline, .row, .prow, .content, .rise-now, .flash { animation: none !important; opacity: 1; transform: none; }
  .btn, .tinybtn, .iconbtn, .mbtn, .opt { transition: none; }
  .overlay, .modal { animation: none; }
  .shake { animation: none; }
}
`;
