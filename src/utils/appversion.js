import packageInfo from '../../package.json';

const getAppVersion = (value = import.meta.env.VITE_APP_VERSION) => (
  typeof value === 'string' && value.trim() ? value.trim() : packageInfo.version
);

export default getAppVersion;
