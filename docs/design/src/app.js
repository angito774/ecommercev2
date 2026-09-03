/* ============================================================================
   NEXBYTE — app.js
   Motion (motion.dev) · carrito · buscador · tema · render de catálogo
   ============================================================================ */

/* ─────────── 1. MOTION: import con degradación elegante ─────────── */
let M = null;
try {
  M = await import("https://cdn.jsdelivr.net/npm/motion@11.18.2/+esm");
} catch (e) {
  console.warn("[nexbyte] Motion no disponible — la web funciona sin animaciones.", e);
}
const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const MOTION = M && !reduced;

const animate = (...a) => (MOTION ? M.animate(...a) : null);
const inView  = (...a) => (MOTION ? M.inView(...a)  : null);
const stagger = (...a) => (MOTION ? M.stagger(...a) : 0);
const scrollM = (...a) => (MOTION ? M.scroll(...a)  : null);

const $  = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/* ─────────── 2. ARTE DE PRODUCTO (SVG inline, theme-aware) ─────────── */
const ART = {
  headphones: `<svg viewBox="0 0 200 200" class="art" aria-hidden="true">
    <path class="as" d="M42 118V96a58 58 0 0 1 116 0v22" stroke-width="11" fill="none" stroke-linecap="round"/>
    <rect class="a1" x="24" y="106" width="34" height="60" rx="16"/>
    <rect class="a1" x="142" y="106" width="34" height="60" rx="16"/>
    <rect class="a3" x="31" y="118" width="20" height="36" rx="9"/>
    <rect class="a3" x="149" y="118" width="20" height="36" rx="9"/>
    <circle class="a4" cx="100" cy="60" r="5"/></svg>`,

  laptop: `<svg viewBox="0 0 200 200" class="art" aria-hidden="true">
    <rect class="a1" x="38" y="46" width="124" height="86" rx="8"/>
    <rect class="a3" x="46" y="54" width="108" height="70" rx="4"/>
    <path class="a2" d="M18 140h164l-9 14a8 8 0 0 1-6.6 3.4H33.6A8 8 0 0 1 27 154Z"/>
    <rect class="a4" x="84" y="140" width="32" height="4" rx="2"/>
    <path class="a4" d="M60 70h48M60 84h74M60 98h34" stroke-width="5" stroke-linecap="round" fill="none" stroke="currentColor" opacity=".35"/></svg>`,

  phone: `<svg viewBox="0 0 200 200" class="art" aria-hidden="true">
    <rect class="a1" x="60" y="18" width="80" height="164" rx="18"/>
    <rect class="a3" x="67" y="25" width="66" height="150" rx="13"/>
    <rect class="a4" x="88" y="31" width="24" height="5" rx="2.5"/>
    <circle class="a2" cx="82" cy="56" r="9"/><circle class="a2" cx="82" cy="78" r="9"/>
    <rect class="a4" x="104" y="120" width="24" height="40" rx="8" opacity=".55"/></svg>`,

  watch: `<svg viewBox="0 0 200 200" class="art" aria-hidden="true">
    <path class="a2" d="M76 20h48l-5 40H81ZM81 140h38l5 40H76Z"/>
    <rect class="a1" x="58" y="54" width="84" height="92" rx="26"/>
    <rect class="a3" x="66" y="62" width="68" height="76" rx="20"/>
    <path class="a4" d="M84 108l12 12 22-30" stroke-width="8" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
    <rect class="a2" x="142" y="82" width="7" height="20" rx="3.5"/></svg>`,

  gpu: `<svg viewBox="0 0 200 200" class="art" aria-hidden="true">
    <rect class="a1" x="18" y="58" width="164" height="84" rx="10"/>
    <circle class="a3" cx="66" cy="100" r="27"/><circle class="a3" cx="136" cy="100" r="27"/>
    <circle class="a4" cx="66" cy="100" r="9"/><circle class="a4" cx="136" cy="100" r="9"/>
    <path class="a2" d="M30 142h18v16H30ZM152 142h18v16h-18Z"/>
    <rect class="a4" x="94" y="66" width="14" height="10" rx="3" opacity=".7"/></svg>`,

  keyboard: `<svg viewBox="0 0 200 200" class="art" aria-hidden="true">
    <rect class="a1" x="16" y="62" width="168" height="76" rx="12"/>
    <g class="a3">
      <rect x="28" y="74" width="18" height="15" rx="4"/><rect x="50" y="74" width="18" height="15" rx="4"/>
      <rect x="72" y="74" width="18" height="15" rx="4"/><rect x="94" y="74" width="18" height="15" rx="4"/>
      <rect x="116" y="74" width="18" height="15" rx="4"/><rect x="138" y="74" width="18" height="15" rx="4"/>
      <rect x="160" y="74" width="12" height="15" rx="4"/>
      <rect x="28" y="93" width="24" height="15" rx="4"/><rect x="56" y="93" width="18" height="15" rx="4"/>
      <rect x="78" y="93" width="18" height="15" rx="4"/><rect x="100" y="93" width="18" height="15" rx="4"/>
      <rect x="122" y="93" width="18" height="15" rx="4"/><rect x="144" y="93" width="28" height="15" rx="4"/>
      <rect x="28" y="112" width="18" height="15" rx="4"/><rect x="50" y="112" width="18" height="15" rx="4"/>
      <rect x="72" y="112" width="56" height="15" rx="4"/><rect x="132" y="112" width="18" height="15" rx="4"/>
      <rect x="154" y="112" width="18" height="15" rx="4"/>
    </g></svg>`,

  drone: `<svg viewBox="0 0 200 200" class="art" aria-hidden="true">
    <path class="a2" d="M62 62 88 88M138 62 112 88M62 138l26-26M138 138l-26-26" stroke-width="9" stroke="currentColor" stroke-linecap="round" fill="none"/>
    <ellipse class="a3" cx="54" cy="54" rx="30" ry="7"/><ellipse class="a3" cx="146" cy="54" rx="30" ry="7"/>
    <ellipse class="a3" cx="54" cy="146" rx="30" ry="7"/><ellipse class="a3" cx="146" cy="146" rx="30" ry="7"/>
    <rect class="a1" x="76" y="80" width="48" height="40" rx="13"/>
    <circle class="a4" cx="100" cy="124" r="12"/></svg>`,

  camera: `<svg viewBox="0 0 200 200" class="art" aria-hidden="true">
    <path class="a1" d="M22 74h156a10 10 0 0 1 10 10v58a10 10 0 0 1-10 10H22a10 10 0 0 1-10-10V84a10 10 0 0 1 10-10Z"/>
    <path class="a2" d="M74 56h40l7 18H67Z"/>
    <circle class="a3" cx="112" cy="113" r="34"/><circle class="a4" cx="112" cy="113" r="16"/>
    <rect class="a4" x="28" y="86" width="22" height="9" rx="4.5" opacity=".7"/>
    <circle class="a4" cx="40" cy="128" r="7" opacity=".5"/></svg>`,

  earbuds: `<svg viewBox="0 0 200 200" class="art" aria-hidden="true">
    <path class="a1" d="M46 132a26 26 0 1 1 52 0c0 20-16 26-26 26s-26-6-26-26Z"/>
    <path class="a1" d="M62 42a20 20 0 0 1 20 20v58H62Z" transform="rotate(-14 72 80)"/>
    <path class="a1" d="M102 132a26 26 0 1 1 52 0c0 20-16 26-26 26s-26-6-26-26Z"/>
    <path class="a1" d="M118 42a20 20 0 0 1 20 20v58h-20Z" transform="rotate(-14 128 80)"/>
    <circle class="a3" cx="72" cy="132" r="11"/><circle class="a3" cx="128" cy="132" r="11"/></svg>`,

  charger: `<svg viewBox="0 0 200 200" class="art" aria-hidden="true">
    <rect class="a1" x="52" y="56" width="96" height="96" rx="22"/>
    <rect class="a3" x="70" y="74" width="26" height="26" rx="6"/>
    <rect class="a3" x="104" y="74" width="26" height="26" rx="6"/>
    <rect class="a4" x="70" y="112" width="60" height="9" rx="4.5"/>
    <path class="a2" d="M78 32h14v24H78ZM108 32h14v24h-14Z"/>
    <path class="a4" d="M96 128h8l-4 14z" opacity=".8"/></svg>`
};
const art = (k) => ART[k] || ART.laptop;

