import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ToastHost from "../../components/ui/ToastHost";
import BottomTabBar from "../../components/BottomTabBar";

export default function SiteLayout({ children }) {
  return (
    <>
      <Nav />
      {/* Bottom padding on mobile so content clears the fixed bottom tab bar. */}
      <div className="pb-20 md:pb-0">
        {children}
        <Footer />
      </div>
      <BottomTabBar />
      <ToastHost />
    </>
  );
}
