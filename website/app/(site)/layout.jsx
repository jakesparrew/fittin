import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import ToastHost from "../../components/ui/ToastHost";

export default function SiteLayout({ children }) {
  return (
    <>
      <Nav />
      {children}
      <Footer />
      <ToastHost />
    </>
  );
}
