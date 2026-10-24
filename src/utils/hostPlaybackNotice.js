// Server visibility is account-specific; absence is not evidence that the host stopped.
export default (host, server, enabled = true) => {
  if (!host?.media || host.state === 'stopped') {
    return {
      title: 'No movie is playing in this room',
      text: 'There’s no host playback to restore. Pick a movie below, or wait for your host to start one.',
    };
  }
  if (!server) {
    return {
      title: 'Host movie isn’t available to your Plex account',
      text: 'Your Plex account does not list the server playing the host’s movie. '
        + 'Ask the server owner to share the movie’s library with you, then refresh your Plex servers and try again. '
        + 'A matching copy on another shared server can also be used.',
    };
  }
  if (!enabled) {
    return {
      title: 'The host’s Plex server is hidden',
      text: 'Enable this server’s libraries below, then try syncing again.',
    };
  }
  if (!server.chosenConnection) {
    return {
      title: 'Can’t reach the host’s Plex server',
      text: 'The host is watching a movie, but your browser cannot reach its server. '
        + 'Refresh your Plex servers and check the connection.',
    };
  }
  return {
    title: 'Host movie couldn’t be opened',
    text: 'The host is watching a movie, but no playable copy was found for you. '
      + 'Ask the server owner to check your library access, or try a matching copy on another shared server.',
  };
};
