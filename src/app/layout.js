import { Fredoka, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import ThemeProvider from "@/components/ThemeProvider";
import { GameSessions } from "@/features/game/GameSessions";

const fredoka = Fredoka({ variable: "--font-fredoka", subsets: ["latin"], display: "swap" });
const plusJakartaSans = Plus_Jakarta_Sans({ variable: "--font-plus-jakarta-sans", subsets: ["latin"], display: "swap" });

export const metadata = {
  title: "No Way — Party Trivia",
  description: "Explore numerical trivia, submit increasing guesses, and follow the round ladder.",
};

export default function RootLayout({ children }) {
  return (
    <html lang='en' data-theme='light' className={fredoka.variable + ' ' + plusJakartaSans.variable}>
      <body>
        <ThemeProvider>
          <GameSessions>{children}</GameSessions>
        </ThemeProvider>
      </body>
    </html>
  );
}
