import type { ShareLanding } from '@baichile/api-contract';
import { staticAssetUrl } from '../config/static-cdn';
import { buildSharePosterModel, type SharePosterKind } from './share-poster';
import { downloadWebFile } from '../platform/web-share';

export interface SaveGachaPosterOptions {
  canvasId: string;
  data: ShareLanding;
  kind: SharePosterKind;
  subjectImageUrl?: string;
}

export function shareCoverPath(kind: SharePosterKind): string {
  return staticAssetUrl(`share/gacha-${kind}-cover.png`);
}

export async function saveGachaPoster(options: SaveGachaPosterOptions): Promise<void> {
  const { data, kind, canvasId, subjectImageUrl } = options;
  if (!data.miniProgramCodeUrl) throw new Error('小程序码暂未生成');
  const [qr, avatar, subject] = await Promise.all([
    download(data.miniProgramCodeUrl),
    data.identity?.avatarUrl ? download(data.identity.avatarUrl).catch(() => '') : Promise.resolve(''),
    subjectImageUrl ? download(subjectImageUrl).catch(() => '') : Promise.resolve(''),
  ]);
  const ctx = uni.createCanvasContext(canvasId);
  drawGachaPoster(ctx, data, kind, qr, avatar, subject);
  await new Promise<void>((resolve) => ctx.draw(false, () => setTimeout(resolve, 80)));
  await saveImage(await exportCanvas(canvasId));
}

function drawGachaPoster(ctx: UniApp.CanvasContext, data: ShareLanding, kind: SharePosterKind, qr: string, avatar: string, subject: string) {
  const model = buildSharePosterModel(data, kind);
  const paper = '#FFF8E8';
  const ink = '#191713';
  ctx.setFillStyle(paper); ctx.fillRect(0, 0, 750, 1334);
  ctx.setFillStyle(model.accent); ctx.fillRect(0, 0, 750, 232);
  ctx.setFillStyle(ink); ctx.fillRect(42, 42, 666, 100);
  ctx.setFillStyle('#FFD400'); ctx.setFontSize(28); ctx.fillText('这顿白吃 · 扭蛋站', 74, 103);
  ctx.setFillStyle(paper); ctx.setFontSize(18); ctx.fillText(model.ticket, 74, 132);
  ctx.setFillStyle(ink); ctx.beginPath(); ctx.arc(640, 112, 78, 0, Math.PI * 2); ctx.fill();
  ctx.setFillStyle('#FFD400'); ctx.beginPath(); ctx.arc(620, 91, 28, 0, Math.PI * 2); ctx.fill();
  ctx.setFillStyle('#36BFA1'); ctx.beginPath(); ctx.arc(666, 137, 23, 0, Math.PI * 2); ctx.fill();
  ctx.setFillStyle(ink); ctx.setFontSize(24); ctx.fillText(model.eyebrow, 52, 288);
  ctx.setFontSize(54); drawText(ctx, model.title, 52, 350, 450, 66, 2);
  ctx.setFillStyle('#70695F'); ctx.setFontSize(25); drawText(ctx, model.detail, 52, 500, 540, 38, 2);
  ctx.setFillStyle(ink); roundRect(ctx, 42, 610, 666, 402, 32); ctx.fill();
  ctx.setFillStyle('#FFF8E8'); roundRect(ctx, 56, 624, 638, 374, 22); ctx.fill();
  ctx.setFillStyle(model.accent); roundRect(ctx, 76, 650, 598, 236, 24); ctx.fill();
  if (subject) {
    ctx.save(); roundRect(ctx, 94, 670, 560, 196, 18); ctx.clip(); ctx.drawImage(subject, 94, 670, 560, 196); ctx.restore();
  } else drawCapsules(ctx, 156, 766, model.accent);
  ctx.setFillStyle(ink); ctx.setFontSize(22); ctx.fillText(model.primaryLabel, 82, 932);
  ctx.setFontSize(42); ctx.fillText(model.primary, 82, 980);
  ctx.setFontSize(23); ctx.setFillStyle('#70695F'); ctx.fillText(model.secondary, 388, 976);
  ctx.setFillStyle(ink); roundRect(ctx, 42, 1052, 430, 158, 28); ctx.fill();
  ctx.setFillStyle(paper); ctx.setFontSize(22); ctx.fillText(model.stamp, 74, 1100);
  ctx.setFontSize(30); ctx.fillText(model.callToAction, 74, 1152);
  if (avatar) { ctx.save(); ctx.beginPath(); ctx.arc(88, 1262, 28, 0, Math.PI * 2); ctx.clip(); ctx.drawImage(avatar, 60, 1234, 56, 56); ctx.restore(); }
  ctx.setFillStyle(ink); ctx.setFontSize(22); ctx.fillText(data.identity?.nickname || '匿名白吃选手', avatar ? 132 : 54, 1270);
  ctx.drawImage(qr, 554, 1128, 126, 126);
  ctx.setFillStyle('#70695F'); ctx.setFontSize(18); ctx.fillText('扫码来抽同款', 534, 1284);
}

