"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
import { useContext } from "react";
import { Moon, Sun } from "react-feather";
import { ThemeContext } from "../ThemeProvider";
import styles from "./ToggleTheme.module.css";
export default function ToggleTheme() {
  const {
    t
  } = useI18n();
  const {
    theme,
    toggleTheme
  } = useContext(ThemeContext);
  const label = t(theme === "light" ? "Switch to dark mode" : "Switch to light mode");
  return <button className={styles.button} onClick={toggleTheme} aria-label={label} title={label} aria-pressed={theme === "dark"}>
      {theme === "light" ? <Moon size={17} aria-hidden='true' /> : <Sun size={17} aria-hidden='true' />}
      <span>{t("Theme")}</span>
    </button>;
}
