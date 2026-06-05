// Generates PWA/app icons from inline SVG. Run: node scripts/gen-icons.mjs
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const F = `<path d="M176 136h176v64H248v48h88v64H248v72h-72V136z" fill="#fff"/>
           <circle cx="368" cy="160" r="36" fill="#5FDA6B"/>`;

const rounded = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" rx="112" fill="#22194F"/>${F}</svg>`;

const maskable = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <rect width="512" height="512" fill="#22194F"/>
  <g transform="translate(256,256) scale(0.62) translate(-256,-256)">${F}</g></svg>`;

const out = [
  ["public/icon-192.png", rounded, 192],
  ["public/icon-512.png", rounded, 512],
  ["public/icon-maskable-512.png", maskable, 512],
  ["app/apple-icon.png", rounded, 180],
];

await mkdir("public", { recursive: true });
for (const [path, svg, size] of out) {
  await sharp(Buffer.from(svg)).resize(size, size).png().toFile(path);
  console.log("wrote", path, size);
}
