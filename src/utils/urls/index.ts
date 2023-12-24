import { Day, Month, Year } from "../../constants/datetime";

export const getLiquidityPoolsFromRaydiumUrl = ({
  year,
  month,
  day,
}: {
  year: Year;
  month: Month;
  day: Day;
}) => {
  return `https://uapi.raydium.io/v2/sdk/liquidity/date/${year}-${month}-${day}`;
};
