import { createContextId } from "@builder.io/qwik";
import type { Signal } from "@builder.io/qwik";

export type Locale = "en" | "fr";

export const LocaleContext = createContextId<Signal<Locale>>("locale");

const translations = {
  // Header nav
  "logo.apparel": { en: "Apparel", fr: "Vêtements" },
  "nav.home": { en: "Home", fr: "Accueil" },
  "nav.apparel": { en: "Apparel", fr: "Vêtements" },
  "nav.shirts": { en: "Shirts", fr: "Chandails" },
  "nav.polos": { en: "Polos", fr: "Polos" },
  "nav.hoodies": { en: "Hoodies", fr: "Kangourous" },
  "nav.hats": { en: "Hats", fr: "Chapeaux" },
  "nav.caps": { en: "Caps", fr: "Casquettes" },
  "nav.jackets": { en: "Jackets", fr: "Manteaux" },
  "nav.safety": { en: "Safety", fr: "Sécurité" },

  // Login modal
  "login.title": { en: "Employee Login", fr: "Connexion employé" },
  "login.subtitle": { en: "Login to access apparel", fr: "Connectez-vous pour accéder aux vêtements" },
  "login.username": { en: "Username", fr: "Nom d'utilisateur" },
  "login.username.placeholder": { en: "Enter username", fr: "Entrez le nom d'utilisateur" },
  "login.password": { en: "Password", fr: "Mot de passe" },
  "login.password.placeholder": { en: "Enter password", fr: "Entrez le mot de passe" },
  "login.submit": { en: "Login", fr: "Se connecter" },
  "login.submitting": { en: "Signing in...", fr: "Connexion..." },
  "login.error": { en: "Invalid username or password", fr: "Nom d'utilisateur ou mot de passe invalide" },
  "login.logout": { en: "Log out", fr: "Déconnexion" },

  // Hero
  "hero.badge": { en: "Employee Exclusive", fr: "Exclusif employés" },
  "hero.accent": { en: "Wear", fr: "Portez" },
  "hero.title.your": { en: "Your", fr: "Votre" },
  "hero.title.brand": { en: "Brand", fr: "Marque" },
  "hero.subtitle": {
    en: "From the jobsite to the office.",
    fr: "Du chantier au bureau.",
  },

  "hero.explore": { en: "Explore Apparel", fr: "Explorer les vêtements" },
  "hero.browse": { en: "Browse Apparel", fr: "Parcourir les vêtements" },

  // Hero photo labels
  "hero.label.onthejob": { en: "On the Job", fr: "Au travail" },
  "hero.label.polos": { en: "Polos", fr: "Polos" },
  "hero.label.hats": { en: "Hats", fr: "Chapeaux" },

  // Teaser cards
  "teaser.all.tag": { en: "Full Collection", fr: "Collection complète" },
  "teaser.all.title": { en: "All Apparel", fr: "Les Vêtements" },
  "teaser.all.text": { en: "Browse the complete Farmboy Apparel branded collection.", fr: "Parcourez la collection complète Farmboy Apparel." },
  "teaser.all.cta": { en: "Browse Apparel", fr: "Parcourir les vêtements" },
  "teaser.jackets.tag": { en: "Cold Weather", fr: "Temps froid" },
  "teaser.jackets.title": { en: "Jackets & Hoodies", fr: "Manteaux et hoodies" },
  "teaser.jackets.text": { en: "Softshell and insulated options built for Canadian weather.", fr: "Options softshell et isolées conçues pour le climat canadien." },
  "teaser.jackets.cta": { en: "Shop Jackets", fr: "Voir les manteaux" },

  "teaser.polos.tag": { en: "Team Favourite", fr: "Favori de l'équipe" },
  "teaser.polos.title": { en: "Classic Shirts", fr: "Chemises classiques" },
  "teaser.polos.text": { en: "The go-to for site visits and the office.", fr: "L'incontournable pour les visites de chantier et le bureau." },
  "teaser.polos.cta": { en: "Shop Polos", fr: "Voir les polos" },

  "teaser.hoodies.tag": { en: "Cold Weather", fr: "Temps froid" },
  "teaser.hoodies.title": { en: "Hoodies & Layers", fr: "Kangourous et couches" },
  "teaser.hoodies.text": { en: "Pullover and zip-up hoodies for cooler days.", fr: "Kangourous à enfiler et à fermeture éclair pour les journées fraîches." },
  "teaser.hoodies.cta": { en: "Shop Hoodies", fr: "Voir les kangourous" },

  "teaser.hats.tag": { en: "Headwear", fr: "Couvre-chefs" },
  "teaser.hats.title": { en: "Caps & Beanies", fr: "Casquettes et tuques" },
  "teaser.hats.text": { en: "Embroidered caps and knit beanies for every season.", fr: "Casquettes brodées et tuques tricotées pour toutes les saisons." },
  "teaser.hats.cta": { en: "Shop Hats", fr: "Voir les chapeaux" },

  "teaser.workwear.tag": { en: "On the Job", fr: "Au travail" },
  "teaser.workwear.title": { en: "All Apparel", fr: "Tous les vêtements" },
  "teaser.workwear.text": { en: "Durable gear built for the jobsite.", fr: "Équipement durable conçu pour le chantier." },
  "teaser.workwear.cta": { en: "Shop All Apparel", fr: "Voir tous les vêtements" },

  "teaser.tees.tag": { en: "Essentials", fr: "Essentiels" },
  "teaser.tees.title": { en: "Crew Neck Tees", fr: "T-shirts col rond" },
  "teaser.tees.text": { en: "Lightweight branded tees for everyday wear.", fr: "T-shirts légers à l'effigie de la marque pour tous les jours." },
  "teaser.tees.cta": { en: "Shop Tees", fr: "Voir les t-shirts" },

  "teaser.safety.tag": { en: "Job Site", fr: "Chantier" },
  "teaser.safety.title": { en: "Safety Gear", fr: "Équipement de sécurité" },
  "teaser.safety.text": { en: "Hi-vis vests and rain jackets that meet safety standards.", fr: "Vestes haute visibilité et imperméables conformes aux normes de sécurité." },
  "teaser.safety.cta": { en: "Shop Safety", fr: "Voir la sécurité" },

  // Shop page
  "shop.back": { en: "← All Categories", fr: "← Toutes les catégories" },
  "shop.items": { en: "items", fr: "articles" },

  // Apparel catalog
  "apparel.title": { en: "Apparel", fr: "Vêtements" },
  "apparel.all.title": { en: "All Apparel", fr: "Tous les vêtements" },
  "apparel.items": { en: "items", fr: "articles" },
  "apparel.all": { en: "All", fr: "Tous" },
  "apparel.sort.popular": { en: "Most Popular", fr: "Les plus populaires" },
  "apparel.sort.newest": { en: "Newest First", fr: "Plus récents" },
  "apparel.sort.name": { en: "Name A-Z", fr: "Nom A-Z" },

  // Product badges
  "badge.bestseller": { en: "Best Seller", fr: "Meilleur vendeur" },
  "badge.new": { en: "New", fr: "Nouveau" },
  "badge.staffpick": { en: "Staff Pick", fr: "Choix du personnel" },
  "badge.popular": { en: "Popular", fr: "Populaire" },
  "badge.required": { en: "Required", fr: "Obligatoire" },

  // Product card
  "product.specsheet": { en: "View Spec Sheet", fr: "Voir la fiche technique" },
  "product.specsheet.pdf": { en: "View Spec Sheet (PDF)", fr: "Voir la fiche technique (PDF)" },

  // Color names
  "color.green": { en: "Green", fr: "Vert" },
  "color.black": { en: "Black", fr: "Noir" },
  "color.white": { en: "White", fr: "Blanc" },
  "color.navy": { en: "Navy", fr: "Marine" },
  "color.grey": { en: "Grey", fr: "Gris" },
  "color.orange": { en: "Orange", fr: "Orange" },
  "color.safetyorange": { en: "Safety Orange", fr: "Orange sécurité" },
  "color.yellow": { en: "Yellow", fr: "Jaune" },
  "color.red": { en: "Red", fr: "Rouge" },
  "color.purple": { en: "Purple", fr: "Violet" },
  "color.royal": { en: "Royal", fr: "Bleu royal" },
  "color.greyheather": { en: "Grey Heather", fr: "Gris chiné" },
  "color.lightblue": { en: "Light Blue", fr: "Bleu clair" },
  "color.solaceblue": { en: "Solace Blue", fr: "Bleu Solace" },
  "color.silver": { en: "Silver", fr: "Argent" },
  "color.charcoal": { en: "Charcoal", fr: "Charbon" },
  "color.bronze": { en: "Bronze", fr: "Bronze" },
  "color.carharttbrown": { en: "Carhartt Brown", fr: "Brun Carhartt" },
  "color.skyblue": { en: "Sky Blue", fr: "Bleu ciel" },

  // Product modal
  "modal.material": { en: "Material", fr: "Matière" },
  "modal.size": { en: "Size", fr: "Taille" },
  "modal.color": { en: "Color", fr: "Couleur" },
  "modal.quantity": { en: "Quantity", fr: "Quantité" },
  "modal.addtocart": { en: "Add to Cart", fr: "Ajouter au panier" },
  "modal.ordernow": { en: "Order Now", fr: "Commander" },
  "modal.added": { en: "Added!", fr: "Ajouté!" },
  "modal.selectsize": { en: "Select a Size", fr: "Choisir une taille" },
  "modal.onesize": { en: "One Size", fr: "Taille unique" },

  // Cart drawer
  "cart.mycart": { en: "My Cart", fr: "Mon panier" },
  "cart.title": { en: "MY CART", fr: "PANIER" },
  "cart.empty": { en: "Your cart is empty", fr: "Votre panier est vide" },
  "cart.backtoapparel": { en: "Back to Apparel", fr: "Retour aux vêtements" },
  "cart.qty": { en: "Qty", fr: "Qté" },
  "cart.each": { en: "each", fr: "chacun" },
  "cart.item": { en: "item", fr: "article" },
  "cart.items": { en: "items", fr: "articles" },
  "cart.invoice": { en: "Order Summary", fr: "Résumé de la commande" },
  "cart.invoice.product": { en: "Product", fr: "Produit" },
  "cart.invoice.details": { en: "Details", fr: "Détails" },
  "cart.invoice.qty": { en: "Qty", fr: "Qté" },
  "cart.invoice.unit": { en: "Unit", fr: "Unit." },
  "cart.invoice.total": { en: "Total", fr: "Total" },
  "cart.invoice.subtotal": { en: "Subtotal", fr: "Sous-total" },
  "cart.invoice.tax": { en: "Tax", fr: "Taxe" },
  "cart.orderdetails": { en: "Order Details", fr: "Détails de la commande" },
  "cart.firstname": { en: "First Name *", fr: "Prénom *" },
  "cart.lastname": { en: "Last Name *", fr: "Nom *" },
  "cart.phone": { en: "Phone Number *", fr: "Téléphone *" },
  "cart.email": { en: "Email *", fr: "Courriel *" },
  "cart.location": { en: "Location *", fr: "Emplacement *" },
  "cart.province": { en: "Province *", fr: "Province *" },
  "cart.po": { en: "PO # *", fr: "N° de bon de commande *" },
  "cart.createorder": { en: "Place Order", fr: "Commander" },
  "cart.checkout": { en: "Checkout", fr: "Passer à la caisse" },
  "cart.backtocart": { en: "Back to Cart", fr: "Retour au panier" },
  "cart.ordersummary": { en: "Order Summary", fr: "Résumé de la commande" },

  // Cart errors
  "cart.error.both": { en: "Employee number and name are required", fr: "Le numéro d'employé et le nom sont requis" },
  "cart.error.number": { en: "Employee number is required", fr: "Le numéro d'employé est requis" },
  "cart.error.name": { en: "Full name is required", fr: "Le nom complet est requis" },
  "cart.error.required": { en: "Please complete required fields", fr: "Veuillez remplir les champs requis" },
  "cart.error.email": { en: "Please enter a valid email address", fr: "Veuillez entrer une adresse courriel valide" },
  "cart.error.phone": { en: "Please enter a valid phone number", fr: "Veuillez entrer un numéro de téléphone valide" },
  "cart.requiredfields": { en: "* required", fr: "* requis" },

  // Order confirmation
  "order.title": { en: "Order Submitted", fr: "Commande soumise" },
  "order.text": {
    en: "Your order has been recorded and sent for processing.",
    fr: "Votre commande a été enregistrée et envoyée pour traitement.",
  },
  "order.continue": { en: "Home", fr: "Accueil" },

  // Categories (used in apparel chips & product cards)
  "cat.Polos": { en: "Polos", fr: "Polos" },
  "cat.T-Shirts": { en: "T-Shirts", fr: "T-Shirts" },
  "cat.Hoodies": { en: "Hoodies", fr: "Kangourous" },
  "cat.Hats": { en: "Hats", fr: "Chapeaux" },
  "cat.Safety": { en: "Safety", fr: "Sécurité" },
  "cat.Caps": { en: "Caps & Beanies", fr: "Casquettes" },
  "cat.Jackets": { en: "Jackets", fr: "Manteaux" },
  "cat.Work Wear": { en: "Work Wear", fr: "Travail" },
  "cat.Flame Resistant": { en: "Flame Resistant", fr: "Vêtements ignifuges" },
  "cat.Shirts": { en: "Shirts", fr: "Chemises" },
  "cat.SWAG": { en: "SWAG", fr: "SWAG" },

  // Product detail
  "product.taptoclose": { en: "Tap anywhere to close", fr: "Appuyez pour fermer" },
  "product.related": { en: "Related Items", fr: "Articles connexes" },
  "product.more": { en: "More", fr: "Plus de" },
  "product.notfound": { en: "Product not found.", fr: "Produit introuvable." },
  "product.waist": { en: "Waist", fr: "Tour de taille" },
  "product.length": { en: "Length", fr: "Longueur" },
  "product.variant": { en: "Variant", fr: "Variante" },
  "product.select": { en: "Select", fr: "Choisir" },
} as const;

export type TranslationKey = keyof typeof translations;

export function t(key: TranslationKey, locale: Locale): string {
  return translations[key]?.[locale] ?? translations[key]?.en ?? key;
}
