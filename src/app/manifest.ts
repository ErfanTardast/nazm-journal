import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

/**
 * PWA web app manifest (Next App Router serves this at /manifest.webmanifest and auto-links it).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: brand.en.tagline,
    short_name: brand.en.name,
    description: "Plan, journal, review, and improve your trading discipline.",
    start_url: "/",
    display: "standalone",
    background_color: "#0b0f17",
    theme_color: "#0b0f17",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-256.png", sizes: "256x256", type: "image/png", purpose: "any" },
      { src: "/icons/icon-384.png", sizes: "384x384", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}
