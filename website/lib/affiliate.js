// Awin affiliate link builder for Body & Fit. Set AWIN_AFFID (your publisher id) + optionally
// AWIN_BODYFIT_MID (merchant id; 19861 = Body & Fit NL, 41248 = Body & Fit BE) in env once
// approved. Until AWIN_AFFID is set, links point straight to the destination so nothing breaks.
const AFFID = process.env.AWIN_AFFID || "";
const MID = process.env.AWIN_BODYFIT_MID || "19861";

export function awinLink(destUrl) {
  if (!destUrl) return "https://www.bodyandfit.com/nl-be/";
  if (!AFFID) return destUrl; // not approved yet → direct link
  return `https://www.awin1.com/cread.php?awinmid=${MID}&awinaffid=${encodeURIComponent(AFFID)}&ued=${encodeURIComponent(destUrl)}`;
}

export const affiliateEnabled = Boolean(AFFID);
