import { component$, useSignal, useContext, useVisibleTask$, useComputed$, $ } from "@builder.io/qwik";
import type { DocumentHead } from "@builder.io/qwik-city";
import { LocaleContext, t } from "../i18n";
import { allProducts, colorName } from "./apparel/products";
import { expandSizes, sortColorsWhiteLast } from "./apparel/utils";
import { LoginTypeContext } from "./layout";

// Size chips for a product: expand each "/"-separated range
// (e.g. "S - 4XL / LT - 4XLT" -> S…4XL plus the tall run).
const sizeOptions = (s: string): string[] => {
  if (!s) return [];
  if (s === "One Size") return ["One Size"];
  return s.split("/").flatMap((seg) => expandSizes(seg.trim()));
};

// Rigby Dungaree pants use a waist × inseam matrix (same as the MN store).
const WAIST_LENGTH_SKUS = new Set(["FB-3"]);
const PANTS_WAIST = ["28", "29", "30", "31", "32", "33", "34", "35", "36", "38", "40", "42", "44", "46", "48", "50", "52", "54"];
const PANTS_INSEAM = ["28", "30", "32", "34", "36"];

// Regular/Tall handled as a separate variant line (same approach as CM/MN) —
// the size bubbles narrow to the chosen variant instead of mixing in the talls.
const SIZE_ORDER = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
const VARIANT_SKUS = new Set(["FB-1", "FB-2", "FB-4"]);
const VARIANT_SIZES: Record<string, Record<string, string[]>> = {
  "FB-1": { "Regular": ["S", "M", "L", "XL", "2XL", "3XL", "4XL"], "Tall": ["L", "XL", "2XL", "3XL"] },
  "FB-2": { "Regular": ["S", "M", "L", "XL", "2XL", "3XL", "4XL"], "Tall": ["L", "XL", "2XL", "3XL"] },
  "FB-4": { "Regular": ["S", "M", "L", "XL", "2XL", "3XL"], "Tall": ["L", "XL", "2XL"] },
};
// Size pool for a product: the chosen variant's run, the union before a
// variant is picked, or the plain expanded sizes for non-variant SKUs.
const sizeChipsFor = (sku: string, sizes: string, variant: string): string[] => {
  const vmap = VARIANT_SIZES[sku];
  if (vmap) {
    if (variant && vmap[variant]) return vmap[variant];
    const union = new Set<string>();
    Object.values(vmap).forEach((arr) => arr.forEach((s) => union.add(s)));
    return Array.from(union).sort((a, b) => SIZE_ORDER.indexOf(a) - SIZE_ORDER.indexOf(b));
  }
  return sizeOptions(sizes);
};

