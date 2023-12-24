import axios from "axios";
import { Day, Month, Year } from "../../constants/datetime";
import {
  getBrowserLikeHeaders,
  getLiquidityPoolsFromRaydiumUrl,
} from "../urls";
import { RadiumLiquidityPoolInfoList } from "../../types/raydium";

export const getLiquidityPoolsFromRaydium = async ({
  year = new Date().getFullYear().toString() as Year,
  month = (new Date().getMonth() + 1).toString().padStart(2, "0") as Month,
  day = new Date().getDate().toString().padStart(2, "0") as Day,
}: {
  year: Year;
  month: Month;
  day: Day;
}) => {
  const url = getLiquidityPoolsFromRaydiumUrl({ year, month, day });

  console.log({ url });

  try {
    const {
      data: pools,
      status,
    }: {
      data: RadiumLiquidityPoolInfoList;
      status: number;
    } = await axios.get(url, {
      headers: getBrowserLikeHeaders(),
    });

    if (!pools || status !== 200) {
      throw new Error(`HTTP error! status: ${status}`);
    }

    console.log({ pools });

    return pools;
  } catch (error) {
    console.error({ error });
  }
};
