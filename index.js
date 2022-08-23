const superagent = require("superagent");
const cheerio = require("cheerio");
const axios = require("axios");
const nodemailer = require("nodemailer");
const schedule = require("node-schedule");
const ejs = require("ejs");
const fs = require("fs");
const path = require("path");

const {
  EamilAuth, // 发送者邮箱账户SMTP授权码
  EmailFrom, // 发送者昵称与邮箱地址
  local, // 地址信息
  startDay, // 纪念日
  EmailSubject, // 邮件主题
  EmailTo, // 收件人邮箱
} = require("./config.json");

/** 获取一个APP url地址 */
const OneUrl = "http://wufazhuce.com/";

/** 获取天气信息url地址 */
const WeatherUrl = "https://tianqi.moji.com/weather/china/" + local;

/** 获取暖心话信息url地址 */
const warmSentenceUrl = "https://api.ooomn.com/api/love?encode=json";

/** 获取在一起时间方法 */
const getTogetherDay = () => {
  const today = new Date();
  const initDay = new Date(startDay);

  const lastDay = Math.floor((today - initDay) / 1000 / 60 / 60 / 24);
  const todaystr =
    today.getFullYear() +
    " / " +
    (today.getMonth() + 1) +
    " / " +
    today.getDate();
  return [lastDay, todaystr];
};

const [lastDay, todaystr] = getTogetherDay();

/** 发送邮件方法 */
const sendEmailFn = async (html, count = 0) => {
  const testAccount = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: "smtp.qq.com",
    port: 587,
    secure: false,
    auth: EamilAuth,
  });
  await transporter.sendMail(
    {
      from: EmailFrom,
      to: EmailTo,
      subject: EmailSubject,
      html,
    },
    (err, info = {}) => {
      if (count > 2) return;
      if (err) {
        console.log(`${todaystr} 发送邮件失败，重试第${count + 1}次...`);
        return setTimeout(() => {
          sendEmailFn(html, count + 1);
        }, 2000);
      }
      console.log(todaystr, "邮件发送成功", info.messageId);
    }
  );
};

/** 获取ONE内容 */
const getOneData = () => {
  return new Promise((resolve, reject) => {
    superagent.get(OneUrl).end((err, res) => {
      if (err) {
        reject(err);
      }
      const $ = cheerio.load(res.text);
      const selectItem = $("#carousel-one .carousel-inner .item");
      const todayOne = selectItem[0];
      const todayOneData = {
        imgUrl: $(todayOne).find(".fp-one-imagen").attr("src"),
        type: $(todayOne)
          .find(".fp-one-imagen-footer")
          .text()
          .replace(/(^\s*)|(\s*$)/g, ""),
        text: $(todayOne)
          .find(".fp-one-cita")
          .text()
          .replace(/(^\s*)|(\s*$)/g, ""),
      };
      resolve(todayOneData);
    });
  });
};

/** 获取天气预报 */
const getWeatherData = () => {
  return new Promise((resolve, reject) => {
    superagent.get(WeatherUrl).end((err, res) => {
      if (err) {
        reject(err);
      }
      let threeDaysData = [];
      let weatherTip = "";
      let $ = cheerio.load(res.text);
      $(".forecast .days").each((i, elem) => {
        const SingleDay = $(elem).find("li");
        threeDaysData.push({
          Day: $(SingleDay[0])
            .text()
            .replace(/(^\s*)|(\s*$)/g, ""),
          WeatherImgUrl: $(SingleDay[1]).find("img").attr("src"),
          WeatherText: $(SingleDay[1])
            .text()
            .replace(/(^\s*)|(\s*$)/g, ""),
          Temperature: $(SingleDay[2])
            .text()
            .replace(/(^\s*)|(\s*$)/g, ""),
          WindDirection: $(SingleDay[3])
            .find("em")
            .text()
            .replace(/(^\s*)|(\s*$)/g, ""),
          WindLevel: $(SingleDay[3])
            .find("b")
            .text()
            .replace(/(^\s*)|(\s*$)/g, ""),
          Pollution: $(SingleDay[4])
            .text()
            .replace(/(^\s*)|(\s*$)/g, ""),
          PollutionLevel: $(SingleDay[4]).find("strong").attr("class"),
        });
      });
      resolve(threeDaysData);
    });
  });
};

/** 获取天气提醒方法 */
const getWeatherTips = () => {
  return new Promise((resolve, reject) => {
    superagent.get(WeatherUrl).end((err, res) => {
      if (err) {
        reject("报错了：", err);
      }
      const threeDaysData = [];
      let weatherTip = "";
      let $ = cheerio.load(res.text);
      $(".wea_tips").each((i, elem) => {
        weatherTip = $(elem).find("em").text();
      });
      resolve(weatherTip);
    });
  });
};

/** 获取暖心话方法 */
const getWarmSentence = () => {
  return new Promise((resolve, reject) => {
    axios
      .get(warmSentenceUrl)
      .then((res) => {
        if (res?.data && res?.data?.code === 200) {
          resolve(res.data?.text);
        } else {
          reject("数据异常");
        }
      })
      .catch((err) => {
        reject("请求失败");
      });
  });
};

/** 聚合 */
const main = async () => {
  const HtmlData = {
    lastDay,
    todaystr,
    todayOneData: "",
    weatherTip: "",
    threeDaysData: [],
    warmSentence: "",
  };
  Promise.all([
    getOneData(),
    getWeatherTips(),
    getWeatherData(),
    getWarmSentence(),
  ])
    .then((data) => {
      HtmlData["todayOneData"] = data[0];
      HtmlData["weatherTip"] = data[1];
      HtmlData["threeDaysData"] = data[2];
      HtmlData["warmSentence"] = data[3];

      const template = ejs.compile(
        fs.readFileSync(path.resolve(__dirname, "view.ejs"), "utf8")
      );
      const html = template(HtmlData);
      sendEmailFn(html);
    })
    .catch((err) => {
      console.log("获取数据失败： ", err);
    });
};

console.log("项目启动===>");

/** 定时任务方法 */
schedule.scheduleJob("00 00 10 * * *", async () => {
  console.log(todaystr, "定时任务执行了!");
  main();
});