export default component$(() => {
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const isTech = useComputed$(() => loginType.value === "tech");
  const hasCartItems = useSignal(false);

  // Single-page product expansion — no route change.
  const selectedSku = useSignal("");
  const selected = useComputed$(() => allProducts.find((p) => p.sku === selectedSku.value) || null);
  const selSize = useSignal("");
  const selColor = useSignal("");
  const selQty = useSignal(1);
  const added = useSignal(false);
  const detailImg = useSignal(0);
  const selWaist = useSignal("");
  const selLength = useSignal("");
  const selVariant = useSignal("");

  const openProduct = $((sku: string) => {
    const p = allProducts.find((x) => x.sku === sku);
    selectedSku.value = sku;
    selColor.value = sortColorsWhiteLast(p?.colors || [])[0] || "";
    selSize.value = "";
    selWaist.value = "";
    selLength.value = "";
    selVariant.value = "";
    selQty.value = 1;
    detailImg.value = 0;
    added.value = false;
  });
  const closeProduct = $(() => { selectedSku.value = ""; added.value = false; });

  const addToCart = $(() => {
    const p = allProducts.find((x) => x.sku === selectedSku.value);
    if (!p) return;
    const isWL = WAIST_LENGTH_SKUS.has(p.sku);
    const isVariant = VARIANT_SKUS.has(p.sku);
    const opts = sizeChipsFor(p.sku, p.sizes, selVariant.value);
    if (isWL) {
      if (!selWaist.value || !selLength.value) return;
    } else if (isVariant) {
      if (!selVariant.value || !selSize.value) return;
    } else if (opts.length > 1 && !selSize.value) {
      return;
    }
    if ((p.colors?.length || 0) > 0 && !selColor.value) return;
    const sizeVal = isWL
      ? `W${selWaist.value} x L${selLength.value}`
      : isVariant
        ? `${selSize.value} ${selVariant.value}`
        : (selSize.value || opts[0] || "One Size");
    try {
      const key = `ce_cart_mn_${loginType.value || "clothing"}`;
      const saved = localStorage.getItem(key);
      const items = saved ? JSON.parse(saved) : [];
      const existing = items.find(
        (i: any) => i.name === p.name && i.size === sizeVal && i.color === selColor.value
      );
      if (existing) {
        existing.quantity += selQty.value;
      } else {
        const codeMatch = p.details?.match(/#[A-Za-z0-9]+/);
        const item: any = {
          name: p.name, sku: p.sku, category: p.category,
          size: sizeVal, color: selColor.value, quantity: selQty.value,
          price: p.price, img: p.img,
        };
        if (codeMatch) item.code = codeMatch[0];
        if (isWL) { item.waist = selWaist.value; item.length = selLength.value; }
        if (isVariant) { item.variant = selVariant.value; }
        items.push(item);
      }
      localStorage.setItem(key, JSON.stringify(items));
      window.dispatchEvent(new CustomEvent("cart-updated"));
    } catch (err) { console.error("addToCart error:", err); }
    added.value = true;
    selQty.value = 1;
    setTimeout(() => { added.value = false; }, 3500);
  });

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const check = () => {
      try {
        const cart = JSON.parse(localStorage.getItem(`ce_cart_mn_${loginType.value || "clothing"}`) || "[]");
        hasCartItems.value = cart.length > 0;
      } catch { hasCartItems.value = false; }
    };
    check();
    window.addEventListener("cart-updated", check);
    cleanup(() => window.removeEventListener("cart-updated", check));
    document.documentElement.classList.remove("mn-hero-no-anim");
  });

  return (
    <div class="home-page">
      {/* Hero — Farm Boy flyer paper backdrop + left logo cluster, right shelf */}
      <section class="hero hero--fb">
        <div
          class="hero__upper"
          onClick$={(e) => {
            // When a product is expanded, clicking anywhere outside it closes it.
            // Ignore clicks on a product card (that's an open) and on the detail
            // / cart button — otherwise the open click would bubble here and
            // immediately close what just opened.
            if (!selectedSku.value) return;
            const target = e.target as HTMLElement | null;
            if (target && (target.closest(".fb-detail") || target.closest(".fb-cart-float") || target.closest(".fb-shelf__card"))) return;
            selectedSku.value = "";
            added.value = false;
          }}
        >
          {/* Flyer paper backdrop + printed decorations */}
          <div class="fb-flyer" aria-hidden="true">
            <div class="fb-flyer__paper" />
            <span class="fb-doodle fb-doodle--berry fb-doodle--berry-a" />
            <span class="fb-doodle fb-doodle--berry fb-doodle--berry-b" />
            {/* Scattered abstract produce — subtle background pattern */}
            <svg class="fb-veg fb-veg--a" viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="52" r="38"/><path d="M50 16c2-8 8-12 16-12-2 9-8 14-16 14z"/></svg>
            <svg class="fb-veg fb-veg--b" viewBox="0 0 100 100" fill="currentColor"><path d="M50 10C70 38 76 60 60 76 50 86 38 86 30 76 16 60 30 38 50 10Z"/></svg>
            <svg class="fb-veg fb-veg--c" viewBox="0 0 100 100" fill="currentColor"><path d="M16 84C40 44 80 30 88 20 82 62 48 88 18 82Z"/></svg>
            <svg class="fb-veg fb-veg--d" viewBox="0 0 100 100" fill="currentColor"><circle cx="36" cy="40" r="12"/><circle cx="60" cy="38" r="12"/><circle cx="48" cy="60" r="12"/><circle cx="70" cy="60" r="12"/><circle cx="58" cy="80" r="12"/></svg>
            <svg class="fb-veg fb-veg--e" viewBox="0 0 100 100" fill="currentColor"><path d="M50 90 44 40Q50 30 58 40Z"/><path d="M50 38 46 18M50 38 54 18M50 38 50 14" stroke="currentColor" stroke-width="5" fill="none" stroke-linecap="round"/></svg>
            <svg class="fb-veg fb-veg--f" viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="50" r="40"/></svg>
            <svg class="fb-veg fb-veg--g" viewBox="0 0 100 100" fill="currentColor"><path d="M50 10C70 38 76 60 60 76 50 86 38 86 30 76 16 60 30 38 50 10Z"/></svg>
            <svg class="fb-veg fb-veg--h" viewBox="0 0 100 100" fill="currentColor"><path d="M16 84C40 44 80 30 88 20 82 62 48 88 18 82Z"/></svg>
            <svg class="fb-veg fb-veg--i" viewBox="0 0 100 100" fill="currentColor"><circle cx="50" cy="52" r="36"/><path d="M50 18c2-8 8-12 16-12-2 9-8 14-16 14z"/></svg>
          </div>

          {/* Floating cart button (top-right, overlaid) */}
          <button class={`fb-headbtn fb-headbtn--cart fb-cart-float ${hasCartItems.value ? "fb-headbtn--cart-active" : ""}`} onClick$={() => {
            const btn = document.querySelector('.cart-btn') as HTMLElement;
            btn?.click();
          }} aria-label="Cart">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
            <span>Cart</span>
          </button>

          {/* Single-screen stage: logo cover (left) + product area (right) */}
          <div class="fb-stage">
            <div class="fb-cover__card">
              <span class="fb-cover__badge">
                <img class="fb-cover__logo fb-cover__logo--desktop" src="/farmboy-logo.svg" alt="Farm Boy Apparel" width="302" height="280" />
                <img class="fb-cover__logo fb-cover__logo--mobile" src="/farmboy-logo-mobile.svg" alt="Farm Boy Apparel" width="302" height="280" />
              </span>
              <p class="fb-cover__sub">
                Premium Branded Farm Boy Apparel
              </p>
              <div class="fb-cover__contact-wrap">
                <span class="fb-cover__contact-title">Contact</span>
                <a class="fb-cover__contact" href="mailto:info@farmboyapparel.ca">
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
                  <span>info@farmboyapparel.ca</span>
                </a>
              </div>
            </div>

            {/* Right side: product grid, or the expanded product in-place */}
            {selected.value ? (() => {
              const sel = selected.value!;
              const cols = sortColorsWhiteLast(sel.colors || []);
              const isWL = WAIST_LENGTH_SKUS.has(sel.sku);
              const isVariant = VARIANT_SKUS.has(sel.sku);
              const opts = sizeChipsFor(sel.sku, sel.sizes, selVariant.value);
              const variants = VARIANT_SIZES[sel.sku] ? Object.keys(VARIANT_SIZES[sel.sku]) : [];
              const needsColor = cols.length > 0;
              const canAdd = (isWL
                ? (!!selWaist.value && !!selLength.value)
                : isVariant
                  ? (!!selVariant.value && !!selSize.value)
                  : (opts.length <= 1 || !!selSize.value))
                && (!needsColor || !!selColor.value);
              const gallery = (sel.imgs && sel.imgs.length ? sel.imgs : (sel.img ? [sel.img] : []));
              const mainImg = gallery[detailImg.value] || gallery[0] || "";
              return (
                <div class="fb-detail">
                  <button type="button" class="fb-detail__close" onClick$={closeProduct} aria-label="Back to all products">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
                    <span>All products</span>
                  </button>
                  <div class="fb-detail__body">
                    <div class="fb-detail__gallery">
                      <div class="fb-detail__media">
                        {mainImg
                          ? <img src={mainImg} alt={sel.name} width="480" height="480" />
                          : <span class="fb-shelf__ph" aria-hidden="true">Farm Boy</span>}
                      </div>
                      {gallery.length > 1 && (
                        <div class="fb-detail__thumbs">
                          {gallery.map((im, i) => (
                            <button key={im} type="button" class="fb-detail__thumb" aria-pressed={detailImg.value === i} aria-label={`Image ${i + 1}`} onClick$={() => { detailImg.value = i; }}>
                              <img src={im} alt="" width="56" height="56" loading="lazy" />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div class="fb-detail__info">
                      <h2 class="fb-detail__name">{sel.name}</h2>
                      {!isTech.value && <div class="fb-detail__price">${(Number(sel.price) || 0).toFixed(2)}</div>}

                      {cols.length > 0 && (
                        <div class="fb-detail__group">
                          <span class="fb-detail__label">Colour{selColor.value ? ` — ${colorName(selColor.value, locale.value)}` : ""}</span>
                          <div class="fb-detail__swatches">
                            {cols.map((c) => (
                              <button key={c} type="button" class="fb-detail__swatch" aria-pressed={selColor.value === c} aria-label={colorName(c, locale.value)} style={{ background: c }} onClick$={() => { selColor.value = c; }} />
                            ))}
                          </div>
                        </div>
                      )}

                      {isWL ? (
                        <div class="fb-detail__group">
                          <div class="fb-detail__wl">
                            <div class="fb-detail__select-group">
                              <span class="fb-detail__label">Waist</span>
                              <select class="fb-detail__select" value={selWaist.value} onChange$={(_, el) => { selWaist.value = el.value; }}>
                                <option value="" disabled>Select</option>
                                {PANTS_WAIST.map((w) => <option key={w} value={w}>{w}</option>)}
                              </select>
                            </div>
                            <div class="fb-detail__select-group">
                              <span class="fb-detail__label">Inseam</span>
                              <select class="fb-detail__select" value={selLength.value} onChange$={(_, el) => { selLength.value = el.value; }}>
                                <option value="" disabled>Select</option>
                                {PANTS_INSEAM.map((l) => <option key={l} value={l}>{l}</option>)}
                              </select>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <>
                          {opts.length > 0 && (
                            <div class="fb-detail__group">
                              <span class="fb-detail__label">Size{isVariant && selVariant.value ? ` — ${selVariant.value}` : ""}</span>
                              <div class="fb-detail__sizes">
                                {opts.map((s) => (
                                  <button key={s} type="button" class="fb-detail__size" aria-pressed={selSize.value === s} onClick$={() => { selSize.value = s; }}>{s === "One Size" ? t("modal.onesize", locale.value) : s}</button>
                                ))}
                              </div>
                            </div>
                          )}
                          {isVariant && variants.length > 0 && (
                            <div class="fb-detail__group">
                              <span class="fb-detail__label">Fit</span>
                              <div class="fb-detail__sizes">
                                {variants.map((v) => (
                                  <button key={v} type="button" class="fb-detail__size" aria-pressed={selVariant.value === v} onClick$={() => {
                                    selVariant.value = v;
                                    const m = VARIANT_SIZES[selectedSku.value];
                                    if (m && m[v] && !m[v].includes(selSize.value)) selSize.value = "";
                                  }}>{v}</button>
                                ))}
                              </div>
                            </div>
                          )}
                        </>
                      )}

                      <div class="fb-detail__actions">
                        <div class="fb-detail__qty">
                          <button type="button" aria-label="Decrease quantity" onClick$={() => { if (selQty.value > 1) selQty.value--; }}>−</button>
                          <span>{selQty.value}</span>
                          <button type="button" aria-label="Increase quantity" onClick$={() => { selQty.value++; }}>+</button>
                        </div>
                        <button type="button" class="fb-detail__add" disabled={!canAdd} onClick$={addToCart}>
                          {added.value ? "Added ✓" : canAdd ? "Add to Cart" : "Select size"}
                        </button>
                      </div>
                      {added.value && <div class="fb-detail__added">✓ Added to your cart</div>}

                      {sel.material && <p class="fb-detail__meta-line">{sel.material}</p>}
                      {sel.details && (
                        <ul class={`fb-detail__details-list ${sel.details.split(",").length <= 2 ? "fb-detail__details-list--single" : ""}`}>
                          {sel.details.split(",").map((d, i) => (
                            <li key={i}>{d.trim()}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                </div>
              );
            })() : (
              <div class="fb-shelf" role="list">
                {allProducts.map((p) => (
                  <button type="button" key={p.sku} class="fb-shelf__card" onClick$={() => openProduct(p.sku)}>
                    <div class="fb-shelf__img">
                      {p.img
                        ? <img src={p.img} alt={p.name} width="240" height="240" loading="lazy" />
                        : <span class="fb-shelf__ph" aria-hidden="true">Farm Boy</span>}
                    </div>
                    <div class="fb-shelf__meta">
                      <span class="fb-shelf__name">{p.name}</span>
                      <div class="fb-shelf__meta-row">
                        {!isTech.value && <span class="fb-shelf__price">${(Number(p.price) || 0).toFixed(2)}</span>}
                        <span class="fb-shelf__sizes">{p.sizes}</span>
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* email under the products on mobile/tablet — inside the hero card, no label */}
          <div class="fb-contact-bottom">
            <a class="fb-cover__contact" href="mailto:info@farmboyapparel.ca">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
              <span>info@farmboyapparel.ca</span>
            </a>
          </div>
        </div>
      </section>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Farm Boy Apparel",
  meta: [
    { name: "description", content: "Farm Boy Apparel Employee Apparel. Order branded jackets, polos, hats, and more." },
    { name: "robots", content: "noindex, nofollow" },
    { name: "theme-color", content: "#d5202a" },
    { property: "og:title", content: "Farm Boy Apparel" },
    { property: "og:description", content: "Internal apparel ordering for Farm Boy Apparel staff." },
    { property: "og:type", content: "website" },
    { property: "og:url", content: "https://farmboyapparel.ca/" },
    { property: "og:image", content: "https://farmboyapparel.ca/farmboy-og.png" },
    { property: "og:image:width", content: "1200" },
    { property: "og:image:height", content: "630" },
    { name: "twitter:card", content: "summary_large_image" },
    { name: "twitter:title", content: "Farm Boy Apparel" },
    { name: "twitter:description", content: "Internal apparel ordering for Farm Boy Apparel staff." },
    { name: "twitter:image", content: "https://farmboyapparel.ca/farmboy-og.png" },
  ],
};
