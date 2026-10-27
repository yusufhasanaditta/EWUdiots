// Inside the Android/iOS app shell, skip the website and open the app.
if (window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform()) location.replace("/app.html");
