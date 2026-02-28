import type { Metadata } from "next";
import { Inter, Staatliches } from "next/font/google";
import { ConvexClientProvider } from "./ConvexClientProvider";
import ThemeProvider from "@/components/ThemeProvider";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const staatliches = Staatliches({
  subsets: ["latin"],
  variable: "--font-display",
  weight: "400",
});

export const metadata: Metadata = {
  title: "SentinelDrive",
  description:
    "Observe traffic. Predict collisions. Beat the AI. A competitive 3D prediction arena.",
  openGraph: {
    title: "SentinelDrive",
    description: "Observe. Predict. Collapse.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Anti-flash: apply dark class before paint */}
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){var t=localStorage.getItem("sd-theme");if(t==="dark"||!t)document.documentElement.classList.add("dark")})()`,
          }}
        />
      </head>
      <body className={`${inter.variable} ${staatliches.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
