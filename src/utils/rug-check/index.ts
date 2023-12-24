import puppeteer from "puppeteer";
import { getRugCheckInfoUrl } from "../urls";

export type GetRugCheckInfoResponse = {
  status: number;
  riskAnalysis: {
    riskAnalysScore: string;
    riskAnalysWord: string;
  };
};

export const scrapeRugCheck = async ({
  address,
}: {
  address: string;
}): Promise<GetRugCheckInfoResponse> => {
  const browser = await puppeteer.launch({
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });

  const url = getRugCheckInfoUrl(address);

  console.log({ url });

  const page = await browser.newPage();
  await page.goto(url, {
    waitUntil: "networkidle0",
  });

  console.log("page loaded");

  // get h4 with content "Risk Analysis"
  const riskAnalysisLabelSelector = "h4:contains('Risk Analysis')";

  await page.waitForSelector(riskAnalysisLabelSelector);

  // get content of sibling div > h4 > small
  const riskAnalysScoreSelector =
    "h4:contains('Risk Analysis') + div > h4 > small";

  // get h1 child el of el with class of `risk` and get content
  const riskAnalysWordSelector = ".risk > h1";

  const riskAnalysScore =
    (await page.$eval(riskAnalysScoreSelector, (el) => el.textContent)) ||
    "N/A";
  const riskAnalysWord =
    (await page.$eval(riskAnalysWordSelector, (el) => el.textContent)) || "N/A";

  await browser.close();

  console.log({ riskAnalysScore, riskAnalysWord });

  return {
    status: 200,
    // only add if exists in response
    riskAnalysis: {
      riskAnalysScore,
      riskAnalysWord,
    },
  };
};
