/* global shaka */
shaka.polyfill.installAll();
const video = document.getElementById('video');
const player = new shaka.Player();
player.attach(video).then(() => {
  // CastReceiver starts itself and retains the Cast message-bus listeners.
  new shaka.cast.CastReceiver(video, player);
});
