const jwt = require('jsonwebtoken');
const generateToken = (payload) => {
  try {
    console.log('---------- auth:generateToken ---------');
    console.log(payload);
    const expiresIn = 60 * 60 * 24; // 1 days
    const token = jwt.sign(payload, process.env.JWT_SECRET, {
      expiresIn: expiresIn,
    });

    // console.log(token);
    return token;
  } catch (error) {
    return error;
  }
};

// Web server & rest api - express-jwt built-in
const verifyToken = async (token) => {
  try {
    // console.log('---------- auth:verifyToken ---------')

    if (!token) {
      // winstonLogger.log('error', 'verifyToken: not logged in.');
      return res.status(401).json({
        code: 401,
        message: 'verifyToken: not logged in.',
      });
    }

    // verify and decode token
    const verify_info = jwt.verify(
      token,
      process.env.JWT_SECRET,
      (err, decoded) => {
        if (err) {
          // winstonLogger.log('error', err);
          return {
            code: 403,
            message: 'verifyToken: error = ' + err,
          };
        } else {
          console.log(decoded);

          // winstonLogger.log('info', 'auth:verifyToken: logged in. decoded = %s', JSON.stringify(decoded));
          return info;
        }
      },
    );
    return verify_info;
  } catch (error) {
    // winstonLogger.log('error', error);
  }
};

module.exports = {
  // -------------------------------------------------
  // Web server - Rest api
  // -------------------------------------------------

  generateToken: generateToken,
  verifyToken: verifyToken,
};
