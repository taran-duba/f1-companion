import type { Metadata, Viewport } from "next";
import { Fira_Code, Space_Grotesk } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { StreamProvider } from "@/lib/store";
import { SelectionProvider } from "@/lib/selection";
import "./globals.css";

// UI font. Swap the family here; the variable name keeps everything else unchanged.
const uiFont = Space_Grotesk({
  variable: "--font-ui",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const firaCode = Fira_Code({
  variable: "--font-fira-code",
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "F1 Companion",
  description: "Personal live timing companion for race day",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0e0b0d",
  colorScheme: "dark",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${uiFont.variable} ${firaCode.variable}`}>
      <body>
        <StreamProvider>
          <SelectionProvider>
            <AppShell>{children}</AppShell>
          </SelectionProvider>
        </StreamProvider>
      </body>
    </html>
  );
}
