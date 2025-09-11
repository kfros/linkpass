"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyTelegramInitData = verifyTelegramInitData;
const crypto_1 = __importDefault(require("crypto"));
function verifyTelegramInitData(initData, botToken) {
    try {
        const data = new URLSearchParams(initData);
        const hash = data.get("hash");
        if (!hash)
            throw new Error("No hash in init data");
        const entries = [];
        data.forEach((value, key) => {
            if (key !== "hash") {
                entries.push(`${key}=${value}`);
            }
        });
        entries.sort();
        const dataCheckString = entries.join("\n");
        const secretKey = crypto_1.default.createHash("sha256")
            .update(botToken)
            .digest();
        const hmac = crypto_1.default.createHmac("sha256", secretKey)
            .update(dataCheckString)
            .digest("hex");
        return { ok: hmac === hash, data };
    }
    catch (e) {
        return { ok: false };
    }
}
