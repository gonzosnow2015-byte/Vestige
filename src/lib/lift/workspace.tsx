import { createContext, useContext, type ReactNode } from "react";
import type { Workspace } from "@/lib/lift/types";

type WorkspaceStore = {
  workspace: Workspace;
  setWorkspace: (workspace: Workspace) => void;
  requestSwitch: () => void;
};

const WorkspaceContext = createContext<WorkspaceStore | null>(null);

export function WorkspaceProvider({
  workspace,
  setWorkspace,
  requestSwitch,
  children,
}: {
  workspace: Workspace;
  setWorkspace: (workspace: Workspace) => void;
  requestSwitch: () => void;
  children: ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={{ workspace, setWorkspace, requestSwitch }}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace(): Workspace {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace is missing.");
  return value.workspace;
}

export function useSetWorkspace(): (workspace: Workspace) => void {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace is missing.");
  return value.setWorkspace;
}

export function useRequestSwitch(): () => void {
  const value = useContext(WorkspaceContext);
  if (!value) throw new Error("Workspace is missing.");
  return value.requestSwitch;
}