/* ─────────── 3. DATOS ─────────── */
const PRODUCTS = [
  { id:"p1",  name:"Auralis Pro",       cat:"Audio",        art:"headphones", price:249,  old:329,  rate:4.9, revs:312, tags:["auriculares","anc","cascos","bluetooth"], badge:{t:"−24%",c:"badge-off"} },
  { id:"p2",  name:"Nexbook Air 14″",   cat:"Cómputo",      art:"laptop",     price:1099, old:1399, rate:4.8, revs:198, tags:["portatil","portátil","laptop","ordenador"], badge:{t:"Oferta",c:"badge-hot"} },
  { id:"p3",  name:"Vertex 9 Pro",      cat:"Móviles",      art:"phone",      price:899,  old:999,  rate:4.7, revs:441, tags:["movil","móvil","smartphone","telefono"], badge:{t:"−10%",c:"badge-off"} },
  { id:"p4",  name:"Pulse Watch S3",    cat:"Wearables",    art:"watch",      price:199,  old:null, rate:4.6, revs:256, tags:["smartwatch","reloj","wearable"], badge:{t:"Nuevo",c:"badge-new"} },
  { id:"p5",  name:"Titan RTX 5080",    cat:"Componentes",  art:"gpu",        price:1099, old:null, rate:4.9, revs:87,  tags:["gpu","grafica","gráfica","tarjeta"], badge:null },
  { id:"p6",  name:"Aero Keys 75",      cat:"Accesorios",   art:"keyboard",   price:149,  old:179,  rate:4.8, revs:163, tags:["teclado","mecanico","mecánico","keyboard"], badge:{t:"−17%",c:"badge-off"} },
  { id:"p7",  name:"Skyline Drone 4K",  cat:"Foto",         art:"drone",      price:649,  old:null, rate:4.5, revs:74,  tags:["drone","dron","4k","volar"], badge:null },
  { id:"p8",  name:"Lumen Cam R8",      cat:"Foto",         art:"camera",     price:1899, old:null, rate:4.9, revs:52,  tags:["camara","cámara","mirrorless","foto"], badge:{t:"Nuevo",c:"badge-new"} },
  { id:"p9",  name:"Orbit Pods 2",      cat:"Audio",        art:"earbuds",    price:129,  old:159,  rate:4.7, revs:628, tags:["auriculares","earbuds","inalambricos"], badge:{t:"−19%",c:"badge-off"} },
  { id:"p10", name:"Volt Charge 140W",  cat:"Accesorios",   art:"charger",    price:69,   old:null, rate:4.8, revs:390, tags:["cargador","gan","usb-c","carga"], badge:null }
];
const byId = (id) => PRODUCTS.find(p => p.id === id);

