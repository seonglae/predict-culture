import type { Metadata } from "next";
import { Inter } from "next/font/google";
import localFont from "next/font/local";
import { ConvexClientProvider } from "./ConvexClientProvider";
import ThemeProvider from "@/components/ThemeProvider";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

const nasalization = localFont({
  src: "../../public/fonts/nasalization-rg.otf",
  variable: "--font-display",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Predict Chaos",
  description:
    "Watch AI cultures clash. Predict which belief dominates. A culture propagation simulation powered by Mistral AI.",
  openGraph: {
    title: "Predict Chaos",
    description: "Watch. Predict. Propagate.",
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
      <body className={`${inter.variable} ${nasalization.variable} font-sans antialiased bg-background text-foreground`}>
        <ThemeProvider>
          <ConvexClientProvider>{children}</ConvexClientProvider>
          <Toaster theme="dark" position="top-center" richColors />
        </ThemeProvider>
      </body>
    </html>
  );
}
