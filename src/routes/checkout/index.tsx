// Dedicated checkout route.
//
// This is the "details" step that used to live inside the cart drawer, lifted
// onto its own route so it is a real, linkable URL and — crucially — so a
// submission error is ALWAYS visible. In the old in-drawer modal the error
// could be written to a panel that was closed or scrolled away, so a failed
// order looked to the customer like nothing happened. Here the error renders
// inline with role="alert" in the page flow; it cannot be hidden.
//
// The cart itself stays a slide-in drawer in the layout; its "Checkout" button
// now navigates here. The page re-reads the cart from localStorage (the same
// key the drawer writes) so no state has to be threaded across the navigation.
//
// fb is PO-only (no Stripe): the order action inserts the row into Turso, reads
// it back to confirm, then sends the Resend confirmation email. This page just
// drives that action and shows the result.
import { component$, useSignal, useStore, useComputed$, useContext, useVisibleTask$, $ } from "@builder.io/qwik";
import { type DocumentHead, Link, useNavigate } from "@builder.io/qwik-city";
import { Modal, Collapsible } from "@qwik-ui/headless";
import { LocaleContext, t } from "../../i18n";
import {
  LoginTypeContext,
  useSubmitOrder,
  needsLocation,
  taxRateFor,
  colorName,
  stripColorSuffix,
  type CartItem,
} from "../layout";

