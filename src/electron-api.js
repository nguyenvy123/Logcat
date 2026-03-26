function loadElectronMainApi(requireFn = require) {
  try {
    return requireFn('electron/main');
  } catch (error) {
    if (error && error.code !== 'MODULE_NOT_FOUND') {
      throw error;
    }

    return requireFn('electron');
  }
}

module.exports = {
  loadElectronMainApi,
};
