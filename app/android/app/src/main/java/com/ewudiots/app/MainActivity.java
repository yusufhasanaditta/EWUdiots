package com.ewudiots.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class); // in-app update (download the new APK, open the installer)
        registerPlugin(PortalSyncPlugin.class); // sign in to the EWU portal on the phone and read academic pages
        super.onCreate(savedInstanceState);
    }
}
