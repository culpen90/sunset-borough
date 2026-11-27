package com.sunsetborough.game;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.ApplicationInfo;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.WindowInsets;
import android.view.WindowInsetsController;
import android.view.WindowManager;
import android.webkit.RenderProcessGoneDetail;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.window.OnBackInvokedDispatcher;

public final class MainActivity extends Activity {
    private WebView game;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        if (Build.VERSION.SDK_INT >= 33) {
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(
                    OnBackInvokedDispatcher.PRIORITY_DEFAULT, this::handleBack);
        }
        openGame();
        enterFullscreen();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void openGame() {
        WebView.setWebContentsDebuggingEnabled(
                (getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0);
        game = new WebView(this);
        game.setBackgroundColor(getColor(R.color.asphalt));
        game.setOverScrollMode(View.OVER_SCROLL_NEVER);
        game.setVerticalScrollBarEnabled(false);
        game.setHorizontalScrollBarEnabled(false);
        WebSettings settings = game.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);

        game.setWebChromeClient(new WebChromeClient());
        game.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view,
                    WebResourceRequest request) {
                return GameAssets.open(getAssets(), request);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !GameAssets.START.equals(request.getUrl().toString());
            }

            @Override
            public boolean onRenderProcessGone(WebView view, RenderProcessGoneDetail detail) {
                setContentView(new View(MainActivity.this));
                view.destroy();
                game = null;
                if (!isFinishing() && !isDestroyed()) {
                    new AlertDialog.Builder(MainActivity.this)
                            .setTitle(R.string.app_name)
                            .setMessage(R.string.renderer_error)
                            .setPositiveButton(R.string.reopen, (dialog, button) -> openGame())
                            .setOnCancelListener(dialog -> finish())
                            .show();
                }
                return true;
            }
        });
        setContentView(game);
        game.loadUrl(GameAssets.START);
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) {
            enterFullscreen();
        }
    }

    @SuppressWarnings("deprecation")
    private void enterFullscreen() {
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsetsController controller = getWindow().getInsetsController();
            if (controller != null) {
                controller.hide(WindowInsets.Type.systemBars());
                controller.setSystemBarsBehavior(
                        WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            getWindow().getDecorView().setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_FULLSCREEN | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                    | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                    | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION);
        }
    }

    @SuppressWarnings("deprecation")
    // API 33 and newer route Back through the dispatcher registered in onCreate.
    @SuppressLint("GestureBackNavigation")
    @Override
    public void onBackPressed() {
        handleBack();
    }

    private void handleBack() {
        if (game == null) {
            finish();
            return;
        }
        game.evaluateJavascript(
                "typeof window.gameBack === 'function' && window.gameBack() !== false",
                handled -> {
                    if (!"true".equals(handled)) {
                        finish();
                    }
                });
    }

    @Override
    protected void onPause() {
        if (game != null) {
            game.evaluateJavascript("window.dispatchEvent(new Event('gamepause'))", null);
            game.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (game != null) {
            game.onResume();
        }
    }

    @Override
    protected void onDestroy() {
        if (game != null) {
            setContentView(new View(this));
            game.destroy();
            game = null;
        }
        super.onDestroy();
    }
}
