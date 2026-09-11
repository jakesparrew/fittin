import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ToastHost from "../../components/ui/ToastHost";
import BottomTabBar from "../../components/BottomTabBar";

export default function SiteLayout({ children }) {
  return (
    <>
      <Nav />
      {/* Bottom padding on mobile so content clears the fixed bottom tab bar (+ the home indicator
          in the app). With the native iOS bar live, its own reported height takes over. */}
      <div className="pb-[calc(5rem_+_var(--sab))] md:pb-0 nativebar:pb-[calc(var(--native-tabbar-h)_+_1rem)]">
        {children}
        <Footer />
      </div>
      <BottomTabBar />
      <ToastHost />
    </>
  );
}
