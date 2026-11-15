import { requestLocalization, hasSavedUnitSystem } from '@/i18n/server.mjs';
import { LocalizationProvider } from '@/i18n/LocalizationProvider';
import { Fredoka, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import { GameSessions } from "@/features/game/GameSessions";

const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], display: "swap" });
const plusJakartaSans = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta-sans", subsets: ["latin"], display: "swap" });

// The document language and provider must share the request cookie before the
// first render. This root intentionally waits for preferences to avoid a flash.
export const instant = false;

export const metadata = {
  title: "No Way — Party Trivia",
  description: "Explore numerical trivia, submit increasing guesses, and follow the round ladder.",
};

export default async function RootLayout({ children }) {
  const preferences = await requestLocalization();
  return (
    <html lang={preferences.locale} data-theme='light' className={fredoka.variable + ' ' + plusJakartaSans.variable}>
      <body>
        <ThemeProvider>
          <LocalizationProvider initial={preferences} initialUnitExplicit={await hasSavedUnitSystem()}><GameSessions>{children}</GameSessions></LocalizationProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
