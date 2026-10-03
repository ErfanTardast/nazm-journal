import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  allowedDevOrigins: ["localhost", "127.0.0.1"],
  async headers() {
    const security = [
      { key: "X-Content-Type-Options", value: "nosniff" },
      { key: "X-Frame-Options", value: "DENY" },
      { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
      { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
      // HTTPS-only once deployed; browsers ignore it over plain http, but keep local dev clean.
      ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : [])
    ];
    return [
      { source: "/:path*", headers: security },
      // Files under /public are served with `max-age=0`, so the 111 KB Persian font was revalidated on every page
      // load. Font files carry a version in their name (Vazirmatn-Variable.v1.woff2): a changed font is a new file,
      // so these can be cached for a year. Matching rules are merged, so the security headers above still apply.
      { source: "/fonts/:path*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] }
    ];
  }
};

export default nextConfig;
