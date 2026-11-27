package com.sunsetborough.game;

import android.content.res.AssetManager;
import android.net.Uri;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.net.URLConnection;
import java.util.Collections;
import java.util.List;
import java.util.Locale;

/** Serves the packaged game under one HTTPS origin so modules and saves work offline. */
final class GameAssets {
    private static final String HOST = "appassets.androidplatform.net";
    static final String START = "https://" + HOST + "/game/index.html";

    private GameAssets() {}

    static WebResourceResponse open(AssetManager assets, WebResourceRequest request) {
        Uri url = request.getUrl();
        if (!"GET".equals(request.getMethod())
                || !"https".equals(url.getScheme()) || !HOST.equals(url.getAuthority())) {
            return missing();
        }

        List<String> parts = url.getPathSegments();
        if (parts.size() < 2 || !"game".equals(parts.get(0))) {
            return missing();
        }
        for (String part : parts) {
            if (part.equals(".") || part.equals("..") || part.contains("/") || part.contains("\\")
                    || part.indexOf('\0') >= 0) {
                return missing();
            }
        }

        String path = String.join("/", parts);
        String mime = mimeType(path);
        try {
            return new WebResourceResponse(mime, mime.startsWith("text/") ? "UTF-8" : null,
                    200, "OK", Collections.singletonMap("X-Content-Type-Options", "nosniff"),
                    assets.open(path, AssetManager.ACCESS_STREAMING));
        } catch (IOException missingAsset) {
            return missing();
        }
    }

    private static String mimeType(String path) {
        String extension = path.substring(path.lastIndexOf('.') + 1).toLowerCase(Locale.ROOT);
        switch (extension) {
            case "js":
            case "mjs":
                return "text/javascript";
            case "css":
                return "text/css";
            case "html":
                return "text/html";
            case "svg":
                return "image/svg+xml";
            case "webp":
                return "image/webp";
            case "woff2":
                return "font/woff2";
            case "woff":
                return "font/woff";
            case "ttf":
                return "font/ttf";
            case "json":
                return "application/json";
            case "wasm":
                return "application/wasm";
            default:
                String guessed = URLConnection.guessContentTypeFromName(path);
                return guessed != null ? guessed : "application/octet-stream";
        }
    }

    private static WebResourceResponse missing() {
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found",
                Collections.emptyMap(), new ByteArrayInputStream(new byte[0]));
    }
}
