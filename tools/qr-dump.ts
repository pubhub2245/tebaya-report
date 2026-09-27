/** QRのます目を文字で出す（正しさの確かめ用。本番の画面では使わない） */
import { qrMatrix } from "../lib/keiri/qr";

const url = process.argv[2] ?? "https://tebaya-report.vercel.app/keiri/case";
const m = qrMatrix(url);
console.log(m.map((r) => r.map((d) => (d ? "1" : "0")).join("")).join("\n"));
