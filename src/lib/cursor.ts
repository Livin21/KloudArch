import { create } from "zustand";

/**
 * Transient drafting readout (cursor position in flow coordinates + zoom).
 * Kept outside the design store so high-frequency updates only re-render
 * the status bar readout.
 */
type CursorState = {
  x: number;
  y: number;
  zoom: number;
  setPosition: (x: number, y: number) => void;
  setZoom: (zoom: number) => void;
};

export const useCursorStore = create<CursorState>((set) => ({
  x: 0,
  y: 0,
  zoom: 1,
  setPosition: (x, y) => set({ x, y }),
  setZoom: (zoom) => set({ zoom }),
}));
