const redis = require('redis');

const redisClient = redis.createClient();
const resetHour = 24;
const resetHourInSeconds = resetHour * 3600;
const maxRequest = 100;
let hashGroup;

const setClient = (ip, updateInfo) => {
  const timestamp = Math.floor(Number(new Date()) / 1000);
  const Info = { timeStamp: timestamp, token: 0 };

  const clientInfo = updateInfo
    ? JSON.stringify({ ...Info, ...updateInfo })
    : JSON.stringify(Info);

  /*
  Using hashGroup as hash key, which is of format 0.0.0 of the ip address
  so that ip addresses can be hashed in groups and be memory efficient with large data
  E.g 
    hashGroup 10.20.10, will contain...
    ip in the range 10.20.10.0 - 10.20.10.255
  */
  const setClientInfo = redisClient.hset(hashGroup, ip, clientInfo);

  return setClientInfo;
};

const RateLimiter = (req, res, next) => {
  const ip = req.ip;
  const ipGroup = new RegExp(/((\d*)\.){2}((\d*))/, 'g');

  // Redis Hash key which the ip can be found/set
  hashGroup = ipGroup.exec(ip)[0];

  redisClient.hget(hashGroup, ip, (err, record) => {
    if (err) throw err;

    if (record == null) {
      setClient(ip);
      return next();
    }

    const data = JSON.parse(record);

    // get the current time in seconds
    const currentTimeInSeconds = Math.floor(Number(new Date()) / 1000);
    // delete ClientHash in 24 hours time
    const expireTime = data.timeStamp + resetHourInSeconds;
    // increase the client's token by 1
    const tokenCount = data.token + 1;

    if (currentTimeInSeconds > expireTime) {
      // delete client old session
      redisClient.hdel(hashGroup, ip);
      //  create new session
      setClient(ip);
      next();
    } else {
      if (tokenCount >= maxRequest) {
        return res.status(429).send({
          message: `You have exceeded the ${maxRequest} requests in ${resetHour} hrs limit!`,
        });
      }

      // get initialTimestamp of client data
      const clientInitialTimestamp = data.timeStamp;
      // Update the token info
      const updatedInfo = {
        timeStamp: clientInitialTimestamp,
        token: tokenCount,
      };
      // setClient with the updated info
      setClient(ip, updatedInfo);
      next();
    }
  });
};

module.exports = { RateLimiter };
