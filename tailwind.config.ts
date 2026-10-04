import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  // Only the app's own files. A test that names a class in a sentence (for example "max-[Npx]:sr-only") is read by
  // Tailwind as that class, and its unit "Npx" made `next dev` warn about mixed screen units on the first request.
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        card: "hsl(var(--card))",
        "card-foreground": "hsl(var(--card-foreground))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        destructive: "hsl(var(--destructive))",
        success: "hsl(var(--success))",
        warning: "hsl(var(--warning))"
      },
      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px"
      },
      fontFamily: {
        sans: ["var(--font-sans)", "Inter", "Tahoma", "Arial", "sans-serif"]
      }
    }
  },
  plugins: []
};

export default config;

