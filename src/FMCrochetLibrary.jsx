import React, { useState, useEffect, useMemo, useRef } from "react";
import { Search, Sun, Moon, Globe, Heart, ChevronRight, LayoutGrid, LayoutDashboard, BookOpen, Sparkles, FileText, Youtube, ShoppingBag, ExternalLink, ArrowLeft, ArrowRight, Lock, Plus, Pencil, Trash2, LogOut, ChevronUp, ChevronDown, Upload, X as XIcon, Package, Boxes, ShoppingCart, BarChart3, Settings as SettingsIcon, Palette, Menu, Mail, Phone, MapPin, Link2, Bold, Italic, Underline, List, ListOrdered, Quote, Heading2, AlignLeft, AlignCenter, AlignRight, Image as ImageIcon, Check, AlertCircle, Instagram, Facebook } from "lucide-react";

/* ---------------------------------------------------------
   SUPABASE — config & REST helpers
   No SDK import (not available in this sandbox) — talks to
   Supabase's PostgREST, Auth, and Storage APIs directly via fetch.
--------------------------------------------------------- */

const SUPABASE_URL = "https://xlhqldshdpohzyilgejr.supabase.co";
// Project Settings → API → "Publishable key" (safe to embed client-side, unlike the secret key)
const SUPABASE_ANON_KEY = "sb_publishable_A_QF4oYKITf2c8l4LrNbTA_tqo6LfTb";

let sbSession = null; // { access_token, refresh_token, expires_at } — set on sign-in / restore

// Works inside Claude's artifact preview (window.storage) AND as a normal deployed
// website (falls back to localStorage, since window.storage won't exist there).
const storage = (typeof window !== "undefined" && window.storage)
  ? window.storage
  : {
      async get(key) {
        const v = typeof localStorage !== "undefined" ? localStorage.getItem(key) : null;
        return v === null ? null : { key, value: v };
      },
      async set(key, value) {
        if (typeof localStorage !== "undefined") localStorage.setItem(key, value);
        return { key, value };
      },
      async delete(key) {
        if (typeof localStorage !== "undefined") localStorage.removeItem(key);
        return { key, deleted: true };
      },
    };

async function sbEnsureFreshToken() {
  if (!sbSession) return null;
  if (sbSession.expires_at && Date.now() / 1000 < sbSession.expires_at - 30) return sbSession.access_token;
  try {
    const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
      method: "POST",
      headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ refresh_token: sbSession.refresh_token }),
    });
    if (!res.ok) throw new Error("refresh failed");
    const data = await res.json();
    sbSession = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600) };
    storage.set("fm_session", JSON.stringify(sbSession)).catch(() => {});
    return sbSession.access_token;
  } catch (e) {
    sbSession = null;
    storage.delete("fm_session").catch(() => {});
    return null;
  }
}

async function sbHeaders(authed) {
  const token = authed ? await sbEnsureFreshToken() : null;
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token || SUPABASE_ANON_KEY}`,
    "Content-Type": "application/json",
  };
}

async function sbSelect(table, query = "select=*") {
  const headers = await sbHeaders(!!sbSession);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${query}`, { headers });
  if (!res.ok) throw new Error(`Supabase read failed (${table}): ${res.status}`);
  return res.json();
}

async function sbInsert(table, row) {
  const headers = { ...(await sbHeaders(true)), Prefer: "return=representation" };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, { method: "POST", headers, body: JSON.stringify(row) });
  if (!res.ok) throw new Error(`Supabase insert failed (${table}): ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data[0];
}

async function sbUpdate(table, id, patch) {
  const headers = { ...(await sbHeaders(true)), Prefer: "return=representation" };
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "PATCH", headers, body: JSON.stringify(patch) });
  if (!res.ok) throw new Error(`Supabase update failed (${table}): ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data[0];
}

async function sbDelete(table, id) {
  const headers = await sbHeaders(true);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${encodeURIComponent(id)}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error(`Supabase delete failed (${table}): ${res.status} ${await res.text()}`);
}

