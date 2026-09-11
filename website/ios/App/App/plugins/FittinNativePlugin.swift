import AuthenticationServices
import Capacitor
import UIKit
import UserNotifications

/// The app's own small plugin: what this binary can do, native sign-in, and native chrome.
/// JS side: lib/native/fittinNative.js. The site deploys independently of this binary, so it asks
/// `capabilities()` before relying on anything here.
@objc(FittinNativePlugin)
public class FittinNativePlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding,
    ASAuthorizationControllerDelegate, ASAuthorizationControllerPresentationContextProviding {
    public let identifier = "FittinNativePlugin"
    public let jsName = "FittinNative"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "capabilities", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "webAuth", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "appleSignIn", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setInterfaceStyle", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "clearBadge", returnType: CAPPluginReturnPromise),
    ]

    // ASWebAuthenticationSession must be retained for as long as it is on screen.
    private var authSession: ASWebAuthenticationSession?
    private var appleCall: CAPPluginCall?

    @objc func capabilities(_ call: CAPPluginCall) {
        #if DEBUG
        let apns = "development" // Xcode debug builds get sandbox APNs tokens
        #else
        let apns = "production" // TestFlight + App Store
        #endif
        call.resolve([
            "push": true,
            "apnsEnvironment": apns,
            "webAuth": true,
            "appleSignIn": true,
            "build": Bundle.main.object(forInfoDictionaryKey: "CFBundleVersion") as? String ?? "0",
        ])
    }

    // MARK: Google (and any OAuth) — ASWebAuthenticationSession

    /// Google refuses OAuth in embedded webviews. This system sheet shares Safari's cookies (so an
    /// already signed-in Google account is one tap), and returns the callback URL straight to JS.
    @objc func webAuth(_ call: CAPPluginCall) {
        guard let raw = call.getString("url"), let url = URL(string: raw),
              let scheme = call.getString("callbackScheme") else {
            call.reject("url and callbackScheme are required")
            return
        }
        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { callbackURL, error in
                self.authSession = nil
                if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("Aanmelden geannuleerd", "canceled")
                } else if let error = error {
                    call.reject(error.localizedDescription, "failed", error)
                } else if let callbackURL = callbackURL {
                    call.resolve(["url": callbackURL.absoluteString])
                } else {
                    call.reject("Geen antwoord ontvangen", "failed")
                }
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.authSession = session
            if !session.start() { self.authSession = nil; call.reject("Kon het aanmeldvenster niet openen", "failed") }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    // MARK: Sign in with Apple

    @objc func appleSignIn(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            self.appleCall = call
            let request = ASAuthorizationAppleIDProvider().createRequest()
            request.requestedScopes = [.fullName, .email]
            if let nonce = call.getString("nonce") { request.nonce = nonce } // SHA-256 of the raw nonce
            let controller = ASAuthorizationController(authorizationRequests: [request])
            controller.delegate = self
            controller.presentationContextProvider = self
            controller.performRequests()
        }
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithAuthorization authorization: ASAuthorization) {
        guard let call = appleCall else { return }
        appleCall = nil
        guard let cred = authorization.credential as? ASAuthorizationAppleIDCredential,
              let tokenData = cred.identityToken, let token = String(data: tokenData, encoding: .utf8) else {
            call.reject("Apple gaf geen identiteitsbewijs terug", "failed")
            return
        }
        // Name and e-mail come ONLY on the first authorisation; JS persists them right away.
        call.resolve([
            "identityToken": token,
            "user": cred.user,
            "givenName": cred.fullName?.givenName ?? "",
            "familyName": cred.fullName?.familyName ?? "",
            "email": cred.email ?? "",
        ])
    }

    public func authorizationController(controller: ASAuthorizationController, didCompleteWithError error: Error) {
        guard let call = appleCall else { return }
        appleCall = nil
        if let e = error as? ASAuthorizationError, e.code == .canceled {
            call.reject("Aanmelden geannuleerd", "canceled")
        } else {
            call.reject(error.localizedDescription, "failed", error)
        }
    }

    public func presentationAnchor(for controller: ASAuthorizationController) -> ASPresentationAnchor {
        bridge?.viewController?.view.window ?? ASPresentationAnchor()
    }

    // MARK: Chrome

    /// The site has its own theme choice (licht / donker / systeem). Native alerts, share sheets and
    /// the keyboard follow the SITE, so light pages never get a dark alert and vice versa.
    @objc func setInterfaceStyle(_ call: CAPPluginCall) {
        let style: UIUserInterfaceStyle = call.getString("style") == "dark" ? .dark : .light
        DispatchQueue.main.async {
            self.bridge?.viewController?.view.window?.overrideUserInterfaceStyle = style
            call.resolve()
        }
    }

    @objc func clearBadge(_ call: CAPPluginCall) {
        DispatchQueue.main.async {
            if #available(iOS 16.0, *) {
                UNUserNotificationCenter.current().setBadgeCount(0)
            } else {
                UIApplication.shared.applicationIconBadgeNumber = 0
            }
            call.resolve()
        }
    }
}
