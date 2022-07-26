let express = require('express');
let router = express.Router();
const jwt = require('../../lib/jwt-util');
const redisClient = require('../../lib/redis');
const refresh = require('../../lib/refresh');
const token = require('../../lib/token');
const _ = require('lodash');
let bcrypt = require('bcrypt-nodejs');
const authMiddleware = require('../../middlewares/auth');
const helper = require('../../lib/helpers');
const request = require('request-promise-native');
const winston = require('winston');
const logger = winston.createLogger();
const qs = require('qs');
const fetch = require('node-fetch');

const authJwt = require('../../middlewares/auth');

class Kakao {
  constructor(code) {
    this.url = 'https://kauth.kakao.com/oauth/token';
    this.clientID = process.env.KAKAO_CLIENT_ID;
    this.clientSecret = process.env.KAKAO_CLIENT_SECRET;
    this.redirectUri = 'http://localhost:3031/oauth/kakao';
    this.code = code;
    // userInfo
    this.userInfoUrl = 'https://kapi.kakao.com/v2/user/me';
    this.userInfoMethod = 'post';
  }
}

class Google {
  constructor(code) {
    this.url = 'https://oauth2.googleapis.com/token';
    this.clientID = process.env.GOOGLE_CLIENT_ID;
    this.clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    this.redirectUri = 'http://localhost:3001/oauth/callback/google';
    this.grant_type = 'authorization_code';
    this.code = code;
    // userInfo
    this.userInfoUrl = '';
    this.userInfoMethod = 'get';
  }
}

class Naver {
  constructor(code) {
    this.url = '';
    this.clientID = process.env.NAVER_CLIENT_ID;
    this.clientSecret = process.env.NAVER_CLIENT_SECRET;
    this.redirectUri = 'http://localhost:3001/oauth/callback/naver';
    this.grant_type = 'authorization_code';
    this.code = code;
    // userInfo
    this.userInfoUrl = 'https://openapi.naver.com/v1/nid/me';
    this.userInfoMethod = 'get';
  }
}
// /    GET /api/auth/check
// const check = (req, res) => {
//   console.log('check in');
//   res.json({
//     success: true,
//     info: req.decoded
//   });
// };
// router.use('/check', authMiddleware);
// router.get('/check', check);
bcryptCheck = async (password, rows) => {
  try {
    const jwtToken = await helper.bcryptCompare(password, rows);
    return jwtToken;
  } catch (e) {
    console.error(e);
  }
};

const getAccessToken = async (options) => {
  try {
    return await fetch(options.url, {
      method: 'POST',
      headers: {
        'content-type': 'application/x-www-form-urlencoded;charset=utf-8',
      },
      body: qs.stringify({
        grant_type: 'authorization_code', //특정 스트링
        client_id: options.clientID,
        client_secret: options.clientSecret,
        redirectUri: options.redirectUri,
        redirect_uri: options.redirectUri,
        code: options.code,
      }),
    }).then((res) => res.json());
  } catch (e) {
    logger.info('error', e);
  }
};

//

// authorization: `token ${accessToken}`,
// accept: 'application/json'
const getUserInfo = async (method, url, access_token) => {
  try {
    return await fetch(url, {
      method: method,
      headers: {
        'Content-type': 'application/x-www-form-urlencoded;charset=utf-8',
        Authorization: `Bearer ${access_token}`,
      },
    }).then((res) => {
      console.log(res);
      return res.json();
    });
  } catch (e) {
    logger.info('error', e);
  }
};

