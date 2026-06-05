import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import { getSessionProfile } from "@/lib/auth";

export default async function SiteLayout({ children }) {
  const { profile } = await getSessionProfile();
  const account = profile
    ? { name: profile.full_name || "Account", role: profile.role }
    : null;
  return (
    <>
      <Nav account={account} />
      {children}
      <Footer />
    </>
  );
}
