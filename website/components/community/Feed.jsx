"use client";
import { useState, useRef, useActionState } from "react";
import { createPost, toggleKudos, addComment, deletePost } from "@/app/(site)/community/feed-actions";

const fmt = (iso) => new Intl.DateTimeFormat("nl-BE", { timeZone: "Europe/Brussels", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
const initials = (n) => (n || "?").split(" ").map((x) => x[0]).slice(0, 2).join("").toUpperCase();

const KIND_BADGE = {
  activity: { icon: "🏋️", label: "Sessie" },
  achievement: { icon: "🏅", label: "Mijlpaal" },
  coach_tip: { icon: "💡", label: "Coach-tip" },
  post: null,
};

// Strava-style social feed: composer + filterable list of posts with kudos + comments.
export default function Feed({ posts = [], me, buddyIds = [], isCoach = false }) {
  const [tab, setTab] = useState("all"); // all | buddies | coaches
  const buddySet = new Set(buddyIds);

  const filtered = posts.filter((p) => {
    if (tab === "buddies") return p.author_id === me.id || buddySet.has(p.author_id);
    if (tab === "coaches") return p.kind === "coach_tip";
    return true;
  });

  const TABS = [
    { v: "all", l: "Iedereen" },
    { v: "buddies", l: "Mijn buddies" },
    { v: "coaches", l: "Coach-tips" },
  ];

  return (
    <section className="rounded-3xl border border-borderc bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-black text-brand">Feed</h2>
          <p className="mt-1 text-sm text-brand/60">Deel je trainingen, geef elkaar kudos en blijf gemotiveerd.</p>
        </div>
        <div className="inline-flex rounded-full border border-borderc p-1 text-xs font-bold">
          {TABS.map((t) => (
            <button key={t.v} onClick={() => setTab(t.v)} className={"rounded-full px-3 py-1.5 transition " + (tab === t.v ? "bg-brand text-white" : "text-brand/60 hover:text-brand")}>{t.l}</button>
          ))}
        </div>
      </div>

      <Composer isCoach={isCoach} />

      <div className="mt-5 space-y-4">
        {filtered.length === 0 && (
          <p className="rounded-2xl bg-paper p-6 text-center text-sm text-brand/50">
            {tab === "buddies" ? "Nog niks van je buddies. Voeg buddies toe of post zelf iets!" : tab === "coaches" ? "Nog geen coach-tips." : "Nog niks te zien. Wees de eerste — boek een sessie of post iets!"}
          </p>
        )}
        {filtered.map((p) => <PostCard key={p.id} post={p} me={me} />)}
      </div>
    </section>
  );
}

function Composer({ isCoach }) {
  const formRef = useRef(null);
  const [, action, pending] = useActionState(async (_p, fd) => {
    const r = await createPost(fd);
    if (!r?.error) formRef.current?.reset();
    if (r?.error) window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type: "error", msg: r.error } }));
    else window.dispatchEvent(new CustomEvent("fittin:toast", { detail: { type: "success", msg: r.message || "Geplaatst ✓" } }));
    return r || { ok: true };
  }, null);

  return (
    <form ref={formRef} action={action} className="mt-5 rounded-2xl border border-borderc bg-paper/50 p-4">
      <textarea name="body" rows={2} placeholder={isCoach ? "Deel een tip, aankondiging of motivatie met de community…" : "Hoe ging je training? Deel een update…"} className="w-full resize-none rounded-xl border-2 border-borderc bg-white px-3 py-2 text-sm" />
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-xs font-bold text-brand/60">
          <span className="rounded-full bg-white px-3 py-1.5 transition hover:bg-accent/15">📷 Foto</span>
          <input type="file" name="image" accept="image/*" className="hidden" onChange={(e) => { e.target.previousSibling.textContent = e.target.files?.[0] ? "📷 " + e.target.files[0].name.slice(0, 18) : "📷 Foto"; }} />
        </label>
        <div className="flex items-center gap-2">
          {isCoach && (
            <label className="flex items-center gap-1.5 text-xs font-bold text-brand/60">
              <input type="checkbox" name="kind" value="coach_tip" className="h-4 w-4 accent-[#5fda6b]" /> Als coach-tip
            </label>
          )}
          <button disabled={pending} className="rounded-full bg-accent px-5 py-2 text-sm font-bold text-brand transition hover:opacity-90 disabled:opacity-50">{pending ? "Bezig…" : "Plaats"}</button>
        </div>
      </div>
    </form>
  );
}

