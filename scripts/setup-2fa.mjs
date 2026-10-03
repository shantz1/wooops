import { Secret, TOTP } from "otpauth";

const role = process.argv[2] || "admin";
if (!["admin", "readonly"].includes(role)) throw new Error("Choose admin or readonly.");
const secret = new Secret({ size: 20 });
const totp = new TOTP({ issuer: "WooOps", label: role, secret, algorithm: "SHA1", digits: 6, period: 30 });
console.log(`WOOOPS_${role.toUpperCase()}_TOTP_SECRET=${secret.base32}`);
console.log("Keep this secret private. Add it manually to your authenticator or import this URI locally:");
console.log(totp.toString());
console.log("Do not paste the URI into an online QR generator. Store a secure backup before enabling 2FA.");
