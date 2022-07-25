class ErrorHandler extends Error {
  constructor(statusCode, message, errors, res) {
    super();
    handleError({statusCode, message, errors}, res);
  }
}
const handleError = (err, res) => {
  const { statusCode, message, errors } = err;
  res.status(statusCode || 500).json({
    status: "error",
    statusCode,
    message,
    errors
  });
};

module.exports = {
  ErrorHandler,
  handleError
};
