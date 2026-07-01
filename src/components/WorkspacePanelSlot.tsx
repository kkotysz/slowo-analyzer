import type { ReactNode } from "react";
import type { MobileWorkspaceView } from "../types/wordle";

interface WorkspacePanelSlotProps {
  activeView: MobileWorkspaceView;
  children: ReactNode;
  compact: boolean;
  order: number;
  view: MobileWorkspaceView;
}

export function WorkspacePanelSlot({
  activeView,
  children,
  compact,
  order,
  view,
}: WorkspacePanelSlotProps) {
  return (
    <div
      className="workspace-panel-slot"
      data-mobile-order={order}
      data-mobile-view={view}
      hidden={compact && activeView !== view}
    >
      {children}
    </div>
  );
}
