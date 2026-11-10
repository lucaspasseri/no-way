"use client";
import React from "react";

export const ThemeContext = React.createContext();

function ThemeProvider({ children }) {
	const [theme, setTheme] = React.useState("dark");

	React.useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	function toggleTheme() {
		setTheme(prev => (prev === "dark" ? "light" : "dark"));
	}

	return (
		<ThemeContext.Provider value={{ theme, toggleTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export default ThemeProvider;
