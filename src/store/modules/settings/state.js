// All of these settings are stored in localStorage and are persistent across reloads
const state = () => ({
  autoplay: null,
  advancedPartyMode: false,
  showBufferingNotifications: true,
  clientPollInterval: null,
  syncMode: null,
  syncFlexibility: null,
  customServerUrl: 'https://',
  slPlayerQuality: null,
  slPlayerVolume: null,
  slPlayerForceTranscode: null,
  altUsername: null,
  autoSkipIntro: null,
});

export default state;
