import Crypto from "crypto";

export enum CryptoUsage {
	Oauth2 = "oauth2",
	Stripe = "stripe",
}

const IV_LENGTH = 12;
const SALT_LENGTH = 16;
const KEY_LENGTH = 32;
const AES_256_GCM: Crypto.CipherGCMTypes = "aes-256-gcm";

const CLEAR_ENCODING = "utf8";
const CRYPTO_ENCODING = "hex";

const HEX_SEPARATOR = ":";

function derivateKey(key: string, usage: CryptoUsage) {
	const salt = "0".repeat(SALT_LENGTH);
	const iteration = 1;
	const digest = "sha512";
	return Crypto.pbkdf2Sync(
		`${key}:${usage}`,
		salt,
		iteration,
		KEY_LENGTH,
		digest,
	);
}

export function sign(
	key: string,
	usage: CryptoUsage,
	data: Record<string, unknown> | string,
) {
	const dKey = derivateKey(key, usage);
	const hmac = Crypto.createHmac("sha256", dKey);
	const dataToSign = Buffer.from(JSON.stringify(data), CLEAR_ENCODING).toString(
		CRYPTO_ENCODING,
	);
	const signature = hmac.update(dataToSign).digest(CRYPTO_ENCODING);
	return `${dataToSign}${HEX_SEPARATOR}${signature}`;
}

export function verify(
	key: string,
	usage: CryptoUsage,
	signedData: string,
): Record<string, unknown> {
	const dKey = derivateKey(key, usage);
	try {
		const hmac = Crypto.createHmac("sha256", dKey);
		const [realSignedData, claimedSignature] = signedData.split(HEX_SEPARATOR);
		const signature = hmac.update(realSignedData).digest();

		if (
			Crypto.timingSafeEqual(
				signature,
				Buffer.from(claimedSignature, CRYPTO_ENCODING),
			)
		) {
			return JSON.parse(
				Buffer.from(realSignedData, CRYPTO_ENCODING).toString(CLEAR_ENCODING),
			);
		}

		throw new Error(`${signedData} signature invalid`);
	} catch (error) {
		throw new Error("Unknown verification error");
	}
}