async function sbDeleteWhere(table, filter) {
  const headers = await sbHeaders(true);
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${filter}`, { method: "DELETE", headers });
  if (!res.ok) throw new Error(`Supabase delete failed (${table}): ${res.status} ${await res.text()}`);
}

async function sbSignIn(email, password) {
  const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error_description || data.msg || "Sign-in failed");
  sbSession = { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: Math.floor(Date.now() / 1000) + (data.expires_in || 3600) };
  await storage.set("fm_session", JSON.stringify(sbSession)).catch(() => {});
  return sbSession;
}

async function sbSignOut() {
  sbSession = null;
  await storage.delete("fm_session").catch(() => {});
}

async function sbUpdatePassword(newPassword) {
  const token = await sbEnsureFreshToken();
  if (!token) throw new Error("Not signed in.");
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    method: "PUT",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ password: newPassword }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.msg || data.error_description || "Couldn't update password.");
  return data;
}

async function sbUploadImage(file, onProgress) {
  const token = (await sbEnsureFreshToken()) || SUPABASE_ANON_KEY;
  const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
  const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const res = await fetch(`${SUPABASE_URL}/storage/v1/object/images/${path}`, {
    method: "POST",
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${token}`, "Content-Type": file.type || "application/octet-stream", "x-upsert": "true" },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed: ${res.status} ${await res.text()}`);
  return `${SUPABASE_URL}/storage/v1/object/public/images/${path}`;
}

/* ---------------------------------------------------------
   FM CROCHET LIBRARY — design tokens
   Display: Fraunces (warm soft-serif) / El Messiri (Arabic)
   Body:    Plus Jakarta Sans / Cairo (Arabic)
   Palette: cream, sage, lavender, butter, thread(mauve-brown)
--------------------------------------------------------- */

const FONT_IMPORT = `
@import url('https://fonts.googleapis.com/css2?family=Fraunces:ital,opsz,wght@0,9..144,300;0,9..144,450;0,9..144,600;1,9..144,450&family=Plus+Jakarta+Sans:wght@400;500;600;700&family=El+Messiri:wght@500;600;700&family=Cairo:wght@400;500;600;700&display=swap');
`;

const THEMES = {
  light: {
    bg: "#FAF6EF",
    surface: "#FFFFFF",
    surfaceMuted: "#F2ECE0",
    text: "#362F2B",
    textMuted: "#7A7067",
    border: "#E7DFD1",
    sage: "#AECBA5",
    sageDeep: "#7FA073",
    lavender: "#D8CDEA",
    lavenderDeep: "#A791C9",
    butter: "#F1DFA0",
    butterDeep: "#D9B34F",
    thread: "#9C7A63",
    threadDeep: "#7A5C48",
  },
  dark: {
    bg: "#211D1A",
    surface: "#2A2521",
    surfaceMuted: "#302B26",
    text: "#F2EBE1",
    textMuted: "#B6AA9C",
    border: "#3D3630",
    sage: "#8FAE86",
    sageDeep: "#B7CDB0",
    lavender: "#B7A6D6",
    lavenderDeep: "#D8CDEA",
    butter: "#D9B34F",
    butterDeep: "#F1DFA0",
    thread: "#C6A088",
    threadDeep: "#E3C6B4",
  },
};

const COPY = {
  en: {
    dir: "ltr",
    brand: "FM Crochet Library",
    nav: { home: "Home", library: "Library", inspiration: "Inspiration", favorites: "Favorites", about: "About" },
    searchPlaceholder: "Search projects, patterns, categories…",
    heroEyebrow: "A handmade digital journal",
    heroTitle: "Every stitch,\nkept and cherished.",
    heroSub: "The place I gather my crochet projects, patterns, and inspiration — one loop at a time.",
    heroCta: "Browse the library",
    heroCtaSecondary: "See what's in progress",
    continueTitle: "Continue Crocheting",
    continueSub: "Projects on the hook right now",
    categoriesTitle: "Categories",
    categoriesSub: "Browse by kind of make",
    featuredTitle: "Featured Projects",
    featuredSub: "A few favorites, chosen by hand",
    recentTitle: "Recently Added",
    recentSub: "Fresh off the hook",
    viewAll: "View all",
    statusLabels: { notStarted: "Not started", inProgress: "In progress", finished: "Finished" },
    footerNote: "Made with love, one loop at a time.",
    emptyProgress: "Nothing on the hook right now. Start a new project!",
    libraryTitle: "Pattern Library",
    librarySub: "Every pattern I've collected, all in one place",
    emptyLibrary: "No patterns yet.",
    designerLabel: "Designer",
    notesLabel: "Notes",
    noNotes: "No notes yet.",
    viewPdf: "View PDF",
    watchVideo: "Watch tutorial",
    shopEtsy: "Shop on Etsy",
    seePinterest: "See on Pinterest",
    favoritesTitle: "Favorites",
    favoritesSub: "Projects I keep coming back to",
    emptyFavorites: "No favorites yet. Tap the heart on a project to save it here.",
    inspirationTitle: "Inspiration",
    inspirationSub: "A moodboard for what's next",
    inspirationComingSoon: "The inspiration board is still being woven together. Check back soon.",
    back: "Back",
    galleryLabel: "Gallery",
    patternLabel: "Pattern",
    categoryLabel: "Category",
    statusLabel: "Status",
    seePattern: "See full pattern",
    adminTitle: "Admin Dashboard",
    adminGateTitle: "Admin access",
    adminGateSub: "This area is private. Sign in with your admin account to continue.",
    adminEmailPlaceholder: "Email",
    adminGatePlaceholder: "Password",
    adminGateBtn: "Sign in",
    adminGateWrong: "That email or password isn't right — try again.",
    adminGateNote: "This account was created in your Supabase project (Authentication → Users).",
    adminLogout: "Exit admin",
    navGroupOverview: "Overview",
    navGroupCatalog: "Catalog",
    navGroupSite: "Site",
    navGroupSystem: "System",
    tabOverview: "Dashboard",
    tabProjects: "Projects",
    tabPatterns: "Patterns",
    tabYarn: "Yarn Inventory",
    tabMaterials: "Materials",
    tabCategories: "Categories",
    tabOrders: "Orders",
    tabContent: "Website Content",
    tabCustomize: "Customize",
    tabAnalytics: "Analytics",
    tabSettings: "Settings",
    comingSoonTitle: "Coming in a later phase",
    comingSoonBody: "This section isn't built yet — it's reserved in the dashboard so the layout is ready when we get to it.",
    statPublicProjects: "Public",
    statPrivateProjects: "Private",
    settingsAccountTitle: "Account",
    settingsSignedInAs: "Signed in as",
    settingsChangePassword: "Change password",
    settingsNewPassword: "New password",
    settingsUpdatePassword: "Update password",
    settingsPasswordUpdated: "Password updated.",
    settingsProjectTitle: "Supabase project",
    contentBrandTitle: "Brand & logo",
    contentLogoLabel: "Logo",
    contentFaviconLabel: "Favicon",
    contentSeoTitle: "Browser tab (SEO)",
    contentSeoTitleLabel: "Page title",
    contentSeoDescLabel: "Page description",
    contentContactTitle: "Contact",
    contentEmailLabel: "Email",
    contentPhoneLabel: "Phone",
    contentLocationLabel: "Location",
    contentFooterTitle: "Footer",
    contentFooterLabel: "Footer note",
    contentCopyrightLabel: "Copyright text",
    contentSocialTitle: "Social links",
    toastProjectSaved: "Project saved.",
    toastPatternSaved: "Pattern saved.",
    toastCategorySaved: "Category saved.",
    toastDeleted: "Deleted.",
    toastError: "Something went wrong — check your connection and try again.",
    rteBold: "Bold", rteItalic: "Italic", rteUnderline: "Underline",
    rteHeading: "Heading", rteBulletList: "Bullet list", rteNumberedList: "Numbered list",
    rteQuote: "Quote", rteLink: "Link", rteAlignLeft: "Align left", rteAlignCenter: "Align center", rteAlignRight: "Align right",
    rteLinkPrompt: "Paste a URL",
    yarnTitle: "Yarn Inventory",
    yarnAdd: "Add yarn",
    yarnSearchPlaceholder: "Search yarn…",
    yarnSortNewest: "Newest", yarnSortBrand: "Brand", yarnSortLowStock: "Low stock first",
    yarnFilterAll: "All fibers", yarnLowStockBadge: "Low stock",
    yarnArchived: "Archived", yarnArchive: "Archive", yarnUnarchive: "Unarchive", yarnDuplicate: "Duplicate",
    yarnEmpty: "No yarn in your stash yet.",
    fieldPhoto: "Photo", fieldBrand: "Brand", fieldCollection: "Collection", fieldColorName: "Color name", fieldColorNumber: "Color number",
    fieldWeight: "Weight", fieldFiberType: "Fiber type", fieldHookSize: "Hook size", fieldDyeLot: "Dye lot",
    fieldQuantity: "Quantity", fieldUnit: "Unit", fieldLowStockThreshold: "Low stock alert at",
    fieldStore: "Purchased from", fieldPurchasePrice: "Purchase price", fieldPurchaseDate: "Purchase date", fieldNotes: "Notes",
    materialsTitle: "Materials",
    materialsAdd: "Add material",
    materialsSearchPlaceholder: "Search materials…",
    materialsEmpty: "No materials yet.",
    fieldName: "Name", fieldCategory: "Category",
    materialCategories: "Hooks,Stitch Markers,Needles,Safety Eyes,Stuffing,Buttons,Beads,Scissors,Measuring Tape,Other",
    yarnUsedTitle: "Yarn used",
    yarnUsedAdd: "Add yarn",
    yarnUsedPick: "Choose yarn…",
    yarnUsedQty: "Qty used",
    statTotalYarn: "Yarn Types", statLowStock: "Low Stock",
    statTotalProjects: "Total Projects",
    statTotalPatterns: "Total Patterns",
    statTotalCategories: "Total Categories",
    statRecent: "Recent Projects",
    addProject: "Add project",
    addPattern: "Add pattern",
    addCategory: "Add category",
    edit: "Edit",
    delete: "Delete",
    save: "Save",
    cancel: "Cancel",
    confirmDeleteTitle: "Delete this?",
    confirmDeleteSub: "This can't be undone.",
    confirmDeleteBtn: "Yes, delete",
    titleEnLabel: "Title (English)",
    titleArLabel: "Title (Arabic)",
    categoryFieldLabel: "Category",
    statusFieldLabel: "Status",
    visibilityFieldLabel: "Visibility",
    public: "Public",
    private: "Private",
    featuredFieldLabel: "Featured on homepage",
    toneFieldLabel: "Cover color",
    notesEnLabel: "Notes (English)",
    notesArLabel: "Notes (Arabic)",
    designerEnLabel: "Designer (English, optional)",
    designerArLabel: "Designer (Arabic, optional)",
    pdfFieldLabel: "Has a PDF",
    youtubeFieldLabel: "Has a YouTube link",
    etsyFieldLabel: "Has an Etsy link",
    pinterestFieldLabel: "Has a Pinterest link",
    nameEnLabel: "Name (English)",
    nameArLabel: "Name (Arabic)",
    customizeBrand: "Brand & logo text",
    customizeHero: "Homepage hero",
    brandFieldLabel: "Brand name",
    heroEyebrowLabel: "Eyebrow text",
    heroTitleLabel: "Hero headline",
    heroSubLabel: "Hero subtext",
    customizeSaved: "Saved",
    noneYet: "Nothing here yet.",
    coverImageLabel: "Cover image",
    coverImageHelp: "Upload a photo from your phone or computer. Leave blank to use the color placeholder.",
    galleryLabel2: "Gallery photos",
    galleryHelp: "Upload one or more photos for the project's gallery.",
    pdfUrlLabel: "PDF link (URL)",
    youtubeUrlLabel: "YouTube link (URL)",
    etsyUrlLabel: "Etsy link (URL)",
    pinterestUrlLabel: "Pinterest link (URL)",
    linkUrlHelp: "Leave any of these blank if there's no link yet — the button just won't show.",
    aboutTitle: "About me",
    aboutSub: "The story behind the hook",
    aboutBody: "I picked up a hook for the first time on a quiet weekend and never really put it down. What started as a way to use up leftover yarn turned into this whole little world — doilies for my grandmother's table, a cardigan I wore until the elbows wore thin, gifts for friends who now ask for more. This library is where I keep it all: the patterns I love, the projects I'm proud of, and the ones still waiting on the hook.",
    aboutTitleLabel: "Page title",
    aboutBodyLabel: "Your story",
    aboutImageLabel: "Photo",
    readMyStory: "Read my story →",
    heroImageLabel: "Hero photo (optional — replaces the illustration)",
    heroCtaLabel: "Primary button text",
    heroCtaSecondaryLabel: "Secondary button text",
  },
  ar: {
    dir: "rtl",
    brand: "مكتبة FM للكروشيه",
    nav: { home: "الرئيسية", library: "المكتبة", inspiration: "إلهام", favorites: "المفضلة", about: "نبذتي" },
    searchPlaceholder: "ابحثي عن مشاريع أو باترونات أو تصنيفات…",
    heroEyebrow: "دفتر يدوي رقمي",
    heroTitle: "كل غرزة،\nمحفوظة وبكل حب.",
    heroSub: "المكان الذي أجمع فيه مشاريعي وباتروناتي وإلهامي في الكروشيه — غرزة بعد غرزة.",
    heroCta: "تصفّحي المكتبة",
    heroCtaSecondary: "شاهدي المشاريع الحالية",
    continueTitle: "أكملي الكروشيه",
    continueSub: "مشاريع على الإبرة الآن",
    categoriesTitle: "التصنيفات",
    categoriesSub: "تصفّحي حسب نوع القطعة",
    featuredTitle: "مشاريع مميزة",
    featuredSub: "مفضلات مختارة بعناية",
    recentTitle: "أُضيفت مؤخرًا",
    recentSub: "جديدة على الإبرة",
    viewAll: "عرض الكل",
    statusLabels: { notStarted: "لم تبدأ", inProgress: "قيد التنفيذ", finished: "منتهية" },
    footerNote: "صُنعت بحب، غرزة بعد غرزة.",
    emptyProgress: "لا يوجد شيء على الإبرة الآن. ابدئي مشروعًا جديدًا!",
    libraryTitle: "مكتبة الباترونات",
    librarySub: "كل باترون جمعته، في مكان واحد",
    emptyLibrary: "لا توجد باترونات بعد.",
    designerLabel: "المصمم",
    notesLabel: "ملاحظات",
    noNotes: "لا توجد ملاحظات بعد.",
    viewPdf: "عرض PDF",
    watchVideo: "مشاهدة الشرح",
    shopEtsy: "التسوق على Etsy",
    seePinterest: "عرض على Pinterest",
    favoritesTitle: "المفضلة",
    favoritesSub: "مشاريع أعود إليها دائمًا",
    emptyFavorites: "لا توجد مفضلات بعد. اضغطي على القلب في أي مشروع لحفظه هنا.",
    inspirationTitle: "إلهام",
    inspirationSub: "لوحة إلهام لما هو قادم",
    inspirationComingSoon: "لوحة الإلهام لا تزال قيد النسج. عودي قريبًا.",
    back: "رجوع",
    galleryLabel: "معرض الصور",
    patternLabel: "الباترون",
    categoryLabel: "التصنيف",
    statusLabel: "الحالة",
    seePattern: "عرض الباترون كاملاً",
    adminTitle: "لوحة التحكم",
    adminGateTitle: "دخول المشرف",
    adminGateSub: "هذه المنطقة خاصة. سجّلي الدخول بحساب المشرف للمتابعة.",
    adminEmailPlaceholder: "البريد الإلكتروني",
    adminGatePlaceholder: "كلمة المرور",
    adminGateBtn: "تسجيل الدخول",
    adminGateWrong: "البريد الإلكتروني أو كلمة المرور غير صحيحة — حاولي مجددًا.",
    adminGateNote: "تم إنشاء هذا الحساب في مشروع Supabase الخاص بك (Authentication ← Users).",
    adminLogout: "الخروج من لوحة التحكم",
    navGroupOverview: "نظرة عامة",
    navGroupCatalog: "الفهرس",
    navGroupSite: "الموقع",
    navGroupSystem: "النظام",
    tabOverview: "لوحة التحكم",
    tabProjects: "المشاريع",
    tabPatterns: "الباترونات",
    tabYarn: "مخزون الخيوط",
    tabMaterials: "المستلزمات",
    tabCategories: "التصنيفات",
    tabOrders: "الطلبات",
    tabContent: "محتوى الموقع",
    tabCustomize: "التخصيص",
    tabAnalytics: "الإحصائيات",
    tabSettings: "الإعدادات",
    comingSoonTitle: "قادم في مرحلة لاحقة",
    comingSoonBody: "هذا القسم لم يُبنَ بعد — تم حجز مكانه في لوحة التحكم ليكون جاهزًا عند الوصول إليه.",
    statPublicProjects: "عامة",
    statPrivateProjects: "خاصة",
    settingsAccountTitle: "الحساب",
    settingsSignedInAs: "مسجّلة الدخول باسم",
    settingsChangePassword: "تغيير كلمة المرور",
    settingsNewPassword: "كلمة المرور الجديدة",
    settingsUpdatePassword: "تحديث كلمة المرور",
    settingsPasswordUpdated: "تم تحديث كلمة المرور.",
    settingsProjectTitle: "مشروع Supabase",
    contentBrandTitle: "العلامة التجارية والشعار",
    contentLogoLabel: "الشعار",
    contentFaviconLabel: "أيقونة المتصفح",
    contentSeoTitle: "علامة تبويب المتصفح (SEO)",
    contentSeoTitleLabel: "عنوان الصفحة",
    contentSeoDescLabel: "وصف الصفحة",
    contentContactTitle: "معلومات التواصل",
    contentEmailLabel: "البريد الإلكتروني",
    contentPhoneLabel: "الهاتف",
    contentLocationLabel: "الموقع",
    contentFooterTitle: "التذييل",
    contentFooterLabel: "ملاحظة التذييل",
    contentCopyrightLabel: "نص حقوق النشر",
    contentSocialTitle: "روابط التواصل الاجتماعي",
    toastProjectSaved: "تم حفظ المشروع.",
    toastPatternSaved: "تم حفظ الباترون.",
    toastCategorySaved: "تم حفظ التصنيف.",
    toastDeleted: "تم الحذف.",
    toastError: "حدث خطأ ما — تحققي من اتصالك وحاولي مجددًا.",
    rteBold: "غامق", rteItalic: "مائل", rteUnderline: "تسطير",
    rteHeading: "عنوان", rteBulletList: "قائمة نقطية", rteNumberedList: "قائمة مرقّمة",
    rteQuote: "اقتباس", rteLink: "رابط", rteAlignLeft: "محاذاة يسار", rteAlignCenter: "محاذاة وسط", rteAlignRight: "محاذاة يمين",
    rteLinkPrompt: "الصقي رابطًا",
    yarnTitle: "مخزون الخيوط",
    yarnAdd: "إضافة خيط",
    yarnSearchPlaceholder: "بحث في الخيوط…",
    yarnSortNewest: "الأحدث", yarnSortBrand: "الماركة", yarnSortLowStock: "المخزون المنخفض أولاً",
    yarnFilterAll: "كل الألياف", yarnLowStockBadge: "مخزون منخفض",
    yarnArchived: "مؤرشف", yarnArchive: "أرشفة", yarnUnarchive: "إلغاء الأرشفة", yarnDuplicate: "تكرار",
    yarnEmpty: "لا يوجد خيط في مخزونك بعد.",
    fieldPhoto: "صورة", fieldBrand: "الماركة", fieldCollection: "المجموعة", fieldColorName: "اسم اللون", fieldColorNumber: "رقم اللون",
    fieldWeight: "السماكة", fieldFiberType: "نوع الألياف", fieldHookSize: "مقاس الإبرة", fieldDyeLot: "رقم الصبغة",
    fieldQuantity: "الكمية", fieldUnit: "الوحدة", fieldLowStockThreshold: "تنبيه عند انخفاض الكمية إلى",
    fieldStore: "مكان الشراء", fieldPurchasePrice: "سعر الشراء", fieldPurchaseDate: "تاريخ الشراء", fieldNotes: "ملاحظات",
    materialsTitle: "المستلزمات",
    materialsAdd: "إضافة مستلزم",
    materialsSearchPlaceholder: "بحث في المستلزمات…",
    materialsEmpty: "لا توجد مستلزمات بعد.",
    fieldName: "الاسم", fieldCategory: "الفئة",
    materialCategories: "إبر,علامات الغرز,إبر خياطة,عيون أمان,حشوة,أزرار,خرز,مقص,شريط قياس,أخرى",
    yarnUsedTitle: "الخيوط المستخدمة",
    yarnUsedAdd: "إضافة خيط",
    yarnUsedPick: "اختاري خيطًا…",
    yarnUsedQty: "الكمية المستخدمة",
    statTotalYarn: "أنواع الخيوط", statLowStock: "مخزون منخفض",
    statTotalProjects: "إجمالي المشاريع",
    statTotalPatterns: "إجمالي الباترونات",
    statTotalCategories: "إجمالي التصنيفات",
    statRecent: "أحدث المشاريع",
    addProject: "إضافة مشروع",
    addPattern: "إضافة باترون",
    addCategory: "إضافة تصنيف",
    edit: "تعديل",
    delete: "حذف",
    save: "حفظ",
    cancel: "إلغاء",
    confirmDeleteTitle: "هل تريدين حذف هذا؟",
    confirmDeleteSub: "لا يمكن التراجع عن هذا الإجراء.",
    confirmDeleteBtn: "نعم، احذفي",
    titleEnLabel: "العنوان (إنجليزي)",
    titleArLabel: "العنوان (عربي)",
    categoryFieldLabel: "التصنيف",
    statusFieldLabel: "الحالة",
    visibilityFieldLabel: "الظهور",
    public: "عام",
    private: "خاص",
    featuredFieldLabel: "مميز في الصفحة الرئيسية",
    toneFieldLabel: "لون الغلاف",
    notesEnLabel: "ملاحظات (إنجليزي)",
    notesArLabel: "ملاحظات (عربي)",
    designerEnLabel: "المصمم (إنجليزي، اختياري)",
    designerArLabel: "المصمم (عربي، اختياري)",
    pdfFieldLabel: "يحتوي على PDF",
    youtubeFieldLabel: "يحتوي على رابط يوتيوب",
    etsyFieldLabel: "يحتوي على رابط Etsy",
    pinterestFieldLabel: "يحتوي على رابط Pinterest",
    nameEnLabel: "الاسم (إنجليزي)",
    nameArLabel: "الاسم (عربي)",
    customizeBrand: "اسم العلامة والشعار",
    customizeHero: "قسم البطل بالصفحة الرئيسية",
    brandFieldLabel: "اسم العلامة",
    heroEyebrowLabel: "النص العلوي",
    heroTitleLabel: "عنوان القسم الرئيسي",
    heroSubLabel: "النص الفرعي",
    customizeSaved: "تم الحفظ",
    noneYet: "لا يوجد شيء هنا بعد.",
    coverImageLabel: "صورة الغلاف",
    coverImageHelp: "ارفعي صورة من هاتفك أو جهازك. اتركيه فارغًا لاستخدام اللون البديل.",
    galleryLabel2: "صور المعرض",
    galleryHelp: "ارفعي صورة واحدة أو أكثر لمعرض صور المشروع.",
    pdfUrlLabel: "رابط PDF",
    youtubeUrlLabel: "رابط يوتيوب",
    etsyUrlLabel: "رابط Etsy",
    pinterestUrlLabel: "رابط Pinterest",
    linkUrlHelp: "اتركي أي حقل فارغًا إذا لم يتوفر رابط بعد — الزر ببساطة لن يظهر.",
    aboutTitle: "نبذة عني",
    aboutSub: "قصتي مع الكروشيه",
    aboutBody: "أمسكت الإبرة لأول مرة في عطلة نهاية أسبوع هادئة، ولم أتركها منذ ذلك الحين. ما بدأ كطريقة لاستخدام بقايا الخيوط تحوّل إلى هذا العالم الصغير الكامل — مفارش لطاولة جدتي، وكارديغان ارتديته حتى تآكلت أكمامه، وهدايا لصديقات أصبحن الآن يطلبن المزيد. هذه المكتبة هي المكان الذي أحفظ فيه كل ذلك: الباترونات التي أحبها، والمشاريع التي أفتخر بها، وتلك التي لا تزال بانتظار الإبرة.",
    aboutTitleLabel: "عنوان الصفحة",
    aboutBodyLabel: "قصتك",
    aboutImageLabel: "الصورة",
    readMyStory: "اقرأي قصتي ←",
    heroImageLabel: "صورة قسم البطل (اختياري — يستبدل الرسم التوضيحي)",
    heroCtaLabel: "نص الزر الرئيسي",
    heroCtaSecondaryLabel: "نص الزر الثانوي",
  },
};

const DEFAULT_CATEGORIES = [
  { id: "doilies", en: "Doilies", ar: "مفارش", tone: "lavender" },
  { id: "wearables", en: "Wearables", ar: "ملابس", tone: "sage" },
  { id: "bags", en: "Bags", ar: "حقائب", tone: "butter" },
  { id: "amigurumi", en: "Amigurumi", ar: "أميغورومي", tone: "sage" },
  { id: "accessories", en: "Accessories", ar: "إكسسوارات", tone: "lavender" },
  { id: "homeDecor", en: "Home Decor", ar: "ديكور منزلي", tone: "butter" },
  { id: "other", en: "Other", ar: "أخرى", tone: "sage" },
];

const DEFAULT_PROJECTS = [
  { id: 1, titleEn: "Lavender Field Doily", titleAr: "مفرش حقل اللافندر", cat: "doilies", tone: "lavender", status: "finished", visibility: "public", featured: true, patternId: "p1", galleryCount: 4,
    notesEn: "Blocked with pins overnight — the picot edge holds its shape beautifully.", notesAr: "تم تثبيته بالدبابيس طوال الليل — حافة البيكو تحافظ على شكلها بشكل جميل." },
  { id: 2, titleEn: "Meadow Granny Cardigan", titleAr: "كارديغان غراني مرج", cat: "wearables", tone: "sage", status: "inProgress", visibility: "public", featured: true, patternId: "p2", galleryCount: 3,
    notesEn: "On sleeve two. Considering shorter sleeves for warmer weather.", notesAr: "أعمل على الكم الثاني. أفكر بجعل الأكمام أقصر للطقس الدافئ." },
  { id: 3, titleEn: "Sunlit Market Tote", titleAr: "حقيبة السوق المشمسة", cat: "bags", tone: "butter", status: "inProgress", visibility: "public", featured: false, patternId: "p3", galleryCount: 3,
    notesEn: "Doubling the yarn for extra structure on the base.", notesAr: "أستخدم خيطين معًا لإعطاء القاعدة صلابة أكبر." },
  { id: 4, titleEn: "Little Fox Amigurumi", titleAr: "دمية الثعلب الصغير", cat: "amigurumi", tone: "sage", status: "notStarted", visibility: "public", featured: true, patternId: null, galleryCount: 2,
    notesEn: "Saved for a rainy weekend project.", notesAr: "محفوظ كمشروع ليوم ممطر." },
  { id: 5, titleEn: "Chunky Bow Clips", titleAr: "مشابك فيونكة سميكة", cat: "accessories", tone: "lavender", status: "finished", visibility: "public", featured: false, patternId: "p4", galleryCount: 2,
    notesEn: "Made a set of five in different pastel shades.", notesAr: "صنعت طقمًا من خمس قطع بألوان باستيل مختلفة." },
  { id: 6, titleEn: "Scalloped Coasters", titleAr: "مفارش أكواب مزخرفة", cat: "homeDecor", tone: "butter", status: "inProgress", visibility: "public", featured: false, patternId: null, galleryCount: 2,
    notesEn: "Set of six, one for each mug in the cupboard.", notesAr: "طقم من ست قطع، واحدة لكل كوب في الخزانة." },
  { id: 7, titleEn: "Cloudy Baby Blanket", titleAr: "بطانية الأطفال الغيمية", cat: "other", tone: "sage", status: "notStarted", visibility: "private", featured: false, patternId: "p2", galleryCount: 1,
    notesEn: "Waiting on the right shade of cream yarn.", notesAr: "بانتظار اللون الكريمي المناسب من الخيوط." },
  { id: 8, titleEn: "Braided Headband", titleAr: "عصابة رأس مجدولة", cat: "accessories", tone: "butter", status: "finished", visibility: "public", featured: false, patternId: "p4", galleryCount: 3,
    notesEn: "The braid holds up well without a lining.", notesAr: "الجديلة تحافظ على شكلها جيدًا بدون بطانة." },
];

const DEFAULT_PATTERNS = [
  { id: "p1", titleEn: "Classic Lavender Doily", titleAr: "مفرش لافندر كلاسيكي", designerEn: "Nora K.", designerAr: "نورا ك.", cat: "doilies", tone: "lavender",
    notesEn: "Uses a size 2.5mm hook and fine cotton thread. Chart included on page 3.", notesAr: "يستخدم إبرة 2.5 مم وخيط قطني ناعم. المخطط في الصفحة 3." },
  { id: "p2", titleEn: "Meadow Stitch Set", titleAr: "مجموعة غرزة المرج", designerEn: "Studio Wren", designerAr: "استوديو رين", cat: "wearables", tone: "sage",
    notesEn: "Sized XS–XL. Gauge swatch is essential before starting the yoke.", notesAr: "المقاسات من XS إلى XL. عينة القياس ضرورية قبل بدء الجزء العلوي." },
  { id: "p3", titleEn: "Market Day Tote", titleAr: "حقيبة يوم السوق", designerEn: "", designerAr: "", cat: "bags", tone: "butter",
    notesEn: "Self-drafted from a favorite tote shape — no written pattern yet.", notesAr: "مصمم ذاتيًا من شكل حقيبة مفضل — لا يوجد باترون مكتوب بعد." },
  { id: "p4", titleEn: "Pastel Bow Trio", titleAr: "ثلاثية الفيونكة الباستيل", designerEn: "Nora K.", designerAr: "نورا ك.", cat: "accessories", tone: "lavender",
    notesEn: "Quick make — about 20 minutes per bow once you know the shaping.", notesAr: "تنفيذ سريع — حوالي 20 دقيقة لكل فيونكة بعد إتقان التشكيل." },
  { id: "p5", titleEn: "Scalloped Edge Coaster", titleAr: "مفرش كوب بحافة مزخرفة", designerEn: "Studio Wren", designerAr: "استوديو رين", cat: "homeDecor", tone: "butter",
    notesEn: "Great stash-buster for leftover cotton yarn.", notesAr: "مثالي للاستفادة من بقايا الخيوط القطنية." },
  { id: "p6", titleEn: "Cloud Nine Blanket", titleAr: "بطانية سحابة", designerEn: "", designerAr: "", cat: "other", tone: "sage",
    notesEn: "Repeats a simple puff-stitch panel — easy to size up or down.", notesAr: "يعتمد على تكرار لوحة غرزة منفوشة بسيطة — يسهل تكبيرها أو تصغيرها." },
];

/* ---------- tiny hand-drawn crochet icon set ---------- */

function YarnBallIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="8.5" stroke={color} strokeWidth="1.4" />
      <path d="M5 9c3 2 6 2 9-1M4.5 13.5c3.5 1 8 .5 12-2M6.5 17c3.5 0 8-1.5 10.5-4.5M8.5 6c1.5 2.5 1.5 6.5-1 11" stroke={color} strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function HookIcon({ size = 22, color = "currentColor" }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <path d="M8 20 15 6.5c.6-1.2 2.1-1.7 3.2-1 1 .6 1.3 2 .6 3-.6.8-1.7 1-2.5.5" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M8 20c-2 0-3.3-1.4-3.3-3 0-1.8 1.6-3 3.3-2.6" stroke={color} strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

/* scalloped chain-stitch divider — the page's signature element */
function StitchDivider({ color = "#9C7A63", opacity = 0.55 }) {
  return (
    <svg viewBox="0 0 400 20" preserveAspectRatio="none" className="w-full h-4" style={{ display: "block" }}>
      <path
        d="M0 10 Q 12.5 0 25 10 T 50 10 T 75 10 T 100 10 T 125 10 T 150 10 T 175 10 T 200 10 T 225 10 T 250 10 T 275 10 T 300 10 T 325 10 T 350 10 T 375 10 T 400 10"
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeLinecap="round"
        opacity={opacity}
      />
    </svg>
  );
}

function toneVars(th, tone) {
  const map = {
    sage: { bg: th.sage, deep: th.sageDeep },
    lavender: { bg: th.lavender, deep: th.lavenderDeep },
    butter: { bg: th.butter, deep: th.butterDeep },
  };
  return map[tone] || map.sage;
}

/* ---------------------------------------------------------
   App
--------------------------------------------------------- */

const rowToCategory = (r) => ({ id: r.id, en: r.en, ar: r.ar, tone: r.tone, position: r.position });
const categoryToRow = (c, position) => ({ id: c.id, en: c.en, ar: c.ar, tone: c.tone, position: position ?? c.position ?? 0 });

const rowToProject = (r) => ({
  id: r.id, titleEn: r.title_en, titleAr: r.title_ar, cat: r.cat, tone: r.tone,
  status: r.status, visibility: r.visibility, featured: r.featured,
  patternId: r.pattern_id, coverImage: r.cover_image, gallery: r.gallery || [],
  galleryCount: (r.gallery || []).length || 1, notesEn: r.notes_en, notesAr: r.notes_ar,
});
const projectToRow = (p) => ({
  title_en: p.titleEn, title_ar: p.titleAr, cat: p.cat, tone: p.tone,
  status: p.status, visibility: p.visibility, featured: !!p.featured,
  pattern_id: p.patternId || null, cover_image: p.coverImage || null,
  gallery: p.gallery || [], notes_en: p.notesEn, notes_ar: p.notesAr,
});

const rowToPattern = (r) => ({
  id: r.id, titleEn: r.title_en, titleAr: r.title_ar, designerEn: r.designer_en, designerAr: r.designer_ar,
  cat: r.cat, tone: r.tone, pdfUrl: r.pdf_url, youtubeUrl: r.youtube_url, etsyUrl: r.etsy_url, pinterestUrl: r.pinterest_url,
  coverImage: r.cover_image, notesEn: r.notes_en, notesAr: r.notes_ar,
});
const patternToRow = (p) => ({
  title_en: p.titleEn, title_ar: p.titleAr, designer_en: p.designerEn, designer_ar: p.designerAr,
  cat: p.cat, tone: p.tone, pdf_url: p.pdfUrl || null, youtube_url: p.youtubeUrl || null,
  etsy_url: p.etsyUrl || null, pinterest_url: p.pinterestUrl || null,
  cover_image: p.coverImage || null, notes_en: p.notesEn, notes_ar: p.notesAr,
});

const rowToYarn = (r) => ({
  id: r.id, photo: r.photo, brand: r.brand, collection: r.collection, colorName: r.color_name, colorNumber: r.color_number,
  weight: r.weight, fiberType: r.fiber_type, hookSize: r.hook_size, dyeLot: r.dye_lot,
  quantity: Number(r.quantity), unit: r.unit, lowStockThreshold: Number(r.low_stock_threshold),
  store: r.store, purchasePrice: r.purchase_price, purchaseDate: r.purchase_date, notes: r.notes,
  visibility: r.visibility, archived: r.archived,
});
const yarnToRow = (y) => ({
  photo: y.photo || null, brand: y.brand, collection: y.collection, color_name: y.colorName, color_number: y.colorNumber,
  weight: y.weight, fiber_type: y.fiberType, hook_size: y.hookSize, dye_lot: y.dyeLot,
  quantity: Number(y.quantity) || 0, unit: y.unit, low_stock_threshold: Number(y.lowStockThreshold) || 0,
  store: y.store, purchase_price: y.purchasePrice === "" ? null : y.purchasePrice, purchase_date: y.purchaseDate || null, notes: y.notes,
  visibility: y.visibility, archived: !!y.archived,
});

const rowToMaterial = (r) => ({
  id: r.id, photo: r.photo, name: r.name, category: r.category, quantity: Number(r.quantity), unit: r.unit,
  notes: r.notes, visibility: r.visibility, archived: r.archived,
});
const materialToRow = (m) => ({
  photo: m.photo || null, name: m.name, category: m.category, quantity: Number(m.quantity) || 0, unit: m.unit,
  notes: m.notes, visibility: m.visibility, archived: !!m.archived,
});

const rowToProjectYarn = (r) => ({ id: r.id, projectId: r.project_id, yarnId: r.yarn_id, quantityUsed: Number(r.quantity_used) });

export default function FMCrochetLibrary() {
  const [lang, setLang] = useState("en");
  const [mode, setMode] = useState("light");
  const [favorites, setFavorites] = useState({});
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [view, setView] = useState("home"); // home | library | project | favorites | inspiration | admin
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [categories, setCategories] = useState(DEFAULT_CATEGORIES);
  const [projects, setProjects] = useState(DEFAULT_PROJECTS);
  const [patterns, setPatterns] = useState(DEFAULT_PATTERNS);
  const [yarnItems, setYarnItems] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [projectYarnLinks, setProjectYarnLinks] = useState([]);
  const [adminUnlocked, setAdminUnlocked] = useState(false);
  const [adminEmail, setAdminEmail] = useState("");
  const [site, setSite] = useState({});
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const th = THEMES[mode];
  const overrides = Object.fromEntries(Object.entries(site[lang] || {}).filter(([, v]) => v));
  const t = { ...COPY[lang], ...overrides };
  const isRTL = lang === "ar";

  const openProject = (id) => {
    setSelectedProjectId(id);
    setView("project");
    window.scrollTo?.({ top: 0, behavior: "instant" });
  };

  const goTo = (v) => {
    setView(v);
    setMobileNavOpen(false);
    window.scrollTo?.({ top: 0, behavior: "instant" });
  };

  const loadContent = async () => {
    const [catRows, projRows, patRows, siteRows] = await Promise.all([
      sbSelect("categories", "select=*&order=position.asc"),
      sbSelect("projects", "select=*&order=created_at.asc"),
      sbSelect("patterns", "select=*&order=created_at.asc"),
      sbSelect("site_settings", "select=*&id=eq.1"),
    ]);
    setCategories(catRows.map(rowToCategory));
    setProjects(projRows.map(rowToProject));
    setPatterns(patRows.map(rowToPattern));
    setSite(siteRows?.[0]?.data || {});
    // Phase 2 tables — fetched separately so the core site still works
    // even if this migration hasn't been run yet.
    try {
      const [yarnRows, materialRows, linkRows] = await Promise.all([
        sbSelect("yarn_inventory", "select=*&order=created_at.asc"),
        sbSelect("materials", "select=*&order=created_at.asc"),
        sbSelect("project_yarn", "select=*"),
      ]);
      setYarnItems(yarnRows.map(rowToYarn));
      setMaterials(materialRows.map(rowToMaterial));
      setProjectYarnLinks(linkRows.map(rowToProjectYarn));
    } catch (e) {
      /* Phase 2 migration not run yet — yarn/materials sections just stay empty */
    }
  };

  useEffect(() => {
    (async () => {
      try {
        const l = await storage.get("fm_lang");
        const m = await storage.get("fm_mode");
        const f = await storage.get("fm_favorites");
        if (l?.value) setLang(l.value);
        if (m?.value) setMode(m.value);
        if (f?.value) setFavorites(JSON.parse(f.value));
      } catch (e) {
        /* first run — no stored prefs yet */
      }
      try {
        const s = await storage.get("fm_session");
        if (s?.value) sbSession = JSON.parse(s.value);
        const em = await storage.get("fm_admin_email");
        if (em?.value) setAdminEmail(em.value);
      } catch (e) {
        /* no saved session */
      }
      if (sbSession) {
        const token = await sbEnsureFreshToken();
        setAdminUnlocked(!!token);
      }
      try {
        await loadContent();
      } catch (e) {
        setLoadError(e.message || "Couldn't reach Supabase.");
      } finally {
        setLoaded(true);
      }
    })();
  }, []);

  useEffect(() => {
    if (!loaded) return;
    storage.set("fm_lang", lang).catch(() => {});
  }, [lang, loaded]);

  useEffect(() => {
    if (!loaded) return;
    storage.set("fm_mode", mode).catch(() => {});
  }, [mode, loaded]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const langOverrides = site[lang] || {};
    document.title = langOverrides.seoTitle || t.brand;
    let meta = document.querySelector('meta[name="description"]');
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    meta.content = langOverrides.seoDesc || t.heroSub?.replace(/<[^>]+>/g, "") || "";
    if (site.faviconImage) {
      let link = document.querySelector('link[rel="icon"]');
      if (!link) {
        link = document.createElement("link");
        link.rel = "icon";
        document.head.appendChild(link);
      }
      link.href = site.faviconImage;
    }
    document.documentElement.dir = isRTL ? "rtl" : "ltr";
    document.documentElement.lang = lang;
  }, [site, lang, t.brand, isRTL]);

  const toggleFavorite = (id) => {
    setFavorites((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      storage.set("fm_favorites", JSON.stringify(next)).catch(() => {});
      return next;
    });
  };

  const handleSignIn = async (email, password) => {
    await sbSignIn(email, password);
    setAdminUnlocked(true);
    setAdminEmail(email);
    storage.set("fm_admin_email", email).catch(() => {});
    await loadContent(); // re-fetch so private projects are now included
  };

  const handleSignOut = async () => {
    await sbSignOut();
    setAdminUnlocked(false);
    await loadContent().catch(() => {}); // drop private projects from view again
  };

  const saveProject = async (proj) => {
    let savedId = proj.id;
    if (proj.id) {
      const row = await sbUpdate("projects", proj.id, projectToRow(proj));
      setProjects((prev) => prev.map((p) => (p.id === proj.id ? rowToProject(row) : p)));
    } else {
      const row = await sbInsert("projects", projectToRow(proj));
      savedId = row.id;
      setProjects((prev) => [...prev, rowToProject(row)]);
    }
    if (proj.yarnUsed) {
      await syncProjectYarn(savedId, proj.yarnUsed);
    }
  };
  const deleteProject = async (id) => {
    await sbDelete("projects", id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
  };

  const savePattern = async (pat) => {
    if (pat.id) {
      const row = await sbUpdate("patterns", pat.id, patternToRow(pat));
      setPatterns((prev) => prev.map((p) => (p.id === pat.id ? rowToPattern(row) : p)));
    } else {
      const newId = `p${Date.now()}`;
      const row = await sbInsert("patterns", { id: newId, ...patternToRow(pat) });
      setPatterns((prev) => [...prev, rowToPattern(row)]);
    }
  };
  const deletePattern = async (id) => {
    await sbDelete("patterns", id);
    setPatterns((prev) => prev.filter((p) => p.id !== id));
  };

  const saveYarn = async (yarn) => {
    if (yarn.id) {
      const row = await sbUpdate("yarn_inventory", yarn.id, yarnToRow(yarn));
      setYarnItems((prev) => prev.map((y) => (y.id === yarn.id ? rowToYarn(row) : y)));
    } else {
      const row = await sbInsert("yarn_inventory", yarnToRow(yarn));
      setYarnItems((prev) => [...prev, rowToYarn(row)]);
    }
  };
  const deleteYarn = async (id) => {
    await sbDelete("yarn_inventory", id);
    setYarnItems((prev) => prev.filter((y) => y.id !== id));
  };
  const duplicateYarn = async (yarn) => {
    const { id, ...rest } = yarn;
    const row = await sbInsert("yarn_inventory", yarnToRow(rest));
    setYarnItems((prev) => [...prev, rowToYarn(row)]);
  };
  const toggleYarnArchived = async (yarn) => saveYarn({ ...yarn, archived: !yarn.archived });

  const saveMaterial = async (mat) => {
    if (mat.id) {
      const row = await sbUpdate("materials", mat.id, materialToRow(mat));
      setMaterials((prev) => prev.map((m) => (m.id === mat.id ? rowToMaterial(row) : m)));
    } else {
      const row = await sbInsert("materials", materialToRow(mat));
      setMaterials((prev) => [...prev, rowToMaterial(row)]);
    }
  };
  const deleteMaterial = async (id) => {
    await sbDelete("materials", id);
    setMaterials((prev) => prev.filter((m) => m.id !== id));
  };
  const duplicateMaterial = async (mat) => {
    const { id, ...rest } = mat;
    const row = await sbInsert("materials", materialToRow(rest));
    setMaterials((prev) => [...prev, rowToMaterial(row)]);
  };
  const toggleMaterialArchived = async (mat) => saveMaterial({ ...mat, archived: !mat.archived });

  // Replaces a project's whole yarn-used list. Deleting the old rows first (rather than
  // diffing) lets the database trigger correctly restore then re-deduct stock either way.
  const syncProjectYarn = async (projectId, yarnRows) => {
    await sbDeleteWhere("project_yarn", `project_id=eq.${projectId}`);
    const inserts = (yarnRows || []).filter((r) => r.yarnId && r.quantityUsed > 0);
    let newLinks = [];
    if (inserts.length > 0) {
      newLinks = await Promise.all(
        inserts.map((r) => sbInsert("project_yarn", { project_id: projectId, yarn_id: r.yarnId, quantity_used: r.quantityUsed }))
      );
    }
    setProjectYarnLinks((prev) => [...prev.filter((l) => l.projectId !== projectId), ...newLinks.map(rowToProjectYarn)]);
    // yarn quantities changed server-side via trigger — refresh yarn stock from the source of truth
    try {
      const yarnRowsFresh = await sbSelect("yarn_inventory", "select=*&order=created_at.asc");
      setYarnItems(yarnRowsFresh.map(rowToYarn));
    } catch (e) { /* non-fatal */ }
  };

  const saveCategory = async (cat) => {
    const exists = categories.some((c) => c.id === cat.id);
    if (exists) {
      const row = await sbUpdate("categories", cat.id, categoryToRow(cat));
      setCategories((prev) => prev.map((c) => (c.id === cat.id ? rowToCategory(row) : c)));
    } else {
      const row = await sbInsert("categories", categoryToRow(cat, categories.length));
      setCategories((prev) => [...prev, rowToCategory(row)]);
    }
  };
  const deleteCategory = async (id) => {
    await sbDelete("categories", id);
    setCategories((prev) => prev.filter((c) => c.id !== id));
  };
  const reorderCategory = async (id, dir) => {
    const idx = categories.findIndex((c) => c.id === id);
    const swapWith = idx + dir;
    if (swapWith < 0 || swapWith >= categories.length) return;
    const a = categories[idx], b = categories[swapWith];
    const next = [...categories];
    [next[idx], next[swapWith]] = [next[swapWith], next[idx]];
    setCategories(next);
    try {
      await Promise.all([
        sbUpdate("categories", a.id, { position: swapWith }),
        sbUpdate("categories", b.id, { position: idx }),
      ]);
    } catch (e) {
      setCategories(categories); // revert on failure
    }
  };

  const saveSite = async (draft) => {
    await sbUpdate("site_settings", 1, { data: draft });
    setSite(draft);
  };

  const publicProjects = useMemo(() => (adminUnlocked ? projects : projects.filter((p) => p.visibility !== "private")), [projects, adminUnlocked]);

  const inProgress = useMemo(() => publicProjects.filter((p) => p.status === "inProgress"), [publicProjects]);
  const featured = useMemo(() => publicProjects.filter((p) => p.featured), [publicProjects]);
  const recent = useMemo(() => [...publicProjects].slice(-4).reverse(), [publicProjects]);

  const bodyFont = isRTL ? "'Cairo', sans-serif" : "'Plus Jakarta Sans', sans-serif";
  const displayFont = isRTL ? "'El Messiri', serif" : "'Fraunces', serif";

  return (
    <div
      dir={isRTL ? "rtl" : "ltr"}
      style={{
        "--bg": th.bg,
        "--surface": th.surface,
        "--surfaceMuted": th.surfaceMuted,
        "--text": th.text,
        "--textMuted": th.textMuted,
        "--border": th.border,
        "--sage": th.sage,
        "--sageDeep": th.sageDeep,
        "--lavender": th.lavender,
        "--lavenderDeep": th.lavenderDeep,
        "--butter": th.butter,
        "--butterDeep": th.butterDeep,
        "--thread": th.thread,
        "--threadDeep": th.threadDeep,
        fontFamily: bodyFont,
        background: "var(--bg)",
        color: "var(--text)",
        minHeight: "100vh",
        transition: "background 0.35s ease, color 0.35s ease",
      }}
      className="w-full"
    >
      <style>{FONT_IMPORT}</style>
      <style>{`
        .fm-display { font-family: ${displayFont}; }
        .fm-card { transition: transform .25s ease, box-shadow .25s ease; }
        .fm-card:hover { transform: translateY(-4px); }
        .fm-btn { transition: transform .2s ease, opacity .2s ease; }
        .fm-btn:active { transform: scale(0.97); }
        .fm-focusable:focus-visible { outline: 2px solid var(--threadDeep); outline-offset: 3px; border-radius: 10px; }
        .fm-rte ul, .fm-prose ul { list-style: disc; padding-inline-start: 1.25em; margin: 0.5em 0; }
        .fm-rte ol, .fm-prose ol { list-style: decimal; padding-inline-start: 1.25em; margin: 0.5em 0; }
        .fm-rte h3, .fm-prose h3 { font-family: ${displayFont}; font-size: 1.1em; font-weight: 600; margin: 0.6em 0 0.3em; }
        .fm-rte blockquote, .fm-prose blockquote { border-inline-start: 3px solid var(--threadDeep); padding-inline-start: 0.9em; margin: 0.6em 0; opacity: 0.85; font-style: italic; }
        .fm-rte a, .fm-prose a { color: var(--threadDeep); text-decoration: underline; }
        .fm-prose p { margin: 0.5em 0; }
        @media (prefers-reduced-motion: reduce) {
          .fm-card, .fm-btn { transition: none !important; }
          .fm-card:hover { transform: none !important; }
        }
      `}</style>

      {loadError && (
        <div className="px-4 sm:px-6 pt-3">
          <div className="mx-auto max-w-6xl rounded-xl px-4 py-3 text-xs" style={{ background: "#F7E4E1", color: "#7A342B" }}>
            Couldn't load your Supabase data ({loadError}). Check that your publishable key is pasted in correctly and that the migration has been run.
          </div>
        </div>
      )}

      {/* ---------------- NAV ---------------- */}
      <header className="sticky top-0 z-30 px-4 sm:px-6 pt-4">
        <div
          className="mx-auto max-w-6xl flex items-center justify-between gap-3 rounded-full px-4 sm:px-5 py-2.5 backdrop-blur"
          style={{ background: "color-mix(in srgb, var(--surface) 88%, transparent)", border: "1px solid var(--border)", boxShadow: "0 8px 24px -12px rgba(60,45,30,0.18)" }}
        >
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => goTo("home")}
              className="fm-btn fm-focusable flex items-center gap-2"
              aria-label="FM Crochet Library home"
            >
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 overflow-hidden"
                style={site.logoImage ? undefined : { background: "linear-gradient(135deg, var(--sage), var(--lavender))" }}
              >
                {site.logoImage ? (
                  <img src={site.logoImage} alt={t.brand} className="w-full h-full object-cover" />
                ) : (
                  <span className="fm-display text-sm font-semibold" style={{ color: "var(--threadDeep)" }}>FM</span>
                )}
              </div>
              <span className="fm-display hidden sm:inline text-[15px] font-medium tracking-tight">{t.brand}</span>
            </button>
          </div>

          <nav className="hidden md:flex items-center gap-1 text-sm">
            {[
              ["home", t.nav.home],
              ["library", t.nav.library],
              ["inspiration", t.nav.inspiration],
              ["favorites", t.nav.favorites],
              ["about", t.nav.about],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => goTo(key)}
                className="fm-btn fm-focusable px-3.5 py-1.5 rounded-full hover:opacity-80"
                style={{
                  color: view === key ? "var(--surface)" : "var(--text)",
                  background: view === key ? "var(--threadDeep)" : "transparent",
                }}
              >
                {label}
              </button>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              aria-label="Toggle language"
              onClick={() => setLang((l) => (l === "en" ? "ar" : "en"))}
              className="fm-btn fm-focusable w-9 h-9 rounded-full flex items-center justify-center hover:opacity-80"
              style={{ background: "var(--surfaceMuted)" }}
            >
              <Globe size={16} />
            </button>
            <button
              aria-label="Toggle theme"
              onClick={() => setMode((m) => (m === "light" ? "dark" : "light"))}
              className="fm-btn fm-focusable w-9 h-9 rounded-full flex items-center justify-center hover:opacity-80"
              style={{ background: "var(--surfaceMuted)" }}
            >
              {mode === "light" ? <Moon size={16} /> : <Sun size={16} />}
            </button>
            <button
              aria-label="Search"
              className="fm-btn fm-focusable w-9 h-9 rounded-full flex items-center justify-center hover:opacity-80 md:hidden"
              style={{ background: "var(--surfaceMuted)" }}
            >
              <Search size={16} />
            </button>
            <button
              aria-label="Menu"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen((o) => !o)}
              className="fm-btn fm-focusable w-9 h-9 rounded-full flex items-center justify-center hover:opacity-80 md:hidden"
              style={{ background: "var(--surfaceMuted)" }}
            >
              {mobileNavOpen ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
            </button>
          </div>
        </div>

        {/* mobile nav dropdown */}
        {mobileNavOpen && (
          <div
            className="mx-auto max-w-6xl mt-2 rounded-2xl p-2 flex flex-col gap-1 md:hidden"
            style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 12px 28px -14px rgba(60,45,30,0.25)" }}
          >
            {[
              ["home", t.nav.home],
              ["library", t.nav.library],
              ["inspiration", t.nav.inspiration],
              ["favorites", t.nav.favorites],
              ["about", t.nav.about],
            ].map(([key, label]) => (
              <button
                key={key}
                onClick={() => goTo(key)}
                className="fm-btn fm-focusable text-left rtl:text-right px-4 py-2.5 rounded-xl text-sm font-medium"
                style={{
                  color: view === key ? "var(--surface)" : "var(--text)",
                  background: view === key ? "var(--threadDeep)" : "transparent",
                }}
              >
                {label}
              </button>
            ))}
          </div>
        )}
      </header>

      {view === "home" && (
      <>
      {/* ---------------- HERO ---------------- */}
      <section className="px-4 sm:px-6 pt-10 sm:pt-16">
        <div className="mx-auto max-w-6xl grid md:grid-cols-2 gap-10 items-center">
          <div>
            <div
              className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium mb-5"
              style={{ background: "var(--surfaceMuted)", color: "var(--threadDeep)" }}
            >
              <Sparkles size={12} />
              {t.heroEyebrow}
            </div>
            <h1 className="fm-display text-[2.5rem] sm:text-[3.4rem] leading-[1.08] font-medium tracking-tight whitespace-pre-line">
              {t.heroTitle}
            </h1>
            <div
              className="fm-prose mt-5 text-[15px] sm:text-base leading-relaxed max-w-md"
              style={{ color: "var(--textMuted)" }}
              dangerouslySetInnerHTML={{ __html: t.heroSub }}
            />

            <div className="mt-7 flex flex-wrap items-center gap-3">
              <button
                onClick={() => goTo("library")}
                className="fm-btn fm-focusable px-5 py-3 rounded-full text-sm font-medium"
                style={{ background: "var(--threadDeep)", color: "var(--surface)" }}
              >
                {t.heroCta}
              </button>
              <a
                href="#continue-crocheting"
                className="fm-btn fm-focusable px-5 py-3 rounded-full text-sm font-medium flex items-center gap-1.5"
                style={{ background: "transparent", border: "1px solid var(--border)" }}
              >
                {t.heroCtaSecondary}
                <ChevronRight size={14} className={isRTL ? "rotate-180" : ""} />
              </a>
            </div>

            <button
              onClick={() => goTo("about")}
              className="fm-btn fm-focusable mt-4 inline-flex items-center gap-1 text-xs font-medium underline decoration-dotted underline-offset-4"
              style={{ color: "var(--threadDeep)" }}
            >
              {t.readMyStory}
            </button>

            {/* search bar */}
            <div
              className="mt-8 flex items-center gap-2.5 px-4 py-3 rounded-2xl max-w-md"
              style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
            >
              <Search size={16} style={{ color: "var(--textMuted)" }} />
              <input
                type="text"
                placeholder={t.searchPlaceholder}
                className="fm-focusable bg-transparent outline-none text-sm w-full placeholder:opacity-60"
                style={{ color: "var(--text)" }}
              />
            </div>
          </div>

          {/* hero visual — real photo when set, otherwise the wound-yarn illustration */}
          {site.heroImage ? (
            <div className="relative h-[280px] sm:h-[380px] rounded-3xl overflow-hidden" style={{ boxShadow: "0 20px 44px -20px rgba(60,45,30,0.35)" }}>
              <img src={site.heroImage} alt={t.brand} className="w-full h-full object-cover" />
            </div>
          ) : (
          <div className="relative h-[280px] sm:h-[360px] flex items-center justify-center">
            <div
              className="absolute w-56 h-56 sm:w-72 sm:h-72 rounded-full"
              style={{ background: "linear-gradient(135deg, var(--lavender), var(--sage))", opacity: 0.5, filter: "blur(2px)" }}
            />
            {[
              { tone: "sage", top: "6%", left: "50%", size: 92, rot: -8 },
              { tone: "lavender", top: "38%", left: "18%", size: 108, rot: 6 },
              { tone: "butter", top: "40%", left: "72%", size: 84, rot: -4 },
              { tone: "sage", top: "70%", left: "42%", size: 96, rot: 10 },
            ].map((c, i) => {
              const tv = toneVars(th, c.tone);
              return (
                <div
                  key={i}
                  className="fm-card absolute rounded-3xl flex items-center justify-center shadow-lg"
                  style={{
                    top: c.top,
                    left: c.left,
                    width: c.size,
                    height: c.size,
                    transform: `translate(-50%,-50%) rotate(${c.rot}deg)`,
                    background: `linear-gradient(160deg, ${tv.bg}, ${tv.deep})`,
                    boxShadow: "0 14px 28px -14px rgba(60,45,30,0.35)",
                  }}
                >
                  <YarnBallIcon color="rgba(255,255,255,0.85)" size={c.size * 0.32} />
                </div>
              );
            })}
          </div>
          )}
        </div>

        <div className="mx-auto max-w-6xl mt-12 sm:mt-16">
          <StitchDivider color={th.thread} />
        </div>
      </section>

      {/* ---------------- CONTINUE CROCHETING ---------------- */}
      <Section id="continue-crocheting" title={t.continueTitle} sub={t.continueSub} icon={<HookIcon size={18} color={th.threadDeep} />}>
        {inProgress.length === 0 ? (
          <EmptyState text={t.emptyProgress} />
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 sm:mx-0 sm:px-0 sm:grid sm:grid-cols-3">
            {inProgress.map((p) => (
              <ProjectCard key={p.id} p={p} lang={lang} t={t} th={th} isFav={!!favorites[p.id]} onFav={() => toggleFavorite(p.id)} onOpen={() => openProject(p.id)} categories={categories} wide />
            ))}
          </div>
        )}
      </Section>

      {/* ---------------- CATEGORIES ---------------- */}
      <Section title={t.categoriesTitle} sub={t.categoriesSub} icon={<LayoutGrid size={18} color={th.threadDeep} />}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {categories.map((c) => {
            const tv = toneVars(th, c.tone);
            return (
              <button
                key={c.id}
                onClick={() => { setLibraryFilter(c.id); goTo("library"); }}
                className="fm-card fm-btn fm-focusable rounded-2xl p-4 sm:p-5 text-left rtl:text-right flex flex-col gap-6 sm:gap-10"
                style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
              >
                <div
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `linear-gradient(135deg, ${tv.bg}, ${tv.deep})` }}
                >
                  <YarnBallIcon color="#fff" size={18} />
                </div>
                <span className="text-sm font-medium">{lang === "en" ? c.en : c.ar}</span>
              </button>
            );
          })}
        </div>
      </Section>

      {/* ---------------- FEATURED ---------------- */}
      <Section title={t.featuredTitle} sub={t.featuredSub} icon={<Sparkles size={18} color={th.threadDeep} />}>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {featured.map((p) => (
            <ProjectCard key={p.id} p={p} lang={lang} t={t} th={th} isFav={!!favorites[p.id]} onFav={() => toggleFavorite(p.id)} onOpen={() => openProject(p.id)} categories={categories} tall />
          ))}
        </div>
      </Section>

      {/* ---------------- RECENTLY ADDED ---------------- */}
      <Section title={t.recentTitle} sub={t.recentSub} icon={<BookOpen size={18} color={th.threadDeep} />} last>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          {recent.map((p) => (
            <ProjectCard key={p.id} p={p} lang={lang} t={t} th={th} isFav={!!favorites[p.id]} onFav={() => toggleFavorite(p.id)} onOpen={() => openProject(p.id)} categories={categories} compact />
          ))}
        </div>
      </Section>
      </>
      )}

      {view === "library" && (
        <LibraryView
          lang={lang} t={t} th={th} isRTL={isRTL}
          filter={libraryFilter} setFilter={setLibraryFilter}
          categories={categories} patterns={patterns}
        />
      )}

      {view === "project" && (
        <ProjectDetailView
          project={publicProjects.find((p) => p.id === selectedProjectId)}
          lang={lang} t={t} th={th} isRTL={isRTL}
          categories={categories} patterns={patterns}
          isFav={!!favorites[selectedProjectId]}
          onFav={() => toggleFavorite(selectedProjectId)}
          onBack={() => goTo("home")}
        />
      )}

      {view === "favorites" && (
        <FavoritesView
          projects={publicProjects.filter((p) => favorites[p.id])}
          lang={lang} t={t} th={th} categories={categories}
          onFav={toggleFavorite}
          onOpen={openProject}
        />
      )}

      {view === "inspiration" && <InspirationView t={t} th={th} />}

      {view === "about" && <AboutView t={t} th={th} aboutImage={site.aboutImage} />}

      {view === "admin" && (
        <AdminView
          lang={lang} t={t} th={th} isRTL={isRTL}
          adminUnlocked={adminUnlocked} adminEmail={adminEmail}
          onSignIn={handleSignIn} onSignOut={handleSignOut}
          categories={categories} projects={projects} patterns={patterns}
          saveProject={saveProject} deleteProject={deleteProject}
          savePattern={savePattern} deletePattern={deletePattern}
          saveCategory={saveCategory} deleteCategory={deleteCategory} reorderCategory={reorderCategory}
          site={site} saveSite={saveSite}
          yarnItems={yarnItems} saveYarn={saveYarn} deleteYarn={deleteYarn} duplicateYarn={duplicateYarn} toggleYarnArchived={toggleYarnArchived}
          materials={materials} saveMaterial={saveMaterial} deleteMaterial={deleteMaterial} duplicateMaterial={duplicateMaterial} toggleMaterialArchived={toggleMaterialArchived}
          projectYarnLinks={projectYarnLinks}
          onExit={() => goTo("home")}
        />
      )}

      {/* ---------------- FOOTER ---------------- */}
      <footer className="px-4 sm:px-6 pb-10 pt-4">
        <div className="mx-auto max-w-6xl">
          <StitchDivider color={th.thread} opacity={0.35} />
          <div className="mt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 text-xs" style={{ color: "var(--textMuted)" }}>
            <div className="flex items-center gap-2">
              <div
                className="w-6 h-6 rounded-full flex items-center justify-center overflow-hidden"
                style={site.logoImage ? undefined : { background: "linear-gradient(135deg, var(--sage), var(--lavender))" }}
              >
                {site.logoImage ? (
                  <img src={site.logoImage} alt={t.brand} className="w-full h-full object-cover" />
                ) : (
                  <span className="fm-display text-[10px] font-semibold" style={{ color: "var(--threadDeep)" }}>FM</span>
                )}
              </div>
              <span>{t.brand}</span>
              {site.contactEmail && (
                <a href={`mailto:${site.contactEmail}`} className="fm-btn fm-focusable flex items-center gap-1 hover:opacity-80">
                  <Mail size={12} />
                  {site.contactEmail}
                </a>
              )}
            </div>

            {(site.social?.instagram || site.social?.pinterest || site.social?.etsy || site.social?.youtube || site.social?.facebook) && (
              <div className="flex items-center gap-2">
                {site.social?.instagram && <a href={site.social.instagram} target="_blank" rel="noopener noreferrer" className="fm-btn fm-focusable w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }}><Instagram size={13} /></a>}
                {site.social?.facebook && <a href={site.social.facebook} target="_blank" rel="noopener noreferrer" className="fm-btn fm-focusable w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }}><Facebook size={13} /></a>}
                {site.social?.youtube && <a href={site.social.youtube} target="_blank" rel="noopener noreferrer" className="fm-btn fm-focusable w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }}><Youtube size={13} /></a>}
                {site.social?.etsy && <a href={site.social.etsy} target="_blank" rel="noopener noreferrer" className="fm-btn fm-focusable w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }}><ShoppingBag size={13} /></a>}
                {site.social?.pinterest && <a href={site.social.pinterest} target="_blank" rel="noopener noreferrer" className="fm-btn fm-focusable w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }}><Link2 size={13} /></a>}
              </div>
            )}

            <div className="flex items-center gap-3">
              <span>{overrides.copyright || t.footerNote}</span>
              <button onClick={() => goTo("admin")} className="fm-btn fm-focusable opacity-50 hover:opacity-90 underline decoration-dotted underline-offset-4">
                Admin
              </button>
            </div>
          </div>
        </div>
      </footer>

      {view !== "home" && (
        <button
          onClick={() => goTo("home")}
          aria-label={t.back}
          className="fm-btn fm-focusable fixed bottom-5 left-5 z-40 w-11 h-11 rounded-full flex items-center justify-center"
          style={{ background: "var(--threadDeep)", color: "var(--surface)", boxShadow: "0 10px 24px -10px rgba(60,45,30,0.5)" }}
        >
          <ArrowLeft size={18} />
        </button>
      )}
    </div>
  );
}

/* ---------------------------------------------------------
   Sub-components
--------------------------------------------------------- */

function Section({ id, title, sub, icon, children, last }) {
  return (
    <section id={id} className={`px-4 sm:px-6 ${last ? "pt-10 sm:pt-14" : "pt-10 sm:pt-14"}`}>
      <div className="mx-auto max-w-6xl">
        <div className="flex items-end justify-between mb-5 sm:mb-6">
          <div>
            <div className="flex items-center gap-2 mb-1">
              {icon}
              <h2 className="fm-display text-xl sm:text-2xl font-medium tracking-tight">{title}</h2>
            </div>
            <p className="text-sm" style={{ color: "var(--textMuted)" }}>{sub}</p>
          </div>
        </div>
        {children}
      </div>
    </section>
  );
}

function EmptyState({ text }) {
  return (
    <div
      className="rounded-2xl px-6 py-10 text-center text-sm flex flex-col items-center gap-3"
      style={{ background: "var(--surfaceMuted)", color: "var(--textMuted)", border: "1px dashed var(--border)" }}
    >
      <YarnBallIcon size={26} />
      {text}
    </div>
  );
}

function ProjectCard({ p, lang, t, th, isFav, onFav, onOpen, categories, wide, tall, compact }) {
  const tv = toneVars(th, p.tone);
  const title = lang === "en" ? p.titleEn : p.titleAr;
  const catObj = (categories || DEFAULT_CATEGORIES).find((c) => c.id === p.cat);
  const catLabel = catObj ? (lang === "en" ? catObj.en : catObj.ar) : "";
  const statusLabel = t.statusLabels[p.status];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === "Enter") onOpen?.(); }}
      className="fm-card fm-focusable rounded-2xl overflow-hidden shrink-0 cursor-pointer text-left rtl:text-right"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        width: wide ? 240 : undefined,
        boxShadow: "0 10px 24px -16px rgba(60,45,30,0.25)",
      }}
    >
      <div
        className={`relative flex items-center justify-center overflow-hidden ${tall ? "h-40" : compact ? "h-24" : "h-32"}`}
        style={p.coverImage ? undefined : { background: `linear-gradient(150deg, ${tv.bg}, ${tv.deep})` }}
      >
        {p.coverImage ? (
          <img src={p.coverImage} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <YarnBallIcon color="rgba(255,255,255,0.9)" size={compact ? 26 : 36} />
        )}
        <button
          aria-label="Toggle favorite"
          onClick={(e) => { e.stopPropagation(); onFav(); }}
          className="fm-btn fm-focusable absolute top-2.5 right-2.5 rtl:right-auto rtl:left-2.5 w-7 h-7 rounded-full flex items-center justify-center"
          style={{ background: "rgba(255,255,255,0.85)" }}
        >
          <Heart size={14} color={th.threadDeep} fill={isFav ? th.threadDeep : "none"} />
        </button>
        <span
          className="absolute bottom-2.5 left-2.5 rtl:left-auto rtl:right-2.5 text-[10px] font-medium px-2 py-1 rounded-full"
          style={{ background: "rgba(255,255,255,0.85)", color: "var(--threadDeep, #7A5C48)" }}
        >
          {statusLabel}
        </span>
      </div>
      <div className={`p-3 ${compact ? "pb-2.5" : "p-4"}`}>
        <p className="text-xs mb-0.5" style={{ color: "var(--textMuted)" }}>{catLabel}</p>
        <h3 className={`fm-display font-medium leading-snug ${compact ? "text-sm" : "text-[15px]"}`}>{title}</h3>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Library view
--------------------------------------------------------- */

function LibraryView({ lang, t, th, isRTL, filter, setFilter, categories, patterns }) {
  const list = filter === "all" ? patterns : patterns.filter((p) => p.cat === filter);

  return (
    <section className="px-4 sm:px-6 pt-8 sm:pt-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <BookOpen size={18} color={th.threadDeep} />
            <h2 className="fm-display text-xl sm:text-2xl font-medium tracking-tight">{t.libraryTitle}</h2>
          </div>
          <p className="text-sm" style={{ color: "var(--textMuted)" }}>{t.librarySub}</p>
        </div>

        <div className="flex gap-2 overflow-x-auto pb-1 mb-6">
          <FilterPill active={filter === "all"} onClick={() => setFilter("all")} label={t.viewAll} th={th} />
          {categories.map((c) => (
            <FilterPill key={c.id} active={filter === c.id} onClick={() => setFilter(c.id)} label={lang === "en" ? c.en : c.ar} th={th} />
          ))}
        </div>

        {list.length === 0 ? (
          <EmptyState text={t.emptyLibrary} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {list.map((p) => (
              <PatternCard key={p.id} p={p} lang={lang} t={t} th={th} isRTL={isRTL} />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FilterPill({ active, onClick, label, th }) {
  return (
    <button
      onClick={onClick}
      className="fm-btn fm-focusable shrink-0 px-3.5 py-1.5 rounded-full text-xs font-medium"
      style={{
        background: active ? "var(--threadDeep)" : "var(--surfaceMuted)",
        color: active ? "var(--surface)" : "var(--text)",
      }}
    >
      {label}
    </button>
  );
}

function LinkChip({ icon, label, th, href }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="fm-btn fm-focusable inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full"
      style={{ background: "var(--surfaceMuted)", color: "var(--text)" }}
    >
      {icon}
      {label}
      <ExternalLink size={11} style={{ opacity: 0.5 }} />
    </a>
  );
}

function PatternCard({ p, lang, t, th, isRTL }) {
  const tv = toneVars(th, p.tone);
  const title = lang === "en" ? p.titleEn : p.titleAr;
  const designer = lang === "en" ? p.designerEn : p.designerAr;
  const notes = lang === "en" ? p.notesEn : p.notesAr;

  return (
    <div
      className="fm-card rounded-2xl overflow-hidden"
      style={{ background: "var(--surface)", border: "1px solid var(--border)", boxShadow: "0 10px 24px -16px rgba(60,45,30,0.25)" }}
    >
      <div className="h-32 flex items-center justify-center overflow-hidden" style={p.coverImage ? undefined : { background: `linear-gradient(150deg, ${tv.bg}, ${tv.deep})` }}>
        {p.coverImage ? (
          <img src={p.coverImage} alt={title} className="w-full h-full object-cover" loading="lazy" />
        ) : (
          <HookIcon color="rgba(255,255,255,0.9)" size={32} />
        )}
      </div>
      <div className="p-4">
        <h3 className="fm-display font-medium text-[15px] leading-snug mb-0.5">{title}</h3>
        {designer && <p className="text-xs mb-2.5" style={{ color: "var(--textMuted)" }}>{t.designerLabel}: {designer}</p>}
        <p className="text-xs leading-relaxed mb-3" style={{ color: "var(--textMuted)" }}>{notes || t.noNotes}</p>
        <div className="flex flex-wrap gap-1.5" onClick={(e) => e.stopPropagation()}>
          {p.pdfUrl && <LinkChip icon={<FileText size={12} />} label={t.viewPdf} th={th} href={p.pdfUrl} />}
          {p.youtubeUrl && <LinkChip icon={<Youtube size={12} />} label={t.watchVideo} th={th} href={p.youtubeUrl} />}
          {p.etsyUrl && <LinkChip icon={<ShoppingBag size={12} />} label={t.shopEtsy} th={th} href={p.etsyUrl} />}
          {p.pinterestUrl && <LinkChip icon={<Sparkles size={12} />} label={t.seePinterest} th={th} href={p.pinterestUrl} />}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------
   Project detail view
--------------------------------------------------------- */

function ProjectDetailView({ project, lang, t, th, isRTL, isFav, onFav, onBack, categories, patterns }) {
  if (!project) return null;
  const tv = toneVars(th, project.tone);
  const title = lang === "en" ? project.titleEn : project.titleAr;
  const notes = lang === "en" ? project.notesEn : project.notesAr;
  const catObj = categories.find((c) => c.id === project.cat);
  const catLabel = catObj ? (lang === "en" ? catObj.en : catObj.ar) : "";
  const pattern = project.patternId ? patterns.find((p) => p.id === project.patternId) : null;
  const BackIcon = isRTL ? ArrowRight : ArrowLeft;
  const gallery = project.gallery && project.gallery.length > 0
    ? project.gallery
    : Array.from({ length: project.galleryCount || 1 }).map(() => null);

  return (
    <section className="px-4 sm:px-6 pt-8 sm:pt-12">
      <div className="mx-auto max-w-5xl">
        <button
          onClick={onBack}
          className="fm-btn fm-focusable inline-flex items-center gap-1.5 text-sm font-medium mb-6 px-3.5 py-1.5 rounded-full"
          style={{ background: "var(--surfaceMuted)" }}
        >
          <BackIcon size={14} />
          {t.back}
        </button>

        {/* cover */}
        <div
          className="relative rounded-3xl h-56 sm:h-80 flex items-center justify-center mb-4 overflow-hidden"
          style={project.coverImage ? undefined : { background: `linear-gradient(150deg, ${tv.bg}, ${tv.deep})` }}
        >
          {project.coverImage ? (
            <img src={project.coverImage} alt={title} className="w-full h-full object-cover" />
          ) : (
            <YarnBallIcon color="rgba(255,255,255,0.9)" size={56} />
          )}
          <button
            aria-label="Toggle favorite"
            onClick={onFav}
            className="fm-btn fm-focusable absolute top-4 right-4 rtl:right-auto rtl:left-4 w-10 h-10 rounded-full flex items-center justify-center"
            style={{ background: "rgba(255,255,255,0.9)" }}
          >
            <Heart size={18} color={th.threadDeep} fill={isFav ? th.threadDeep : "none"} />
          </button>
        </div>

        {/* gallery strip */}
        {gallery.length > 1 && (
          <div className="flex gap-3 mb-8 overflow-x-auto pb-1">
            {gallery.map((url, i) => (
              <div
                key={i}
                className="shrink-0 w-20 h-20 rounded-xl flex items-center justify-center overflow-hidden"
                style={url ? undefined : { background: `linear-gradient(150deg, ${tv.bg}, ${tv.deep})`, opacity: 0.75 }}
              >
                {url ? (
                  <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" />
                ) : (
                  <YarnBallIcon color="rgba(255,255,255,0.9)" size={20} />
                )}
              </div>
            ))}
          </div>
        )}

        <div className="grid md:grid-cols-3 gap-8">
          <div className="md:col-span-2">
            <h1 className="fm-display text-2xl sm:text-3xl font-medium tracking-tight mb-4">{title}</h1>

            <div className="flex flex-wrap gap-2 mb-6">
              <span className="text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: "var(--surfaceMuted)" }}>
                {t.categoryLabel}: {catLabel}
              </span>
              <span className="text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: "var(--surfaceMuted)", color: "var(--threadDeep)" }}>
                {t.statusLabel}: {t.statusLabels[project.status]}
              </span>
            </div>

            <h3 className="fm-display text-sm font-medium mb-1.5" style={{ color: "var(--textMuted)" }}>{t.notesLabel}</h3>
            <p className="text-sm leading-relaxed">{notes || t.noNotes}</p>
          </div>

          {/* pattern side card */}
          <div>
            <h3 className="fm-display text-sm font-medium mb-2" style={{ color: "var(--textMuted)" }}>{t.patternLabel}</h3>
            {pattern ? (
              <div className="rounded-2xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <p className="fm-display font-medium text-sm mb-1">{lang === "en" ? pattern.titleEn : pattern.titleAr}</p>
                {(lang === "en" ? pattern.designerEn : pattern.designerAr) && (
                  <p className="text-xs mb-3" style={{ color: "var(--textMuted)" }}>
                    {t.designerLabel}: {lang === "en" ? pattern.designerEn : pattern.designerAr}
                  </p>
                )}
                <div className="flex flex-wrap gap-1.5">
                  {pattern.pdfUrl && <LinkChip icon={<FileText size={12} />} label={t.viewPdf} th={th} href={pattern.pdfUrl} />}
                  {pattern.youtubeUrl && <LinkChip icon={<Youtube size={12} />} label={t.watchVideo} th={th} href={pattern.youtubeUrl} />}
                  {pattern.etsyUrl && <LinkChip icon={<ShoppingBag size={12} />} label={t.shopEtsy} th={th} href={pattern.etsyUrl} />}
                  {pattern.pinterestUrl && <LinkChip icon={<Sparkles size={12} />} label={t.seePinterest} th={th} href={pattern.pinterestUrl} />}
                </div>
              </div>
            ) : (
              <p className="text-xs" style={{ color: "var(--textMuted)" }}>{t.noNotes}</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------
   Favorites view
--------------------------------------------------------- */

function FavoritesView({ projects, lang, t, th, categories, onFav, onOpen }) {
  return (
    <section className="px-4 sm:px-6 pt-8 sm:pt-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Heart size={18} color={th.threadDeep} />
            <h2 className="fm-display text-xl sm:text-2xl font-medium tracking-tight">{t.favoritesTitle}</h2>
          </div>
          <p className="text-sm" style={{ color: "var(--textMuted)" }}>{t.favoritesSub}</p>
        </div>

        {projects.length === 0 ? (
          <EmptyState text={t.emptyFavorites} />
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
            {projects.map((p) => (
              <ProjectCard key={p.id} p={p} lang={lang} t={t} th={th} isFav onFav={() => onFav(p.id)} onOpen={() => onOpen(p.id)} categories={categories} tall />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------
   Inspiration view (placeholder for a future pass)
--------------------------------------------------------- */

function InspirationView({ t, th }) {
  return (
    <section className="px-4 sm:px-6 pt-8 sm:pt-12">
      <div className="mx-auto max-w-6xl">
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-1">
            <Sparkles size={18} color={th.threadDeep} />
            <h2 className="fm-display text-xl sm:text-2xl font-medium tracking-tight">{t.inspirationTitle}</h2>
          </div>
          <p className="text-sm" style={{ color: "var(--textMuted)" }}>{t.inspirationSub}</p>
        </div>
        <EmptyState text={t.inspirationComingSoon} />
      </div>
    </section>
  );
}

function AboutView({ t, th, aboutImage }) {
  return (
    <section className="px-4 sm:px-6 pt-8 sm:pt-12">
      <div className="mx-auto max-w-4xl">
        <div className="grid md:grid-cols-[220px_1fr] gap-6 sm:gap-10 items-start">
          <div
            className="w-full aspect-square rounded-3xl flex items-center justify-center overflow-hidden shrink-0"
            style={aboutImage ? undefined : { background: "linear-gradient(150deg, var(--sage), var(--lavender))" }}
          >
            {aboutImage ? (
              <img src={aboutImage} alt={t.aboutTitle} className="w-full h-full object-cover" />
            ) : (
              <YarnBallIcon color="rgba(255,255,255,0.9)" size={48} />
            )}
          </div>
          <div>
            <h1 className="fm-display text-2xl sm:text-3xl font-medium tracking-tight mb-4">{t.aboutTitle}</h1>
            <div
              className="fm-prose text-sm sm:text-[15px] leading-relaxed"
              style={{ color: "var(--textMuted)" }}
              dangerouslySetInnerHTML={{ __html: t.aboutBody }}
            />
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------
   Admin Dashboard
--------------------------------------------------------- */

function AdminView(props) {
  const {
    lang, t, th, isRTL, adminUnlocked, adminEmail, onSignIn, onSignOut,
    categories, projects, patterns,
    saveProject, deleteProject, savePattern, deletePattern,
    saveCategory, deleteCategory, reorderCategory,
    site, saveSite, onExit,
    yarnItems, saveYarn, deleteYarn, duplicateYarn, toggleYarnArchived,
    materials, saveMaterial, deleteMaterial, duplicateMaterial, toggleMaterialArchived,
    projectYarnLinks,
  } = props;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [gateError, setGateError] = useState("");
  const [tab, setTab] = useState("overview");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const [editingProject, setEditingProject] = useState(undefined); // undefined = closed, null = new, object = editing
  const [editingPattern, setEditingPattern] = useState(undefined);
  const [editingCategory, setEditingCategory] = useState(undefined);
  const [editingYarn, setEditingYarn] = useState(undefined);
  const [editingMaterial, setEditingMaterial] = useState(undefined);
  const [confirmTarget, setConfirmTarget] = useState(null); // { type, id, label }

  const notify = (type, message) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  if (!adminUnlocked) {
    return (
      <section className="px-4 sm:px-6 pt-10 sm:pt-16">
        <div className="mx-auto max-w-sm">
          <div className="rounded-3xl p-6 sm:p-7" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="w-11 h-11 rounded-2xl flex items-center justify-center mb-4" style={{ background: "var(--surfaceMuted)" }}>
              <Lock size={18} color={th.threadDeep} />
            </div>
            <h2 className="fm-display text-xl font-medium mb-1.5">{t.adminGateTitle}</h2>
            <p className="text-sm mb-5" style={{ color: "var(--textMuted)" }}>{t.adminGateSub}</p>
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setSigningIn(true);
                setGateError("");
                try {
                  await onSignIn(email, password);
                } catch (err) {
                  setGateError(err.message || t.adminGateWrong);
                } finally {
                  setSigningIn(false);
                }
              }}
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={t.adminEmailPlaceholder}
                autoComplete="username"
                className="fm-focusable w-full px-4 py-3 rounded-xl text-sm outline-none mb-3"
                style={{ background: "var(--surfaceMuted)", color: "var(--text)" }}
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t.adminGatePlaceholder}
                autoComplete="current-password"
                className="fm-focusable w-full px-4 py-3 rounded-xl text-sm outline-none mb-3"
                style={{ background: "var(--surfaceMuted)", color: "var(--text)" }}
              />
              {gateError && <p className="text-xs mb-3" style={{ color: "#B5544A" }}>{gateError}</p>}
              <button
                type="submit"
                disabled={signingIn}
                className="fm-btn fm-focusable w-full py-3 rounded-xl text-sm font-medium disabled:opacity-60"
                style={{ background: "var(--threadDeep)", color: "var(--surface)" }}
              >
                {signingIn ? "…" : t.adminGateBtn}
              </button>
            </form>
            <p className="text-[11px] mt-4 leading-relaxed" style={{ color: "var(--textMuted)" }}>{t.adminGateNote}</p>
            <button onClick={onExit} className="fm-btn fm-focusable text-xs mt-4 underline decoration-dotted underline-offset-4" style={{ color: "var(--textMuted)" }}>
              {t.back}
            </button>
          </div>
        </div>
      </section>
    );
  }

  const NAV_SECTIONS = [
    { group: t.navGroupOverview, items: [["overview", t.tabOverview, LayoutDashboard]] },
    { group: t.navGroupCatalog, items: [
      ["projects", t.tabProjects, BookOpen],
      ["patterns", t.tabPatterns, FileText],
      ["yarn", t.tabYarn, Package],
      ["materials", t.tabMaterials, Boxes],
      ["categories", t.tabCategories, LayoutGrid],
      ["orders", t.tabOrders, ShoppingCart],
    ]},
    { group: t.navGroupSite, items: [
      ["content", t.tabContent, Pencil],
      ["customize", t.tabCustomize, Palette],
      ["analytics", t.tabAnalytics, BarChart3],
    ]},
    { group: t.navGroupSystem, items: [["settings", t.tabSettings, SettingsIcon]] },
  ];
  const currentLabel = NAV_SECTIONS.flatMap((g) => g.items).find(([key]) => key === tab)?.[1] || t.adminTitle;

  const SidebarNav = ({ onNavigate }) => (
    <nav className="flex flex-col gap-5">
      {NAV_SECTIONS.map((g) => (
        <div key={g.group}>
          <p className="text-[10px] font-semibold uppercase tracking-wide px-3 mb-1.5" style={{ color: "var(--textMuted)" }}>{g.group}</p>
          <div className="flex flex-col gap-0.5">
            {g.items.map(([key, label, Icon]) => (
              <button
                key={key}
                onClick={() => { setTab(key); onNavigate?.(); }}
                className="fm-btn fm-focusable flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm text-left rtl:text-right"
                style={{
                  background: tab === key ? "var(--threadDeep)" : "transparent",
                  color: tab === key ? "var(--surface)" : "var(--text)",
                  fontWeight: tab === key ? 600 : 500,
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </div>
        </div>
      ))}
    </nav>
  );

  return (
    <section className="px-4 sm:px-6 pt-6 sm:pt-10 pb-4">
      <div className="mx-auto max-w-6xl md:flex md:items-start md:gap-8">
        {/* desktop sidebar */}
        <aside className="hidden md:block w-56 shrink-0 sticky top-24 rounded-2xl p-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <SidebarNav />
          <div className="mt-5 pt-4" style={{ borderTop: "1px solid var(--border)" }}>
            <button
              onClick={() => { onSignOut(); onExit(); }}
              className="fm-btn fm-focusable w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm"
              style={{ color: "var(--textMuted)" }}
            >
              <LogOut size={15} />
              {t.adminLogout}
            </button>
          </div>
        </aside>

        <div className="flex-1 min-w-0">
          {/* top bar: mobile hamburger + title + sign out */}
          <div className="flex items-center justify-between mb-6 gap-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setSidebarOpen(true)}
                className="fm-btn fm-focusable w-9 h-9 rounded-full flex items-center justify-center md:hidden"
                style={{ background: "var(--surfaceMuted)" }}
                aria-label="Menu"
              >
                <Menu size={16} />
              </button>
              <h2 className="fm-display text-xl sm:text-2xl font-medium tracking-tight">{currentLabel}</h2>
            </div>
            <button
              onClick={() => { onSignOut(); onExit(); }}
              className="fm-btn fm-focusable md:hidden inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-1.5 rounded-full"
              style={{ background: "var(--surfaceMuted)" }}
            >
              <LogOut size={13} />
            </button>
          </div>

          {tab === "overview" && (
            <OverviewTab t={t} th={th} lang={lang} categories={categories} projects={projects} patterns={patterns} yarnItems={yarnItems} />
          )}

          {tab === "projects" && (
            <ProjectsTab
              t={t} th={th} lang={lang} categories={categories} projects={projects}
              onAdd={() => setEditingProject(null)}
              onEdit={(p) => setEditingProject(p)}
              onDelete={(p) => setConfirmTarget({ type: "project", id: p.id, label: lang === "en" ? p.titleEn : p.titleAr })}
            />
          )}

          {tab === "patterns" && (
            <PatternsTab
              t={t} th={th} lang={lang} categories={categories} patterns={patterns}
              onAdd={() => setEditingPattern(null)}
              onEdit={(p) => setEditingPattern(p)}
              onDelete={(p) => setConfirmTarget({ type: "pattern", id: p.id, label: lang === "en" ? p.titleEn : p.titleAr })}
            />
          )}

          {tab === "categories" && (
            <CategoriesTab
              t={t} th={th} lang={lang} categories={categories}
              onAdd={() => setEditingCategory(null)}
              onEdit={(c) => setEditingCategory(c)}
              onDelete={(c) => setConfirmTarget({ type: "category", id: c.id, label: lang === "en" ? c.en : c.ar })}
              onReorder={reorderCategory}
            />
          )}

          {tab === "content" && (
            <ContentTab t={t} th={th} site={site} saveSite={saveSite} notify={notify} />
          )}

          {tab === "customize" && (
            <CustomizeTab t={t} th={th} />
          )}

          {tab === "settings" && (
            <SettingsTab t={t} th={th} adminEmail={adminEmail} notify={notify} />
          )}

          {tab === "yarn" && (
            <YarnTab
              t={t} th={th} yarnItems={yarnItems}
              onAdd={() => setEditingYarn(null)}
              onEdit={(y) => setEditingYarn(y)}
              onDelete={(y) => setConfirmTarget({ type: "yarn", id: y.id, label: `${y.brand} ${y.colorName}` })}
              onDuplicate={async (y) => { try { await duplicateYarn(y); notify("success", t.toastProjectSaved); } catch (e) { notify("error", e.message || t.toastError); } }}
              onToggleArchive={async (y) => { try { await toggleYarnArchived(y); } catch (e) { notify("error", e.message || t.toastError); } }}
            />
          )}

          {tab === "materials" && (
            <MaterialsTab
              t={t} th={th} materials={materials}
              onAdd={() => setEditingMaterial(null)}
              onEdit={(m) => setEditingMaterial(m)}
              onDelete={(m) => setConfirmTarget({ type: "material", id: m.id, label: m.name })}
              onDuplicate={async (m) => { try { await duplicateMaterial(m); notify("success", t.toastProjectSaved); } catch (e) { notify("error", e.message || t.toastError); } }}
              onToggleArchive={async (m) => { try { await toggleMaterialArchived(m); } catch (e) { notify("error", e.message || t.toastError); } }}
            />
          )}

          {(tab === "orders" || tab === "analytics") && (
            <PlaceholderTab t={t} th={th} />
          )}
        </div>
      </div>

      {/* mobile sidebar drawer */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-50 md:hidden" onClick={() => setSidebarOpen(false)}>
          <div className="absolute inset-0" style={{ background: "rgba(30,24,20,0.45)" }} />
          <div
            onClick={(e) => e.stopPropagation()}
            className="absolute top-0 bottom-0 left-0 rtl:left-auto rtl:right-0 w-72 max-w-[80vw] p-4 overflow-y-auto"
            style={{ background: "var(--surface)" }}
          >
            <div className="flex items-center justify-between mb-4">
              <span className="fm-display text-base font-medium">{t.adminTitle}</span>
              <button onClick={() => setSidebarOpen(false)} className="fm-btn fm-focusable w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }}>
                <XIcon size={15} />
              </button>
            </div>
            <SidebarNav onNavigate={() => setSidebarOpen(false)} />
          </div>
        </div>
      )}

      {editingProject !== undefined && (
        <ProjectFormModal
          t={t} th={th} categories={categories} initial={editingProject}
          yarnItems={yarnItems}
          initialYarnUsed={editingProject ? projectYarnLinks.filter((l) => l.projectId === editingProject.id).map((l) => ({ yarnId: l.yarnId, quantityUsed: l.quantityUsed })) : []}
          onClose={() => setEditingProject(undefined)}
          onSave={async (proj) => {
            try { await saveProject(proj); setEditingProject(undefined); notify("success", t.toastProjectSaved); }
            catch (e) { notify("error", e.message || t.toastError); }
          }}
        />
      )}
      {editingPattern !== undefined && (
        <PatternFormModal
          t={t} th={th} categories={categories} initial={editingPattern}
          onClose={() => setEditingPattern(undefined)}
          onSave={async (pat) => {
            try { await savePattern(pat); setEditingPattern(undefined); notify("success", t.toastPatternSaved); }
            catch (e) { notify("error", e.message || t.toastError); }
          }}
        />
      )}
      {editingCategory !== undefined && (
        <CategoryFormModal
          t={t} th={th} initial={editingCategory}
          onClose={() => setEditingCategory(undefined)}
          onSave={async (cat) => {
            try { await saveCategory(cat); setEditingCategory(undefined); notify("success", t.toastCategorySaved); }
            catch (e) { notify("error", e.message || t.toastError); }
          }}
        />
      )}
      {editingYarn !== undefined && (
        <YarnFormModal
          t={t} th={th} initial={editingYarn}
          onClose={() => setEditingYarn(undefined)}
          onSave={async (yarn) => {
            try { await saveYarn(yarn); setEditingYarn(undefined); notify("success", t.toastProjectSaved); }
            catch (e) { notify("error", e.message || t.toastError); }
          }}
        />
      )}
      {editingMaterial !== undefined && (
        <MaterialFormModal
          t={t} th={th} initial={editingMaterial}
          onClose={() => setEditingMaterial(undefined)}
          onSave={async (mat) => {
            try { await saveMaterial(mat); setEditingMaterial(undefined); notify("success", t.toastProjectSaved); }
            catch (e) { notify("error", e.message || t.toastError); }
          }}
        />
      )}
      {confirmTarget && (
        <ConfirmDialog
          t={t} label={confirmTarget.label}
          onCancel={() => setConfirmTarget(null)}
          onConfirm={async () => {
            try {
              if (confirmTarget.type === "project") await deleteProject(confirmTarget.id);
              if (confirmTarget.type === "pattern") await deletePattern(confirmTarget.id);
              if (confirmTarget.type === "category") await deleteCategory(confirmTarget.id);
              if (confirmTarget.type === "yarn") await deleteYarn(confirmTarget.id);
              if (confirmTarget.type === "material") await deleteMaterial(confirmTarget.id);
              notify("success", t.toastDeleted);
            } catch (e) {
              notify("error", e.message || t.toastError);
            }
            setConfirmTarget(null);
          }}
        />
      )}
      <Toast toast={toast} />
    </section>
  );
}

function OverviewTab({ t, th, lang, categories, projects, patterns, yarnItems }) {
  const recent = [...projects].slice(-5).reverse();
  const publicCount = projects.filter((p) => p.visibility !== "private").length;
  const privateCount = projects.length - publicCount;
  const lowStock = (yarnItems || []).filter((y) => !y.archived && y.quantity <= y.lowStockThreshold);
  const stats = [
    { label: t.statTotalProjects, value: projects.length, tone: "sage" },
    { label: t.statTotalPatterns, value: patterns.length, tone: "lavender" },
    { label: t.statTotalCategories, value: categories.length, tone: "butter" },
    { label: t.statPublicProjects, value: publicCount, tone: "sage" },
    { label: t.statPrivateProjects, value: privateCount, tone: "lavender" },
    { label: t.statTotalYarn, value: (yarnItems || []).length, tone: "butter" },
  ];
  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-6">
        {stats.map((s) => {
          const tv = toneVars(th, s.tone);
          return (
            <div key={s.label} className="rounded-2xl p-4 sm:p-5" style={{ background: `linear-gradient(150deg, ${tv.bg}, ${tv.deep})` }}>
              <p className="fm-display text-2xl sm:text-3xl font-medium text-white">{s.value}</p>
              <p className="text-[11px] sm:text-xs text-white/85 mt-1">{s.label}</p>
            </div>
          );
        })}
      </div>

      {lowStock.length > 0 && (
        <div className="rounded-2xl p-4 mb-6" style={{ background: "#F7E4E1" }}>
          <p className="text-xs font-semibold mb-2" style={{ color: "#7A342B" }}>{t.statLowStock}</p>
          <div className="flex flex-wrap gap-1.5">
            {lowStock.map((y) => (
              <span key={y.id} className="text-[11px] px-2.5 py-1 rounded-full" style={{ background: "#fff", color: "#7A342B" }}>
                {y.brand} {y.colorName} ({y.quantity} {y.unit})
              </span>
            ))}
          </div>
        </div>
      )}

      <h3 className="fm-display text-sm font-medium mb-3" style={{ color: "var(--textMuted)" }}>{t.statRecent}</h3>
      <div className="space-y-2">
        {recent.map((p) => (
          <div key={p.id} className="flex items-center justify-between rounded-xl px-4 py-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <span className="text-sm font-medium">{lang === "en" ? p.titleEn : p.titleAr}</span>
            <span className="text-xs px-2.5 py-1 rounded-full" style={{ background: "var(--surfaceMuted)", color: "var(--threadDeep)" }}>
              {t.statusLabels[p.status]}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function AdminRow({ title, sub, badges, onEdit, onDelete }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl px-4 py-3 flex-wrap" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{title}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: "var(--textMuted)" }}>{sub}</p>}
        {badges && badges.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-1.5">
            {badges.map((b, i) => (
              <span key={i} className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: "var(--surfaceMuted)" }}>{b}</span>
            ))}
          </div>
        )}
      </div>
      <div className="flex items-center gap-1.5 shrink-0">
        <button onClick={onEdit} className="fm-btn fm-focusable w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }} aria-label="Edit">
          <Pencil size={13} />
        </button>
        <button onClick={onDelete} className="fm-btn fm-focusable w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }} aria-label="Delete">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function ProjectsTab({ t, th, lang, categories, projects, onAdd, onEdit, onDelete }) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={onAdd} className="fm-btn fm-focusable inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>
          <Plus size={13} /> {t.addProject}
        </button>
      </div>
      {projects.length === 0 ? <EmptyState text={t.noneYet} /> : (
        <div className="space-y-2">
          {projects.map((p) => {
            const cat = categories.find((c) => c.id === p.cat);
            return (
              <AdminRow
                key={p.id}
                title={lang === "en" ? p.titleEn : p.titleAr}
                sub={cat ? (lang === "en" ? cat.en : cat.ar) : ""}
                badges={[t.statusLabels[p.status], p.visibility === "private" ? t.private : t.public, p.featured ? "★" : null].filter(Boolean)}
                onEdit={() => onEdit(p)}
                onDelete={() => onDelete(p)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function PatternsTab({ t, th, lang, categories, patterns, onAdd, onEdit, onDelete }) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={onAdd} className="fm-btn fm-focusable inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>
          <Plus size={13} /> {t.addPattern}
        </button>
      </div>
      {patterns.length === 0 ? <EmptyState text={t.noneYet} /> : (
        <div className="space-y-2">
          {patterns.map((p) => {
            const cat = categories.find((c) => c.id === p.cat);
            const badges = [p.pdfUrl && "PDF", p.youtubeUrl && "YouTube", p.etsyUrl && "Etsy", p.pinterestUrl && "Pinterest"].filter(Boolean);
            return (
              <AdminRow
                key={p.id}
                title={lang === "en" ? p.titleEn : p.titleAr}
                sub={cat ? (lang === "en" ? cat.en : cat.ar) : ""}
                badges={badges}
                onEdit={() => onEdit(p)}
                onDelete={() => onDelete(p)}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}

function CategoriesTab({ t, th, lang, categories, onAdd, onEdit, onDelete, onReorder }) {
  return (
    <div>
      <div className="flex justify-end mb-4">
        <button onClick={onAdd} className="fm-btn fm-focusable inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>
          <Plus size={13} /> {t.addCategory}
        </button>
      </div>
      <div className="space-y-2">
        {categories.map((c, i) => (
          <div key={c.id} className="flex items-center justify-between gap-3 rounded-xl px-4 py-3" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
            <div className="flex items-center gap-3 min-w-0">
              <div className="flex flex-col">
                <button disabled={i === 0} onClick={() => onReorder(c.id, -1)} className="fm-btn fm-focusable disabled:opacity-25" aria-label="Move up"><ChevronUp size={14} /></button>
                <button disabled={i === categories.length - 1} onClick={() => onReorder(c.id, 1)} className="fm-btn fm-focusable disabled:opacity-25" aria-label="Move down"><ChevronDown size={14} /></button>
              </div>
              <span className="text-sm font-medium truncate">{lang === "en" ? c.en : c.ar}</span>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button onClick={() => onEdit(c)} className="fm-btn fm-focusable w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }} aria-label="Edit"><Pencil size={13} /></button>
              <button onClick={() => onDelete(c)} className="fm-btn fm-focusable w-8 h-8 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }} aria-label="Delete"><Trash2 size={13} /></button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ContentTab({ t, th, site, saveSite, notify }) {
  const blank = { brand: "", heroEyebrow: "", heroTitle: "", heroSub: "", heroCta: "", heroCtaSecondary: "", aboutTitle: "", aboutBody: "", seoTitle: "", seoDesc: "", location: "", footerNote: "", copyright: "" };
  const [draft, setDraft] = useState({
    en: { ...blank, ...(site.en || {}) },
    ar: { ...blank, ...(site.ar || {}) },
    aboutImage: site.aboutImage || "",
    heroImage: site.heroImage || "",
    logoImage: site.logoImage || "",
    faviconImage: site.faviconImage || "",
    contactEmail: site.contactEmail || "",
    contactPhone: site.contactPhone || "",
    social: { instagram: "", pinterest: "", etsy: "", youtube: "", facebook: "", ...(site.social || {}) },
  });
  const [saving, setSaving] = useState(false);

  const update = (lng, field, value) => setDraft((prev) => ({ ...prev, [lng]: { ...prev[lng], [field]: value } }));
  const updateTop = (field, value) => setDraft((prev) => ({ ...prev, [field]: value }));
  const updateSocial = (field, value) => setDraft((prev) => ({ ...prev, social: { ...prev.social, [field]: value } }));

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveSite(draft);
      notify("success", t.customizeSaved);
    } catch (e) {
      notify("error", e.message || t.toastError);
    } finally {
      setSaving(false);
    }
  };

  const Field = ({ label, lng, field, textarea }) => {
    const Comp = textarea ? "textarea" : "input";
    return (
      <label className="block mb-3">
        <span className="text-xs font-medium block mb-1" style={{ color: "var(--textMuted)" }}>{label}</span>
        <Comp
          value={draft[lng][field]}
          onChange={(e) => update(lng, field, e.target.value)}
          placeholder={COPY[lng][field] || ""}
          rows={textarea ? 3 : undefined}
          className="fm-focusable w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
          style={{ background: "var(--surfaceMuted)", color: "var(--text)" }}
        />
      </label>
    );
  };

  const SectionCard = ({ title, children }) => (
    <div className="rounded-2xl p-4 sm:p-5 mb-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      <h3 className="fm-display text-sm font-medium mb-3.5" style={{ color: "var(--textMuted)" }}>{title}</h3>
      {children}
    </div>
  );

  return (
    <div className="max-w-2xl">
      <SectionCard title={t.contentBrandTitle}>
        <div className="grid sm:grid-cols-2 gap-6 mb-4">
          <div><Field label={`${t.brandFieldLabel} (EN)`} lng="en" field="brand" /></div>
          <div dir="rtl"><Field label={`${t.brandFieldLabel} (AR)`} lng="ar" field="brand" /></div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <FileUploadField label={t.contentLogoLabel} value={draft.logoImage} onChange={(v) => updateTop("logoImage", v)} />
          <FileUploadField label={t.contentFaviconLabel} value={draft.faviconImage} onChange={(v) => updateTop("faviconImage", v)} />
        </div>
      </SectionCard>

      <SectionCard title={t.contentSeoTitle}>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <Field label={`${t.contentSeoTitleLabel} (EN)`} lng="en" field="seoTitle" />
            <Field label={`${t.contentSeoDescLabel} (EN)`} lng="en" field="seoDesc" textarea />
          </div>
          <div dir="rtl">
            <Field label={`${t.contentSeoTitleLabel} (AR)`} lng="ar" field="seoTitle" />
            <Field label={`${t.contentSeoDescLabel} (AR)`} lng="ar" field="seoDesc" textarea />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t.customizeHero}>
        <div className="grid sm:grid-cols-2 gap-6 mb-4">
          <div>
            <span className="text-xs font-medium block mb-2" style={{ color: "var(--textMuted)" }}>EN</span>
            <Field label={t.heroEyebrowLabel} lng="en" field="heroEyebrow" />
            <Field label={t.heroTitleLabel} lng="en" field="heroTitle" textarea />
            <RichTextEditor t={t} label={t.heroSubLabel} value={draft.en.heroSub} onChange={(v) => update("en", "heroSub", v)} />
            <Field label={t.heroCtaLabel} lng="en" field="heroCta" />
            <Field label={t.heroCtaSecondaryLabel} lng="en" field="heroCtaSecondary" />
          </div>
          <div dir="rtl">
            <span className="text-xs font-medium block mb-2" style={{ color: "var(--textMuted)" }}>AR</span>
            <Field label={t.heroEyebrowLabel} lng="ar" field="heroEyebrow" />
            <Field label={t.heroTitleLabel} lng="ar" field="heroTitle" textarea />
            <RichTextEditor t={t} label={t.heroSubLabel} value={draft.ar.heroSub} onChange={(v) => update("ar", "heroSub", v)} />
            <Field label={t.heroCtaLabel} lng="ar" field="heroCta" />
            <Field label={t.heroCtaSecondaryLabel} lng="ar" field="heroCtaSecondary" />
          </div>
        </div>
        <FileUploadField label={t.heroImageLabel} value={draft.heroImage} onChange={(v) => updateTop("heroImage", v)} />
      </SectionCard>

      <SectionCard title={t.nav.about}>
        <FileUploadField label={t.aboutImageLabel} value={draft.aboutImage} onChange={(v) => updateTop("aboutImage", v)} />
        <div className="grid sm:grid-cols-2 gap-6 mt-2">
          <div>
            <span className="text-xs font-medium block mb-2" style={{ color: "var(--textMuted)" }}>EN</span>
            <Field label={t.aboutTitleLabel} lng="en" field="aboutTitle" />
            <RichTextEditor t={t} label={t.aboutBodyLabel} value={draft.en.aboutBody} onChange={(v) => update("en", "aboutBody", v)} />
          </div>
          <div dir="rtl">
            <span className="text-xs font-medium block mb-2" style={{ color: "var(--textMuted)" }}>AR</span>
            <Field label={t.aboutTitleLabel} lng="ar" field="aboutTitle" />
            <RichTextEditor t={t} label={t.aboutBodyLabel} value={draft.ar.aboutBody} onChange={(v) => update("ar", "aboutBody", v)} />
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t.contentContactTitle}>
        <div className="grid sm:grid-cols-2 gap-4 mb-4">
          <label className="block">
            <span className="text-xs font-medium block mb-1" style={{ color: "var(--textMuted)" }}>{t.contentEmailLabel}</span>
            <input type="email" value={draft.contactEmail} onChange={(e) => updateTop("contactEmail", e.target.value)} className="fm-focusable w-full px-3.5 py-2.5 rounded-xl text-sm outline-none" style={{ background: "var(--surfaceMuted)", color: "var(--text)" }} />
          </label>
          <label className="block">
            <span className="text-xs font-medium block mb-1" style={{ color: "var(--textMuted)" }}>{t.contentPhoneLabel}</span>
            <input type="tel" value={draft.contactPhone} onChange={(e) => updateTop("contactPhone", e.target.value)} className="fm-focusable w-full px-3.5 py-2.5 rounded-xl text-sm outline-none" style={{ background: "var(--surfaceMuted)", color: "var(--text)" }} />
          </label>
        </div>
        <div className="grid sm:grid-cols-2 gap-6">
          <div><Field label={`${t.contentLocationLabel} (EN)`} lng="en" field="location" /></div>
          <div dir="rtl"><Field label={`${t.contentLocationLabel} (AR)`} lng="ar" field="location" /></div>
        </div>
      </SectionCard>

      <SectionCard title={t.contentSocialTitle}>
        <div className="grid sm:grid-cols-2 gap-4">
          {["instagram", "pinterest", "etsy", "youtube", "facebook"].map((platform) => (
            <label className="block" key={platform}>
              <span className="text-xs font-medium block mb-1 capitalize" style={{ color: "var(--textMuted)" }}>{platform}</span>
              <input value={draft.social[platform]} onChange={(e) => updateSocial(platform, e.target.value)} className="fm-focusable w-full px-3.5 py-2.5 rounded-xl text-sm outline-none" style={{ background: "var(--surfaceMuted)", color: "var(--text)" }} />
            </label>
          ))}
        </div>
      </SectionCard>

      <SectionCard title={t.contentFooterTitle}>
        <div className="grid sm:grid-cols-2 gap-6">
          <div>
            <Field label={`${t.contentFooterLabel} (EN)`} lng="en" field="footerNote" />
            <Field label={`${t.contentCopyrightLabel} (EN)`} lng="en" field="copyright" />
          </div>
          <div dir="rtl">
            <Field label={`${t.contentFooterLabel} (AR)`} lng="ar" field="footerNote" />
            <Field label={`${t.contentCopyrightLabel} (AR)`} lng="ar" field="copyright" />
          </div>
        </div>
      </SectionCard>

      <button onClick={handleSave} disabled={saving} className="fm-btn fm-focusable px-5 py-2.5 rounded-full text-sm font-medium disabled:opacity-60" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>
        {saving ? "…" : t.save}
      </button>
    </div>
  );
}

function CustomizeTab({ t, th }) {
  return (
    <div className="max-w-xl">
      <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <Palette size={20} color={th.threadDeep} className="mb-3" />
        <h3 className="fm-display text-base font-medium mb-1.5">{t.comingSoonTitle}</h3>
        <p className="text-sm" style={{ color: "var(--textMuted)" }}>{t.comingSoonBody}</p>
      </div>
    </div>
  );
}

function SettingsTab({ t, th, adminEmail, notify }) {
  const [newPassword, setNewPassword] = useState("");
  const [updating, setUpdating] = useState(false);

  const handleUpdatePassword = async () => {
    if (!newPassword) return;
    setUpdating(true);
    try {
      await sbUpdatePassword(newPassword);
      setNewPassword("");
      notify("success", t.settingsPasswordUpdated);
    } catch (e) {
      notify("error", e.message || t.toastError);
    } finally {
      setUpdating(false);
    }
  };

  return (
    <div className="max-w-md space-y-5">
      <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="fm-display text-sm font-medium mb-3" style={{ color: "var(--textMuted)" }}>{t.settingsAccountTitle}</h3>
        {adminEmail && (
          <p className="text-sm mb-4">{t.settingsSignedInAs}: <strong>{adminEmail}</strong></p>
        )}
        <label className="block mb-3">
          <span className="text-xs font-medium block mb-1" style={{ color: "var(--textMuted)" }}>{t.settingsNewPassword}</span>
          <input
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            className="fm-focusable w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
            style={{ background: "var(--surfaceMuted)", color: "var(--text)" }}
          />
        </label>
        <button
          onClick={handleUpdatePassword}
          disabled={updating || !newPassword}
          className="fm-btn fm-focusable px-4 py-2.5 rounded-full text-sm font-medium disabled:opacity-50"
          style={{ background: "var(--threadDeep)", color: "var(--surface)" }}
        >
          {updating ? "…" : t.settingsUpdatePassword}
        </button>
      </div>

      <div className="rounded-2xl p-5" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <h3 className="fm-display text-sm font-medium mb-2" style={{ color: "var(--textMuted)" }}>{t.settingsProjectTitle}</h3>
        <p className="text-xs break-all" style={{ color: "var(--textMuted)" }}>{SUPABASE_URL}</p>
      </div>
    </div>
  );
}

function PlaceholderTab({ t, th }) {
  return (
    <div className="rounded-2xl p-6 sm:p-8 text-center" style={{ background: "var(--surfaceMuted)", border: "1px dashed var(--border)" }}>
      <Package size={24} color={th.threadDeep} className="mx-auto mb-3" />
      <h3 className="fm-display text-base font-medium mb-1.5">{t.comingSoonTitle}</h3>
      <p className="text-sm max-w-sm mx-auto" style={{ color: "var(--textMuted)" }}>{t.comingSoonBody}</p>
    </div>
  );
}

/* ---------------------------------------------------------
   Yarn Inventory
--------------------------------------------------------- */

const YARN_WEIGHTS = ["Lace", "Fingering", "Sport", "DK", "Worsted", "Aran", "Bulky", "Super Bulky", "Jumbo"];
const YARN_UNITS = ["skeins", "balls", "grams"];

function YarnTab({ t, th, yarnItems, onAdd, onEdit, onDelete, onDuplicate, onToggleArchive }) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("newest");
  const [showArchived, setShowArchived] = useState(false);

  const list = useMemo(() => {
    let arr = yarnItems.filter((y) => (showArchived ? y.archived : !y.archived));
    const q = search.trim().toLowerCase();
    if (q) {
      arr = arr.filter((y) => [y.brand, y.collection, y.colorName, y.fiberType].join(" ").toLowerCase().includes(q));
    }
    if (sort === "brand") arr = [...arr].sort((a, b) => (a.brand || "").localeCompare(b.brand || ""));
    if (sort === "lowstock") arr = [...arr].sort((a, b) => (a.quantity - a.lowStockThreshold) - (b.quantity - b.lowStockThreshold));
    return arr;
  }, [yarnItems, search, sort, showArchived]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex-1 min-w-[160px] flex items-center gap-2 px-3.5 py-2 rounded-full" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Search size={14} style={{ color: "var(--textMuted)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.yarnSearchPlaceholder} className="fm-focusable bg-transparent outline-none text-sm w-full" />
        </div>
        <select value={sort} onChange={(e) => setSort(e.target.value)} className="fm-focusable px-3 py-2 rounded-full text-xs" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <option value="newest">{t.yarnSortNewest}</option>
          <option value="brand">{t.yarnSortBrand}</option>
          <option value="lowstock">{t.yarnSortLowStock}</option>
        </select>
        <FilterPill active={showArchived} onClick={() => setShowArchived((v) => !v)} label={t.yarnArchived} th={th} />
        <button onClick={onAdd} className="fm-btn fm-focusable inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>
          <Plus size={13} /> {t.yarnAdd}
        </button>
      </div>

      {list.length === 0 ? <EmptyState text={t.yarnEmpty} /> : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {list.map((y) => {
            const isLow = y.quantity <= y.lowStockThreshold;
            return (
              <div key={y.id} className="rounded-2xl overflow-hidden" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
                <div className="h-24 flex items-center justify-center overflow-hidden" style={y.photo ? undefined : { background: "linear-gradient(150deg, var(--sage), var(--lavender))" }}>
                  {y.photo ? <img src={y.photo} alt="" className="w-full h-full object-cover" /> : <Package size={22} color="rgba(255,255,255,0.9)" />}
                </div>
                <div className="p-3.5">
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <p className="text-sm font-medium leading-snug">{y.brand} {y.colorName}</p>
                    {y.visibility === "private" && <Lock size={11} style={{ color: "var(--textMuted)" }} />}
                  </div>
                  <p className="text-xs mb-2" style={{ color: "var(--textMuted)" }}>{[y.weight, y.fiberType].filter(Boolean).join(" · ")}</p>
                  <div className="flex items-center gap-1.5 mb-3">
                    <span className="text-xs px-2 py-0.5 rounded-full" style={{ background: isLow ? "#F7E4E1" : "var(--surfaceMuted)", color: isLow ? "#7A342B" : "var(--text)" }}>
                      {y.quantity} {y.unit}
                    </span>
                    {isLow && <span className="text-[10px] font-medium" style={{ color: "#B5544A" }}>{t.yarnLowStockBadge}</span>}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => onEdit(y)} className="fm-btn fm-focusable w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }} aria-label={t.edit}><Pencil size={12} /></button>
                    <button onClick={() => onDuplicate(y)} className="fm-btn fm-focusable w-7 h-7 rounded-full flex items-center justify-center" style={{ background: "var(--surfaceMuted)" }} aria-label={t.yarnDuplicate}><Plus size={12} /></button>
                    <button onClick={() => onToggleArchive(y)} className="fm-btn fm-focusable px-2 h-7 rounded-full flex items-center justify-center text-[10px]" style={{ background: "var(--surfaceMuted)" }}>
                      {y.archived ? t.yarnUnarchive : t.yarnArchive}
                    </button>
                    <button onClick={() => onDelete(y)} className="fm-btn fm-focusable w-7 h-7 rounded-full flex items-center justify-center ml-auto rtl:ml-0 rtl:mr-auto" style={{ background: "var(--surfaceMuted)" }} aria-label={t.delete}><Trash2 size={12} /></button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function YarnFormModal({ t, th, initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || {
    id: null, photo: "", brand: "", collection: "", colorName: "", colorNumber: "",
    weight: YARN_WEIGHTS[3], fiberType: "", hookSize: "", dyeLot: "",
    quantity: 1, unit: "skeins", lowStockThreshold: 0,
    store: "", purchasePrice: "", purchaseDate: "", notes: "", visibility: "public", archived: false,
  });
  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }));

  return (
    <ModalShell onClose={onClose}>
      <h3 className="fm-display text-lg font-medium mb-4">{initial ? t.edit : t.yarnAdd}</h3>
      <FileUploadField label={t.fieldPhoto} value={form.photo} onChange={set("photo")} />
      <div className="grid grid-cols-2 gap-3">
        <FieldInput label={t.fieldBrand} value={form.brand} onChange={set("brand")} />
        <FieldInput label={t.fieldCollection} value={form.collection} onChange={set("collection")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldInput label={t.fieldColorName} value={form.colorName} onChange={set("colorName")} />
        <FieldInput label={t.fieldColorNumber} value={form.colorNumber} onChange={set("colorNumber")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldSelect label={t.fieldWeight} value={form.weight} onChange={set("weight")} options={YARN_WEIGHTS.map((w) => ({ value: w, label: w }))} />
        <FieldInput label={t.fieldFiberType} value={form.fiberType} onChange={set("fiberType")} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <FieldInput label={t.fieldHookSize} value={form.hookSize} onChange={set("hookSize")} />
        <FieldInput label={t.fieldDyeLot} value={form.dyeLot} onChange={set("dyeLot")} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <FieldInput label={t.fieldQuantity} value={form.quantity} onChange={(v) => set("quantity")(v.replace(/[^0-9.]/g, ""))} />
        <FieldSelect label={t.fieldUnit} value={form.unit} onChange={set("unit")} options={YARN_UNITS.map((u) => ({ value: u, label: u }))} />
        <FieldInput label={t.fieldLowStockThreshold} value={form.lowStockThreshold} onChange={(v) => set("lowStockThreshold")(v.replace(/[^0-9.]/g, ""))} />
      </div>
      <FieldSelect label={t.visibilityFieldLabel} value={form.visibility} onChange={set("visibility")} options={[{ value: "public", label: t.public }, { value: "private", label: t.private }]} />
      <div className="grid grid-cols-2 gap-3">
        <FieldInput label={t.fieldStore} value={form.store} onChange={set("store")} />
        <FieldInput label={t.fieldPurchasePrice} value={form.purchasePrice} onChange={(v) => set("purchasePrice")(v.replace(/[^0-9.]/g, ""))} />
      </div>
      <FieldInput label={t.fieldPurchaseDate} value={form.purchaseDate} onChange={set("purchaseDate")} />
      <FieldInput label={t.fieldNotes} value={form.notes} onChange={set("notes")} textarea />
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave({ ...form, quantity: Number(form.quantity) || 0, lowStockThreshold: Number(form.lowStockThreshold) || 0 })} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>{t.save}</button>
        <button onClick={onClose} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--surfaceMuted)" }}>{t.cancel}</button>
      </div>
    </ModalShell>
  );
}

/* ---------------------------------------------------------
   Materials
--------------------------------------------------------- */

function MaterialsTab({ t, th, materials, onAdd, onEdit, onDelete, onDuplicate, onToggleArchive }) {
  const [search, setSearch] = useState("");
  const [showArchived, setShowArchived] = useState(false);

  const list = useMemo(() => {
    let arr = materials.filter((m) => (showArchived ? m.archived : !m.archived));
    const q = search.trim().toLowerCase();
    if (q) arr = arr.filter((m) => [m.name, m.category].join(" ").toLowerCase().includes(q));
    return arr;
  }, [materials, search, showArchived]);

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <div className="flex-1 min-w-[160px] flex items-center gap-2 px-3.5 py-2 rounded-full" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
          <Search size={14} style={{ color: "var(--textMuted)" }} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t.materialsSearchPlaceholder} className="fm-focusable bg-transparent outline-none text-sm w-full" />
        </div>
        <FilterPill active={showArchived} onClick={() => setShowArchived((v) => !v)} label={t.yarnArchived} th={th} />
        <button onClick={onAdd} className="fm-btn fm-focusable inline-flex items-center gap-1.5 text-xs font-medium px-3.5 py-2 rounded-full" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>
          <Plus size={13} /> {t.materialsAdd}
        </button>
      </div>

      {list.length === 0 ? <EmptyState text={t.materialsEmpty} /> : (
        <div className="space-y-2">
          {list.map((m) => (
            <AdminRow
              key={m.id}
              title={m.name}
              sub={[m.category, `${m.quantity} ${m.unit || ""}`].filter(Boolean).join(" · ")}
              badges={[m.visibility === "private" ? t.private : null, m.archived ? t.yarnArchived : null].filter(Boolean)}
              onEdit={() => onEdit(m)}
              onDelete={() => onDelete(m)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialFormModal({ t, th, initial, onClose, onSave }) {
  const categories = t.materialCategories.split(",");
  const [form, setForm] = useState(initial || { id: null, photo: "", name: "", category: categories[0], quantity: 1, unit: "", notes: "", visibility: "public", archived: false });
  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }));

  return (
    <ModalShell onClose={onClose}>
      <h3 className="fm-display text-lg font-medium mb-4">{initial ? t.edit : t.materialsAdd}</h3>
      <FileUploadField label={t.fieldPhoto} value={form.photo} onChange={set("photo")} />
      <FieldInput label={t.fieldName} value={form.name} onChange={set("name")} />
      <FieldSelect label={t.fieldCategory} value={form.category} onChange={set("category")} options={categories.map((c) => ({ value: c, label: c }))} />
      <div className="grid grid-cols-2 gap-3">
        <FieldInput label={t.fieldQuantity} value={form.quantity} onChange={(v) => set("quantity")(v.replace(/[^0-9.]/g, ""))} />
        <FieldInput label={t.fieldUnit} value={form.unit} onChange={set("unit")} />
      </div>
      <FieldSelect label={t.visibilityFieldLabel} value={form.visibility} onChange={set("visibility")} options={[{ value: "public", label: t.public }, { value: "private", label: t.private }]} />
      <FieldInput label={t.fieldNotes} value={form.notes} onChange={set("notes")} textarea />
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave({ ...form, quantity: Number(form.quantity) || 0 })} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>{t.save}</button>
        <button onClick={onClose} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--surfaceMuted)" }}>{t.cancel}</button>
      </div>
    </ModalShell>
  );
}

/* ---------------------------------------------------------
   Admin forms & confirm dialog
--------------------------------------------------------- */

function ModalShell({ onClose, children, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: "rgba(30,24,20,0.45)" }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className={`w-full ${wide ? "max-w-lg" : "max-w-md"} max-h-[85vh] overflow-y-auto rounded-3xl p-5 sm:p-6`}
        style={{ background: "var(--surface)", border: "1px solid var(--border)" }}
      >
        {children}
      </div>
    </div>
  );
}

function FieldInput({ label, value, onChange, textarea }) {
  const Comp = textarea ? "textarea" : "input";
  return (
    <label className="block mb-3">
      <span className="text-xs font-medium block mb-1" style={{ color: "var(--textMuted)" }}>{label}</span>
      <Comp
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={textarea ? 3 : undefined}
        className="fm-focusable w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
        style={{ background: "var(--surfaceMuted)", color: "var(--text)" }}
      />
    </label>
  );
}

function FieldSelect({ label, value, onChange, options }) {
  return (
    <label className="block mb-3">
      <span className="text-xs font-medium block mb-1" style={{ color: "var(--textMuted)" }}>{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="fm-focusable w-full px-3.5 py-2.5 rounded-xl text-sm outline-none"
        style={{ background: "var(--surfaceMuted)", color: "var(--text)" }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}

function FieldCheckbox({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2.5 mb-3 text-sm cursor-pointer">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="w-4 h-4" />
      {label}
    </label>
  );
}

function RichTextEditor({ label, value, onChange, t }) {
  const ref = useRef(null);
  const isFirstRender = useRef(true);

  useEffect(() => {
    // Only sync from prop on first mount / external change, so we don't fight the cursor while typing
    if (ref.current && isFirstRender.current) {
      ref.current.innerHTML = value || "";
      isFirstRender.current = false;
    }
  }, [value]);

  const exec = (cmd, arg) => {
    ref.current?.focus();
    document.execCommand(cmd, false, arg);
    onChange(ref.current?.innerHTML || "");
  };

  const ToolBtn = ({ onClick, icon, label: btnLabel }) => (
    <button
      type="button"
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      aria-label={btnLabel}
      title={btnLabel}
      className="fm-btn fm-focusable w-7 h-7 rounded-md flex items-center justify-center hover:opacity-80"
      style={{ background: "var(--surface)" }}
    >
      {icon}
    </button>
  );

  return (
    <div className="mb-3">
      {label && <span className="text-xs font-medium block mb-1.5" style={{ color: "var(--textMuted)" }}>{label}</span>}
      <div className="rounded-xl overflow-hidden" style={{ border: "1px solid var(--border)" }}>
        <div className="flex flex-wrap items-center gap-1 p-1.5" style={{ background: "var(--surfaceMuted)" }}>
          <ToolBtn onClick={() => exec("bold")} icon={<Bold size={13} />} label={t.rteBold} />
          <ToolBtn onClick={() => exec("italic")} icon={<Italic size={13} />} label={t.rteItalic} />
          <ToolBtn onClick={() => exec("underline")} icon={<Underline size={13} />} label={t.rteUnderline} />
          <ToolBtn onClick={() => exec("formatBlock", "H3")} icon={<Heading2 size={13} />} label={t.rteHeading} />
          <ToolBtn onClick={() => exec("insertUnorderedList")} icon={<List size={13} />} label={t.rteBulletList} />
          <ToolBtn onClick={() => exec("insertOrderedList")} icon={<ListOrdered size={13} />} label={t.rteNumberedList} />
          <ToolBtn onClick={() => exec("formatBlock", "BLOCKQUOTE")} icon={<Quote size={13} />} label={t.rteQuote} />
          <ToolBtn onClick={() => { const url = window.prompt(t.rteLinkPrompt); if (url) exec("createLink", url); }} icon={<Link2 size={13} />} label={t.rteLink} />
          <ToolBtn onClick={() => exec("justifyLeft")} icon={<AlignLeft size={13} />} label={t.rteAlignLeft} />
          <ToolBtn onClick={() => exec("justifyCenter")} icon={<AlignCenter size={13} />} label={t.rteAlignCenter} />
          <ToolBtn onClick={() => exec("justifyRight")} icon={<AlignRight size={13} />} label={t.rteAlignRight} />
        </div>
        <div
          ref={ref}
          contentEditable
          suppressContentEditableWarning
          onInput={() => onChange(ref.current?.innerHTML || "")}
          onBlur={() => onChange(ref.current?.innerHTML || "")}
          className="fm-rte px-3.5 py-2.5 text-sm outline-none min-h-[110px]"
          style={{ background: "var(--surface)", color: "var(--text)" }}
        />
      </div>
    </div>
  );
}

function FileUploadField({ label, value, onChange, help }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputId = useRef(`upload-${Math.random().toString(36).slice(2, 9)}`).current;

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    setError("");
    try {
      const url = await sbUploadImage(file);
      onChange(url);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div className="mb-3">
      <span className="text-xs font-medium block mb-1.5" style={{ color: "var(--textMuted)" }}>{label}</span>
      {value && (
        <div className="w-full h-32 rounded-xl overflow-hidden mb-2" style={{ background: "var(--surfaceMuted)" }}>
          <img src={value} alt="" className="w-full h-full object-cover" />
        </div>
      )}
      <div className="flex items-center gap-2">
        <input id={inputId} type="file" accept="image/*" onChange={handleFile} className="hidden" />
        <label
          htmlFor={inputId}
          className="fm-btn fm-focusable inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium px-3.5 py-2 rounded-full"
          style={{ background: "var(--surfaceMuted)" }}
        >
          <Upload size={13} />
          {uploading ? "Uploading…" : value ? "Replace photo" : "Upload photo"}
        </label>
        {value && !uploading && (
          <button type="button" onClick={() => onChange("")} className="fm-btn fm-focusable text-xs" style={{ color: "var(--textMuted)" }}>
            Remove
          </button>
        )}
      </div>
      {error && <p className="text-xs mt-1.5" style={{ color: "#B5544A" }}>{error}</p>}
      {help && <p className="text-[11px] mt-1.5" style={{ color: "var(--textMuted)" }}>{help}</p>}
    </div>
  );
}

function MultiFileUploadField({ label, value, onChange, help }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const inputId = useRef(`upload-multi-${Math.random().toString(36).slice(2, 9)}`).current;
  const urls = value || [];

  const handleFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploading(true);
    setError("");
    try {
      const uploaded = await Promise.all(files.map((f) => sbUploadImage(f)));
      onChange([...urls, ...uploaded]);
    } catch (err) {
      setError(err.message || "Upload failed.");
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (i) => onChange(urls.filter((_, idx) => idx !== i));

  return (
    <div className="mb-3">
      <span className="text-xs font-medium block mb-1.5" style={{ color: "var(--textMuted)" }}>{label}</span>
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2">
          {urls.map((u, i) => (
            <div key={i} className="relative w-16 h-16 rounded-lg overflow-hidden" style={{ background: "var(--surfaceMuted)" }}>
              <img src={u} alt="" className="w-full h-full object-cover" />
              <button
                type="button"
                onClick={() => removeAt(i)}
                className="absolute top-0.5 right-0.5 w-4 h-4 rounded-full flex items-center justify-center"
                style={{ background: "rgba(0,0,0,0.55)" }}
                aria-label="Remove"
              >
                <XIcon size={10} color="#fff" />
              </button>
            </div>
          ))}
        </div>
      )}
      <input id={inputId} type="file" accept="image/*" multiple onChange={handleFiles} className="hidden" />
      <label
        htmlFor={inputId}
        className="fm-btn fm-focusable inline-flex items-center gap-1.5 cursor-pointer text-xs font-medium px-3.5 py-2 rounded-full"
        style={{ background: "var(--surfaceMuted)" }}
      >
        <Upload size={13} />
        {uploading ? "Uploading…" : "Add photos"}
      </label>
      {error && <p className="text-xs mt-1.5" style={{ color: "#B5544A" }}>{error}</p>}
      {help && <p className="text-[11px] mt-1.5" style={{ color: "var(--textMuted)" }}>{help}</p>}
    </div>
  );
}

function ProjectFormModal({ t, th, categories, initial, yarnItems, initialYarnUsed, onClose, onSave }) {
  const [form, setForm] = useState(
    initial || { id: null, titleEn: "", titleAr: "", cat: categories[0]?.id || "", tone: "sage", status: "notStarted", visibility: "public", featured: false, patternId: null, coverImage: "", gallery: [], notesEn: "", notesAr: "" }
  );
  const [yarnUsed, setYarnUsed] = useState(initialYarnUsed && initialYarnUsed.length > 0 ? initialYarnUsed : []);
  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }));

  const handleSave = () => {
    const gallery = form.gallery || [];
    onSave({ ...form, gallery, galleryCount: gallery.length || 1, yarnUsed });
  };

  const addYarnRow = () => setYarnUsed((prev) => [...prev, { yarnId: yarnItems?.[0]?.id || "", quantityUsed: 1 }]);
  const updateYarnRow = (i, field, v) => setYarnUsed((prev) => prev.map((r, idx) => (idx === i ? { ...r, [field]: v } : r)));
  const removeYarnRow = (i) => setYarnUsed((prev) => prev.filter((_, idx) => idx !== i));

  return (
    <ModalShell onClose={onClose}>
      <h3 className="fm-display text-lg font-medium mb-4">{initial ? t.edit : t.addProject}</h3>
      <FieldInput label={t.titleEnLabel} value={form.titleEn} onChange={set("titleEn")} />
      <FieldInput label={t.titleArLabel} value={form.titleAr} onChange={set("titleAr")} />
      <FieldSelect label={t.categoryFieldLabel} value={form.cat} onChange={set("cat")} options={categories.map((c) => ({ value: c.id, label: c.en }))} />
      <FieldSelect label={t.statusFieldLabel} value={form.status} onChange={set("status")} options={[
        { value: "notStarted", label: t.statusLabels.notStarted },
        { value: "inProgress", label: t.statusLabels.inProgress },
        { value: "finished", label: t.statusLabels.finished },
      ]} />
      <FieldSelect label={t.visibilityFieldLabel} value={form.visibility} onChange={set("visibility")} options={[
        { value: "public", label: t.public },
        { value: "private", label: t.private },
      ]} />
      <FieldSelect label={t.toneFieldLabel} value={form.tone} onChange={set("tone")} options={[
        { value: "sage", label: "Sage" }, { value: "lavender", label: "Lavender" }, { value: "butter", label: "Butter" },
      ]} />
      <FieldCheckbox label={t.featuredFieldLabel} checked={form.featured} onChange={set("featured")} />
      <FileUploadField label={t.coverImageLabel} value={form.coverImage} onChange={set("coverImage")} help={t.coverImageHelp} />
      <MultiFileUploadField label={t.galleryLabel2} value={form.gallery} onChange={set("gallery")} help={t.galleryHelp} />

      {yarnItems && yarnItems.length > 0 && (
        <div className="mb-3">
          <span className="text-xs font-medium block mb-1.5" style={{ color: "var(--textMuted)" }}>{t.yarnUsedTitle}</span>
          <div className="space-y-2 mb-2">
            {yarnUsed.map((row, i) => (
              <div key={i} className="flex items-center gap-2">
                <select
                  value={row.yarnId}
                  onChange={(e) => updateYarnRow(i, "yarnId", Number(e.target.value))}
                  className="fm-focusable flex-1 px-3 py-2 rounded-lg text-xs outline-none"
                  style={{ background: "var(--surfaceMuted)", color: "var(--text)" }}
                >
                  {yarnItems.filter((y) => !y.archived).map((y) => (
                    <option key={y.id} value={y.id}>{y.brand} {y.colorName} ({y.quantity} {y.unit} left)</option>
                  ))}
                </select>
                <input
                  type="number" min="0" step="any"
                  value={row.quantityUsed}
                  onChange={(e) => updateYarnRow(i, "quantityUsed", Number(e.target.value))}
                  placeholder={t.yarnUsedQty}
                  className="fm-focusable w-20 px-2 py-2 rounded-lg text-xs outline-none"
                  style={{ background: "var(--surfaceMuted)", color: "var(--text)" }}
                />
                <button type="button" onClick={() => removeYarnRow(i)} className="fm-btn fm-focusable w-7 h-7 rounded-full flex items-center justify-center shrink-0" style={{ background: "var(--surfaceMuted)" }}>
                  <XIcon size={12} />
                </button>
              </div>
            ))}
          </div>
          <button type="button" onClick={addYarnRow} className="fm-btn fm-focusable inline-flex items-center gap-1 text-xs font-medium px-3 py-1.5 rounded-full" style={{ background: "var(--surfaceMuted)" }}>
            <Plus size={12} /> {t.yarnUsedAdd}
          </button>
        </div>
      )}

      <FieldInput label={t.notesEnLabel} value={form.notesEn} onChange={set("notesEn")} textarea />
      <FieldInput label={t.notesArLabel} value={form.notesAr} onChange={set("notesAr")} textarea />
      <div className="flex gap-2 mt-4">
        <button onClick={handleSave} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>{t.save}</button>
        <button onClick={onClose} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--surfaceMuted)" }}>{t.cancel}</button>
      </div>
    </ModalShell>
  );
}

function PatternFormModal({ t, th, categories, initial, onClose, onSave }) {
  const [form, setForm] = useState(
    initial || { id: null, titleEn: "", titleAr: "", designerEn: "", designerAr: "", cat: categories[0]?.id || "", tone: "sage", pdfUrl: "", youtubeUrl: "", etsyUrl: "", pinterestUrl: "", coverImage: "", notesEn: "", notesAr: "" }
  );
  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }));

  return (
    <ModalShell onClose={onClose}>
      <h3 className="fm-display text-lg font-medium mb-4">{initial ? t.edit : t.addPattern}</h3>
      <FieldInput label={t.titleEnLabel} value={form.titleEn} onChange={set("titleEn")} />
      <FieldInput label={t.titleArLabel} value={form.titleAr} onChange={set("titleAr")} />
      <FieldInput label={t.designerEnLabel} value={form.designerEn} onChange={set("designerEn")} />
      <FieldInput label={t.designerArLabel} value={form.designerAr} onChange={set("designerAr")} />
      <FieldSelect label={t.categoryFieldLabel} value={form.cat} onChange={set("cat")} options={categories.map((c) => ({ value: c.id, label: c.en }))} />
      <FieldSelect label={t.toneFieldLabel} value={form.tone} onChange={set("tone")} options={[
        { value: "sage", label: "Sage" }, { value: "lavender", label: "Lavender" }, { value: "butter", label: "Butter" },
      ]} />
      <FieldInput label={t.pdfUrlLabel} value={form.pdfUrl} onChange={set("pdfUrl")} />
      <FieldInput label={t.youtubeUrlLabel} value={form.youtubeUrl} onChange={set("youtubeUrl")} />
      <FieldInput label={t.etsyUrlLabel} value={form.etsyUrl} onChange={set("etsyUrl")} />
      <FieldInput label={t.pinterestUrlLabel} value={form.pinterestUrl} onChange={set("pinterestUrl")} />
      <p className="text-[11px] -mt-2 mb-3" style={{ color: "var(--textMuted)" }}>{t.linkUrlHelp}</p>
      <FileUploadField label={t.coverImageLabel} value={form.coverImage} onChange={set("coverImage")} />
      <FieldInput label={t.notesEnLabel} value={form.notesEn} onChange={set("notesEn")} textarea />
      <FieldInput label={t.notesArLabel} value={form.notesAr} onChange={set("notesAr")} textarea />
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave(form)} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>{t.save}</button>
        <button onClick={onClose} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--surfaceMuted)" }}>{t.cancel}</button>
      </div>
    </ModalShell>
  );
}

function CategoryFormModal({ t, th, initial, onClose, onSave }) {
  const [form, setForm] = useState(initial || { id: "", en: "", ar: "", tone: "sage" });
  const set = (field) => (v) => setForm((f) => ({ ...f, [field]: v }));

  return (
    <ModalShell onClose={onClose}>
      <h3 className="fm-display text-lg font-medium mb-4">{initial ? t.edit : t.addCategory}</h3>
      <FieldInput label={t.nameEnLabel} value={form.en} onChange={(v) => setForm((f) => ({ ...f, en: v, id: f.id || v.toLowerCase().replace(/[^a-z0-9]+/g, "-") }))} />
      <FieldInput label={t.nameArLabel} value={form.ar} onChange={set("ar")} />
      <FieldSelect label={t.toneFieldLabel} value={form.tone} onChange={set("tone")} options={[
        { value: "sage", label: "Sage" }, { value: "lavender", label: "Lavender" }, { value: "butter", label: "Butter" },
      ]} />
      <div className="flex gap-2 mt-4">
        <button onClick={() => onSave(form)} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--threadDeep)", color: "var(--surface)" }}>{t.save}</button>
        <button onClick={onClose} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--surfaceMuted)" }}>{t.cancel}</button>
      </div>
    </ModalShell>
  );
}

function ConfirmDialog({ t, label, onCancel, onConfirm }) {
  return (
    <ModalShell onClose={onCancel}>
      <h3 className="fm-display text-lg font-medium mb-1.5">{t.confirmDeleteTitle}</h3>
      <p className="text-sm mb-1" style={{ color: "var(--textMuted)" }}>{label}</p>
      <p className="text-xs mb-5" style={{ color: "var(--textMuted)" }}>{t.confirmDeleteSub}</p>
      <div className="flex gap-2">
        <button onClick={onConfirm} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "#B5544A", color: "#fff" }}>{t.confirmDeleteBtn}</button>
        <button onClick={onCancel} className="fm-btn fm-focusable flex-1 py-2.5 rounded-full text-sm font-medium" style={{ background: "var(--surfaceMuted)" }}>{t.cancel}</button>
      </div>
    </ModalShell>
  );
}

function Toast({ toast }) {
  if (!toast) return null;
  const isError = toast.type === "error";
  return (
    <div
      className="fixed bottom-5 right-5 z-[60] flex items-center gap-2 px-4 py-3 rounded-xl text-sm font-medium shadow-lg"
      style={{ background: isError ? "#B5544A" : "var(--threadDeep)", color: "#fff" }}
      role="status"
    >
      {isError ? <AlertCircle size={15} /> : <Check size={15} />}
      {toast.message}
    </div>
  );
}
