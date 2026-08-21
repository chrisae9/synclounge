const suppressStationaryMouseMoves = (controls) => {
  const originalHandler = controls.onMouseMove_.bind(controls);
  const originalMouseLeaveHandler = typeof controls.onMouseLeave_ === 'function'
    ? controls.onMouseLeave_.bind(controls)
    : null;
  let hasRecordedCoordinates = false;
  let lastScreenX;
  let lastScreenY;

  const mouseLeaveHandler = originalMouseLeaveHandler
    ? (...args) => {
      hasRecordedCoordinates = false;
      return originalMouseLeaveHandler(...args);
    }
    : null;

  const mouseMoveHandler = (event) => {
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

  return { mouseMoveHandler, mouseLeaveHandler };
};

export default suppressStationaryMouseMoves;
