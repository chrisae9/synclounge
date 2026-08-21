import nconf from 'nconf';
import defaults from './defaults';

const get = () => {
  const provider = new nconf.Provider();

  provider
    .argv({
      separator: '__',
      parseValues: true,
    })
    .env({
      separator: '__',
      lowerCase: true,
      parseValues: true,
    })
    .defaults({ ...defaults });

  return provider.get();
};

export default get;
