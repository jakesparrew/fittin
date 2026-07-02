// One stroke-icon set for the whole app — replaces the dingbats/emoji scattered through the admin +
// coach sidebars and misc UI. 24px, stroke-2, currentColor (inherits text colour). No icon font, no
// dependency. Merged from the hand-rolled dictionaries in BottomTabBar + the homepage.
const P = {
  // nav / structure
  home: "M3 11l9-8 9 8M5 10v10h14V10",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  dashboard: "M4 13h6V4H4zM14 20h6v-9h-6zM14 8h6V4h-6zM4 20h6v-4H4z",
  cal: "M3 9h18M7 3v4M17 3v4M5 5h14v16H5z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01",
  dumbbell: "M6.5 6.5l11 11M4 9l2-2 3 3-2 2zM15 18l2-2 3 3-2 2zM2 11l2 2M20 11l2 2",
  play: "M6 4l14 8-14 8z",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0",
  users: "M9 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7zM2 20a7 7 0 0114 0M17 11a3 3 0 100-6M22 20a6 6 0 00-4-5.7",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  whistle: "M14 11a5 5 0 11-9.9-1H14zM14 9l6-3M12 16v3",
  bell: "M6 9a6 6 0 1112 0c0 5 2 6 2 6H4s2-1 2-6zM10 21a2 2 0 004 0",
  mail: "M3 5h18v14H3zM3 6l9 7 9-7",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.5 6 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-6-3.5-9s1-6.5 3.5-9z",
  chart: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  euro: "M17 6a6 6 0 100 12M4 10h9M4 14h9",
  card: "M3 6h18v12H3zM3 10h18",
  cog: "M12 15a3 3 0 100-6 3 3 0 000 6zM19 12a7 7 0 00-.1-1l2-1.5-2-3.4-2.3 1a7 7 0 00-1.7-1L14.5 3h-4l-.4 2.6a7 7 0 00-1.7 1l-2.3-1-2 3.4L4.1 11a7 7 0 000 2l-2 1.5 2 3.4 2.3-1a7 7 0 001.7 1l.4 2.6h4l.4-2.6a7 7 0 001.7-1l2.3 1 2-3.4L18.9 13a7 7 0 00.1-1z",
  tag: "M20 12l-8 8-9-9V4h7zM7.5 7.5h.01",
  megaphone: "M3 11v2a1 1 0 001 1h2l4 4V6L6 10H4a1 1 0 00-1 1zM14 8a4 4 0 010 8M18 5a8 8 0 010 14",
  star: "M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18l-5.8 3 1.1-6.5L2.6 9.8l6.5-.9z",
  bolt: "M13 2L4 14h6l-1 8 9-12h-6z",
  edit: "M4 20h4L18 10l-4-4L4 16zM14 6l4 4",
  door: "M6 3h9v18H6zM11 12h.01M15 3l3 1v16l-3 1",
  clock: "M12 3a9 9 0 100 18 9 9 0 000-18zM12 8v4l3 2",
  check: "M4 12l5 5L20 6",
  warn: "M12 3l10 18H2zM12 9v5M12 18h.01",
  x: "M6 6l12 12M18 6L6 18",
  menu: "M4 6h16M4 12h16M4 18h16",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z",
  chat: "M4 5h16v11H8l-4 4z",
  heart: "M12 21C6 17 3 13 3 8.5A4.5 4.5 0 0112 6a4.5 4.5 0 019 2.5C21 13 18 17 12 21z",
};

export default function Icon({ name, size = 22, className = "", strokeWidth = 2 }) {
  const d = P[name] || P.grid;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      <path d={d} />
    </svg>
  );
}
