#!/usr/bin/env node
import os from 'os';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { execSync } from 'child_process';

const root = process.cwd();
const platform = os.platform();
const isWin = platform === 'win32';
const isMac = platform === 'darwin';
const resDirMac = path.join(root, 'resources', 'bin', 'mac');
const resDirWin = path.join(root, 'resources', 'bin', 'win');
fs.mkdirSync(resDirMac, { recursive: true });
fs.mkdirSync(resDirWin, { recursive: true });

function download(url, dest, redirects = 0) {
  return new Promise((resolve, reject) => {
    const req = https.get(new URL(url), { headers: { 'User-Agent': 'yt-dlp-offline-downloader/1.0' } }, (response) => {
      // Follow redirects (e.g., GitHub latest -> actual asset)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        if (redirects > 5) return reject(new Error(`Too many redirects for ${url}`));
        const nextUrl = response.headers.location.startsWith('http')
          ? response.headers.location
          : new URL(response.headers.location, url).toString();
        response.resume();
        return resolve(download(nextUrl, dest, redirects + 1));
      }
      if (response.statusCode !== 200) {
        response.resume();
        return reject(new Error(`Failed to download ${url} (${response.statusCode})`));
      }
      const file = fs.createWriteStream(dest);
      response.pipe(file);
      file.on('finish', () => file.close(() => resolve()));
      file.on('error', (err) => {
        try { fs.unlinkSync(dest); } catch {}
        reject(err);
      });
    });
    req.on('error', (err) => {
      try { fs.unlinkSync(dest); } catch {}
      reject(err);
    });
  });
}

function fileSize(file) {
  try { return fs.statSync(file).size; } catch { return 0; }
}

async function ensureYtDlpCurrent() {
  const resDir = isWin ? resDirWin : resDirMac;
  const target = path.join(resDir, isWin ? 'yt-dlp.exe' : 'yt-dlp');
  const minSize = isWin ? 1_000_000 : 1_000_000; // ~1MB sanity
  if (fs.existsSync(target) && fileSize(target) > minSize) return;
  try { if (fs.existsSync(target) && fileSize(target) <= minSize) fs.unlinkSync(target); } catch {}
  // Prefer standalone binary on macOS to avoid needing Python at runtime
  const url = isWin
    ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe'
    : (isMac
      ? 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp_macos'
      : 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp');
  console.log('Downloading yt-dlp...');
  await download(url, target);
  if (!isWin) fs.chmodSync(target, 0o755);
  const sz = fileSize(target);
  if (sz <= minSize) throw new Error(`yt-dlp download seems invalid (size=${sz})`);
  console.log('yt-dlp ready:', target);
}

async function ensureYtDlpWin() {
  const target = path.join(resDirWin, 'yt-dlp.exe');
  const minSize = 1_000_000;
  if (fs.existsSync(target) && fileSize(target) > minSize) return;
  try { if (fs.existsSync(target) && fileSize(target) <= minSize) fs.unlinkSync(target); } catch {}
  const url = 'https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe';
  console.log('Downloading yt-dlp.exe (Windows)...');
  await download(url, target);
  const sz = fileSize(target);
  if (sz <= minSize) throw new Error(`yt-dlp.exe download seems invalid (size=${sz})`);
  console.log('yt-dlp.exe ready:', target);
}

function tryWhich(cmds) {
  for (const cmd of cmds) {
    try {
      const out = execSync(process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`, { stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim();
      if (out) return out.split(/\r?\n/)[0];
    } catch {}
  }
  return null;
}

async function ensureFfmpegCurrent() {
  const resDir = isWin ? resDirWin : resDirMac;
  const target = path.join(resDir, isWin ? 'ffmpeg.exe' : 'ffmpeg');
  if (fs.existsSync(target)) return;
  console.log('Looking for ffmpeg to bundle...');
  // Try ffmpeg-static first
  try {
    const ffstatic = await import('ffmpeg-static');
    const staticPath = ffstatic?.default || ffstatic;
    if (staticPath && fs.existsSync(staticPath)) {
      fs.copyFileSync(staticPath, target);
      if (!isWin) fs.chmodSync(target, 0o755);
      console.log('Bundled ffmpeg from ffmpeg-static:', staticPath);
      return;
    }
  } catch {}
  // Fallback to system ffmpeg
  const found = tryWhich(isWin ? ['ffmpeg.exe', 'ffmpeg'] : ['ffmpeg']);
  if (found && fs.existsSync(found)) {
    fs.copyFileSync(found, target);
    if (!isWin) fs.chmodSync(target, 0o755);
    console.log('Copied ffmpeg from system:', found);
    return;
  }
  console.warn('ffmpeg not found on system. Please install ffmpeg or place the binary manually: ', target);
}

async function ensureFfmpegWin() {
  const target = path.join(resDirWin, 'ffmpeg.exe');
  if (fs.existsSync(target)) return;
  // Download a recent FFmpeg Windows build (x64) zip and extract ffmpeg.exe
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ffmpeg-win-'));
  const zipPath = path.join(tmpDir, 'ffmpeg-win64.zip');
  // BtbN builds: master latest win64 gpl
  const url = 'https://github.com/BtbN/FFmpeg-Builds/releases/latest/download/ffmpeg-master-latest-win64-gpl.zip';
  console.log('Downloading FFmpeg (Windows x64)...');
  await download(url, zipPath);
  console.log('Extracting FFmpeg zip...');
  try {
    execSync(`unzip -q "${zipPath}" -d "${tmpDir}"`);
  } catch (e) {
    console.warn('Failed to unzip FFmpeg automatically. Please place ffmpeg.exe into resources/bin/win manually.');
    return;
  }
  // Find ffmpeg.exe inside extracted folder
  const walk = (dir) => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const ent of entries) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        const found = walk(p);
        if (found) return found;
      } else if (ent.isFile() && ent.name.toLowerCase() === 'ffmpeg.exe') {
        return p;
      }
    }
    return null;
  };
  const found = walk(tmpDir);
  if (found) {
    fs.copyFileSync(found, target);
    console.log('Bundled Windows ffmpeg.exe at', target);
  } else {
    console.warn('Could not find ffmpeg.exe in extracted archive. Please add it manually at', target);
  }
}

(async () => {
  // Always ensure binaries for current platform
  await ensureYtDlpCurrent();
  await ensureFfmpegCurrent();
  // Additionally, when building on macOS, also prepare Windows binaries for cross-packaging
  if (isMac) {
    await ensureYtDlpWin();
    await ensureFfmpegWin();
  }
  console.log('Binaries setup complete in', path.join(root, 'resources', 'bin'));
})();