function PostCard({ post, me }) {
  const [showComments, setShowComments] = useState(false);
  const badge = KIND_BADGE[post.kind];
  const mine = post.author_id === me.id;

  return (
    <article className="rounded-2xl border border-borderc bg-white p-4">
      <div className="flex items-start gap-3">
        <Avatar name={post.author_name} url={post.author_photo} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="font-bold text-brand">{post.author_name}</span>
            {badge && <span className="rounded-full bg-paper px-2 py-0.5 text-[10px] font-bold text-brand/60">{badge.icon} {badge.label}</span>}
            <span className="text-xs text-brand/40">· {fmt(post.created_at)}</span>
            {mine && (
              <form action={deletePost} className="ml-auto">
                <input type="hidden" name="id" value={post.id} />
                <button className="text-xs text-brand/30 hover:text-red-500" title="Verwijder">×</button>
              </form>
            )}
          </div>
          {post.body && <p className={"mt-1 text-sm " + (post.kind === "activity" || post.kind === "achievement" ? "font-semibold text-brand/80" : "text-brand/80")}>{post.body}</p>}
          {post.image_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={post.image_url} alt="" className="mt-3 max-h-96 w-full rounded-xl object-cover" />
          )}

          {/* Kudos + comment toggle */}
          <div className="mt-3 flex items-center gap-4 text-sm">
            <form action={toggleKudos}>
              <input type="hidden" name="postId" value={post.id} />
              <button className={"inline-flex items-center gap-1.5 font-bold transition " + (post.i_kudosed ? "text-accentdark" : "text-brand/50 hover:text-brand")}>
                <span className="text-base">{post.i_kudosed ? "👏" : "👏"}</span> {post.kudos > 0 ? post.kudos : ""} Kudos
              </button>
            </form>
            <button onClick={() => setShowComments((s) => !s)} className="font-bold text-brand/50 transition hover:text-brand">
              💬 {post.comments.length > 0 ? post.comments.length : ""} Reageer
            </button>
          </div>

          {showComments && (
            <div className="mt-3 space-y-2 border-t border-borderc pt-3">
              {post.comments.map((c) => (
                <div key={c.id} className="flex items-start gap-2">
                  <Avatar name={c.author_name} small />
                  <div className="rounded-xl bg-paper px-3 py-1.5">
                    <span className="text-xs font-bold text-brand">{c.author_name}</span>
                    <span className="ml-2 text-xs text-brand/40">{fmt(c.created_at)}</span>
                    <p className="text-sm text-brand/80">{c.body}</p>
                  </div>
                </div>
              ))}
              <form action={addComment} className="flex gap-2">
                <input type="hidden" name="postId" value={post.id} />
                <input name="body" placeholder="Schrijf een reactie…" className="flex-1 rounded-full border-2 border-borderc px-3 py-1.5 text-sm" />
                <button className="rounded-full bg-brand px-4 py-1.5 text-xs font-bold text-white">Stuur</button>
              </form>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function Avatar({ name, url, small }) {
  const sz = small ? "h-7 w-7 text-[10px]" : "h-10 w-10 text-sm";
  if (url) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={url} alt={name || ""} className={`${sz} shrink-0 rounded-full object-cover`} />;
  }
  return <span className={`${sz} flex shrink-0 items-center justify-center rounded-full bg-brand font-black text-accent`}>{initials(name)}</span>;
}
