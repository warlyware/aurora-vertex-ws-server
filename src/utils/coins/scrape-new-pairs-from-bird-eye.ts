import puppeteer from "puppeteer";

export interface GetTokenListFromBirdEyeResponse {
  status: number;
  tokens: {
    name: string;
    tvl: string;
    solscanLink: string;
    address: string;
  }[];
}

export const scrapeNewPairsFromBirdEye =
  async ({}: {} = {}): Promise<GetTokenListFromBirdEyeResponse> => {
    const browser = await puppeteer.launch({
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });

    const page = await browser.newPage();
    await page.goto("https://birdeye.so/new-pairs", {
      waitUntil: "networkidle0",
    });

    console.log("page loaded");

    await page.waitForSelector("table");

    console.log("table loaded");

    const data = await page.evaluate(() => {
      const rows = Array.from(document.querySelectorAll("tr"));
      return rows.map((row) => {
        const columns = row.querySelectorAll("td");
        return Array.from(columns, (column, index) => {
          // Check if the column is the last one and if it contains a link
          if (index === columns.length - 1) {
            const link = column.querySelector("a");
            return link ? link.href : "";
          } else {
            return column.innerText;
          }
        });
      });
    });

    const mappedData = data.map((row) => {
      return {
        // split on \
        name: row[0]?.split("\n")?.[0] || "",
        tvl: row[5] === "__" ? "0" : row[5],
        solscanLink: row[9],
        address: row[9]?.split?.("/")?.[4] || "",
      };
    });

    console.log({ mappedData });

    await browser.close();

    return {
      status: 200,
      tokens: mappedData,
    };
  };