const CATEGORIES = [
  { name:"Audio",       n:"48 productos", ico:`<path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2.5" y="13" width="4.5" height="7" rx="2"/><rect x="17" y="13" width="4.5" height="7" rx="2"/>` },
  { name:"Cómputo",     n:"64 productos", ico:`<rect x="3" y="4.5" width="18" height="12" rx="2"/><path d="M2 20h20"/>` },
  { name:"Móviles",     n:"37 productos", ico:`<rect x="7" y="2.5" width="10" height="19" rx="2.5"/><path d="M10.5 5.5h3"/>` },
  { name:"Wearables",   n:"29 productos", ico:`<rect x="8" y="7" width="8" height="10" rx="2.5"/><path d="M9.5 7 10 3h4l.5 4M9.5 17l.5 4h4l.5-4"/>` },
  { name:"Componentes", n:"92 productos", ico:`<rect x="5" y="5" width="14" height="14" rx="2"/><rect x="9" y="9" width="6" height="6" rx="1"/><path d="M9 2v3M15 2v3M9 19v3M15 19v3M2 9h3M2 15h3M19 9h3M19 15h3"/>` },
  { name:"Foto",        n:"41 productos", ico:`<path d="M3 8h3l1.5-2.5h9L18 8h3v11H3Z"/><circle cx="12" cy="13" r="3.6"/>` }
];

// useGrouping "always": es-ES omite el punto en 4 cifras por defecto (1099 €),
// pero el diseño usa separador en todos los precios (1.099 €).
const EUR = new Intl.NumberFormat("es-ES", {
  style: "currency", currency: "EUR",
  minimumFractionDigits: 0, maximumFractionDigits: 0, useGrouping: "always"
});
const money = (n) => EUR.format(n).replace(/\s/g, " ");

const starsHTML = (r) => {
  let s = "";
  for (let i = 1; i <= 5; i++) {
    const fill = r >= i ? 1 : r > i - 1 ? (r - (i - 1)) : 0;
    s += `<svg viewBox="0 0 24 24" style="opacity:${fill > .5 ? 1 : .28}"><path d="m12 2.6 2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.5 6.1 20.6l1.2-6.5L2.5 9.5l6.6-.9Z"/></svg>`;
  }
  return s;
};

/* ─────────── 3b. MODO EMBEBIDO (maquetas de mobile.html) ─────────── */
if (window.self !== window.top) document.documentElement.classList.add("is-embedded");

/* ─────────── 4. TEMA (persistente + prefers-color-scheme) ─────────── */
const root = document.documentElement;
const themeBtn = $("#themeToggle");

function applyTheme(t, persist = true) {
  root.setAttribute("data-theme", t);
  themeBtn.setAttribute("aria-pressed", String(t === "dark"));
  if (persist) { try { localStorage.setItem("nx-theme", t); } catch {} }
}
(function initTheme() {
  const forced = new URLSearchParams(location.search).get("theme"); // maquetas móviles
  let saved = null;
  try { saved = localStorage.getItem("nx-theme"); } catch {}
  const sys = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  applyTheme(forced || saved || sys, false);
  if (forced) return;
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    let s = null; try { s = localStorage.getItem("nx-theme"); } catch {}
    if (!s) applyTheme(e.matches ? "dark" : "light", false);
  });
})();
themeBtn.addEventListener("click", () => {
  const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
  applyTheme(next);
  animate(themeBtn, { rotate: [0, 180], scale: [1, .8, 1] }, { duration: .5, ease: [.22,1,.36,1] });
});

/* ─────────── 5. RENDER: categorías, ofertas, catálogo ─────────── */
$("#catGrid").innerHTML = CATEGORIES.map(c => `
  <a href="#catalogo" class="cat-card" data-reveal data-cat-jump="${c.name}">
    <span class="cat-ico"><svg class="ico" viewBox="0 0 24 24">${c.ico}</svg></span>
    <span class="cat-meta"><h3>${c.name}</h3><span>${c.n}</span></span>
  </a>`).join("");

$("#dealSide").innerHTML = ["p9","p6","p3"].map(id => {
  const p = byId(id);
  return `<article class="deal-mini" data-reveal>
    <div class="dm-art">${art(p.art)}</div>
    <div class="dm-body">
      <p class="dm-cat">${p.cat}</p>
      <h3 class="dm-name">${p.name}</h3>
      <div class="dm-foot">
        <div class="price"><span class="price-now">${money(p.price)}</span>${p.old ? `<span class="price-old">${money(p.old)}</span>` : ""}</div>
        <button class="btn btn-ghost btn-sm" data-add="${p.id}">Añadir</button>
      </div>
    </div>
  </article>`;
}).join("");

