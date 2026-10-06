import { customAlphabet } from "nanoid";

const alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Short URL-safe bill id used in `/b/<id>`. */
export const newBillId = customAlphabet(alphabet, 12);
