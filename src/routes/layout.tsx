import { component$, Slot, useSignal, useVisibleTask$, $, useContextProvider, useStore, useComputed$, createContextId } from "@builder.io/qwik";
import type { Signal } from "@builder.io/qwik";
import { Modal, Collapsible, Accordion } from '@qwik-ui/headless';
import {
  Link,
  routeAction$,
  routeLoader$,
  useLocation,
  useNavigate,
  Form,
  z,
  zod$,
} from "@builder.io/qwik-city";
import type { Cookie } from "@builder.io/qwik-city";
import { Resend } from "resend";
import { createClient } from "@libsql/client";
import { LocaleContext, t } from "../i18n";
import type { Locale, TranslationKey } from "../i18n";
import { allProducts, colorName as productColorName } from "./apparel/products";

const AUTH_COOKIE = "ce_auth"; // v2: orders persist to db
const LOCALE_COOKIE = "ce_locale";

// Canadian provincial sales tax rates (combined GST/HST/PST/QST)
const PROVINCE_TAX: Record<string, number> = {
  AB: 0.05, BC: 0.12, MB: 0.12, NB: 0.15, NL: 0.15,
  NS: 0.14, ON: 0.13, PE: 0.15, QC: 0.14975, SK: 0.11,
};
const PROVINCE_NAMES: Record<string, string> = {
  AB: "Alberta", BC: "British Columbia", MB: "Manitoba",
  NB: "New Brunswick", NL: "Newfoundland and Labrador",
  NS: "Nova Scotia", ON: "Ontario", PE: "Prince Edward Island",
  QC: "Quebec", SK: "Saskatchewan",
};
const taxRateFor = (code: string): number | undefined => PROVINCE_TAX[code];
// Provinces with a single branch — the Location field is unnecessary for these
const SINGLE_BRANCH_PROVINCES = new Set(["AB", "BC"]);
const needsLocation = (code: string): boolean => !!code && !SINGLE_BRANCH_PROVINCES.has(code);

export const LoginTypeContext = createContextId<Signal<string>>("loginType");

export const useLocaleLoader = routeLoader$(({ cookie }) => {
  const saved = cookie.get(LOCALE_COOKIE)?.value;
  return (saved === "fr" ? "fr" : "en") as Locale;
});

type LoginType = "clothing" | "tech" | "safety" | null;

function getLoginType(cookie: Cookie): LoginType {
  const val = cookie.get(AUTH_COOKIE)?.value;
  if (val === "clothing" || val === "tech" || val === "safety") return val;
  if (val === "authenticated") return "clothing"; // backward compat
  return null;
}

function isAuthenticated(cookie: Cookie): boolean {
  return getLoginType(cookie) !== null;
}

export const useAuthCheck = routeLoader$(({ cookie }) => {
  const loginType = getLoginType(cookie);
  return { loggedIn: loginType !== null, loginType: loginType || "clothing" };
});

export const useCartCountLoader = routeLoader$(({ cookie }) => {
  return parseInt(cookie.get("ce_cart_count")?.value || "0", 10);
});

export const useLogin = routeAction$(
  ({ username, password }, { cookie, fail, env }) => {
    const expectedUser = env.get("APP_USERNAME") || env.get("VITE_APP_USERNAME") || "admin";
    const expectedPass = env.get("APP_PASSWORD") || env.get("VITE_APP_PASSWORD");
    const techUser = env.get("TECH_USERNAME") || env.get("VITE_TECH_USERNAME") || "tech";
    const techPass = env.get("TECH_PASSWORD") || env.get("VITE_TECH_PASSWORD");
    const safetyUser = env.get("SAFETY_USERNAME") || env.get("VITE_SAFETY_USERNAME") || "Safety";
    const safetyPass = env.get("SAFETY_PASSWORD") || env.get("VITE_SAFETY_PASSWORD");

    // Check Tech login first
    if (techPass && username === techUser && password === techPass) {
      cookie.set(AUTH_COOKIE, "tech", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 3,
      });
      return { success: true };
    }

    // Check Safety login
    if (safetyPass && username === safetyUser && password === safetyPass) {
      cookie.set(AUTH_COOKIE, "safety", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 3,
      });
      return { success: true };
    }

    // Check Clothing login
    if (!expectedPass) {
      return fail(500, { message: "Login not configured" });
    }
    if (username === expectedUser && password === expectedPass) {
      cookie.set(AUTH_COOKIE, "clothing", {
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 3,
      });
      return { success: true };
    }
    return fail(401, { message: "Invalid username or password" });
  },
  zod$({
    username: z.string().min(1).max(64),
    password: z.string().min(1).max(128),
  }),
);

export const useLogout = routeAction$(async (_, { cookie }) => {
  cookie.delete(AUTH_COOKIE, { path: "/" });
  return { success: true };
});