const FILTERS = ["Todos", ...new Set(PRODUCTS.map(p => p.cat))];
$("#filters").innerHTML = FILTERS.map((f, i) =>
  `<button class="filter" role="tab" aria-selected="${i === 0}" data-filter="${f}">${f}</button>`).join("");

const cardHTML = (p) => `
  <article class="card" data-card data-id="${p.id}">
    <div class="card-media">
      <div class="card-badges">${p.badge ? `<span class="chip ${p.badge.c}">${p.badge.t}</span>` : ""}</div>
      <button class="wish" aria-label="Añadir ${p.name} a favoritos" aria-pressed="false" data-wish>
        <svg class="ico" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M12 20s-7.5-4.7-7.5-9.6A4.4 4.4 0 0 1 12 7.6a4.4 4.4 0 0 1 7.5 2.8C19.5 15.3 12 20 12 20Z"/></svg>
      </button>
      ${art(p.art)}
    </div>
    <div class="card-body">
      <p class="card-cat">${p.cat}</p>
      <h3 class="card-name">${p.name}</h3>
      <p class="rating"><span class="stars">${starsHTML(p.rate)}</span> ${p.rate.toFixed(1)} <span>(${p.revs})</span></p>
      <div class="card-foot">
        <div class="price"><span class="price-now">${money(p.price)}</span>${p.old ? `<span class="price-old">${money(p.old)}</span>` : ""}</div>
        <button class="card-add" data-add="${p.id}" aria-label="Añadir ${p.name} al carrito">
          <svg class="ico" viewBox="0 0 24 24" style="width:17px;height:17px"><path d="M12 5v14M5 12h14"/></svg>
        </button>
      </div>
    </div>
  </article>`;

const grid = $("#productGrid"), emptyState = $("#emptyState");

function renderGrid(filter = "Todos", animateIn = true) {
  const list = filter === "Todos" ? PRODUCTS : PRODUCTS.filter(p => p.cat === filter);
  grid.innerHTML = list.map(cardHTML).join("");
  emptyState.hidden = list.length > 0;
  if (animateIn && MOTION) {
    animate($$("[data-card]", grid), { opacity: [0, 1], y: [16, 0], scale: [.97, 1] },
      { delay: stagger(.045), duration: .5, ease: [.22,1,.36,1] });
  }
  bindCardHover();
}
renderGrid("Todos", false);

$("#filters").addEventListener("click", (e) => {
  const b = e.target.closest("[data-filter]"); if (!b) return;
  $$(".filter").forEach(f => f.setAttribute("aria-selected", String(f === b)));
  renderGrid(b.dataset.filter);
  b.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
});

// salto desde tarjeta de categoría → filtro correspondiente
$("#catGrid").addEventListener("click", (e) => {
  const c = e.target.closest("[data-cat-jump]"); if (!c) return;
  const target = c.dataset.catJump;
  const btn = $$(".filter").find(f => f.dataset.filter === target);
  if (btn) setTimeout(() => btn.click(), 420);
});

// hero card art
$("[data-product-art='headphones']").innerHTML = art("headphones");
$("[data-product-art='laptop']").innerHTML = art("laptop");

/* ─────────── 6. CARRITO ─────────── */
const FREE_SHIP = 59, SHIP_COST = 4.95;
let cart = [];
try { cart = JSON.parse(localStorage.getItem("nx-cart") || "[]"); } catch {}

const els = {
  overlay: $("#cartOverlay"), panel: $(".cart-panel"), backdrop: $(".cart-backdrop"),
  items: $("#cartItems"), empty: $("#cartEmpty"), foot: $("#cartFoot"), ship: $("#cartShip"),
  count: $("#cartCount"), headN: $("#cartHeadN"),
  subtotal: $("#cartSubtotal"), shipping: $("#cartShipping"), total: $("#cartTotal"),
  shipMsg: $("#shipMsg"), shipFill: $("#shipFill")
};

const DEMO = location.search.includes("seed="); // maquetas: no persistir
const saveCart = () => { if (DEMO) return; try { localStorage.setItem("nx-cart", JSON.stringify(cart)); } catch {} };
const cartQty = () => cart.reduce((s, i) => s + i.qty, 0);
const cartSub = () => cart.reduce((s, i) => s + byId(i.id).price * i.qty, 0);

