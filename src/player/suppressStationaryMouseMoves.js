const suppressStationaryMouseMoves = (controls) => {
  const originalHandler = controls.onMouseMove_.bind(controls);
  let hasRecordedCoordinates = false;
  let lastScreenX;
  let lastScreenY;

  return (event) => {
    const hasCoordinates = Number.isFinite(event.screenX) && Number.isFinite(event.screenY);
    if (event.type === 'mousemove' && hasCoordinates) {
      if (hasRecordedCoordinates
        && lastScreenX === event.screenX
        && lastScreenY === event.screenY) return;
      hasRecordedCoordinates = true;
      lastScreenX = event.screenX;
      lastScreenY = event.screenY;
    }
    originalHandler(event);
  };
};

export default suppressStationaryMouseMoves;
