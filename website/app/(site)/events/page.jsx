import ComingSoon from "@/components/ComingSoon";

export const metadata = { title: "Events | Fittin'" };

export default function EventsPage() {
  return (
    <main className="min-h-screen bg-paper">
      <ComingSoon title="Events — binnenkort" subtitle="Groepslessen en events komen er binnenkort aan. Hou je account in de gaten!" />
    </main>
  );
}
