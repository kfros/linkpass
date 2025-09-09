import crypto from "crypto";

export function verifyTelegramInitData(
  initData: string,
  botToken: string): {ok: boolean; data?: URLSearchParams} {
  try {
    const data = new URLSearchParams(initData);
    const hash = data.get("hash");
    if (!hash) throw new Error("No hash in init data");

    const entries: string[] = [];
    data.forEach((value, key) => {
      if (key !== "hash") {
        entries.push(`${key}=${value}`);
      }
    });
    entries.sort();
    const dataCheckString = entries.join("\n");

    const secretKey = crypto.createHash("sha256")
      .update(botToken)
      .digest();

    const hmac = crypto.createHmac("sha256", secretKey)
      .update(dataCheckString)
      .digest("hex");

      return { ok: hmac === hash, data };
  } catch (e) {
    return { ok: false };
  } 
}