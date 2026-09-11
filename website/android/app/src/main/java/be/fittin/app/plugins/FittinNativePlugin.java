package be.fittin.app.plugins;

import android.content.pm.PackageInfo;
import androidx.core.content.pm.PackageInfoCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * The app's own small plugin (JS: lib/native/fittinNative.js). Mirrors the iOS one.
 *
 * <p>The site deploys independently of this binary, so it asks capabilities() before relying on
 * anything native. "push" is the important one: registering for push without Firebase config
 * crashes the app instead of failing politely, so it is only true when google-services.json was
 * part of the build (the google-services Gradle plugin generates the google_app_id string).
 */
@CapacitorPlugin(name = "FittinNative")
public class FittinNativePlugin extends Plugin {

    @PluginMethod
    public void capabilities(PluginCall call) {
        JSObject r = new JSObject();
        int firebase = getContext().getResources().getIdentifier("google_app_id", "string", getContext().getPackageName());
        r.put("push", firebase != 0);
        r.put("webAuth", false); // Android uses a Custom Tab + app link instead
        r.put("appleSignIn", false); // not offered on Android
        r.put("build", String.valueOf(versionCode()));
        call.resolve(r);
    }

    /** Status/navigation bar icons already follow the page via the StatusBar plugin. */
    @PluginMethod
    public void setInterfaceStyle(PluginCall call) {
        call.resolve();
    }

    /** Android has no app icon badge number to reset. */
    @PluginMethod
    public void clearBadge(PluginCall call) {
        call.resolve();
    }

    private long versionCode() {
        try {
            PackageInfo pi = getContext().getPackageManager().getPackageInfo(getContext().getPackageName(), 0);
            return PackageInfoCompat.getLongVersionCode(pi);
        } catch (Exception e) {
            return 0;
        }
    }
}
