// AUTO-GENERATED — do not edit manually. Updated from database at build time.
import { t } from "../../i18n";
import type { Locale } from "../../i18n";

export const allProducts = [
  {
    "sku": "FB-1",
    "name": "Carhartt Short Sleeve Shirt - Chambray",
    "category": "Shirts",
    "sizes": "S - 4XL / LT - 3XLT",
    "badge": "",
    "colors": [
      "#c2a878"
    ],
    "price": 44.99,
    "img": "/shirt2.png",
    "imgs": [
      "/shirt2.png"
    ],
    "material": "4.8 oz 100% cotton ringspun chambray",
    "details": "Loose fit short-sleeve chambray shirt, button-down collar, two chest pockets with mitered flaps and button closures, shoulder pleats for mobility, triple-stitched main seams, garment-washed for softness, #104369"
  },
  {
    "sku": "FB-2",
    "name": "Carhartt Long Sleeve Shirt - Chambray",
    "category": "Shirts",
    "sizes": "S - 4XL / LT - 3XLT",
    "badge": "",
    "colors": [
      "#c2a878"
    ],
    "price": 49.99,
    "img": "/sleeve2.png",
    "imgs": [
      "/sleeve2.png"
    ],
    "material": "4.8 oz 100% cotton ringspun chambray",
    "details": "Loose fit long-sleeve chambray shirt, button-down collar, two chest pockets with mitered flaps, two-button adjustable cuffs with extended plackets, shoulder pleats for mobility, triple-stitched main seams, garment-washed, #104368"
  },
  {
    "sku": "FB-5",
    "name": "Cole Harbour Soft Shell Jacket - Black",
    "category": "Jackets",
    "sizes": "XS - 6XL",
    "badge": "",
    "colors": [
      "#1a1a18"
    ],
    "price": 65,
    "img": "/sku/cole-harbour-black.jpg",
    "imgs": [
      "/sku/cole-harbour-black.jpg"
    ],
    "material": "100% polyester with mechanical stretch, bonded micro fleece lining",
    "details": "Water repellent, wind resistant, anti-pill, YKK zippers, 1000mm waterproof rating, classic fit, Cole Harbour, #J7603"
  },
  {
    "sku": "FB-4",
    "name": "Carhartt Insulated Jacket - Black",
    "category": "Jackets",
    "sizes": "S - 3XL / LT - 2XLT",
    "badge": "",
    "colors": [
      "#1a1a18"
    ],
    "price": 199.99,
    "img": "/sku/insulated-jacket-black.png",
    "imgs": [
      "/sku/insulated-jacket-black.png"
    ],
    "material": "8.1 oz 97% nylon / 3% spandex Rugged Flex shell, 100 g 3M polyester insulation",
    "details": "Relaxed fit insulated jacket, Camden Cryder, Full Swing range of motion, Rain Defender DWR, Wind Fighter, mock neck with detachable adjustable hood, knit storm cuffs, two zippered chest pockets, adjustable droptail hem, #106006"
  },
  {
    "sku": "FB-3",
    "name": "Rugged Flex Rigby Dungaree Pants - Black",
    "category": "Pants",
    "sizes": "W28-54 / L28-36",
    "badge": "",
    "colors": [
      "#1a1a18"
    ],
    "price": 69.99,
    "img": "/102291_001_MF25_e_w.png",
    "imgs": [
      "/102291_001_MF25_e_w.png",
      "/102291_001_AVB_MF25_e_w.png"
    ],
    "material": "10 oz 99% cotton / 1% spandex Rugged Flex canvas",
    "details": "Relaxed fit, Rugged Flex stretch, multiple tool and utility pockets, triple-stitched seams, reinforced front pockets, #102291"
  },
  {
    "sku": "FB-6",
    "name": "Embroidered Cap - Black",
    "category": "Hats",
    "sizes": "One Size",
    "badge": "",
    "colors": [
      "#1a1a18"
    ],
    "price": 23.5,
    "img": "/sku/cap-black.png",
    "imgs": [
      "/sku/cap-black.png"
    ],
    "material": "Poly/spandex with performance mesh",
    "details": "Structured mid-profile 6-panel Flexfit 110®, shapeable pre-curved visor, plastic snapback closure, UV protection, moisture wicking, contrasting grey undervisor, #i8502"
  }
];

export type Product = typeof allProducts[0];

export const categories = ["All", ...Array.from(new Set(allProducts.map((p) => p.category)))];

export const badgeMap: Record<string, string> = { New: "badge.new", Popular: "badge.popular" };
export function badgeClass(badge: string) {
  return badge === "New" ? "product-card__badge product-card__badge--new" : "product-card__badge product-card__badge--popular";
}

const colorNames: Record<string, Record<string, string>> = {
  "#00703c": { en: "Green", fr: "Vert" },
  "#1a1a18": { en: "Black", fr: "Noir" },
  "#ffffff": { en: "White", fr: "Blanc" },
  "#2c3e50": { en: "Navy", fr: "Marine" },
  "#6e6e6e": { en: "Grey", fr: "Gris" },
  "#ff6600": { en: "Safety Orange", fr: "Orange sécurité" },
  "#94a3b8": { en: "Silver", fr: "Argent" },
  "#4a4a4a": { en: "Charcoal", fr: "Charbon" },
  "#6b8bb0": { en: "Solace Blue", fr: "Bleu Solace" },
  "#7dd3fc": { en: "Light Blue", fr: "Bleu clair" },
  "#b8b8b8": { en: "Grey Heather", fr: "Gris chiné" },
  "#6b3fa0": { en: "Purple", fr: "Violet" },
  "#c0392b": { en: "Red", fr: "Rouge" },
  "#1e40af": { en: "Royal", fr: "Bleu royal" },
  "#8a5d3b": { en: "Carhartt Brown", fr: "Brun Carhartt" },
  "#00b5e2": { en: "Sky Blue", fr: "Bleu ciel" },
  "#4f6d8c": { en: "Denim Blue", fr: "Bleu denim" },
  "#c2a878": { en: "Dark Tan", fr: "Tan foncé" },
  "#6b7280": { en: "Shadow", fr: "Ombre" },
};
export function colorName(hex: string, locale: Locale): string {
  return colorNames[hex]?.[locale] || hex;
}

export function categoryLabel(cat: string, locale: Locale): string {
  if (cat === "All") return t("apparel.all", locale);
  const key = `cat.${cat}` as any;
  return t(key, locale);
}

export function expandSizes(sizes: string): string[] {
  if (sizes === "One Size") return ["One Size"];
  const order = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL"];
  const match = sizes.match(/^(\w+)\s*-\s*(\w+)$/);
  if (!match) return [sizes];
  const start = order.indexOf(match[1]);
  const end = order.indexOf(match[2]);
  if (start === -1 || end === -1) return [sizes];
  return order.slice(start, end + 1);
}
