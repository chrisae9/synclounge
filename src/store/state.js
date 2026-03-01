import { detect } from 'detect-browser';

const state = () => ({
  version: import.meta.env.VITE_APP_VERSION,

  background: null,
  configuration: null,

  isLeftSidebarOpen: false,
  isRightSidebarOpen: true,

  // This stores the postplay data and controls whether the upnext component is visible
  upNextPostPlayData: null,

  // Used to help with the crumbs
  activeMetadata: null,

  snackbarMessage: {},
  snackbarOpen: false,
  navigateToPlayer: false,
  browser: detect(),
  navigateHome: false,
  isLibraryListView: false,
});

export default state;
