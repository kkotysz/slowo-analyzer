export const APP_TABS = [
  { id: "analysis", label: "Analiza" },
  { id: "dictionary", label: "Słownik" },
] as const;

export type AppTab = (typeof APP_TABS)[number]["id"];
