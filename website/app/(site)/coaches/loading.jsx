// Galerij van coachkaarten met een foto bovenaan.
import PageSkeleton from "@/components/ui/PageSkeleton";

export default function Loading() {
  return <PageSkeleton variant="raster" breedte="midden" kaarten={1} intro />;
}
