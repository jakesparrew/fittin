import Capacitor
import UIKit

/// A real UITabBar laid OVER the single WKWebView (docs/native/01-decision.md, playbook §10).
///
/// The webview is never resized or reparented, and there is never a second webview: JS owns
/// navigation. A tap emits `tabSelect`; the site's router moves and calls `setActiveId` back.
///
/// Why the labels are pixels: iOS 26's Liquid Glass tab bar ignores every label-colour API, so the
/// inactive labels would render black. Icon + label are drawn into one fixed-colour image
/// (`.alwaysOriginal`), `title` stays nil and the text survives as `accessibilityLabel`.
@objc(NativeTabBarPlugin)
public class NativeTabBarPlugin: CAPPlugin, CAPBridgedPlugin, UITabBarDelegate {
    public let identifier = "NativeTabBarPlugin"
    public let jsName = "NativeTabBar"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "configure", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setActiveId", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setVisible", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "destroy", returnType: CAPPluginReturnPromise),
    ]

    private var tabBar: UITabBar?
    private var ids: [String] = []
    private var activeId: String?
    private var visible = true
    private var tint = UIColor(red: 0x22 / 255, green: 0x19 / 255, blue: 0x4F / 255, alpha: 1)
    private var muted = UIColor.systemGray
    private var style: UIUserInterfaceStyle = .light
    private var host: UIView? { bridge?.viewController?.view }

    @objc func configure(_ call: CAPPluginCall) {
        let items = call.getArray("items", JSObject.self) ?? []
        DispatchQueue.main.async {
            if let h = call.getString("tintColor"), let c = Self.hex(h) { self.tint = c }
            if let h = call.getString("unselectedColor"), let c = Self.hex(h) { self.muted = c }
            self.style = call.getString("style") == "dark" ? .dark : .light
            self.activeId = call.getString("activeId") ?? self.activeId
            self.visible = call.getBool("visible", true)
            self.ensureBar()
            guard let bar = self.tabBar else { call.reject("host view unavailable"); return } // JS falls back to the web bar
            self.build(items, into: bar)
            self.applyVisible(animated: false)
            bar.layoutIfNeeded()
            let h = bar.frame.height > 1 ? bar.frame.height : 49 + (self.host?.safeAreaInsets.bottom ?? 0)
            call.resolve(["height": Double(h)])
        }
    }

    @objc func setActiveId(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.activeId = call.getString("id"); self.select(); call.resolve() }
    }

    @objc func setVisible(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.visible = call.getBool("visible", true); self.applyVisible(animated: true); call.resolve() }
    }

    @objc func destroy(_ call: CAPPluginCall) {
        DispatchQueue.main.async { self.tabBar?.removeFromSuperview(); self.tabBar = nil; self.ids = []; call.resolve() }
    }

    private func ensureBar() {
        guard tabBar == nil, let host = host else { return }
        let bar = UITabBar()
        bar.delegate = self
        bar.translatesAutoresizingMaskIntoConstraints = false
        appearance(bar) // before the first display: no dark flash
        host.addSubview(bar)
        // Pinned to the SUPERVIEW bottom, not the safe area: UITabBar extends itself over the home
        // indicator and pads its own items.
        NSLayoutConstraint.activate([
            bar.leadingAnchor.constraint(equalTo: host.leadingAnchor),
            bar.trailingAnchor.constraint(equalTo: host.trailingAnchor),
            bar.bottomAnchor.constraint(equalTo: host.bottomAnchor),
        ])
        tabBar = bar
    }

    private func build(_ raw: [JSObject], into bar: UITabBar) {
        var newIds: [String] = []
        var items: [UITabBarItem] = []
        for o in raw {
            guard let id = o["id"] as? String else { continue }
            let title = o["title"] as? String ?? ""
            // Icon: custom asset → SF Symbol → a guaranteed fallback, so a typo never crashes.
            let config = UIImage.SymbolConfiguration(pointSize: 20, weight: .semibold)
            let base = (o["image"] as? String).flatMap { UIImage(named: $0) }
                ?? UIImage(systemName: o["sfSymbol"] as? String ?? "", withConfiguration: config)
                ?? UIImage(systemName: "circle.fill", withConfiguration: config)!
            let item = UITabBarItem(title: nil, image: baked(base, title, muted), tag: newIds.count)
            item.selectedImage = baked(base, title, tint)
            item.imageInsets = UIEdgeInsets(top: 2, left: 0, bottom: -2, right: 0)
            item.accessibilityLabel = title // the visible label is pixels now
            if let b = o["badge"] as? String, !b.isEmpty { item.badgeValue = b }
            newIds.append(id)
            items.append(item)
        }
        ids = newIds
        bar.setItems(items, animated: false)
        appearance(bar)
        select()
        host?.bringSubviewToFront(bar)
    }

    /// Icon + label in one fixed-colour image (see the class comment).
    private func baked(_ icon: UIImage, _ title: String, _ color: UIColor) -> UIImage {
        let size = CGSize(width: 84, height: 44)
        let s: CGFloat = 24
        let img = UIGraphicsImageRenderer(size: size).image { ctx in
            // Keep the symbol's aspect ratio inside a 24pt box.
            let ratio = icon.size.width / max(icon.size.height, 1)
            let w = ratio >= 1 ? s : s * ratio
            let h = ratio >= 1 ? s / ratio : s
            let r = CGRect(x: (size.width - w) / 2, y: 1 + (s - h) / 2, width: w, height: h)
            icon.withRenderingMode(.alwaysTemplate).draw(in: r)
            ctx.cgContext.setBlendMode(.sourceIn) // tint, keep the alpha
            color.setFill()
            ctx.cgContext.fill(CGRect(x: 0, y: 0, width: size.width, height: s + 2))
            ctx.cgContext.setBlendMode(.normal)
            let p = NSMutableParagraphStyle()
            p.alignment = .center
            (title as NSString).draw(in: CGRect(x: 0, y: s + 4, width: size.width, height: 14), withAttributes: [
                .font: UIFont.systemFont(ofSize: 10, weight: .semibold), .foregroundColor: color, .paragraphStyle: p,
            ])
        }
        return img.withRenderingMode(.alwaysOriginal)
    }

    private func appearance(_ bar: UITabBar) {
        let a = UITabBarAppearance()
        a.configureWithDefaultBackground()
        bar.standardAppearance = a
        bar.scrollEdgeAppearance = a
        // The site has its own light/dark choice; the bar follows IT, not the phone's setting.
        // Mixed light/dark chrome is the worst option (playbook §11).
        bar.overrideUserInterfaceStyle = style
    }

    private func select() {
        guard let bar = tabBar, let id = activeId, let i = ids.firstIndex(of: id),
              let items = bar.items, i < items.count else { tabBar?.selectedItem = nil; return } // not a tab page → no highlight
        bar.selectedItem = items[i]
    }

    private func applyVisible(animated: Bool) {
        guard let bar = tabBar else { return }
        let hidden = CGAffineTransform(translationX: 0, y: bar.frame.height + 60)
        bar.isUserInteractionEnabled = visible
        if visible { bar.isHidden = false }
        let change = { bar.transform = self.visible ? .identity : hidden; bar.alpha = self.visible ? 1 : 0 }
        guard animated else { change(); bar.isHidden = !visible; return }
        UIView.animate(withDuration: 0.28, delay: 0, options: .curveEaseInOut, animations: change) { _ in
            if !self.visible { bar.isHidden = true } // a show may have raced in
        }
    }

    public func tabBar(_ tabBar: UITabBar, didSelect item: UITabBarItem) {
        guard let i = tabBar.items?.firstIndex(of: item), i < ids.count else { return }
        let id = ids[i]
        // Tapping the tab you are on scrolls to the top: native behaviour the web can't guess.
        notifyListeners("tabSelect", data: ["id": id, "reselected": id == activeId])
        activeId = id
    }

    private static func hex(_ h: String) -> UIColor? {
        var s = h.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6, let v = UInt64(s, radix: 16) else { return nil }
        return UIColor(red: CGFloat((v >> 16) & 0xFF) / 255, green: CGFloat((v >> 8) & 0xFF) / 255,
                       blue: CGFloat(v & 0xFF) / 255, alpha: 1)
    }
}