function renderCart() {
  const qty = cartQty(), sub = cartSub();

  els.count.textContent = qty;
  els.count.dataset.empty = String(qty === 0);
  els.headN.textContent = qty;

  const has = cart.length > 0;
  els.empty.style.display = has ? "none" : "flex";
  els.foot.style.display  = has ? "block" : "none";
  els.ship.style.display  = has ? "block" : "none";
  els.items.style.display = has ? "flex" : "none";

  els.items.innerHTML = cart.map(item => {
    const p = byId(item.id);
    return `<li class="ci" data-ci="${p.id}">
      <div class="ci-art">${art(p.art)}</div>
      <div>
        <div class="ci-top">
          <div><p class="ci-name">${p.name}</p><p class="ci-cat">${p.cat}</p></div>
          <button class="ci-del" data-del="${p.id}" aria-label="Quitar ${p.name}">
            <svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M9 7V5h6v2M6.5 7l1 13h9l1-13"/></svg>
          </button>
        </div>
        <div class="ci-bot">
          <div class="qty">
            <button data-dec="${p.id}" aria-label="Quitar una unidad" ${item.qty <= 1 ? "disabled" : ""}>
              <svg class="ico" viewBox="0 0 24 24"><path d="M5 12h14"/></svg>
            </button>
            <output aria-label="Cantidad">${item.qty}</output>
            <button data-inc="${p.id}" aria-label="Añadir una unidad">
              <svg class="ico" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>
            </button>
          </div>
          <span class="ci-price">${money(p.price * item.qty)}</span>
        </div>
      </div>
    </li>`;
  }).join("");

  const shipping = sub === 0 ? 0 : (sub >= FREE_SHIP ? 0 : SHIP_COST);
  els.subtotal.textContent = money(sub);
  els.shipping.textContent = sub === 0 ? "—" : (shipping === 0 ? "Gratis" : money(shipping));
  els.total.textContent = money(sub + shipping);

  const pct = Math.min(100, (sub / FREE_SHIP) * 100);
  els.shipFill.style.setProperty("--w", pct + "%");
  els.shipMsg.innerHTML = sub >= FREE_SHIP
    ? `<strong>¡Envío gratis conseguido!</strong>`
    : `Te faltan <strong>${money(FREE_SHIP - sub)}</strong> para el envío gratis`;

  saveCart();
}

function addToCart(id) {
  const line = cart.find(i => i.id === id);
  if (line) line.qty++; else cart.push({ id, qty: 1 });
  renderCart();
  bumpCart();
  toast(`${byId(id).name} añadido`);
}

function bumpCart() {
  const btn = $("#cartTrigger");
  animate(els.count, { scale: [1, 1.45, 1] }, { duration: .45, ease: [.22,1,.36,1] });
  animate(btn, { y: [0, -5, 0] }, { duration: .4, ease: [.22,1,.36,1] });
}

// delegación global de "añadir"
document.addEventListener("click", (e) => {
  const add = e.target.closest("[data-add]");
  if (add) { addToCart(add.dataset.add); flyOut(add); return; }

  const w = e.target.closest("[data-wish]");
  if (w) {
    const on = w.getAttribute("aria-pressed") === "true";
    w.setAttribute("aria-pressed", String(!on));
    animate(w, { scale: [1, 1.3, 1] }, { duration: .38, ease: [.22,1,.36,1] });
  }
});

// micro-feedback al añadir
function flyOut(btn) {
  animate(btn, { scale: [1, .84, 1] }, { duration: .35, ease: [.22,1,.36,1] });
}

els.items.addEventListener("click", (e) => {
  const inc = e.target.closest("[data-inc]"), dec = e.target.closest("[data-dec]"), del = e.target.closest("[data-del]");
  if (inc) { cart.find(i => i.id === inc.dataset.inc).qty++; renderCart(); }
  else if (dec) { const l = cart.find(i => i.id === dec.dataset.dec); if (l.qty > 1) l.qty--; renderCart(); }
  else if (del) {
    const row = $(`[data-ci="${del.dataset.del}"]`);
    const remove = () => { cart = cart.filter(i => i.id !== del.dataset.del); renderCart(); };
    if (MOTION && row) {
      const a = animate(row, { opacity: 0, x: 40, height: 0, marginBottom: 0 }, { duration: .3, ease: [.65,0,.35,1] });
      a.finished.then(remove);
    } else remove();
  }
});

$("#checkoutBtn").addEventListener("click", () => toast("Checkout de demostración — sin pasarela real"));

/* ── apertura / cierre del drawer ── */
let cartOpen = false;
function openCart() {
  if (cartOpen) return; cartOpen = true;
  els.overlay.hidden = false;
  document.body.classList.add("is-locked");
  if (MOTION) {
    animate(els.backdrop, { opacity: [0, 1] }, { duration: .3 });
    animate(els.panel, { x: ["100%", "0%"] }, { duration: .55, ease: [.22,1,.36,1] });
    animate($$(".ci", els.items), { opacity: [0, 1], x: [24, 0] },
      { delay: stagger(.05, { startDelay: .15 }), duration: .45, ease: [.22,1,.36,1] });
  } else { els.backdrop.style.opacity = 1; els.panel.style.transform = "none"; }
  $(".cart-head .icon-btn").focus();
}
function closeCart() {
  if (!cartOpen) return; cartOpen = false;
  document.body.classList.remove("is-locked");
  const done = () => { els.overlay.hidden = true; };
  if (MOTION) {
    animate(els.backdrop, { opacity: 0 }, { duration: .25 });
    animate(els.panel, { x: "100%" }, { duration: .4, ease: [.65,0,.35,1] }).finished.then(done);
  } else done();
  $("#cartTrigger").focus();
}
$("#cartTrigger").addEventListener("click", openCart);
$$("[data-close-cart]").forEach(b => b.addEventListener("click", closeCart));

/* ─────────── 7. BUSCADOR ─────────── */
const so = { overlay: $("#searchOverlay"), panel: $(".search-panel"), backdrop: $(".search-backdrop"),
             input: $("#searchInput"), results: $("#searchResults"), label: $("#searchLabel"), tags: $("#searchTags") };
let searchOpen = false, activeIdx = -1;

