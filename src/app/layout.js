import { Fredoka, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import LayoutHeader from "@/components/LayoutHeader";
import ThemeProvider from "@/components/ThemeProvider";
import ToastProvider from "@/components/ToastProvider";
import ToastShelf from "@/components/ToastShelf";

const fredoka = Fredoka({
	variable: "--font-fredoka",
	subsets: ["latin"],
	display: "swap",
});

const plusJakartaSans = Plus_Jakarta_Sans({
	variable: "--font-plus-jakarta-sans",
	subsets: ["latin"],
	display: "swap",
});

export const metadata = {
	title: "No Way — Party Trivia",
	description:
		"Guess big, challenge your friends, and call NO WAY! A social trivia game about wild numerical facts.",
};

export default function RootLayout({ children }) {
	return (
		<ThemeProvider>
			<ToastProvider>
				<html
					lang='en'
					data-theme='dark'
					className={`${fredoka.variable} ${plusJakartaSans.variable}`}
				>
					<body>
						<LayoutHeader />
						{children}
						<div id='toast-root'></div>
						<ToastShelf />
					</body>
				</html>
			</ToastProvider>
		</ThemeProvider>
	);
}
