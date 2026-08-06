const suppressStationaryMouseMoves = (controls) => {
  const originalHandler = controls.onMouseMove_.bind(controls);
  let lastScreenX;
  let lastScreenY;

  return (event) => {
    if (event.type === 'mousemove') {
      if (lastScreenX === event.screenX && lastScreenY === event.screenY) return;
      lastScreenX = event.screenX;
      lastScreenY = event.screenY;
    }
    originalHandler(event);
  };
};

export default suppressStationaryMouseMoves;
