const { InstagramProvider } = require('./instagram');
const { FacebookProvider } = require('./facebook');

const PROVIDERS = {
  instagram: new InstagramProvider(),
  facebook: new FacebookProvider()
};

const PLATAFORMAS = Object.keys(PROVIDERS);

function getProvider(name) {
  const provider = PROVIDERS[name];
  if (!provider) throw Object.assign(new Error(`Plataforma no soportada: ${name}`), { statusCode: 400 });
  return provider;
}

function getProviders(names) {
  return names.map(getProvider);
}

module.exports = { getProvider, getProviders, PLATAFORMAS };
