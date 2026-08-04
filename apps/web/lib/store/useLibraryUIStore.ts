import { create } from "zustand";

interface LibraryUIState {
  sidebarOpen: boolean;
  composerOpen: boolean;
  colorSearchHex: string | null;
  setSidebarOpen: (sidebarOpen: boolean) => void;
  toggleSidebar: () => void;
  setComposerOpen: (composerOpen: boolean) => void;
  toggleComposer: () => void;
  setColorSearchHex: (colorSearchHex: string | null) => void;
}

export const useLibraryUIStore = create<LibraryUIState>((set) => ({
  sidebarOpen: false,
  composerOpen: false,
  colorSearchHex: null,
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),
  setComposerOpen: (composerOpen) => set({ composerOpen }),
  toggleComposer: () =>
    set((state) => ({ composerOpen: !state.composerOpen })),
  setColorSearchHex: (colorSearchHex) => set({ colorSearchHex }),
}));