/* 소셜 로그인시 
 1. 소셜 로그인시 가입이 되어있는지 확인
 1-1. 가입이 되어있다면 가입 이메일로 로그인
 1-2. 가입이 안되어있다면 가입시켜주고 로그인 시켜주기  
*/
router.get('/callback/:coperation', async (req, res) => {
  try {
    let coperation = req.params.coperation;
    let authorization_code = req.query.code;
    let options;

    switch (coperation) {
      case 'google':
        options = new Google(authorization_code);
        break;

      case 'naver':
        options = new Naver(authorization_code);
        break;

      case 'kakao':
        options = new Kakao(authorization_code);
        break;

      case 'apple':
        break;

      default:
        break;
    }

    if (coperation === 'naver') {
      const userInfo = await getUserInfo(
        options.userInfoMethod,
        options.userInfoUrl,
        authorization_code, //sdk login시 client에서 access_token이 바로 전송됨
      );
      console.log('userInfo ', userInfo);
      const jwtToken = token.generateToken({ userInfo });
      let responseData = {
        success: true,
        userInfo,
        jwt: jwtToken,
      };
      return res.status(200).json(responseData);
    }

    console.log('options= ', options);
    const tokenInfo = await getAccessToken(options);
    console.log('token = ', tokenInfo);
    if (!tokenInfo) return;
    if (coperation === 'google')
      options.userInfoUrl = `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenInfo.access_token}`;

    const userInfo = await getUserInfo(
      options.userInfoMethod,
      options.userInfoUrl,
      tokenInfo.access_token,
    );

    console.log('userInfo = ', userInfo);

    //로그인 되었 을 경우
    if (userInfo) {
      if (coperation === 'kakao') {
        const { kakao_account, id } = userInfo;
        if (id && kakao_account) {
          const jwtToken = token.generateToken(kakao_account);

          let responseData = {
            success: true,
            userInfo,
            jwt: jwtToken,
          };
          return res.status(200).json(responseData);
        }
      }
      if (coperation === 'google') {
        const { id, email, verified_email, picture } = userInfo;

        if (id && email) {
          //1. 회원가입 여부 확인
          const memberRow = await authDaoNew.getEmailIsAlreadyExist(email);
          let jwtToken = null;
          let refreshToken = null;
          //회원 가입 안되어있을시
          if (memberRow[0].EXISTFLAG !== 'EXIST') {
            //회원 가입후 토큰 발급
            const userData = {
              mem_username: '',
              mem_userid: id,
              mem_email: email,
              mem_password: '',
              mem_social: 'google',
            };
            console.log(' userData ', userData);
            const signUpResponse = await authDaoNew.setMemberSignUp(userData);
            if (!signUpResponse) return 'error';
            if (signUpResponse) {
              jwtToken = jwt.sign({
                id: id,
                email: email,
              });
              refreshToken = jwt.refresh();
            }
          } else if (memberRow[0].EXISTFLAG === 'EXIST') {
            //토큰 발급
            jwtToken = jwt.sign({
              id: id,
              email: email,
            });
            refreshToken = jwt.refresh();
          }
          // 발급한 refresh token을 redis에 key를 user의 id로 하여 저장합니다.
          redisClient.set(id, refreshToken);

          const responseData = {
            success: true,
            userInfo,
            accessToken: jwtToken,
            refreshToken: refreshToken,
          };
          return res.status(200).json(responseData);
        }
      }
    }
  } catch (e) {
    console.log(e);
  }
});

/* 로그인  */
router.post('/login', async (req, res) => {
  try {
    let filter = {
      MEM_EMAIL: req.body.memEmail,
    };
    let memberRow = await Member.find(filter);
    if (memberRow && memberRow.length !== 0) {
      console.log('isExist');
      //온경우
      const password = req.body.memPassword;
      let jwtToken = await bcryptCheck(password, memberRow);
      console.log(jwtToken);
      // res.cookie('access-token', jwtToken, {
      //   maxAge: 1000 * 60 * 60 * 24 * 1,
      //   httpOnly: false
      // });
      if (jwtToken) {
        return res.json({
          message: 'logged in successfully',
          token: jwtToken,
          status: 200,
        });
      } else {
        return res.json({ message: 'error', status: 400 });
      }
    } else {
      return res.json({ message: '가입된 정보가 없습니다.', status: 400 });
    }
  } catch (e) {
    console.log('error', e);
    return res.json({ message: 'error', status: 400 });
  }
});

// 영문, 숫자 혼합하여 6~20자리 이내
checkValidationPassword = (password, res) => {
  let reg_pwd = /^.*(?=.{8,20})(?=.*[0-9])(?=.*[a-zA-Z]).*$/;
  if (!reg_pwd.test(password)) {
    console.log('password not vaildation ');
    return false;
  }
  return true;
};

/* refresh token 발행을 위한 라우터  */
router.get('/refresh', refresh);

/* 
  profile
  middleware 적용 
*/
router.get('/profile', authJwt, async (req, res) => {});

/* local 회원가입 */
router.post('/setMemberSignup', async (req, res) => {
  console.log('hello setMemberSignUp');
  //test
  if (!checkValidationPassword(req.body.memPassword)) {
    console.log('notVaildation');
    return res.json({
      message: 'fail',
      code: 500,
      //error: error
    });
  }
  try {
    let filter = {
      MEM_EMAIL: req.body.memEmail,
    };
    let memberRow = await Member.find(filter);
    if (memberRow && memberRow.length !== 0) {
      return res.json({
        status: 404,
        message: 'email already exist',
      });
    } else {
      let password = req.body.memPassword;
      const bcySalt = await helper.getBcryptSalt();
      const hashedPassword = await helper.getHashedPassword(password, bcySalt);
      let userData = {
        MEM_EMAIL: req.body.memEmail,
        MEM_PASSWORD: hashedPassword,
        MEM_USER_NAME: req.body.memUserName,
        MEM_SIGN_TYPE: 'LOCAL',
      };
      const member = new Member(userData);
      await member.save();
      return res.json({
        status: '200',
        message: 'success sign up',
      });
    }
  } catch (error) {
    console.error(error);
    return res.json({
      message: 'fail',
      code: 500,
      error: error,
    });
  }
});

module.exports = router;