function drawCapsules(ctx: UniApp.CanvasContext, x: number, y: number, accent: string) {
  ['#FFD400', accent, '#36BFA1'].forEach((fill, index) => {
    const left = x + index * 150;
    ctx.setFillStyle('#191713'); ctx.beginPath(); ctx.arc(left, y, 64, 0, Math.PI * 2); ctx.fill();
    ctx.setFillStyle(fill); ctx.beginPath(); ctx.arc(left, y - 6, 54, 0, Math.PI * 2); ctx.fill();
    ctx.setFillStyle('#FFF8E8'); ctx.fillRect(left - 54, y - 6, 108, 12);
  });
}

function roundRect(ctx: UniApp.CanvasContext, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath(); ctx.moveTo(x + radius, y); ctx.lineTo(x + width - radius, y); ctx.arcTo(x + width, y, x + width, y + radius, radius);
  ctx.lineTo(x + width, y + height - radius); ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
  ctx.lineTo(x + radius, y + height); ctx.arcTo(x, y + height, x, y + height - radius, radius);
  ctx.lineTo(x, y + radius); ctx.arcTo(x, y, x + radius, y, radius); ctx.closePath();
}

function drawText(ctx: UniApp.CanvasContext, text: string, x: number, y: number, width: number, lineHeight: number, maxLines: number) {
  let line = ''; let index = 0;
  for (const character of text) {
    if (ctx.measureText(line + character).width > width) {
      ctx.fillText(line, x, y + index * lineHeight); line = character; index++;
      if (index >= maxLines) return;
    } else line += character;
  }
  if (line && index < maxLines) ctx.fillText(line, x, y + index * lineHeight);
}

function download(url: string): Promise<string> { return new Promise((resolve, reject) => uni.downloadFile({ url, success: (result) => result.statusCode === 200 ? resolve(result.tempFilePath) : reject(new Error('素材下载失败')), fail: reject })); }
function exportCanvas(canvasId: string): Promise<string> { return new Promise((resolve, reject) => uni.canvasToTempFilePath({ canvasId, width: 750, height: 1334, destWidth: 1125, destHeight: 2001, fileType: 'jpg', quality: .92, success: (result) => resolve(result.tempFilePath), fail: reject })); }
async function saveImage(filePath: string): Promise<void> {
  if (await downloadWebFile(filePath, `baichile-poster-${Date.now()}.jpg`)) return;
  await new Promise<void>((resolve, reject) => uni.saveImageToPhotosAlbum({
    filePath,
    success: () => resolve(),
    fail: (error) => {
      if (String(error.errMsg).includes('auth deny')) uni.openSetting({});
      reject(new Error('请允许保存到相册后重试'));
    },
  }));
}
