"use client";

import { useI18n } from "@/i18n/LocalizationProvider";
export default function LoadingLab() {
  const {
    t
  } = useI18n();
  return <main style={{
    width: 'min(100%, 1000px)',
    margin: '56px auto',
    padding: 32
  }} aria-busy='true'>
    <p>{t("NO WAY / EXPERIMENTS")}</p><h1>{t("AI Question Lab")}</h1><p role='status'>{t("Opening the lab and finding your categories…")}</p>
  </main>;
}