const norm = (s) => s.toLowerCase().normalize("NFD").replace(/\p{M}/gu, "");

function searchProducts(q) {
  const n = norm(q.trim());
  if (!n) return PRODUCTS.slice(0, 5);
  return PRODUCTS.filter(p =>
    norm(p.name).includes(n) || norm(p.cat).includes(n) || p.tags.some(t => norm(t).includes(n))
  );
}

function renderResults(q = "") {
  const list = searchProducts(q);
  so.label.textContent = q.trim()
    ? `${list.length} resultado${list.length === 1 ? "" : "s"} para "${q.trim()}"`
    : "Sugerencias";
  activeIdx = -1;

  so.results.innerHTML = list.length
    ? list.map(p => `
      <li><button class="sr-item" data-goto="${p.id}">
        <span class="sr-art">${art(p.art)}</span>
        <span><span class="sr-name">${p.name}</span><span class="sr-cat">${p.cat}</span></span>
        <span class="sr-price">${money(p.price)}</span>
      </button></li>`).join("")
    : `<li class="sr-none">Sin resultados. Prueba con «auriculares» o «portátil».</li>`;

  if (MOTION && list.length) {
    animate($$(".sr-item", so.results), { opacity: [0, 1], y: [8, 0] },
      { delay: stagger(.03), duration: .28, ease: [.22,1,.36,1] });
  }
}

function openSearch() {
  if (searchOpen) return; searchOpen = true;
  so.overlay.hidden = false;
  document.body.classList.add("is-locked");
  renderResults("");
  if (MOTION) {
    animate(so.backdrop, { opacity: [0, 1] }, { duration: .25 });
    animate(so.panel, { opacity: [0, 1], y: [-16, 0], scale: [.97, 1] }, { duration: .4, ease: [.22,1,.36,1] });
  } else { so.backdrop.style.opacity = 1; so.panel.style.opacity = 1; }
  setTimeout(() => so.input.focus(), 60);
}
function closeSearch() {
  if (!searchOpen) return; searchOpen = false;
  document.body.classList.remove("is-locked");
  so.input.value = "";
  const done = () => { so.overlay.hidden = true; };
  if (MOTION) {
    animate(so.backdrop, { opacity: 0 }, { duration: .2 });
    animate(so.panel, { opacity: 0, y: -10, scale: .98 }, { duration: .25, ease: [.65,0,.35,1] }).finished.then(done);
  } else done();
}
$("#searchTrigger").addEventListener("click", openSearch);
$("#searchTriggerMobile").addEventListener("click", openSearch);
$$("[data-close-search]").forEach(b => b.addEventListener("click", closeSearch));
so.input.addEventListener("input", (e) => renderResults(e.target.value));

so.tags.addEventListener("click", (e) => {
  const t = e.target.closest("[data-tag]"); if (!t) return;
  so.input.value = t.dataset.tag; renderResults(t.dataset.tag); so.input.focus();
});

so.results.addEventListener("click", (e) => {
  const b = e.target.closest("[data-goto]"); if (!b) return;
  const p = byId(b.dataset.goto);
  closeSearch();
  const btn = $$(".filter").find(f => f.dataset.filter === p.cat);
  setTimeout(() => {
    $("#catalogo").scrollIntoView({ behavior: "smooth", block: "start" });
    if (btn) btn.click();
    setTimeout(() => {
      const card = $(`[data-id="${p.id}"]`);
      if (card) animate(card, { scale: [1, 1.035, 1], boxShadow: ["none", "0 0 0 2px var(--accent)", "none"] },
        { duration: 1.1, ease: [.22,1,.36,1] });
    }, 500);
  }, 240);
});

// navegación con teclado dentro del buscador
so.input.addEventListener("keydown", (e) => {
  const items = $$(".sr-item", so.results);
  if (!items.length) return;
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    activeIdx = e.key === "ArrowDown"
      ? (activeIdx + 1) % items.length
      : (activeIdx - 1 + items.length) % items.length;
    items.forEach((it, i) => it.classList.toggle("is-active", i === activeIdx));
    items[activeIdx].scrollIntoView({ block: "nearest" });
  } else if (e.key === "Enter" && activeIdx >= 0) {
    e.preventDefault(); items[activeIdx].click();
  }
});

/* ─────────── 8. ATAJOS DE TECLADO ─────────── */
document.addEventListener("keydown", (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") { e.preventDefault(); searchOpen ? closeSearch() : openSearch(); }
  if (e.key === "Escape") { closeSearch(); closeCart(); closeMenu(); }
});

/* ─────────── 9. MENÚ MÓVIL ─────────── */
const menu = $("#mobileMenu"), menuBtn = $("#menuToggle");
let menuOpen = false;
function openMenu() {
  menuOpen = true; menu.hidden = false;
  document.body.classList.add("is-locked");
  menuBtn.setAttribute("aria-expanded", "true");
  menuBtn.innerHTML = `<svg class="ico" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>`;
  if (MOTION) {
    animate(menu, { opacity: [0, 1] }, { duration: .25 });
    animate($$(".mm-nav a", menu), { opacity: [0, 1], y: [22, 0] },
      { delay: stagger(.06), duration: .45, ease: [.22,1,.36,1] });
    animate($(".mm-foot"), { opacity: [0, 1], y: [16, 0] }, { delay: .28, duration: .4, ease: [.22,1,.36,1] });
  }
}
function closeMenu() {
  if (!menuOpen) return; menuOpen = false;
  document.body.classList.remove("is-locked");
  menuBtn.setAttribute("aria-expanded", "false");
  menuBtn.innerHTML = `<svg class="ico" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`;
  const done = () => { menu.hidden = true; };
  if (MOTION) animate(menu, { opacity: 0 }, { duration: .2 }).finished.then(done); else done();
}
menuBtn.addEventListener("click", () => (menuOpen ? closeMenu() : openMenu()));
$$("[data-mm], [data-mm-close]").forEach(a => a.addEventListener("click", closeMenu));

