import { component$, useSignal, useComputed$, useContext, $, useVisibleTask$, useOnDocument } from "@builder.io/qwik";
import { LocaleContext, t } from "../../i18n";
import { allProducts, categoryLabel } from "../../routes/apparel/products";
import type { Product } from "../../routes/apparel/products";
import { sortColorsWhiteLast } from "../../routes/apparel/utils";
import { LoginTypeContext } from "../../routes/layout";

const CLOTHING_CATEGORIES = ["All", "Shirts", "Jackets", "Hats", "SWAG"];

// Safety catalog: every MNFR-* item plus a small allowlist of standard SKUs,
// minus a deny list for FR items we don't carry yet.
const SAFETY_SKU_PREFIX = "MNFR-";
const SAFETY_EXTRA_SKUS = new Set(["MN-2", "MN-3", "MN-5", "MN-6"]);
const SAFETY_HIDDEN_SKUS = new Set(["MNFR-5", "MNFR-6"]); // FR Insulated Bib & Jacket
const SAFETY_CATEGORIES = ["All", "Flame Resistant", "Shirts", "Hats"];
// Explicit display order for the Safety "All" view: FR shirt + hoodies,
// FR pants, then the standard-SKU allowlist (short-sleeve tee,
// long-sleeve tee, ball cap, toque).
const SAFETY_SKU_ORDER = ["MNFR-2", "MNFR-3", "MNFR-4", "MNFR-1", "MN-3", "MN-2", "MN-5", "MN-6"];
const isSafetyProduct = (sku: string) =>
  !SAFETY_HIDDEN_SKUS.has(sku) && (sku.startsWith(SAFETY_SKU_PREFIX) || SAFETY_EXTRA_SKUS.has(sku));

// Colors hidden from catalog-card swatches (still visible on product detail page).
const CARD_HIDDEN_COLORS = new Set(["#c0392b", "#1e40af", "#6b3fa0"]);

const CATEGORY_ICONS: Record<string, string> = {
  "All": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>',
  "Work Wear": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M4 6h16v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/><path d="M4 6l-2 4v2h4V8"/><path d="M20 6l2 4v2h-4V8"/></svg>',
  "Jackets": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2l5 6v12a2 2 0 01-2 2h-3V12h-6v10H6a2 2 0 01-2-2V8l5-6"/><path d="M9 2a3 3 0 006 0"/><line x1="12" y1="12" x2="12" y2="22"/></svg>',
  "Shirts": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>',
  "Polos": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46L16 2 12 5.5 8 2 3.62 3.46a2 2 0 00-1.34 1.93v15.12a2 2 0 001.34 1.93L8 24l4-3.5L16 24l4.38-1.46a2 2 0 001.34-1.93V5.39a2 2 0 00-1.34-1.93z"/></svg>',
  "Hats": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 00-7 7c0 3 2 5 3 6h8c1-1 3-3 3-6a7 7 0 00-7-7z"/><path d="M5 15h14"/><path d="M6 18h12"/></svg>',
  "SWAG": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>',
  "Flame Resistant": '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>',
};

