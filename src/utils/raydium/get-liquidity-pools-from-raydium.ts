import axios from "axios";
import { Day, Month, Year } from "../../constants/datetime";
import {
  getBrowserLikeHeaders,
  getLiquidityPoolsFromRaydiumUrl,
} from "../urls";
import { RaydiumLiquidityPoolInfoList } from "../../types/raydium";

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
      data: RaydiumLiquidityPoolInfoList;
      status: number;
    } = await axios.get(url, {
      headers: getBrowserLikeHeaders(),
    });

    if (!pools || status !== 200) {
      throw new Error(`HTTP error! status: ${status}`);
    }

    console.log({ pools });

    return {
      pools: [...pools?.official, ...pools?.unOfficial],
      count: pools?.official?.length + pools?.unOfficial?.length,
    };
  } catch (error) {
    console.error({ error });
  }
};
