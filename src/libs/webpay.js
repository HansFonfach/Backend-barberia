// src/libs/webpay.js
import pkg from "transbank-sdk";
const { WebpayPlus, Options, Environment } = pkg;

const COMMERCE_CODE = "597055555532"; 
const API_KEY = "579B532A7440BB0C9079DED94D31EA1615BACEB56610332264630D42D0A36B1C";

export const tx = new WebpayPlus.Transaction(
  new Options(
    COMMERCE_CODE, // 🔥 PRIMERO commerceCode
    API_KEY,       // 🔥 Luego apiKey
    Environment.Integration
  )
);
