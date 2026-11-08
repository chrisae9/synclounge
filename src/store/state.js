import { detect } from 'detect-browser';
import getAppVersion from '@/utils/appversion';

const state = () => ({
  version: getAppVersion(),

  background: null,
  configuration: null,

  isLeftSidebarOpen: false,
  isRightSidebarOpen: false,

  // This stores the postplay data and controls whether the upnext component is visible
  upNextPostPlayData: null,

  // Used to help with the crumbs
  activeMetadata: null,

  snackbarMessage: {},
  snackbarOpen: false,
  navigateToPlayer: false,
  browser: detect(),
  navigateHome: false,
  navigateSignIn: false,
  isLibraryListView: false,
});

export default state;
