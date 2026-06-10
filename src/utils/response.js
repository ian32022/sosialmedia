const success = (res, data = null, message = 'Berhasil', statusCode = 200) => {
  return res.status(statusCode).json({
    success: true,
    message,
    data,
  });
};

const error = (res, message = 'Terjadi kesalahan', statusCode = 500, errors = null) => {
  const body = { success: false, message };
  if (errors) body.errors = errors;
  return res.status(statusCode).json(body);
};

const paginate = (res, data, meta, message = 'Berhasil') => {
  return res.status(200).json({
    success: true,
    message,
    data,
    meta,
  });
};

module.exports = { success, error, paginate };
