import { headers } from "../constants/header";
export const apirespone = (staus, success, data) => {
  return {
    statusCode,
    headers,
    body: JSON.stringify({ success, data }),
  };
};
