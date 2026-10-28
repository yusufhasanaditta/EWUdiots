package com.ewudiots.app;

import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(ApkUpdaterPlugin.class); // in-app update (download the new APK, open the installer)
        super.onCreate(savedInstanceState);
    }
}