const ProductCard = component$<{ item: Product; sku: string }>(({ item, sku }) => {
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const isTech = loginType.value === "tech";

  return (
    <a href={`/apparel/${sku}/`} class={`product-card product-card-link ${sku === "CAR-21" ? "product-card--cover" : ""}`}>
      <div class="product-card__image">
        <img src={item.img} alt={item.name} width="440" height="440" />
      </div>
      <div class="product-card__info">
        <div class="product-card__name-row">
          <div class="product-card__name">
            <span class="product-card__name-text">{item.name.replace(/#\S+/g, '').trim()}</span>
            <span class="product-card__name-code">{(item.name.match(/#\S+/) || [''])[0]}</span>
          </div>
          <div class="product-card__price-group">
            {!isTech && <div class="product-card__price">${(Number(item.price) || 0).toFixed(2)}</div>}
          </div>
        </div>
        <div class="product-card__color-size-row">
          {(() => {
            const visible = sortColorsWhiteLast((item.colors || []).filter((c) => !CARD_HIDDEN_COLORS.has(c)));
            return visible.length > 0 ? (
              <div class="product-card__colors">
                {visible.map((c) => (
                  <span
                    key={c}
                    class="product-card__color-dot"
                    style={{ background: c }}
                    aria-hidden="true"
                  />
                ))}
              </div>
            ) : <span />;
          })()}
          <span class="product-card__sizes">{item.sizes === "One Size" ? t("modal.onesize", locale.value) : item.sizes}</span>
        </div>
      </div>
    </a>
  );
});

export const ProductCatalog = component$<{ class?: string }>(({ "class": cls }) => {
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const isTech = useComputed$(() => loginType.value === "tech");
  const isSafety = useComputed$(() => loginType.value === "safety");
  const isSingleCat = useComputed$(() => isTech.value);
  const activeCat = useSignal("All");
  const searchQuery = useSignal("");
  const searchOpen = useSignal(false);
  const tabletCols = useSignal(3);

  const HASH_TO_CAT: Record<string, string> = isSingleCat.value
    ? {}
    : isSafety.value
      ? { "shirts": "Shirts", "hats": "Hats", "fr": "Flame Resistant" }
      : { "shirts": "Shirts", "jackets": "Jackets", "hats": "Hats", "swag": "SWAG" };

  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && HASH_TO_CAT[hash]) {
        activeCat.value = HASH_TO_CAT[hash];
        history.replaceState(null, "", window.location.pathname);
      }
    };
    const onSelectCategory = (e: Event) => {
      const cat = (e as CustomEvent).detail;
      if (cat) {
        activeCat.value = cat;
        searchQuery.value = "";
      }
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    window.addEventListener("select-category", onSelectCategory);
    cleanup(() => {
      window.removeEventListener("hashchange", applyHash);
      window.removeEventListener("select-category", onSelectCategory);
    });
  });

  // When mobile/tablet search is open, close it on any click outside the
  // search bar. Uses useOnDocument so the listener stays attached and is
  // re-checked on every click — works for every open/close cycle.
  useOnDocument(
    'click',
    $((e: Event) => {
      if (!searchOpen.value) return;
      const target = e.target as HTMLElement | null;
      if (!target) return;
      if (target.closest('.apparel-titlebar__search--mobile')) return;
      searchOpen.value = false;
    })
  );

  const doSearch = $((query: string) => {
    if (query.trim()) {
      activeCat.value = "All";
      searchQuery.value = query.trim();
    } else {
      searchQuery.value = "";
    }
  });

  const baseProducts = useComputed$(() => {
    if (isTech.value) return allProducts.filter((p) => p.category === "Work Wear");
    if (isSafety.value) {
      const rank = (sku: string) => {
        const i = SAFETY_SKU_ORDER.indexOf(sku);
        return i === -1 ? SAFETY_SKU_ORDER.length : i;
      };
      return allProducts
        .filter((p) => isSafetyProduct(p.sku))
        .slice()
        .sort((a, b) => rank(a.sku) - rank(b.sku));
    }
    return allProducts.filter((p) => p.category !== "Flame Resistant");
  });

  const ALWAYS_SHOW = new Set(["All"]);

  const visibleCategories = useComputed$(() => {
    if (isTech.value) return ["Work Wear"];
    const present = new Set(baseProducts.value.map((p) => p.category));
    const source = isSafety.value ? SAFETY_CATEGORIES : CLOTHING_CATEGORIES;
    return source.filter((c) => ALWAYS_SHOW.has(c) || present.has(c));
  });

  const filtered = useComputed$(() => {
    const products = baseProducts.value;

    if (searchQuery.value) {
      const q = searchQuery.value.toLowerCase();
      return products.filter((p) =>
        p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q) || p.category.toLowerCase().includes(q)
      );
    }

    if (activeCat.value !== "All") {
      return products.filter((p) => p.category === activeCat.value);
    }

    return products;
  });

  return (
    <section class={`home-catalog ${cls || ""}`}>
      <div class="home-catalog__inner">
        <div class="home-catalog__header">
          <h2 class="home-catalog__title">{t("nav.apparel", locale.value)}</h2>
          <div class="home-catalog__sidebar-search">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
            <input
              type="text"
              class="apparel-titlebar__search-input"
              placeholder=""
              aria-label="Search apparel"
              value={searchQuery.value}
              onInput$={(_, el) => { searchQuery.value = el.value; }}
              onKeyDown$={(e) => { if (e.key === "Enter") doSearch(searchQuery.value); }}
              onBlur$={() => doSearch(searchQuery.value)}
            />
          </div>
          <div class="home-catalog__tabs">
            {visibleCategories.value.map((cat) => (
              <button
                key={cat}
                class={`apparel-titlebar__tab ${isSingleCat.value || activeCat.value === cat ? "active" : ""}`}
                onClick$={() => {
                  if (isSingleCat.value) return;
                  if (activeCat.value === cat) { activeCat.value = "All"; return; }
                  activeCat.value = cat;
                  searchQuery.value = "";
                  const isDesktop = window.innerWidth > 1024;
                  const headerH = window.innerWidth < 768 ? 49 : (window.innerWidth <= 1024 ? 52 : 58);
                  if (isDesktop) {
                    const grid = document.querySelector('.home-catalog .apparel-grid');
                    const gridTop = grid ? grid.getBoundingClientRect().top + window.scrollY - headerH - 8 : 0;
                    const needsScrollUp = gridTop < window.scrollY;
                    window.scrollTo({ top: gridTop, behavior: needsScrollUp ? 'instant' : 'smooth' });
                  } else {
                    const catalog = document.querySelector('.home-catalog');
                    const catalogTop = catalog ? catalog.getBoundingClientRect().top + window.scrollY : 0;
                    // Scroll a hair past the sticky threshold so the tab strip
                    // pins flush under the site header (no dark gap above it).
                    // The +2px sits inside the tab strip's bottom margin so the
                    // first row of product images is not clipped.
                    const stickyPos = catalogTop - headerH + 2;
                    window.scrollTo({ top: stickyPos, behavior: 'instant' });
                  }
                }}
              >
                <span class="apparel-titlebar__tab-icon" dangerouslySetInnerHTML={CATEGORY_ICONS[cat]} />
                {cat === "All" ? t("apparel.all", locale.value) : categoryLabel(cat, locale.value)}
              </button>
            ))}
          </div>
          <div class="home-catalog__right">
            <div class="apparel-titlebar__search home-catalog__search-desktop">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
              <input
                type="text"
                class="apparel-titlebar__search-input"
                placeholder=""
                aria-label="Search apparel"
                value={searchQuery.value}
                onInput$={(_, el) => { searchQuery.value = el.value; }}
                onKeyDown$={(e) => { if (e.key === "Enter") doSearch(searchQuery.value); }}
                onBlur$={() => doSearch(searchQuery.value)}
              />
            </div>
            {searchOpen.value ? (
              <div class="apparel-titlebar__search apparel-titlebar__search--mobile">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                <input
                  type="text"
                  class="apparel-titlebar__search-input"
                  placeholder=""
                  aria-label="Search apparel"
                  autoFocus
                  value={searchQuery.value}
                  onInput$={(_, el) => { searchQuery.value = el.value; }}
                  onKeyDown$={(e) => { if (e.key === "Enter") { doSearch(searchQuery.value); searchOpen.value = false; } if (e.key === "Escape") { searchQuery.value = ""; searchOpen.value = false; } }}
                  onBlur$={() => { doSearch(searchQuery.value); searchOpen.value = false; }}
                />
                <button class="apparel-titlebar__action" aria-label="Close search" onClick$={() => { doSearch(searchQuery.value); searchOpen.value = false; }} style="padding:2px;">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                </button>
              </div>
            ) : (
              <>
                <button
                  class="apparel-titlebar__action apparel-titlebar__action--tablet-cols"
                  aria-label={`Show ${tabletCols.value === 2 ? 3 : 2} per row`}
                  onClick$={() => { tabletCols.value = tabletCols.value === 2 ? 3 : 2; }}
                >
                  {tabletCols.value === 2 ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="5" height="18"/><rect x="9.5" y="3" width="5" height="18"/><rect x="16" y="3" width="5" height="18"/></svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="8" height="18"/><rect x="13" y="3" width="8" height="18"/></svg>
                  )}
                </button>
                <button class="apparel-titlebar__action apparel-titlebar__action--mobile-search" aria-label="Search" onClick$={() => (searchOpen.value = true)}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
                </button>
              </>
            )}
          </div>
        </div>
        <div class={`apparel-grid apparel-grid--cols-${tabletCols.value}`}>
          {filtered.value.map((item) => (
            <ProductCard key={item.sku} item={item} sku={item.sku} />
          ))}
        </div>
      </div>
    </section>
  );
});