// HTML-escape user-provided strings before they go into the order email body
function esc(s: string | undefined | null): string {
  if (s == null) return "";
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export const useSubmitOrder = routeAction$(
  async (data, { fail, env, cookie }) => {
    if (!isAuthenticated(cookie)) {
      return fail(401, { message: "Not authenticated" });
    }
    const lt = getLoginType(cookie);
    const vendor = lt === "tech" ? "farmboy-tech" : lt === "safety" ? "farmboy-safety" : "farmboy";
    // Read from non-prefixed names first, fall back to VITE_* for backward compat.
    // Both are safe at runtime — env.get() reads server env, never bundles.
    const tursoUrl = env.get("TURSO_URL") || env.get("VITE_TURSO_URL");
    const tursoToken = env.get("TURSO_AUTH_TOKEN") || env.get("VITE_TURSO_AUTH_TOKEN");
    const apiKey = env.get("RESEND_API_KEY") || env.get("VITE_RESEND_API_KEY");

    const { employee, items, date } = data;

  // Resolve color names from the single source of truth (auto-generated from
  // the DB in products.ts), so the email never drifts out of sync. English is
  // used for the order email regardless of the customer's browsing locale.
  const cName = (hex: string) => productColorName(hex, "en");

  const province = employee.province;
  if (!province || !PROVINCE_TAX[province]) {
    return fail(400, { message: "Please select a province before submitting the order." });
  }
  const taxRate = PROVINCE_TAX[province];
  const taxPct = +(taxRate * 100).toFixed(3);
  const subtotal = items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0);
  const tax = subtotal * taxRate;
  const total = subtotal + tax;

  // Insert order into Turso database
  if (!tursoUrl || !tursoToken) {
    return fail(500, { message: "Order database not configured (missing env vars)" });
  }
  let orderNumber = "";
  try {
    const db = createClient({ url: tursoUrl, authToken: tursoToken });
    const result = await db.execute({
      sql: `INSERT INTO orders (vendor, emp_number, emp_name, emp_dept, po_number, items, total, status, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 'pending', datetime('now'), datetime('now'))`,
      args: [
        vendor,
        "",
        employee.name,
        employee.department,
        employee.po || "",
        JSON.stringify(items),
        total,
      ],
    });
    const insertedId = result.lastInsertRowid;
    if (insertedId != null) {
      const seq = await db.execute({
        sql: "SELECT COUNT(*) AS n FROM orders WHERE vendor LIKE 'farmboy%' AND id <= ?",
        args: [insertedId as any],
      });
      const n = Number((seq.rows[0] as any)?.n) || Number(insertedId);
      orderNumber = `FB-${n}`;
    }
  } catch (err) {
    console.error("Failed to save order to database:", err);
    return fail(500, { message: "Order could not be saved. Please try again." });
  }

  // Send order confirmation email
  if (!apiKey) {
    console.warn("RESEND_API_KEY not configured — order saved but email not sent");
    return { success: true };
  }

  const itemRows = items.map((i: any) =>
    `<tr>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${esc(i.name)}${i.code ? ` <span style="color:#999;font-size:12px">${esc(i.code)}</span>` : i.sku ? ` <span style="color:#999;font-size:12px">(${esc(i.sku)})</span>` : ""}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee">${i.color ? esc(cName(i.color)) + " / " : ""}${esc(i.size)}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:center">${i.quantity}</td>
      <td style="padding:6px 12px;border-bottom:1px solid #eee;text-align:right">$${(((Number(i.price) || 0) * i.quantity)).toFixed(2)}</td>
    </tr>`
  ).join("");

  const fromAddress = env.get("RESEND_FROM") || env.get("VITE_RESEND_FROM") || "Farm Boy Apparel <onboarding@resend.dev>";
  // Staff notification addresses (comma-separated → trimmed array, empties dropped).
  const staffAddresses = (env.get("ORDER_NOTIFY_TO") || env.get("VITE_ORDER_NOTIFY_TO") || "info@farmboyapparel.ca")
    .split(",")
    .map((a) => a.trim())
    .filter(Boolean);
  // Customer is the visible recipient; staff is BCC'd. If the customer
  // didn't provide an email, send To staff directly so the order still arrives.
  const customerEmail = (employee.email || "").trim();
  const toAddresses = customerEmail ? [customerEmail] : staffAddresses;
  const bccAddresses = customerEmail ? staffAddresses : [];

  const html = `
    <div style="font-family:sans-serif;max-width:600px;margin:0 auto">
      <div style="background:#a4161e;padding:20px 24px;border-radius:8px 8px 0 0">
        <h1 style="color:#fff;margin:0;font-size:20px">Farm Boy Apparel</h1>
        ${orderNumber ? `<p style="color:#f0cccd;margin:6px 0 0;font-size:13px;letter-spacing:0.04em">Order #${esc(orderNumber)}</p>` : ""}
      </div>
      <div style="padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px">
        <p style="margin:0 0 16px;font-size:16px">Thank you for your order!</p>
        <p style="margin:0 0 4px"><strong>Date:</strong> ${esc(date)}</p>
        <p style="margin:0 0 4px"><strong>Name:</strong> ${esc(employee.name)}</p>
        ${employee.email ? `<p style="margin:0 0 4px"><strong>Email:</strong> <a href="mailto:${esc(employee.email)}">${esc(employee.email)}</a></p>` : ""}
        ${employee.phone ? `<p style="margin:0 0 4px"><strong>Phone:</strong> ${esc(employee.phone)}</p>` : ""}
        ${employee.department ? `<p style="margin:0 0 4px"><strong>Location:</strong> ${esc(employee.department)}</p>` : ""}
        <p style="margin:0 0 4px"><strong>Province:</strong> ${esc(PROVINCE_NAMES[province] || province)}</p>
        ${employee.po ? `<p style="margin:0 0 4px"><strong>PO #:</strong> ${esc(employee.po)}</p>` : ""}
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:16px 0">
        <table style="width:100%;border-collapse:collapse;font-size:14px">
          <thead>
            <tr style="background:#f9fafb">
              <th style="padding:8px 12px;text-align:left">Product</th>
              <th style="padding:8px 12px;text-align:left">Details</th>
              <th style="padding:8px 12px;text-align:center">Qty</th>
              <th style="padding:8px 12px;text-align:right">Total</th>
            </tr>
          </thead>
          <tbody>${itemRows}</tbody>
          <tfoot>
            <tr>
              <td colspan="3" style="padding:6px 12px;text-align:right">Subtotal</td>
              <td style="padding:6px 12px;text-align:right">$${subtotal.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="3" style="padding:6px 12px;text-align:right">Tax (${esc(province)} ${taxPct}%)</td>
              <td style="padding:6px 12px;text-align:right">$${tax.toFixed(2)}</td>
            </tr>
            <tr>
              <td colspan="3" style="padding:10px 12px;text-align:right;font-weight:700">Total</td>
              <td style="padding:10px 12px;text-align:right;font-weight:700;color:#d5202a">$${total.toFixed(2)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  `;

  try {
    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: fromAddress,
      to: toAddresses,
      ...(bccAddresses.length ? { bcc: bccAddresses } : {}),
      subject: `${orderNumber ? `#${orderNumber} — ` : ""}Apparel Order — ${employee.name} — ${date}`,
      html,
    });
  } catch (err) {
    console.error("Failed to send order email:", err);
    // Order was already saved — don't fail the whole action
  }

  return { success: true };
  },
  zod$({
    employee: z.object({
      name: z.string().min(1).max(120),
      email: z.string().email().max(254).or(z.literal("")),
      phone: z.string().max(40),
      department: z.string().max(120),
      province: z.string().length(2),
      po: z.string().min(1).max(60),
    }),
    items: z
      .array(
        z.object({
          name: z.string().min(1).max(200),
          sku: z.string().max(40).optional().nullable(),
          color: z.string().max(40).optional().nullable().default(""),
          size: z.string().max(40).optional().nullable().default(""),
          quantity: z.coerce.number().int().min(1).max(999),
          price: z.coerce.number().nonnegative().max(100000),
          waist: z.string().max(20).optional().nullable(),
          length: z.string().max(20).optional().nullable(),
          variant: z.string().max(40).optional().nullable(),
          code: z.string().max(40).optional().nullable(),
        }),
      )
      .min(1)
      .max(100),
    date: z.string().min(1).max(40),
  }),
);

function stripColorSuffix(name: string): string {
  const i = name.lastIndexOf(" - ");
  return i > -1 ? name.slice(0, i) : name;
}

interface CartItem {
  name: string;
  sku: string;
  category: string;
  size: string;
  color: string;
  quantity: number;
  price: number;
  img: string;
  waist?: string;
  length?: string;
  variant?: string;
  code?: string;
}

const colorKeyMap: Record<string, string> = {
  "#00703c": "color.green",
  "#1a1a18": "color.black",
  "#ffffff": "color.white",
  "#2c3e50": "color.navy",
  "#6e6e6e": "color.grey",
  "#94a3b8": "color.silver",
  "#E6570C": "color.orange",
  "#ff6600": "color.safetyorange",
  "#e4ba3f": "color.yellow",
  "#c0392b": "color.red",
  "#6b3fa0": "color.purple",
  "#1e40af": "color.royal",
  "#b8b8b8": "color.greyheather",
  "#7dd3fc": "color.lightblue",
  "#6b8bb0": "color.solaceblue",
  "#4a4a4a": "color.charcoal",
  "#8d5f18": "color.bronze",
  "#8a5d3b": "color.carharttbrown",
  "#00b5e2": "color.skyblue",
  "#c2a878": "color.darktan",
};

const colorName = (hex: string, locale: Locale): string => {
  const key = colorKeyMap[hex];
  if (key) return t(key as TranslationKey, locale);
  return hex;
};

export default component$(() => {
  const loc = useLocation();
  // The home page is a single-screen (~100vh) layout, so the footer is redundant there.
  const isHome = useComputed$(() => loc.url.pathname === "/");
  const nav = useNavigate();
  const auth = useAuthCheck();
  const loginAction = useLogin();
  const logoutAction = useLogout();
  const orderAction = useSubmitOrder();

  const showLogin = useSignal(false);
  const overlayFading = useSignal(false);
  const menuOpen = useSignal(false);
  const savedLocale = useLocaleLoader();
  const locale = useSignal<Locale>(savedLocale.value);

  useContextProvider(LocaleContext, locale);

  const loginType = useSignal(auth.value.loginType);
  useContextProvider(LoginTypeContext, loginType);

  // Cart state
  const initialCartCount = useCartCountLoader();
  const cart = useStore<{ items: CartItem[] }>({ items: [] });
  const ssrCartCount = useSignal(initialCartCount.value);
  const cartOpen = useSignal(false);
  const orderSubmitted = useSignal(false);
  const checkoutOpen = useSignal(false);
  const checkoutStep = useSignal<"cart" | "details">("cart");
  const summaryOpen = useSignal(true);
  const formError = useSignal("");
  const formTouched = useSignal(false);
  const empFirstName = useSignal("");
  const empLastName = useSignal("");
  const empEmail = useSignal("");
  const empPhone = useSignal("");
  const empDept = useSignal("");
  const empProvince = useSignal("");
  const empPO = useSignal("");

  const cartCount = useComputed$(() => {
    const count = cart.items.reduce((sum, i) => sum + i.quantity, 0);
    return count > 0 ? count : ssrCartCount.value;
  });
  const subtotal = useComputed$(() =>
    cart.items.reduce((sum, i) => sum + (Number(i.price) || 0) * i.quantity, 0),
  );
  const taxRate = useComputed$(() => taxRateFor(empProvince.value));
  const taxAmount = useComputed$(() => taxRate.value === undefined ? undefined : subtotal.value * taxRate.value);
  const orderTotal = useComputed$(() => subtotal.value + (taxAmount.value ?? 0));
  const taxLabel = useComputed$(() => {
    if (taxRate.value === undefined) return t("cart.invoice.tax", locale.value);
    const pct = +(taxRate.value * 100).toFixed(3);
    return `${t("cart.invoice.tax", locale.value)} (${empProvince.value} ${pct}%)`;
  });
  const headerScrolled = useSignal(false);

  // Locale toggle removed — buttons commented out site-wide.
  // To re-enable: restore the const toggleLocale = $(() => { ... }) and the
  // commented-out buttons in the site/header/drawer.

  // Load cart from localStorage — eager strategy to ensure it runs immediately
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(
    ({ track, cleanup }) => {
    track(() => loginType.value);
    const cartStorageKey = () => `ce_cart_mn_${loginType.value || "clothing"}`;
    const loadCart = () => {
      try {
        const saved = localStorage.getItem(cartStorageKey());
        if (saved) {
          cart.items = JSON.parse(saved) as CartItem[];
        } else {
          cart.items = [];
        }
        const count = cart.items.reduce((sum, i: any) => sum + i.quantity, 0);
        document.cookie = `ce_cart_count=${count};path=/;max-age=31536000`;
        ssrCartCount.value = 0; // clear SSR fallback once real data loaded
      } catch { cart.items = []; }
    };
    loadCart();
    window.addEventListener("cart-updated", loadCart);
    cleanup(() => window.removeEventListener("cart-updated", loadCart));
  }, { strategy: 'document-ready' });

  const saveCart = $(() => {
    try {
      const key = `ce_cart_mn_${loginType.value || "clothing"}`;
      localStorage.setItem(key, JSON.stringify(cart.items));
      const count = cart.items.reduce((sum, i) => sum + i.quantity, 0);
      document.cookie = `ce_cart_count=${count};path=/;max-age=31536000`;
    } catch { /* ignore */ }
  });

  const updateQty = $(async (index: number, delta: number) => {
    const newQty = cart.items[index].quantity + delta;
    if (newQty < 1) {
      cart.items = cart.items.filter((_, i) => i !== index);
    } else {
      cart.items = cart.items.map((item, i) => i === index ? { ...item, quantity: newQty } : item);
    }
    await saveCart();
    window.dispatchEvent(new CustomEvent("cart-updated"));
  });

  const submitOrder = $(async () => {
    formTouched.value = true;
    const locationRequired = needsLocation(empProvince.value);
    if (!empFirstName.value || !empLastName.value || !empEmail.value || !empPhone.value || !empProvince.value || (locationRequired && !empDept.value) || !empPO.value) {
      formError.value = t("cart.error.required", locale.value);
      checkoutOpen.value = true;
      return;
    }
    // Email format check (basic RFC-ish — anything@anything.tld)
    const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRe.test(empEmail.value.trim())) {
      formError.value = t("cart.error.email", locale.value);
      checkoutOpen.value = true;
      return;
    }
    // Phone format check — at least 7 digits, allow +, spaces, dashes, parens
    const phoneDigits = empPhone.value.replace(/[^\d]/g, "");
    if (phoneDigits.length < 7 || phoneDigits.length > 15 || !/^[\d\s+()\-.]+$/.test(empPhone.value.trim())) {
      formError.value = t("cart.error.phone", locale.value);
      checkoutOpen.value = true;
      return;
    }
    formError.value = "";

    const orderData = {
      employee: { name: `${empFirstName.value} ${empLastName.value}`, email: empEmail.value, phone: empPhone.value, department: empDept.value, province: empProvince.value, po: empPO.value },
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
    };

    // Send order via server action
    let result: any;
    try {
      result = await orderAction.submit(orderData);
    } catch (err) {
      console.error("Order submit threw:", err);
      formError.value = (err as Error)?.message || "Network error placing order";
      return;
    }
    console.log("Order submit result:", result);
    const v = result?.value as any;
    if (v?.failed) {
      // Surface zod field errors, top-level form errors, or generic message
      let msg = v.message;
      if (!msg && v.fieldErrors) {
        const flat: string[] = [];
        const walk = (obj: any) => {
          if (Array.isArray(obj)) flat.push(...obj.map(String));
          else if (obj && typeof obj === "object") Object.values(obj).forEach(walk);
        };
        walk(v.fieldErrors);
        msg = flat.join(", ");
      }
      if (!msg && v.formErrors?.length) msg = v.formErrors.join(", ");
      formError.value = msg || "Failed to place order. Please try again.";
      console.error("Order submission failed:", v);
      return;
    }

    cart.items = [];
    await saveCart();
    window.dispatchEvent(new CustomEvent("cart-updated"));
    orderSubmitted.value = true;
    cartOpen.value = false;
    empFirstName.value = "";
    empLastName.value = "";
    empEmail.value = "";
    empPhone.value = "";
    empDept.value = "";
    empProvince.value = "";
    empPO.value = "";
    formTouched.value = false;
  });


  // Listen for open-cart events from child pages
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const handler = () => {
      cartOpen.value = true;
      checkoutStep.value = "details";
      checkoutOpen.value = true;
    };
    window.addEventListener("open-cart", handler);
    cleanup(() => window.removeEventListener("open-cart", handler));
  }, { strategy: 'document-ready' });

  // Sticky header on scroll (mobile landing page)
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ cleanup }) => {
    const onScroll = () => {
      headerScrolled.value = window.scrollY > 60;
      document.documentElement.classList.toggle("scrolled", window.scrollY > 60);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    cleanup(() => window.removeEventListener("scroll", onScroll));
  }, { strategy: 'document-ready' });

  // Lock scroll when menu is open
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => menuOpen.value);
    if (menuOpen.value) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.overflow = "hidden";
    } else {
      const scrollY = Math.abs(parseInt(document.body.style.top || "0", 10));
      document.body.style.cssText = "";
      window.scrollTo({ top: scrollY, behavior: "instant" });
    }
  }, { strategy: 'document-ready' });

  // Close cart on navigation
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => loc.url.pathname);
    cartOpen.value = false;
  }, { strategy: 'document-ready' });

  // Lock scroll when cart is open
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track }) => {
    track(() => cartOpen.value);
    if (cartOpen.value) {
      const scrollY = window.scrollY;
      document.body.style.position = "fixed";
      document.body.style.top = `-${scrollY}px`;
      document.body.style.left = "0";
      document.body.style.right = "0";
      document.body.style.overflow = "hidden";
    } else {
      const scrollY = Math.abs(parseInt(document.body.style.top || "0", 10));
      document.body.style.cssText = "";
      window.scrollTo({ top: scrollY, behavior: "instant" });
    }
  }, { strategy: 'document-ready' });

  // Auto-open login modal and lock scroll for unauthenticated users
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(() => {
    if (!auth.value.loggedIn) {
      showLogin.value = true;
      document.documentElement.style.overflow = "hidden";
      document.body.style.position = "fixed";
      document.body.style.inset = "0";
      document.body.style.overflow = "hidden";
    }
  }, { strategy: 'document-ready' });

  // Close modal and unlock scroll on successful login
  // eslint-disable-next-line qwik/no-use-visible-task
  useVisibleTask$(({ track, cleanup }) => {
    track(() => loginAction.value);
    if (loginAction.value && !loginAction.value.failed) {
      overlayFading.value = true;
      document.documentElement.style.overflow = "";
      document.body.style.cssText = "";
      window.scrollTo({ top: 0, behavior: "instant" });
      const tid = setTimeout(() => {
        showLogin.value = false;
        overlayFading.value = false;
      }, 800);
      cleanup(() => clearTimeout(tid));
    }
  }, { strategy: 'document-ready' });

  return (
    <>
      {/* Login Modal */}
      {showLogin.value && (
        <div class={`login-overlay ${overlayFading.value ? "login-overlay--fading" : ""}`} onClick$={() => { if (auth.value.loggedIn) showLogin.value = false; }}>
          <div class="login-modal" onClick$={(e) => e.stopPropagation()}>
            {auth.value.loggedIn && (
              <button
                class="login-modal__close"
                onClick$={() => (showLogin.value = false)}
                aria-label="Close"
              >
                &times;
              </button>
            )}
            <div class="login-modal__header">
              <div class="login-modal__brand">
                <img class="login-modal__logo" src="/farmboy-logo.svg" alt="Farm Boy Apparel" width="302" height="280" />
              </div>
              <p class="login-modal__subtitle">
                {t("login.subtitle", locale.value)}
              </p>
            </div>
            <Form action={loginAction} reloadDocument class="login-modal__form">
              {loginAction.value?.failed && (
                <div class="login-modal__error">{loginAction.value.message}</div>
              )}
              <div class="login-modal__field">
                <label for="username">{t("login.username", locale.value)}</label>
                <input
                  id="username"
                  name="username"
                  type="text"
                  autoComplete="username"
                  required
                  placeholder={t("login.username.placeholder", locale.value)}
                />
              </div>
              <div class="login-modal__field">
                <label for="password">{t("login.password", locale.value)}</label>
                <input
                  id="password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  placeholder={t("login.password.placeholder", locale.value)}
                />
              </div>
              <button type="submit" class="btn btn--green login-modal__submit">
                {loginAction.isRunning ? t("login.submitting", locale.value) : t("login.submit", locale.value)}
              </button>
            </Form>
          </div>
        </div>
      )}

      {(auth.value.loggedIn || (loginAction.value && !loginAction.value.failed)) && <>
      <header class={`site-header site-header--white ${isHome.value ? "site-header--off" : ""} ${cartOpen.value ? "site-header--cart-open" : ""}`}>
        <div class="site-header__inner">
          <Link href="/" class="site-header__logo brand-cluster brand-cluster--small">
            <svg class="brand-cluster__mark" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <polygon points="50,50 50,0 100,0" fill="#ffe2a6" />
              <polygon points="50,50 100,0 100,50" fill="#ae1f2a" />
              <polygon points="50,50 100,50 100,100" fill="#d43950" />
              <polygon points="50,50 100,100 50,100" fill="#9ec069" />
              <polygon points="50,50 50,100 0,100" fill="#7fa244" />
              <polygon points="50,50 0,100 0,50" fill="#4689b3" />
              <polygon points="50,50 0,50 0,0" fill="#31759c" />
              <polygon points="50,50 0,0 50,0" fill="#ffd25b" />
            </svg>
            <div class="brand-cluster__words">
              <span class="brand-cluster__word">FARM BOY</span>
              <span class="brand-cluster__word brand-cluster__word--sub">APPAREL</span>
            </div>
          </Link>
          <nav class="site-header__categories">
            <Link href="/" class={loc.url.pathname === "/" ? "active" : ""}>{t("nav.home", locale.value)}</Link>
            <Link href="/apparel/" class={loc.url.pathname.startsWith("/apparel") ? "active" : ""}>{loginType.value === "tech" ? t("cat.Work Wear", locale.value) : t("nav.apparel", locale.value)}</Link>
          </nav>
          <nav class="site-header__nav">
            {/* <button class={`locale-btn ${cartOpen.value ? "locale-btn--cart-open" : ""}`} onClick$={toggleLocale} aria-label="Toggle language">
              <span class="locale-btn__full">{locale.value === "en" ? "Français" : "English"}</span>
              <span class="locale-btn__short">{locale.value === "en" ? "FR" : "EN"}</span>
              <svg class="locale-btn__icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
            </button> */}
            <button class={`cart-btn ${cart.items.length > 0 ? "cart-btn--active" : ""}`} onClick$={() => { cartOpen.value = !cartOpen.value; if (!cartOpen.value) checkoutStep.value = "cart"; }}>
              <span class="cart-btn__label">{t("cart.mycart", locale.value)}</span>
              {cartOpen.value ? (
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
              ) : (
                <>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg>
                  <span class={`cart-btn__dot ${cart.items.length > 0 ? "cart-btn__dot--visible" : ""}`} />
                </>
              )}
            </button>
            <Form action={logoutAction} reloadDocument class="logout-form">
              <button type="submit" class="logout-btn" aria-label={t("login.logout", locale.value)}>
                <span class="logout-btn__label">{t("login.logout", locale.value)}</span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              </button>
            </Form>
            <button class="hamburger-btn" onClick$={() => (menuOpen.value = !menuOpen.value)} aria-label="Menu">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12h18"/><path d="M3 6h18"/><path d="M3 18h18"/></svg>
            </button>
          </nav>
        </div>
      </header>

      {/* Mobile Nav Drawer */}
      {menuOpen.value && (
        <div class="nav-drawer-overlay" onClick$={() => (menuOpen.value = false)}>
          <nav class="nav-drawer" onClick$={(e) => e.stopPropagation()}>
            <div class="nav-drawer__header">
              <div class="nav-drawer__brand brand-cluster brand-cluster--small">
                <svg class="brand-cluster__mark" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
                  <polygon points="50,50 50,0 100,0" fill="#ffe2a6" />
                  <polygon points="50,50 100,0 100,50" fill="#ae1f2a" />
                  <polygon points="50,50 100,50 100,100" fill="#d43950" />
                  <polygon points="50,50 100,100 50,100" fill="#9ec069" />
                  <polygon points="50,50 50,100 0,100" fill="#7fa244" />
                  <polygon points="50,50 0,100 0,50" fill="#4689b3" />
                  <polygon points="50,50 0,50 0,0" fill="#31759c" />
                  <polygon points="50,50 0,0 50,0" fill="#ffd25b" />
                </svg>
                <div class="brand-cluster__words">
                  <span class="brand-cluster__word">FARM BOY</span>
                  <span class="brand-cluster__word brand-cluster__word--sub">APPAREL</span>
                </div>
              </div>
              <button class="nav-drawer__close" onClick$={() => (menuOpen.value = false)} aria-label="Close">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
              </button>
            </div>
            <div class="nav-drawer__links">
              <a href="/" class={`nav-drawer__link ${loc.url.pathname === "/" ? "active" : ""}`} onClick$={() => (menuOpen.value = false)}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                {t("nav.home", locale.value)}
              </a>
              {loginType.value === "tech" && (
                <a href="/apparel/" class={`nav-drawer__link ${loc.url.pathname.startsWith("/apparel") ? "active" : ""}`} onClick$={() => { menuOpen.value = false; window.dispatchEvent(new CustomEvent("select-category", { detail: "Work Wear" })); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 2v4M16 2v4M4 6h16v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6z"/><path d="M4 6l-2 4v2h4V8"/><path d="M20 6l2 4v2h-4V8"/></svg>
                  {t("cat.Work Wear", locale.value)}
                </a>
              )}
              {loginType.value === "safety" && (
                <a href="/apparel/" class={`nav-drawer__link ${loc.url.pathname.startsWith("/apparel") ? "active" : ""}`} onClick$={() => { menuOpen.value = false; window.dispatchEvent(new CustomEvent("select-category", { detail: "Flame Resistant" })); }}>
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l8 4v6c0 5-3.5 9-8 10-4.5-1-8-5-8-10V6l8-4z"/><path d="M9 12l2 2 4-4"/></svg>
                  {t("cat.Flame Resistant", locale.value)}
                </a>
              )}
              {loginType.value !== "tech" && (() => {
                const NAV_CATS: { key: TranslationKey; cat: string; icon: string }[] = [
                  { key: "cat.Shirts",  cat: "Shirts",  icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.38 3.46 16 2a4 4 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.47a1 1 0 0 0 .99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 0 0 2-2V10h2.15a1 1 0 0 0 .99-.84l.58-3.47a2 2 0 0 0-1.34-2.23z"/></svg>' },
                  { key: "cat.Jackets", cat: "Jackets", icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2l5 6v12a2 2 0 01-2 2h-3V12h-6v10H6a2 2 0 01-2-2V8l5-6"/><path d="M9 2a3 3 0 006 0"/><line x1="12" y1="12" x2="12" y2="22"/></svg>' },
                  { key: "cat.Hats",    cat: "Hats",    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 00-7 7c0 3 2 5 3 6h8c1-1 3-3 3-6a7 7 0 00-7-7z"/><path d="M5 15h14"/><path d="M6 18h12"/></svg>' },
                  { key: "cat.SWAG",    cat: "SWAG",    icon: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 12 20 22 4 22 4 12"/><rect x="2" y="7" width="20" height="5"/><line x1="12" y1="22" x2="12" y2="7"/><path d="M12 7H7.5a2.5 2.5 0 010-5C11 2 12 7 12 7z"/><path d="M12 7h4.5a2.5 2.5 0 000-5C13 2 12 7 12 7z"/></svg>' },
                ];
                return (
                  <Accordion.Root class="nav-drawer__accordion" collapsible>
                    {NAV_CATS.map((c) => {
                      const items = allProducts.filter((p) => p.category === c.cat);
                      return (
                        <Accordion.Item key={c.cat} value={c.cat} class="nav-drawer__cat">
                          <Accordion.Header as="h3">
                            <Accordion.Trigger class="nav-drawer__cat-trigger">
                              {/* When the category is already expanded, clicking
                                  the name navigates to the full category view
                                  (all products) instead of collapsing. When
                                  collapsed, the click bubbles to the trigger and
                                  expands the accordion as usual. */}
                              <span
                                class="nav-drawer__cat-label"
                                onClick$={async (e, el) => {
                                  const trigger = el.closest(".nav-drawer__cat-trigger");
                                  if (trigger?.hasAttribute("data-open")) {
                                    e.stopPropagation();
                                    menuOpen.value = false;
                                    window.dispatchEvent(new CustomEvent("select-category", { detail: c.cat }));
                                    await nav(`/apparel/#${c.cat.toLowerCase()}`);
                                  }
                                }}
                              >
                                <span class="nav-drawer__cat-icon" dangerouslySetInnerHTML={c.icon} />
                                {t(c.key, locale.value)}
                              </span>
                              <svg class="nav-drawer__cat-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                            </Accordion.Trigger>
                          </Accordion.Header>
                          <Accordion.Content class="nav-drawer__cat-content">
                            {items.length === 0 ? (
                              <span class="nav-drawer__cat-empty">—</span>
                            ) : items.map((p) => (
                              <a key={p.sku} href={`/apparel/${p.sku}/`} class="nav-drawer__cat-item" onClick$={() => (menuOpen.value = false)}>
                                <img src={p.img} alt="" width="24" height="24" class="nav-drawer__cat-item-img" loading="lazy" decoding="async" />
                                {p.name.replace(/#\S+/g, '').replace(/\s*-\s*$/, '').trim()}
                              </a>
                            ))}
                          </Accordion.Content>
                        </Accordion.Item>
                      );
                    })}
                  </Accordion.Root>
                );
              })()}
            </div>
            <div class="nav-drawer__footer">
              {/* <button class="nav-drawer__locale" onClick$={() => { toggleLocale(); }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 014 10 15.3 15.3 0 01-4 10 15.3 15.3 0 01-4-10 15.3 15.3 0 014-10z"/></svg>
                {locale.value === "en" ? "Français" : "English"}
              </button> */}
              <Form action={logoutAction} reloadDocument>
                <button type="submit" class="nav-drawer__locale nav-drawer__logout">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                  {t("login.logout", locale.value)}
                </button>
              </Form>
            </div>
          </nav>
        </div>
      )}

      <main>
        <Slot />
      </main>

      {!isHome.value && (
      <footer class="site-footer">
        <div class="site-footer__inner">
          <div class="site-footer__brand brand-cluster brand-cluster--small">
            <svg class="brand-cluster__mark" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
              <polygon points="50,50 50,0 100,0" fill="#ffe2a6" />
              <polygon points="50,50 100,0 100,50" fill="#ae1f2a" />
              <polygon points="50,50 100,50 100,100" fill="#d43950" />
              <polygon points="50,50 100,100 50,100" fill="#9ec069" />
              <polygon points="50,50 50,100 0,100" fill="#7fa244" />
              <polygon points="50,50 0,100 0,50" fill="#4689b3" />
              <polygon points="50,50 0,50 0,0" fill="#31759c" />
              <polygon points="50,50 0,0 50,0" fill="#ffd25b" />
            </svg>
            <div class="brand-cluster__words">
              <span class="brand-cluster__word">FARM BOY</span>
              <span class="brand-cluster__word brand-cluster__word--sub">APPAREL</span>
            </div>
          </div>
          <div class="site-footer__col">
          {loginType.value === "safety" && (
          <nav class="site-footer__links">
            <Link href="/">{t("nav.home", locale.value)}</Link>
            <a href="/apparel/#fr" onClick$={(e) => { if (loc.url.pathname.startsWith("/apparel")) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Flame Resistant" })); const headerH = window.innerWidth < 768 ? 49 : (window.innerWidth <= 1024 ? 52 : 58); const grid = document.querySelector('.home-catalog .apparel-grid'); if (grid) { const top = grid.getBoundingClientRect().top + window.scrollY - headerH - 8; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Flame Resistant", locale.value)}</a>
            <a href="/apparel/#shirts" onClick$={(e) => { if (loc.url.pathname.startsWith("/apparel")) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Shirts" })); const headerH = window.innerWidth < 768 ? 49 : (window.innerWidth <= 1024 ? 52 : 58); const grid = document.querySelector('.home-catalog .apparel-grid'); if (grid) { const top = grid.getBoundingClientRect().top + window.scrollY - headerH - 8; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Shirts", locale.value)}</a>
            <a href="/apparel/#hats" onClick$={(e) => { if (loc.url.pathname.startsWith("/apparel")) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Hats" })); const headerH = window.innerWidth < 768 ? 49 : (window.innerWidth <= 1024 ? 52 : 58); const grid = document.querySelector('.home-catalog .apparel-grid'); if (grid) { const top = grid.getBoundingClientRect().top + window.scrollY - headerH - 8; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Hats", locale.value)}</a>
          </nav>
          )}
          {(loginType.value !== "tech" && loginType.value !== "safety") && (
          <nav class="site-footer__links">
            <Link href="/">{t("nav.home", locale.value)}</Link>
            <a href="/apparel/#shirts" onClick$={(e) => { if (loc.url.pathname.startsWith("/apparel")) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Shirts" })); const headerH = window.innerWidth < 768 ? 49 : (window.innerWidth <= 1024 ? 52 : 58); const grid = document.querySelector('.home-catalog .apparel-grid'); if (grid) { const top = grid.getBoundingClientRect().top + window.scrollY - headerH - 8; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Shirts", locale.value)}</a>
            <a href="/apparel/#jackets" onClick$={(e) => { if (loc.url.pathname.startsWith("/apparel")) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Jackets" })); const headerH = window.innerWidth < 768 ? 49 : (window.innerWidth <= 1024 ? 52 : 58); const grid = document.querySelector('.home-catalog .apparel-grid'); if (grid) { const top = grid.getBoundingClientRect().top + window.scrollY - headerH - 8; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Jackets", locale.value)}</a>
            <a href="/apparel/#hats" onClick$={(e) => { if (loc.url.pathname.startsWith("/apparel")) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "Hats" })); const headerH = window.innerWidth < 768 ? 49 : (window.innerWidth <= 1024 ? 52 : 58); const grid = document.querySelector('.home-catalog .apparel-grid'); if (grid) { const top = grid.getBoundingClientRect().top + window.scrollY - headerH - 8; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.Hats", locale.value)}</a>
            <a href="/apparel/#swag" onClick$={(e) => { if (loc.url.pathname.startsWith("/apparel")) { e.preventDefault(); } window.dispatchEvent(new CustomEvent("select-category", { detail: "SWAG" })); const headerH = window.innerWidth < 768 ? 49 : (window.innerWidth <= 1024 ? 52 : 58); const grid = document.querySelector('.home-catalog .apparel-grid'); if (grid) { const top = grid.getBoundingClientRect().top + window.scrollY - headerH - 8; window.scrollTo({ top, behavior: 'instant' }); } }}>{t("cat.SWAG", locale.value)}</a>
          </nav>
          )}
          <div class="site-footer__contact site-footer__contact--inline">
            <svg class="site-footer__contact-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/></svg>
            <a href="mailto:info@farmboyapparel.ca">info@farmboyapparel.ca</a>
          </div>
          </div>
        </div>
      </footer>
      )}

      {/* Cart Drawer */}
      {cartOpen.value && (
        <div class="modal-overlay" onClick$={() => (cartOpen.value = false)}>
          <div class="drawer cart-drawer" onClick$={(e) => e.stopPropagation()}>
            <div class="cart-drawer__site-header">
              <Link href="/" class="site-header__logo">
                <img src="/logo.png" alt="Farm Boy Apparel" class="site-header__logo-img" width="200" height="200" loading="eager" decoding="sync" />
              </Link>
              <nav class="site-header__nav">
                <button class="cart-btn" onClick$={() => (cartOpen.value = false)}>
                  <span class="cart-btn__label">{t("cart.mycart", locale.value)}</span>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18"/><path d="M6 6l12 12"/></svg>
                </button>
              </nav>
            </div>
            <div class="cart-drawer__header">
              <img class="cart-drawer__logo" src="/farmboy-logo.svg" alt="Farm Boy Apparel" width="302" height="280" />
              <h2 class="cart-drawer__title"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 002 1.61h9.72a2 2 0 002-1.61L23 6H6"/></svg> {t("cart.title", locale.value)}</h2>
              <button class="modal__close cart-drawer__close-desktop" onClick$={() => (cartOpen.value = false)}>x</button>
            </div>
            {cart.items.length === 0 ? (
              <div class="cart-drawer__empty">
                <p>{t("cart.empty", locale.value)}</p>
                <button type="button" class="cart-drawer__back-link" onClick$={() => (cartOpen.value = false)}>{t("cart.backtoapparel", locale.value)}</button>
              </div>
            ) : checkoutStep.value === "cart" ? (
              <>
                <div class="cart-drawer__items">
                  <table class="cart-table">
                    <thead>
                      <tr>
                        <th class="cart-table__th-product">{t("cart.invoice.product", locale.value)}</th>
                        <th class="cart-table__th-qty">{t("cart.invoice.qty", locale.value)}</th>
                        {loginType.value !== "tech" && <th class="cart-table__th-total">{t("cart.invoice.total", locale.value)}</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {cart.items.map((item, i) => (
                        <tr key={`${item.name}-${item.size}-${item.color}-${item.quantity}`}>
                          <td class="cart-table__product">
                            <div class="cart-table__product-row">
                            <img src={item.img} alt={item.name} width="40" height="30" class="cart-table__img" />
                            <div>
                            <Link href="/" class="cart-table__name-link" onClick$={() => (cartOpen.value = false)}>{stripColorSuffix(item.name)}</Link>
                            <div class="cart-table__meta">
                              {item.color && item.color.startsWith("#") && <span class="cart-table__swatch" style={{ background: item.color }} aria-hidden="true" />}
                              <span>{item.color ? `${item.color.startsWith("#") ? colorName(item.color, locale.value) : item.color} / ` : ""}{item.size}</span>
                            </div>
                            </div>
                            </div>
                          </td>
                          <td class="cart-table__qty">
                            <div class="cart-table__qty-controls">
                              <button class="cart-table__qty-btn" aria-label={`Decrease quantity of ${item.name}`} onClick$={() => updateQty(i, -1)}>-</button>
                              <span>{item.quantity}</span>
                              <button class="cart-table__qty-btn" aria-label={`Increase quantity of ${item.name}`} onClick$={() => updateQty(i, 1)}>+</button>
                            </div>
                          </td>
                          {loginType.value !== "tech" && <td class="cart-table__total">${(((Number(item.price) || 0) * item.quantity)).toFixed(2)}</td>}
                        </tr>
                      ))}
                    </tbody>
                    {loginType.value !== "tech" && (
                      <tfoot>
                        <tr>
                          <td colSpan={2} class="cart-table__subtotal-label">{t("cart.invoice.subtotal", locale.value)}</td>
                          <td class="cart-table__subtotal-val">${subtotal.value.toFixed(2)}</td>
                        </tr>
                        {empProvince.value ? (
                          <>
                            <tr>
                              <td colSpan={2} class="cart-table__subtotal-label">{taxLabel.value}</td>
                              <td class="cart-table__subtotal-val">${(taxAmount.value ?? 0).toFixed(2)}</td>
                            </tr>
                            <tr>
                              <td colSpan={2} class="cart-table__subtotal-label" style={{ fontWeight: 700 }}>{t("cart.invoice.total", locale.value)}</td>
                              <td class="cart-table__subtotal-val" style={{ fontWeight: 700 }}>${orderTotal.value.toFixed(2)}</td>
                            </tr>
                          </>
                        ) : (
                          <tr>
                            <td colSpan={2} class="cart-table__subtotal-label">+ {t("cart.invoice.tax", locale.value)}</td>
                            <td class="cart-table__subtotal-val">—</td>
                          </tr>
                        )}
                      </tfoot>
                    )}
                  </table>
                </div>
                <div class="cart-drawer__footer">
                  <span class="cart-drawer__total">
                    {cartCount.value} {cartCount.value !== 1 ? t("cart.items", locale.value) : t("cart.item", locale.value)}{loginType.value !== "tech" && (empProvince.value ? ` — $${orderTotal.value.toFixed(2)}` : ` — $${subtotal.value.toFixed(2)} + ${t("cart.invoice.tax", locale.value).toLowerCase()}`)}
                  </span>
                  <button
                    class="btn btn--primary cart-drawer__order-btn"
                    onClick$={() => { summaryOpen.value = cart.items.length <= 4; checkoutStep.value = "details"; }}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                    {t("cart.checkout", locale.value)}
                  </button>
                </div>
              </>
            ) : (
              <>
                <div class="cart-drawer__details-step">
                  <button class="cart-drawer__back-btn" onClick$={() => { checkoutStep.value = "cart"; }}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5"/><path d="M12 19l-7-7 7-7"/></svg>
                    {t("cart.backtocart", locale.value)}
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
                        <input
                          type="text"
                          value={empFirstName.value}
                          onInput$={(_, el) => { empFirstName.value = el.value; formError.value = ""; }}
                        />
                      </div>
                      <div class={`checkout-modal__field ${formTouched.value && !empLastName.value ? "checkout-modal__field--error" : ""}`}>
                        <label>{t("cart.lastname", locale.value)}</label>
                        <input
                          type="text"
                          value={empLastName.value}
                          onInput$={(_, el) => { empLastName.value = el.value; formError.value = ""; }}
                        />
                      </div>
                    </div>
                    {/* Province sits directly under the name row so the
                        tax line in the cart total updates as soon as
                        possible — before the user fills in phone/email. */}
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
                    {/* Location renders only for multi-branch provinces
                        (see needsLocation). Kept directly under Province so
                        the conditional field appears next to the trigger
                        that toggled it. */}
                    {needsLocation(empProvince.value) && (
                      <div class={`checkout-modal__field ${formTouched.value && !empDept.value ? "checkout-modal__field--error" : ""}`}>
                        <label>{t("cart.location", locale.value)}</label>
                        <input
                          type="text"
                          value={empDept.value}
                          onInput$={(_, el) => (empDept.value = el.value)}
                        />
                      </div>
                    )}
                    <div class={`checkout-modal__field ${formTouched.value && !empEmail.value ? "checkout-modal__field--error" : ""}`}>
                      <label>{t("cart.email", locale.value)}</label>
                      <input
                        type="email"
                        value={empEmail.value}
                        onInput$={(_, el) => { empEmail.value = el.value; formError.value = ""; }}
                      />
                    </div>
                    <div class={`checkout-modal__field ${formTouched.value && !empPhone.value ? "checkout-modal__field--error" : ""}`}>
                      <label>{t("cart.phone", locale.value)}</label>
                      <input
                        type="tel"
                        value={empPhone.value}
                        onInput$={(_, el) => { empPhone.value = el.value; formError.value = ""; }}
                      />
                    </div>
                    <div class={`checkout-modal__field ${formTouched.value && !empPO.value ? "checkout-modal__field--error" : ""}`}>
                      <label>{t("cart.po", locale.value)}</label>
                      <input
                        type="text"
                        value={empPO.value}
                        onInput$={(_, el) => (empPO.value = el.value)}
                      />
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
                    onClick$={submitOrder}
                  >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2h11"/></svg>
                    {t("cart.createorder", locale.value)}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Order Confirmation */}
      <Modal.Root bind:show={orderSubmitted} closeOnBackdropClick={true}>
        <Modal.Panel class="modal-overlay">
          <div class="modal order-confirm">
            <h2 class="order-confirm__title">{t("order.title", locale.value)}</h2>
            <p class="order-confirm__text">{t("order.text", locale.value)}</p>
            <a href="/" class="btn btn--primary">{t("order.continue", locale.value)}</a>
          </div>
        </Modal.Panel>
      </Modal.Root>
      </>}
    </>
  );
});
