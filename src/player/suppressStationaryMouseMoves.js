// Filter at the DOM boundary: private Shaka control methods are renamed in
// production builds and must not be patched by name.
const suppressStationaryMouseMoves = (container) => {
  let hasRecordedCoordinates = false;
  let lastScreenX;
  let lastScreenY;
  const mouseLeaveHandler = () => { hasRecordedCoordinates = false; };
  const mouseMoveHandler = (event) => {
    if (!Number.isFinite(event.screenX) || !Number.isFinite(event.screenY)) return;
    if (hasRecordedCoordinates && lastScreenX === event.screenX && lastScreenY === event.screenY) {
      event.stopImmediatePropagation();
      return;
    }
    hasRecordedCoordinates = true;
    lastScreenX = event.screenX;
    lastScreenY = event.screenY;
  };
  container.addEventListener('mousemove', mouseMoveHandler, true);
  container.addEventListener('mouseleave', mouseLeaveHandler, true);
  return () => {
    container.removeEventListener('mousemove', mouseMoveHandler, true);
    container.removeEventListener('mouseleave', mouseLeaveHandler, true);
  };
};

export default suppressStationaryMouseMoves;
