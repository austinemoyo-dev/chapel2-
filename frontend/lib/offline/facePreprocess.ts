'use client';
// ============================================================================
// facePreprocess - ArcFace face alignment and tensor preparation.
// ============================================================================

// ArcFace 112x112 five-point template used by InsightFace.
const DST: [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

const LM_IDX = {
  leftEye: [33, 133],
  rightEye: [362, 263],
  nose: 1,
  mouthCorners: [61, 291],
} as const;

type Point = [number, number];

function toPoint(landmark: { x: number; y: number }, vw: number, vh: number): Point {
  return [landmark.x * vw, landmark.y * vh];
}

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Least-squares similarity transform from src to dst:
 *   u = a*x - b*y + tx
 *   v = b*x + a*y + ty
 */
function estimateSimilarityTransform(src: Point[], dst: Point[]): [number, number, number, number] {
  const n = src.length;
  let srcCx = 0, srcCy = 0, dstCx = 0, dstCy = 0;

  for (let i = 0; i < n; i++) {
    srcCx += src[i][0];
    srcCy += src[i][1];
    dstCx += dst[i][0];
    dstCy += dst[i][1];
  }

  srcCx /= n;
  srcCy /= n;
  dstCx /= n;
  dstCy /= n;

  let numA = 0, numB = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - srcCx;
    const y = src[i][1] - srcCy;
    const u = dst[i][0] - dstCx;
    const v = dst[i][1] - dstCy;

    numA += x * u + y * v;
    numB += x * v - y * u;
    den += x * x + y * y;
  }

  if (den < 1e-10) return [1, 0, 0, 0];

  const a = numA / den;
  const b = numB / den;
  const tx = dstCx - a * srcCx + b * srcCy;
  const ty = dstCy - b * srcCx - a * srcCy;

  return [a, b, tx, ty];
}

/**
 * Extract and align a 112x112 face crop from the current video frame.
 */
export function alignFace(
  video: HTMLVideoElement,
  landmarks: { x: number; y: number; z: number }[],
  vw: number,
  vh: number,
): ImageData | null {
  if (!landmarks || landmarks.length < 400) return null;

  const eyeA = midpoint(
    toPoint(landmarks[LM_IDX.leftEye[0]], vw, vh),
    toPoint(landmarks[LM_IDX.leftEye[1]], vw, vh),
  );
  const eyeB = midpoint(
    toPoint(landmarks[LM_IDX.rightEye[0]], vw, vh),
    toPoint(landmarks[LM_IDX.rightEye[1]], vw, vh),
  );
  const mouthA = toPoint(landmarks[LM_IDX.mouthCorners[0]], vw, vh);
  const mouthB = toPoint(landmarks[LM_IDX.mouthCorners[1]], vw, vh);

  const [leftEye, rightEye] = eyeA[0] <= eyeB[0] ? [eyeA, eyeB] : [eyeB, eyeA];
  const [leftMouth, rightMouth] = mouthA[0] <= mouthB[0] ? [mouthA, mouthB] : [mouthB, mouthA];

  const src: Point[] = [
    leftEye,
    rightEye,
    toPoint(landmarks[LM_IDX.nose], vw, vh),
    leftMouth,
    rightMouth,
  ];

  const [a, b, tx, ty] = estimateSimilarityTransform(src, DST);

  const srcCanvas = document.createElement('canvas');
  srcCanvas.width = vw;
  srcCanvas.height = vh;
  const srcCtx = srcCanvas.getContext('2d');
  if (!srcCtx) return null;
  srcCtx.drawImage(video, 0, 0, vw, vh);

  const dstCanvas = document.createElement('canvas');
  dstCanvas.width = 112;
  dstCanvas.height = 112;
  const dstCtx = dstCanvas.getContext('2d');
  if (!dstCtx) return null;

  // Canvas transforms source coordinates into destination canvas coordinates.
  dstCtx.setTransform(a, b, -b, a, tx, ty);
  dstCtx.drawImage(srcCanvas, 0, 0);
  dstCtx.setTransform(1, 0, 0, 1, 0, 0);

  return dstCtx.getImageData(0, 0, 112, 112);
}

/**
 * Convert a 112x112 RGBA ImageData to an ArcFace NCHW tensor.
 * Normalization matches InsightFace: (pixel - 127.5) / 127.5.
 */
export function imageDataToFloat32(img: ImageData): Float32Array {
  const { data } = img;
  const tensor = new Float32Array(1 * 3 * 112 * 112);
  const npx = 112 * 112;

  for (let i = 0; i < npx; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];

    tensor[i] = (r - 127.5) / 127.5;
    tensor[npx + i] = (g - 127.5) / 127.5;
    tensor[2 * npx + i] = (b - 127.5) / 127.5;
  }

  return tensor;
}
