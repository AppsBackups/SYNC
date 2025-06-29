
module.exports = {
  logError: (message, context) => {
    console.error({
      timestamp: new Date().toISOString(),
      message,
      ...context
    });
  }
};