"use client";

import { useContext } from "react";
import { Moon, Sun } from "react-feather";
import { ThemeContext } from "../ThemeProvider";
import styles from "./ToggleTheme.module.css";

export default function ToggleTheme() {
  const { theme, toggleTheme } = useContext(ThemeContext);
  const label = "Switch to " + (theme === "light" ? "dark" : "light") + " mode";
  return (
    <button className={styles.button} onClick={toggleTheme} aria-label={label} title={label} aria-pressed={theme === "dark"}>
      {theme === "light" ? <Moon size={17} aria-hidden='true' /> : <Sun size={17} aria-hidden='true' />}
      <span>Theme</span>
    </button>
  );
}
