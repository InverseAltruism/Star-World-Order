export const cameraState = {
  viewX: 0,
  viewY: 0,
  zoom: 2,
  localPlayerX: 0,
  localPlayerY: 0,
};

export function worldToScreen(worldX: number, worldY: number): { x: number; y: number } {
  return {
    x: (worldX - cameraState.viewX) * cameraState.zoom,
    y: (worldY - cameraState.viewY) * cameraState.zoom,
  };
}
