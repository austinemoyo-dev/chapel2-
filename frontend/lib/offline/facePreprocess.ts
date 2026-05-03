'use client';
// ============================================================================
// facePreprocess — ArcFace face alignment and tensor preparation.
//
// ArcFace expects a 112×112 RGB image of an ALIGNED face.
// "Aligned" means the 5 key facial landmarks (eyes, nose, mouth corners)
// are warped to match a fixed standard template, so the network always
// sees the face in the same canonical pose regardless of head angle.
//
// This file:
//   1. Takes 5 detected landmark coordinates + raw video frame
//   2. Estimates a 2-D similarity transform (scale + rotation + translation)
//      that maps the detected points to the ArcFace standard template
//   3. Applies that transform to extract a 112×112 crop via canvas 2D
//   4. Converts the pixel data to a float32 NCHW tensor
// ============================================================================

// ArcFace standard 5-point face template for 112×112 crop.
// Order: left_eye, right_eye, nose, left_mouth_corner, right_mouth_corner.
const DST: [number, number][] = [
  [38.2946, 51.6963],
  [73.5318, 51.5014],
  [56.0252, 71.7366],
  [41.5493, 92.3655],
  [70.7299, 92.2041],
];

// MediaPipe FaceLandmarker landmark indices for the 5 alignment points.
const LM_IDX = {
  leftEye:    159,
  rightEye:   386,
  nose:         1,
  leftMouth:   61,
  rightMouth: 291,
} as const;

type Point = [number, number];

/** Solve for a similarity transform (scale, rotation, tx, ty) using
 *  the least-squares closed-form solution over matched point pairs.
 *
 *  Returns a 2×3 matrix [[a, b, tx], [-b, a, ty]] where:
 *    a =  s·cos θ
 *    b =  s·sin θ
 */
function estimateSimilarityTransform(src: Point[], dst: Point[]): number[][] {
  const n = src.length;
  let a = 0, b = 0, cx = 0, cy = 0;
  let sx = 0, sy = 0, sxx = 0, sxy = 0, syx = 0, syy = 0;

  for (let i = 0; i < n; i++) {
    const [x, y] = src[i];
    const [u, v] = dst[i];
    cx  += x; cy  += y;
    sx  += u; sy  += v;
    sxx += x * u; sxy += x * v;
    syx += y * u; syy += y * v;
  }

  const W  = n;
  const det = (sxx + syy) - (cx * sx + cy * sy) / W;
  if (Math.abs(det) < 1e-10) {
    // Degenerate — return identity
    return [[1, 0, 0], [0, 1, 0]];
  }

  a = ((sxx + syy) - (cx * sx + cy * sy) / W) / (det !== 0 ? det : 1);
  b = ((syx - sxy) - (cy * sx - cx * sy) / W) / (det !== 0 ? det : 1);

  const tx = (sx - a * cx - b * cy) / W;
  const ty = (sy + b * cx - a * cy) / W;

  return [[a, b, tx], [-b, a, ty]];
}

/**
 * Extract and align a 112×112 face crop from the current video frame.
 *
 * @param video     The live HTMLVideoElement (camera stream)
 * @param landmarks MediaPipe landmark array (normalised 0–1 coords)
 * @param vw        Video natural width in pixels
 * @param vh        Video natural height in pixels
 * @returns         ImageData of the 112×112 aligned crop, or null if failed
 */
export function alignFace(
  video: HTMLVideoElement,
  landmarks: { x: number; y: number; z: number }[],
  vw: number,
  vh: number,
): ImageData | null {
  if (!landmarks || landmarks.length < 400) return null;

  // Extract 5 source points (convert normalised → pixel coords)
  const src: Point[] = [
    [landmarks[LM_IDX.leftEye].x    * vw, landmarks[LM_IDX.leftEye].y    * vh],
    [landmarks[LM_IDX.rightEye].x   * vw, landmarks[LM_IDX.rightEye].y   * vh],
    [landmarks[LM_IDX.nose].x       * vw, landmarks[LM_IDX.nose].y       * vh],
    [landmarks[LM_IDX.leftMouth].x  * vw, landmarks[LM_IDX.leftMouth].y  * vh],
    [landmarks[LM_IDX.rightMouth].x * vw, landmarks[LM_IDX.rightMouth].y * vh],
  ];

  const M = estimateSimilarityTransform(src, DST);
  const [[a, b, tx], [nb, na, ty]] = M; // nb = -b, na = a

  // Draw the full video frame onto an off-screen canvas, then apply the
  // inverse transform to extract the 112×112 region.
  const src_canvas = document.createElement('canvas');
  src_canvas.width  = vw;
  src_canvas.height = vh;
  const sc = src_canvas.getContext('2d')!;
  sc.drawImage(video, 0, 0, vw, vh);

  const dst_canvas = document.createElement('canvas');
  dst_canvas.width  = 112;
  dst_canvas.height = 112;
  const dc = dst_canvas.getContext('2d')!;

  // Apply the transform: for each destination pixel (u, v),
  // we need the inverse mapping back to source (x, y).
  // M maps src→dst: [u, v] = M·[x, y, 1]
  // So inverse M maps dst→src.
  const det = a * na - b * nb;  // = a*a + b*b
  if (Math.abs(det) < 1e-10) return null;

  const invA  =  na / det;
  const invB  = -b  / det;
  const invNB = -nb / det;
  const invNA =  a  / det;
  const invTX = -(invA * tx + invB  * ty);
  const invTY = -(invNB * tx + invNA * ty);

  dc.setTransform(invA, invNB, invB, invNA, invTX, invTY);
  dc.drawImage(src_canvas, 0, 0);
  dc.setTransform(1, 0, 0, 1, 0, 0);

  return dc.getImageData(0, 0, 112, 112);
}

/**
 * Convert a 112×112 RGBA ImageData to an ArcFace float32 NCHW tensor.
 * Normalisation: (pixel − 127.5) / 128.0  →  range ≈ [−1, 1]
 * Output shape: [1, 3, 112, 112] (batch=1, RGB channels, H, W)
 */
export function imageDataToFloat32(img: ImageData): Float32Array {
  const { data } = img; // RGBA, 112*112*4 bytes
  const tensor = new Float32Array(1 * 3 * 112 * 112);
  const npx = 112 * 112;

  for (let i = 0; i < npx; i++) {
    const r = data[i * 4];
    const g = data[i * 4 + 1];
    const b = data[i * 4 + 2];
    tensor[i]           = (r - 127.5) / 128.0; // channel 0 (R)
    tensor[npx + i]     = (g - 127.5) / 128.0; // channel 1 (G)
    tensor[2 * npx + i] = (b - 127.5) / 128.0; // channel 2 (B)
  }

  return tensor;
}
