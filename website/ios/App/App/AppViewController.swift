import UIKit
import Capacitor

/// The one bridge view controller of the app. Subclassed only to register the app's own local
/// plugins (Capacitor 8 needs them registered explicitly) and to gate the Web Inspector.
class AppViewController: CAPBridgeViewController {
    override open func capacitorDidLoad() {
        bridge?.registerPluginInstance(NativeTabBarPlugin())
        bridge?.registerPluginInstance(FittinNativePlugin())
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        // Brand indigo behind the webview, so nothing white ever shows between the launch screen
        // and the first painted page, nor during an overscroll at the very top.
        view.backgroundColor = UIColor(red: 0x22 / 255, green: 0x19 / 255, blue: 0x4F / 255, alpha: 1)
        // iOS edge-swipe back, done by WebKit itself: it walks the webview's history, which is the
        // Next router's history, so every pushed page gets the native gesture for free. It also
        // rescues the member from a page without our header (a raw file, a third-party screen).
        webView?.allowsBackForwardNavigationGestures = true
        #if DEBUG
        // Safari → Develop → Simulator/device. Never in Release: an App Store build must not be
        // inspectable.
        if #available(iOS 16.4, *) { webView?.isInspectable = true }
        #endif
    }
}
