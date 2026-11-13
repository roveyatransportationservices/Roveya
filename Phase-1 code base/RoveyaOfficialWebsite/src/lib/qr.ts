import QRCode from "qrcode";

// Codes with a logo over the middle need the "H" level, which survives the covered part.
export const qrFor = (url: string, width = 220, level: "M" | "H" = "M") => QRCode.toDataURL(url, { margin: 1, width, errorCorrectionLevel: level, color: { dark: "#12060D", light: "#F6F1DC" } });
