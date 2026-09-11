// One definition of the bottom tabs, shared by the web/Android bar (components/BottomTabBar) and
// the native iOS UITabBar (components/native/NativeTabBarSync). Two lists would drift.
//
// icon = key into TAB_ICONS (web SVG) · sf = SF Symbol name (iOS native bar)

export const TAB_ICONS = {
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  cal: "M3 9h18M7 3v4M17 3v4M5 5h14v16H5z",
  dumbbell: "M6.5 6.5l11 11M4 9l2-2 3 3-2 2zM15 18l2-2 3 3-2 2zM2 11l2 2M20 11l2 2",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  play: "M6 4l14 8-14 8z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  whistle: "M14 11a5 5 0 11-9.9-1H14zM14 9l6-3M12 16v3",
};

const t = (href, label, icon, sf) => ({ href, label, icon, sf });

const BOEKEN = t("/boeken", "Boeken", "cal", "calendar");
const WORKOUTS = t("/workouts", "Workouts", "dumbbell", "dumbbell.fill");
const TRAINING = t("/training", "Training", "play", "play.circle.fill");
const OEFENINGEN = t("/oefeningen", "Oefeningen", "list", "list.bullet.rectangle.portrait");
const ACCOUNT = t("/account", "Account", "user", "person.crop.circle");

export const TABS = {
  // The website's guest bar starts at the marketing homepage…
  guest: [t("/", "Home", "home", "house"), BOEKEN, WORKOUTS, OEFENINGEN, t("/login", "Inloggen", "user", "person.crop.circle")],
  // …the app's does not: a guest in the app came to book or look around, not to read a sales page.
  appGuest: [BOEKEN, WORKOUTS, OEFENINGEN, t("/login", "Inloggen", "user", "person.crop.circle")],
  lid: [BOEKEN, WORKOUTS, TRAINING, OEFENINGEN, ACCOUNT],
  coach: [BOEKEN, WORKOUTS, OEFENINGEN, t("/coach", "Coach", "whistle", "figure.strengthtraining.traditional"), ACCOUNT],
  beheerder: [BOEKEN, WORKOUTS, OEFENINGEN, t("/beheer", "Beheer", "shield", "checkmark.shield"), ACCOUNT],
};

/** role: undefined = still loading, null = guest. */
export function tabsFor(role, { app = false } = {}) {
  if (!role) return app ? TABS.appGuest : TABS.guest;
  return TABS[role] || TABS.lid;
}

export function isTabActive(href, pathname) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
}

/** In the app these screens are full-screen: no tab bar (web bar or native). */
export const APP_NO_TABBAR = ["/app", "/login", "/wachtwoord-vergeten", "/wachtwoord-herstellen", "/training/sessie"];

const ROOTS = new Set(["/", "/app", ...Object.values(TABS).flat().map((x) => x.href)]);

/** A tab root has no back button in the app header: the tab bar IS its navigation. */
export const isTabRoot = (pathname) => ROOTS.has(pathname || "/");