/* ─────────── 10. NEWSLETTER ─────────── */
$("#newsForm").addEventListener("submit", (e) => {
  e.preventDefault();
  const input = $("#newsEmail"), val = input.value.trim();
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(val);
  if (!ok) {
    animate($(".news-field"), { x: [0, -8, 8, -5, 5, 0] }, { duration: .45 });
    input.focus(); return;
  }
  $(".news").classList.add("is-sent");
  toast("¡Listo! Revisa tu correo para confirmar");
  input.value = ""; input.blur();
});

/* ─────────── 11. TOAST ─────────── */
let toastTimer;
function toast(msg) {
  const t = $("#toast");
  $("#toastMsg").textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  const isMobile = window.innerWidth <= 720;
  if (MOTION) {
    animate(t, isMobile ? { opacity: [0, 1], y: [20, 0] } : { opacity: [0, 1], y: [20, 0] },
      { duration: .4, ease: [.22,1,.36,1] });
  } else t.style.opacity = 1;
  toastTimer = setTimeout(() => {
    if (MOTION) animate(t, { opacity: 0, y: 12 }, { duration: .3 }).finished.then(() => { t.hidden = true; });
    else t.hidden = true;
  }, 2600);
}

/* ─────────── 12. CUENTA ATRÁS (hasta medianoche) ─────────── */
(function countdown() {
  const h = $('[data-cd="h"]'), m = $('[data-cd="m"]'), s = $('[data-cd="s"]'), head = $("#dealHeadClock");
  const pad = (n) => String(n).padStart(2, "0");
  function tick() {
    const now = new Date();
    const end = new Date(now); end.setHours(24, 0, 0, 0);
    let d = Math.max(0, Math.floor((end - now) / 1000));
    const hh = Math.floor(d / 3600), mm = Math.floor((d % 3600) / 60), ss = d % 60;
    if (s.textContent !== pad(ss)) {
      s.textContent = pad(ss); m.textContent = pad(mm); h.textContent = pad(hh);
      head.textContent = `${pad(hh)}:${pad(mm)}:${pad(ss)}`;
      animate(s, { y: [-6, 0], opacity: [.5, 1] }, { duration: .25 });
    }
    requestAnimationFrame(tick);
  }
  tick();
})();

/* ─────────── 13. HEADER STICKY ─────────── */
const header = $("#header");
const io = new IntersectionObserver(([e]) => header.classList.toggle("is-stuck", !e.isIntersecting),
  { rootMargin: "-1px 0px 0px 0px", threshold: 1 });
io.observe($("#announce"));

/* ═══════════════════════════════════════════════════════════════════
   14. MOTION — animaciones de entrada, scroll y hover
   ═══════════════════════════════════════════════════════════════════ */
