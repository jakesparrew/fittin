import Image from "next/image";
import blur from "@/public/gym/blur.json";

// De fotoreportage van de zaal (september 2026). Eén component, zodat elke pagina dezelfde
// beeldtaal krijgt en er nooit ergens een pad met de hand wordt ingetypt.
//
// WAAROM DIT ER NIET WAS: de site had tot nu één beeld — een still uit de promovideo, twee keer
// hergebruikt. Voor een gym waar de rúimte het product is, is dat te weinig: mensen boeken een
// zaal die ze nog nooit zagen.

// De 16px-miniaturen uit blur.json geven next/image een echte placeholder, zodat er geen grijs
// vlak staat te knipperen op een trage verbinding.
const FOTO = {
  "zaal-logo-2": "De trainingszaal van Fittin&rsquo; met het rek, de bank en de vrije gewichten",
  "zaal-logo": "De zaal van Fittin&rsquo; in Sint-Amandsberg, met het logo op de wand",
  "zaal-rek": "Het krachtrek met spiegelwand in de zaal van Fittin&rsquo;",
  "zaal-breed": "Halterstang met gekleurde schijven op de vloer van de zaal",
  "rek": "Het squat-rek en de bench in de trainingszaal",
  "bench": "Bench press-station met vrije gewichten",
  "dumbbells": "De dumbbell- en kettlebellrekken",
  "training-logo": "Twee leden trainen met dumbbells voor de logowand",
  "training-duo": "Een coach begeleidt een lid bij een oefening met weerstandsband",
  "training-duo-staand": "Coach en lid tijdens een functionele oefening",
  "training-pulldown": "Een lid aan de lat pulldown naast het logo op de wand",
  "zaal-logo-staand": "De zaal van boven gezien, met rek en spiegels",
};

const alt = (slug) => (FOTO[slug] || "De zaal van Fittin&rsquo; in Gent").replace(/&rsquo;/g, "’");

/** Eén foto. `staand` kiest de verhouding; `sizes` moet passen bij de plek waar hij staat. */
export function GymFoto({ slug, className = "", sizes = "(max-width: 768px) 100vw, 50vw", priority = false }) {
  return (
    <Image
      src={`/gym/${slug}-1600.webp`}
      alt={alt(slug)}
      width={1600}
      height={1067}
      sizes={sizes}
      placeholder={blur[slug] ? "blur" : "empty"}
      blurDataURL={blur[slug]}
      priority={priority}
      className={className}
    />
  );
}

/**
 * Een strook foto's. Bewust een asymmetrisch raster in plaats van vier gelijke vakjes: één breed
 * beeld dat de ruimte toont plus twee details leest als een reportage, vier identieke tegels als
 * een voorraadlijst.
 */
export default function GymFotos({ slugs = ["zaal-logo-2", "dumbbells", "training-logo"], className = "" }) {
  const [groot, ...rest] = slugs;
  return (
    <div className={`grid gap-3 md:grid-cols-3 ${className}`}>
      <div className="overflow-hidden rounded-3xl border border-borderc md:col-span-2">
        <GymFoto slug={groot} sizes="(max-width: 768px) 100vw, 66vw" className="aspect-[3/2] w-full object-cover" />
      </div>
      <div className="grid gap-3">
        {rest.slice(0, 2).map((s) => (
          <div key={s} className="overflow-hidden rounded-3xl border border-borderc">
            <GymFoto slug={s} sizes="(max-width: 768px) 100vw, 33vw" className="aspect-[3/2] w-full object-cover md:aspect-auto md:h-full" />
          </div>
        ))}
      </div>
    </div>
  );
}
