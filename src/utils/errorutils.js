const mapErrorMessage = (error) => {
  const message = error?.message || '';

  if ((error?.name === 'TypeError' && message.includes('Failed to fetch'))
    || message.includes('NetworkError')
    || message.includes('Network request failed')) {
    return 'Unable to connect. Check your internet connection.';
  }

  if (message.includes('timeout') || error?.name === 'TimeoutError') {
    return 'The request timed out. Please try again.';
  }

  const status = error?.response?.status || error?.status;
  if (status === 401 || status === 403
    || message.includes('Unauthorized') || message.includes('Forbidden')) {
    return 'Authentication failed. Please sign in again.';
  }

  return 'Something went wrong. Please try again.';
};

export default mapErrorMessage;