export default component$(() => {
  const locale = useContext(LocaleContext);
  const loginType = useContext(LoginTypeContext);
  const orderAction = useSubmitOrder();
  const nav = useNavigate();

  const cart = useStore<{ items: CartItem[] }>({ items: [] });
  const cartHydrated = useSignal(false);

  const summaryOpen = useSignal(true);
  const formError = useSignal("");
  const formTouched = useSignal(false);
  const submitting = useSignal(false);
  const orderSubmitted = useSignal(false);
  const orderNum = useSignal("");
  // Server/submission failure (DB, network) shown in a prominent modal — as
  // visible as the success modal — separate from inline field-validation.
  const serverError = useSignal("");
  const showError = useSignal(false);
  // One stable idempotency key per checkout visit — shared across all retries
  // so a re-submit can never create a duplicate order (server dedupes on it).
  const idempotencyKey = useSignal("");

  const empFirstName = useSignal("");
  const empLastName = useSignal("");
  const empEmail = useSignal("");
  const empPhone = useSignal("");
  const empDept = useSignal("");
  const empProvince = useSignal("");
  const empPO = useSignal("");

  // Hydrate the cart from the same localStorage key the drawer writes, and stay
  // in sync if another tab/component updates it.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    track(() => loginType.value);
    const key = () => `ce_cart_mn_${loginType.value || "clothing"}`;
    const loadCart = () => {
      try {
        const saved = localStorage.getItem(key());
        cart.items = saved ? (JSON.parse(saved) as CartItem[]) : [];
      } catch {
        cart.items = [];
      }
      cartHydrated.value = true;
    };
    loadCart();
    window.addEventListener("cart-updated", loadCart);
    cleanup(() => window.removeEventListener("cart-updated", loadCart));
  });

  // Mint one idempotency key for this checkout visit (client-side only, so SSR
  // and client agree). Retries reuse it; a fresh visit gets a fresh key.
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    if (idempotencyKey.value) return;
    try {
      idempotencyKey.value = crypto.randomUUID();
    } catch {
      idempotencyKey.value = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  });

  const cartCount = useComputed$(() => cart.items.reduce((sum, i) => sum + i.quantity, 0));
  const subtotal = useComputed$(() => cart.items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0));
  const taxRate = useComputed$(() => taxRateFor(empProvince.value));
  const taxAmount = useComputed$(() => (taxRate.value === undefined ? undefined : subtotal.value * taxRate.value));
  const orderTotal = useComputed$(() => subtotal.value + (taxAmount.value ?? 0));
  const taxLabel = useComputed$(() => {
    if (taxRate.value === undefined) return t("cart.invoice.tax", locale.value);
    const pct = +(taxRate.value * 100).toFixed(3);
    return `${t("cart.invoice.tax", locale.value)} (${empProvince.value} ${pct}%)`;
  });

  const isEmpty = useComputed$(() => cartHydrated.value && cart.items.length === 0);

  const canPlaceOrder = useComputed$(() => {
    const locationRequired = needsLocation(empProvince.value);
    return (
      cart.items.length > 0 &&
      !!empFirstName.value &&
      !!empLastName.value &&
      !!empEmail.value &&
      !!empPhone.value &&
      !!empProvince.value &&
      (!locationRequired || !!empDept.value) &&
      !!empPO.value
    );
  });

  const submitOrder = $(async () => {
    if (submitting.value) return;
    formTouched.value = true;

    const locationRequired = needsLocation(empProvince.value);
    if (
      !empFirstName.value ||
      !empLastName.value ||
      !empEmail.value ||
      !empPhone.value ||
      !empProvince.value ||
      (locationRequired && !empDept.value) ||
      !empPO.value
    ) {
      formError.value = t("cart.error.required", locale.value);
      return;
    }
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(empEmail.value.trim())) {
      formError.value = t("cart.error.email", locale.value);
      return;
    }
    const phoneDigits = empPhone.value.replace(/[^\d]/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 15 || !/^[\d\s+()\-.]+$/.test(empPhone.value.trim())) {
      formError.value = t("cart.error.phone", locale.value);
      return;
    }
    formError.value = "";

    // Guarantee a key even if the mount task hasn't run yet.
    if (!idempotencyKey.value) {
      try {
        idempotencyKey.value = crypto.randomUUID();
      } catch {
        idempotencyKey.value = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      }
    }

    const orderData = {
      employee: {
        name: `${empFirstName.value} ${empLastName.value}`,
        email: empEmail.value,
        phone: empPhone.value,
        department: empDept.value,
        province: empProvince.value,
        po: empPO.value,
      },
      items: cart.items.map((i: any) => ({
        name: i.name || "",
        sku: i.sku || "",
        color: i.color || "",
        size: i.size || "",
        quantity: Number(i.quantity) || 1,
        price: Number(i.price) || 0,
        ...(i.waist ? { waist: i.waist } : {}),
        ...(i.length ? { length: i.length } : {}),
        ...(i.variant ? { variant: i.variant } : {}),
        ...(i.code ? { code: i.code } : {}),
      })),
      date: new Date().toLocaleDateString("en-CA"),
      // Stable per-checkout key so retries can't create a duplicate order: the
      // server dedupes on it (unique index) and returns the existing order.
      idempotencyKey: idempotencyKey.value,
    };

    submitting.value = true;

    // Auto-retry until the order is confirmed placed, then surface a failure.
    // Both transient network drops and server-reported failures are retried —
    // safe because the idempotency key means a re-submit that already saved
    // just returns the same order rather than creating a second one. This
    // covers Turso cold starts and blips transparently while the spinner spins.
    const MAX_TRIES = 3;
    let v: any = null;
    let lastNetworkErr: any = null;
    for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
      try {
        const result = await orderAction.submit(orderData);
        v = result?.value ?? null;
        lastNetworkErr = null;
      } catch (err) {
        lastNetworkErr = err;
        v = null;
        console.error(`Order submit threw (attempt ${attempt}/${MAX_TRIES}):`, err);
      }
      if (v?.success === true) break;
      console.error(`Order not confirmed (attempt ${attempt}/${MAX_TRIES}):`, v ?? lastNetworkErr);
      if (attempt < MAX_TRIES) await new Promise((r) => setTimeout(r, 1500 * attempt));
    }

    // Only treat the order as placed when the server explicitly confirms it
    // saved (v.success === true, set after the DB row is read back).
    if (v?.success !== true) {
      let msg = "";
      if (lastNetworkErr) {
        msg = (lastNetworkErr as Error)?.message || "Network error placing order. Please try again.";
      } else {
        msg = v?.message;
        if (!msg && v?.fieldErrors) {
          const flat: string[] = [];
          const walk = (obj: any) => {
            if (Array.isArray(obj)) flat.push(...obj.map(String));
            else if (obj && typeof obj === "object") Object.values(obj).forEach(walk);
          };
          walk(v.fieldErrors);
          msg = flat.join(", ");
        }
        if (!msg && v?.formErrors?.length) msg = v.formErrors.join(", ");
        msg = msg || "We couldn't confirm your order went through. Please try again.";
      }
      serverError.value = msg;
      showError.value = true;
      console.error("Order submission failed after retries.");
      submitting.value = false;
      return;
    }

    // Success — clear the cart, then show the confirmation.
    orderNum.value = v?.orderNumber || "";
    try {
      localStorage.removeItem(`ce_cart_mn_${loginType.value || "clothing"}`);
      document.cookie = "ce_cart_count=0;path=/;max-age=31536000";
    } catch {
      /* ignore */
    }
    cart.items = [];
    window.dispatchEvent(new CustomEvent("cart-updated"));
    orderSubmitted.value = true;
    submitting.value = false;
  });

  return (
    <div class="modal-overlay" onClick$={() => nav("/")}>
      <div class="drawer cart-drawer" onClick$={(e) => e.stopPropagation()}>
        <div class="cart-drawer__site-header">
          <Link href="/" class="site-header__logo">
            <img src="/logo.png" alt="Farm Boy Apparel" class="site-header__logo-img" width="200" height="200" loading="eager" decoding="sync" />
          </Link>
          <nav class="site-header__nav">
            <button class="cart-btn" onClick$={() => nav("/")}>
              <span class="cart-btn__label">{t("cart.mycart", locale.value)}</span>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
            </button>
          </nav>
        </div>
        <div class="cart-drawer__header">
          <img class="cart-drawer__logo" src="/farmboy-logo.svg" alt="Farm Boy Apparel" width="302" height="280" />
          <h2 class="cart-drawer__title">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>{" "}
            {t("cart.title", locale.value)}
          </h2>
          <button class="modal__close cart-drawer__close-desktop" onClick$={() => nav("/")}>x</button>
        </div>

      {isEmpty.value ? (
        <div class="cart-drawer__empty">
          <p>{t("cart.empty", locale.value)}</p>
          <button type="button" class="cart-drawer__back-link" onClick$={() => nav("/")}>
            {t("cart.backtoapparel", locale.value)}
          </button>
        </div>
      ) : (
        <>
          <div class="cart-drawer__details-step">
            <button class="cart-drawer__back-btn" onClick$={() => nav("/")}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
              {t("cart.backtoapparel", locale.value)}
            </button>
            <Collapsible.Root class="cart-drawer__summary" bind:open={summaryOpen}>
              <Collapsible.Trigger class="cart-drawer__checkout-title">
                {t("cart.ordersummary", locale.value)} — {cartCount.value} {cartCount.value !== 1 ? t("cart.items", locale.value) : t("cart.item", locale.value)}
              </Collapsible.Trigger>
              <Collapsible.Content>
                <div class="cart-drawer__summary-list">
                  {cart.items.map((item) => (
                    <div key={`${item.name}-${item.size}`} class="cart-drawer__summary-item">
                      <span>
                        {item.color && item.color.startsWith("#") && <span class="cart-drawer__summary-swatch" style={{ background: item.color }} aria-hidden="true" />}
                        {item.quantity}x {stripColorSuffix(item.name)}{(item.color || item.size) ? ` — ${item.color ? (item.color.startsWith("#") ? colorName(item.color, locale.value) : item.color) : ""}${item.color && item.size ? " / " : ""}${item.size || ""}` : ""}
                      </span>
                      {loginType.value !== "tech" && <span>${(((Number(item.price) || 0) * item.quantity)).toFixed(2)}</span>}
                    </div>
                  ))}
                  {loginType.value !== "tech" && (
                    <>
                      <div class="cart-drawer__summary-item cart-drawer__summary-total">
                        <span>{t("cart.invoice.subtotal", locale.value)}</span>
                        <span>${subtotal.value.toFixed(2)}</span>
                      </div>
                      {empProvince.value ? (
                        <>
                          <div class="cart-drawer__summary-item">
                            <span>{taxLabel.value}</span>
                            <span>${(taxAmount.value ?? 0).toFixed(2)}</span>
                          </div>
                          <div class="cart-drawer__summary-item cart-drawer__summary-total">
                            <span>{t("cart.invoice.total", locale.value)}</span>
                            <span>${orderTotal.value.toFixed(2)}</span>
                          </div>
                        </>
                      ) : (
                        <div class="cart-drawer__summary-item">
                          <span>+ {t("cart.invoice.tax", locale.value)}</span>
                          <span>—</span>
                        </div>
                      )}
                    </>
                  )}
                </div>
              </Collapsible.Content>
            </Collapsible.Root>
            <div class="checkout-modal__form">
              <h3 class="checkout-modal__form-title">{t("cart.orderdetails", locale.value)}</h3>
              <div class="checkout-modal__row">
                <div class={`checkout-modal__field ${formTouched.value && !empFirstName.value ? "checkout-modal__field--error" : ""}`}>
                  <label>{t("cart.firstname", locale.value)}</label>
                  <input type="text" value={empFirstName.value} onInput$={(_, el) => { empFirstName.value = el.value; formError.value = ""; }} />
                </div>
                <div class={`checkout-modal__field ${formTouched.value && !empLastName.value ? "checkout-modal__field--error" : ""}`}>
                  <label>{t("cart.lastname", locale.value)}</label>
                  <input type="text" value={empLastName.value} onInput$={(_, el) => { empLastName.value = el.value; formError.value = ""; }} />
                </div>
              </div>
              {/* Province sits directly under the name row so the tax line in the
                  summary updates before the user fills in phone/email. */}
              <div class={`checkout-modal__field ${formTouched.value && !empProvince.value ? "checkout-modal__field--error" : ""}`}>
                <label>{t("cart.province", locale.value)}</label>
                <select
                  required
                  value={empProvince.value}
                  onChange$={(_, el) => {
                    empProvince.value = el.value;
                    if (!needsLocation(el.value)) empDept.value = "";
                    formError.value = "";
                  }}
                >
                  <option value="" disabled hidden>{locale.value === "fr" ? "Sélectionner…" : "Select…"}</option>
                  <option value="AB">Alberta</option>
                  <option value="BC">British Columbia</option>
                  <option value="MB">Manitoba</option>
                  <option value="NB">New Brunswick</option>
                  <option value="NL">Newfoundland and Labrador</option>
                  <option value="NS">Nova Scotia</option>
                  <option value="ON">Ontario</option>
                  <option value="PE">Prince Edward Island</option>
                  <option value="QC">Quebec</option>
                  <option value="SK">Saskatchewan</option>
                </select>
              </div>
              {needsLocation(empProvince.value) && (
                <div class={`checkout-modal__field ${formTouched.value && !empDept.value ? "checkout-modal__field--error" : ""}`}>
                  <label>{t("cart.location", locale.value)}</label>
                  <input type="text" value={empDept.value} onInput$={(_, el) => (empDept.value = el.value)} />
                </div>
              )}
              <div class={`checkout-modal__field ${formTouched.value && !empEmail.value ? "checkout-modal__field--error" : ""}`}>
                <label>{t("cart.email", locale.value)}</label>
                <input type="email" value={empEmail.value} onInput$={(_, el) => { empEmail.value = el.value; formError.value = ""; }} />
              </div>
              <div class={`checkout-modal__field ${formTouched.value && !empPhone.value ? "checkout-modal__field--error" : ""}`}>
                <label>{t("cart.phone", locale.value)}</label>
                <input type="tel" value={empPhone.value} onInput$={(_, el) => { empPhone.value = el.value; formError.value = ""; }} />
              </div>
              <div class={`checkout-modal__field ${formTouched.value && !empPO.value ? "checkout-modal__field--error" : ""}`}>
                <label>{t("cart.po", locale.value)}</label>
                <input type="text" value={empPO.value} onInput$={(_, el) => (empPO.value = el.value)} />
              </div>
            </div>
          </div>

          {formError.value && (
            <div class="cart-drawer__error" role="alert">{formError.value}</div>
          )}

          <div class="cart-drawer__footer">
            <span class="cart-drawer__total">
              {cartCount.value} {cartCount.value !== 1 ? t("cart.items", locale.value) : t("cart.item", locale.value)}{loginType.value !== "tech" && (empProvince.value ? ` — $${orderTotal.value.toFixed(2)}` : ` — $${subtotal.value.toFixed(2)} + ${t("cart.invoice.tax", locale.value).toLowerCase()}`)}
            </span>
            <button
              class="btn btn--primary cart-drawer__order-btn"
              disabled={!canPlaceOrder.value || submitting.value}
              onClick$={submitOrder}
            >
              {submitting.value ? (
                <>
                  <span class="btn-spinner" aria-hidden="true" />
                  {t("cart.placing", locale.value)}
                </>
              ) : (
                <>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                  {t("cart.createorder", locale.value)}
                </>
              )}
            </button>
          </div>
        </>
      )}

      {/* Order Confirmation */}
      <Modal.Root bind:show={orderSubmitted}>
        <Modal.Panel class="modal-overlay">
          <div class="modal order-confirm">
            <h2 class="order-confirm__title">{t("order.title", locale.value)}</h2>
            {orderNum.value && <p class="order-confirm__number">{orderNum.value}</p>}
            <p class="order-confirm__text">{t("order.text", locale.value)}</p>
            <a href="/" class="btn btn--primary">{t("order.continue", locale.value)}</a>
          </div>
        </Modal.Panel>
      </Modal.Root>

      {/* Order Failure — as prominent as the success modal */}
      <Modal.Root bind:show={showError}>
        <Modal.Panel class="modal-overlay">
          <div class="modal order-confirm order-confirm--error">
            <h2 class="order-confirm__title">{t("order.fail.title", locale.value)}</h2>
            <p class="order-confirm__text">{t("order.fail.text", locale.value)}</p>
            <div class="order-confirm__actions">
              <button
                type="button"
                class="btn btn--primary"
                onClick$={() => { showError.value = false; submitOrder(); }}
              >
                {t("order.fail.retry", locale.value)}
              </button>
            </div>
          </div>
        </Modal.Panel>
      </Modal.Root>
      </div>
    </div>
  );
});

export const head: DocumentHead = {
  title: "Checkout — Farm Boy Apparel",
  meta: [{ name: "robots", content: "noindex" }],
};
