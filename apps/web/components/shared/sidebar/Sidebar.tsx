import { useTranslation } from "@/lib/i18n/server";
import { api } from "@/server/api/client";
import { TFunction } from "i18next";

import SidebarShell from "@/components/library/SidebarShell";

import { TSidebarItem } from "./TSidebarItem";

export default async function Sidebar({
  items,
  extraSections,
}: {
  items: (t: TFunction) => TSidebarItem[];
  extraSections?: React.ReactNode;
}) {
  // oxlint-disable-next-line rules-of-hooks
  const { t } = await useTranslation();
  const userSettings = await api.users.settings();

  return (
    <SidebarShell
      items={items(t)}
      extraSections={extraSections}
      userSettings={userSettings}
    />
  );
}
