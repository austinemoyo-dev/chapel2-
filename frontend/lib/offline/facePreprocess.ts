'use client';
// ============================================================================
// facePreprocess — ArcFace face alignment and tensor preparation.
//
// The 5 source landmarks must match InsightFace's RetinaFace detections as
// closely as possible so client-side ArcFace embeddings are comparable to
// the server-stored InsightFace embeddings.
//
// MediaPipe FaceLandmarker (478-point model) provides iris center landmarks:
//   468 = left iris center  (equivalent to RetinaFace left-eye keypoint)
//   473 = right iris center (equivalent to RetinaFace right-eye keypoint)
// When iris landmarks are unavailable we fall back to eye-corner midpoints.
// ============================================================================

// ArcFace 112×112 five-point template — identical to InsightFace's reference.
// Order: left_eye, right_eye, nose_tip, left_mouth_corner, right_mouth_corner.
const DST: [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

// Primary landmark indices (iris centers — closest to RetinaFace keypoints).
// Fallback eye-corner pairs used when iris detection is unavailable.
const LM = {
  leftIris:    468,
  rightIris:   473,
  leftEyeA:     33,  // inner corner
  leftEyeB:    133,  // outer corner
  rightEyeA:   362,
  rightEyeB:   263,
  nose:          1,
  leftMouth:    61,
  rightMouth:  291,
} as const;

type Point = [number, number];

function toPoint(lm: { x: number; y: number }, vw: number, vh: number): Point {
  return [lm.x * vw, lm.y * vh];
}

function midpoint(a: Point, b: Point): Point {
  return [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
}

/**
 * Return the best available eye-center point.
 * Prefers the iris center landmark (most accurate); falls back to the
 * midpoint of the two eye-corner landmarks when iris is not detected.
 */
function eyeCenter(
  landmarks: { x: number; y: number; z: number }[],
  iris: number,
  cornerA: number,
  cornerB: number,
  vw: number,
  vh: number,
): Point {
  if (landmarks.length > iris) {
    return toPoint(landmarks[iris], vw, vh);
  }
  return midpoint(toPoint(landmarks[cornerA], vw, vh), toPoint(landmarks[cornerB], vw, vh));
}

/**
 * Least-squares similarity transform (scale + rotation + translation) that
 * maps src points to dst points:
 *   u = a·x − b·y + tx
 *   v = b·x + a·y + ty
 */
function estimateSimilarityTransform(src: Point[], dst: Point[]): [number, number, number, number] {
  const n = src.length;
  let srcCx = 0, srcCy = 0, dstCx = 0, dstCy = 0;
  for (let i = 0; i < n; i++) {
    srcCx += src[i][0]; srcCy += src[i][1];
    dstCx += dst[i][0]; dstCy += dst[i][1];
  }
  srcCx /= n; srcCy /= n; dstCx /= n; dstCy /= n;

  let numA = 0, numB = 0, den = 0;
  for (let i = 0; i < n; i++) {
    const x = src[i][0] - srcCx, y = src[i][1] - srcCy;
    const u = dst[i][0] - dstCx, v = dst[i][1] - dstCy;
    numA += x * u + y * v;
    numB += x * v - y * u;
    den  += x * x + y * y;
  }

  if (den < 1e-10) return [1, 0, 0, 0];

  const a = numA / den;
  const b = numB / den;
  const tx = dstCx - a * srcCx + b * srcCy;
  const ty = dstCy - b * srcCx - a * srcCy;
  return [a, b, tx, ty];
}

/**
 * Extract and align a 112×112 face crop from the current video frame,
 * using the same 5-point alignment as InsightFace's buffalo_l pipeline.
 */
export function alignFace(
  video: HTMLVideoElement,
  landmarks: { x: number; y: number; z: number }[],
  vw: number,
  vh: number,
): ImageData | null {
  if (!landmarks || landmarks.length < 400) return null;

  const leftEye  = eyeCenter(landmarks, LM.leftIris,  LM.leftEyeA,  LM.leftEyeB,  vw, vh);
  const rightEye = eyeCenter(landmarks, LM.rightIris, LM.rightEyeA, LM.rightEyeB, vw, vh);

  // Ensure left/right ordering is correct regardless of camera mirroring.
  const [le, re] = leftEye[0] <= rightEye[0] ? [leftEye, rightEye] : [rightEye, leftEye];

  const mouthL = toPoint(landmarks[LM.leftMouth],  vw, vh);
  const mouthR = toPoint(landmarks[LM.rightMouth], vw, vh);
  const [lm, rm] = mouthL[0] <= mouthR[0] ? [mouthL, mouthR] : [mouthR, mouthL];

  const src: Point[] = [
    le,
    re,
    toPoint(landmarks[LM.nose], vw, vh),
    lm,
    rm,
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
