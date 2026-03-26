function registerSingleInstance(app, { focusMainWindow }) {
  const locked = app.requestSingleInstanceLock();

  if (!locked) {
    app.quit();
    return false;
  }

  app.on('second-instance', () => {
    focusMainWindow();
  });

  return true;
}

module.exports = {
  registerSingleInstance,
};