if (MOTION) {

  /* 14.1 — Hero: entrada en cascada */
  $$("[data-reveal-line]").forEach(l => { l.style.opacity = "0"; });
  animate($$("[data-reveal-line]"), { opacity: [0, 1], y: ["100%", "0%"] },
    { delay: stagger(.09, { startDelay: .12 }), duration: .85, ease: [.22,1,.36,1] });

  const heroBits = [$(".hero-chip"), $(".hero .lede"), $(".hero-cta"), $(".hero-stats")].filter(Boolean);
  heroBits.forEach(el => { el.style.opacity = "0"; });
  animate(heroBits, { opacity: [0, 1], y: [18, 0] },
    { delay: stagger(.08, { startDelay: .28 }), duration: .7, ease: [.22,1,.36,1] });

  const heroCard = $(".hero-card");
  if (heroCard) {
    heroCard.style.opacity = "0";
    animate(heroCard, { opacity: [0, 1], y: [40, 0], rotateX: [8, 0], scale: [.94, 1] },
      { delay: .2, duration: 1, ease: [.22,1,.36,1] });
  }
  $$(".float-card").forEach((fc, i) => {
    fc.style.opacity = "0";
    animate(fc, { opacity: [0, 1], scale: [.8, 1] }, { delay: .75 + i * .14, duration: .55, ease: [.22,1,.36,1] });
    // flotación continua
    animate(fc, { y: [0, i % 2 ? 9 : -9, 0] },
      { duration: 4.5 + i, repeat: Infinity, ease: "easeInOut", delay: 1 + i * .3 });
  });

  /* 14.2 — Contadores numéricos */
  $$("[data-count]").forEach(el => {
    inView(el, () => {
      const target = parseFloat(el.dataset.count);
      const dec = parseInt(el.dataset.decimals || "0", 10);
      const suffix = el.dataset.suffix || "";
      animate(0, target, {
        duration: 1.5, ease: [.22,1,.36,1],
        onUpdate: (v) => { el.textContent = v.toFixed(dec) + suffix; }
      });
    }, { amount: .6, once: true });
  });

  /* 14.3 — Reveal on scroll (secciones) */
  $$("[data-reveal]").forEach(el => {
    if (el.closest(".hero")) return;
    el.style.opacity = "0";
    inView(el, () => {
      animate(el, { opacity: [0, 1], y: [24, 0] }, { duration: .7, ease: [.22,1,.36,1] });
    }, { amount: .18, once: true });
  });

  /* stagger para grids que se revelan juntos */
  [".cat-grid", ".feat-grid", ".deal-side"].forEach(sel => {
    const c = $(sel); if (!c) return;
    const kids = [...c.children];
    kids.forEach(k => { k.style.opacity = "0"; k.removeAttribute("data-reveal"); });
    inView(c, () => {
      animate(kids, { opacity: [0, 1], y: [26, 0] },
        { delay: stagger(.07), duration: .65, ease: [.22,1,.36,1] });
    }, { amount: .15, once: true });
  });

  /* catálogo: primera aparición escalonada */
  inView($("#productGrid"), () => {
    animate($$("[data-card]"), { opacity: [0, 1], y: [22, 0], scale: [.97, 1] },
      { delay: stagger(.05), duration: .6, ease: [.22,1,.36,1] });
  }, { amount: .1, once: true });

  /* 14.4 — Marquee infinito de marcas */
  const track = $("#brandTrack");
  if (track) {
    animate(track, { x: ["0%", "-50%"] }, { duration: 26, repeat: Infinity, ease: "linear" });
  }

  /* 14.5 — Parallax de orbes con scroll */
  const parallaxEls = $$("[data-parallax]");
  scrollM((progress) => {
    const p = typeof progress === "number" ? progress : 0;
    for (const el of parallaxEls) {
      const f = parseFloat(el.dataset.parallax);
      el.style.transform = `translate3d(0, ${p * 900 * f}px, 0)`;
    }
  });

  /* 14.6 — Hover magnético en CTAs */
  $$("[data-magnetic]").forEach(el => {
    let raf;
    el.addEventListener("pointermove", (e) => {
      if (window.matchMedia("(pointer: coarse)").matches) return;
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width / 2) * .28;
      const y = (e.clientY - r.top - r.height / 2) * .34;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => animate(el, { x, y }, { duration: .35, ease: [.22,1,.36,1] }));
    });
    el.addEventListener("pointerleave", () => {
      animate(el, { x: 0, y: 0 }, { type: "spring", stiffness: 260, damping: 18 });
    });
  });

  /* 14.7 — Tilt 3D en la tarjeta del hero */
  const tilt = $("[data-tilt]");
  if (tilt) {
    tilt.addEventListener("pointermove", (e) => {
      if (window.matchMedia("(pointer: coarse)").matches) return;
      const r = tilt.getBoundingClientRect();
      const rx = ((e.clientY - r.top) / r.height - .5) * -9;
      const ry = ((e.clientX - r.left) / r.width - .5) * 11;
      animate(tilt, { rotateX: rx, rotateY: ry }, { duration: .5, ease: [.22,1,.36,1] });
    });
    tilt.addEventListener("pointerleave", () =>
      animate(tilt, { rotateX: 0, rotateY: 0 }, { type: "spring", stiffness: 180, damping: 20 }));
  }

  /* 14.8 — Lift en tarjetas de producto / categoría / oferta */
  function bindLift(nodes, lift = -6) {
    nodes.forEach(el => {
      el.addEventListener("pointerenter", () => animate(el, { y: lift }, { duration: .35, ease: [.22,1,.36,1] }));
      el.addEventListener("pointerleave", () => animate(el, { y: 0 }, { type: "spring", stiffness: 240, damping: 22 }));
    });
  }
  window.bindCardHover = () => bindLift($$("[data-card]"));
  bindLift($$(".cat-card"), -5);
  bindLift($$(".deal-mini"), -4);
  bindCardHover();

} else {
  window.bindCardHover = () => {};
}
function bindCardHover() { if (window.bindCardHover) window.bindCardHover(); }

/* ─────────── 15. DEEP LINKS (?screen=…) — usado por mobile.html ─────────── */
(function deepLink() {
  const params = new URLSearchParams(location.search);
  const screen = params.get("screen");
  const seed = params.get("seed");

  // sembrar carrito de ejemplo para las maquetas (siempre, para que sean deterministas)
  if (seed === "cart") {
    cart = [{ id: "p1", qty: 1 }, { id: "p6", qty: 2 }];
    renderCart();
  }
  if (params.get("q")) { so.input.value = params.get("q"); }

  if (!screen) return;
  setTimeout(() => {
    if (screen === "cart") openCart();
    else if (screen === "search") { openSearch(); if (params.get("q")) renderResults(params.get("q")); }
    else if (screen === "menu") openMenu();
  }, 260);
})();

/* ─────────── 16. INIT ─────────── */
renderCart();
console.log("%cNexbyte", "font:700 20px Space Grotesk,sans-serif;color:#8B7EFF", "· Motion:", MOTION ? "activo" : "desactivado");
