import type { Metadata, Viewport } from "next";
import { Fira_Code, Space_Grotesk } from "next/font/google";
import { AppShell } from "@/components/AppShell";
import { StreamProvider } from "@/lib/store";
import { SelectionProvider } from "@/lib/selection";
import { ArtProvider } from "@/lib/art/useArt";
import { PrefsProvider } from "@/lib/prefs";
import { THEME_BOOT_SCRIPT, ThemeProvider } from "@/lib/theme/useTheme";
import { UiProvider } from "@/lib/ui";
import { WorkspaceProvider } from "@/lib/useWorkspace";
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
  themeColor: "#0a0b0d",
  colorScheme: "dark light",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // The boot script sets the saved theme's variables on <html> before hydration.
    <html lang="en" className={`${uiFont.variable} ${firaCode.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body>
        <PrefsProvider>
          <ThemeProvider>
            <StreamProvider>
              <SelectionProvider>
                <UiProvider>
                  <WorkspaceProvider>
                    <ArtProvider>
                      <AppShell>{children}</AppShell>
                    </ArtProvider>
                  </WorkspaceProvider>
                </UiProvider>
              </SelectionProvider>
            </StreamProvider>
          </ThemeProvider>
        </PrefsProvider>
      </body>
    </html>
  );
}
