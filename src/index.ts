import axios from "axios";
import * as cheerio from "cheerio";
import dayjs from "dayjs";
import { sendPostMessage } from "@secret-momo/lark-notifier";

const client = axios.create({
  headers: {
    cookie: process.env.V2EX_COOKIE,
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
  },
});

async function notify(msg: string) {
  await sendPostMessage(
    JSON.stringify({
      zh_cn: {
        title: dayjs().format("YYYY-MM-DD HH:mm:ss"),
        content: [
          [
            {
              tag: "text",
              text: msg,
            },
            {
              tag: "a",
              href: process.env.RUN_URL,
              text: "(查看详情)",
            },
          ],
        ],
      },
    }),
  );
}

async function getOnce() {
  const { data: html } = await client.get("https://www.v2ex.com/mission/daily");

  if (html.includes("你要查看的页面需要先登录")) throw new Error("未登录");
  if (html.includes("每日登录奖励已领取")) throw new Error("已领取今日奖励");

  const match = html.match(/\/mission\/daily\/redeem\?once=(\d+)'/);

  return match?.[1] || null;
}

async function getBalance() {
  const { data: html } = await client.get("https://www.v2ex.com/balance");
  const $ = cheerio.load(html);
  const balance = $("div.balance_area.bigger").text().trim();
  const arr = balance.split(" ").filter(Boolean);

  if (arr.length === 0) return 0;
  if (arr.length === 1) return Number(arr[0]);
  if (arr.length === 2) return Number(arr[0]) * 100 + Number(arr[1]);

  return Number(arr[0]) * 10000 + Number(arr[1]) * 100 + Number(arr[2]);
}

async function notifyCheckInSuccess(html: string) {
  const match = html.match(/已成功领取每日登录奖励 (\d+) 铜币/);
  const checkInCoin = match?.[1] || 0;

  const match2 = html.match(/已连续登录 (\d+) 天/);
  const totalLoginDays = match2?.[1] || 0;
  const coins = await getBalance();

  await notify(
    `✅ 签到成功：领取 ${checkInCoin} 铜币，已登录 ${totalLoginDays} 天，账户余额 ${coins} 铜币。`,
  );
}

async function checkIn() {
  const once = await getOnce();

  if (!once) {
    throw new Error("未找到 once");
  }

  const url = `https://www.v2ex.com/mission/daily/redeem?once=${once}`;
  const { data: html } = await client.get(url);

  if (!html.includes("已成功领取")) {
    throw new Error("签到失败");
  }

  await notifyCheckInSuccess(html);
}

checkIn().catch(async (err) => {
  await notify(`❌ 签到失败: ${err.message}。`);

  console.error(`❌ 签到失败: ${err.message}`);
  process.exit(1);
});
