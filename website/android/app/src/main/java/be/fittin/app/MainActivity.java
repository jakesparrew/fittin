package be.fittin.app;

import android.os.Bundle;
import be.fittin.app.plugins.FittinNativePlugin;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        // Local plugins must be registered BEFORE super.onCreate(). Registered after it, JS sees
        // "plugin not implemented" until the next full reload.
        registerPlugin(FittinNativePlugin.class);
        super.onCreate(savedInstanceState);
    }
}
