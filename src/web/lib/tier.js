// Quality tier: ?q=high|med|low overrides; otherwise phones/tablets -> low, software or integrated GPUs -> med.
import { TIERS } from "../config.js";

export function detectTier(renderer, param) {
  if (param && TIERS[param]) return { name: param, ...TIERS[param] };
  const ua = navigator.userAgent;
  const mobile = /iPhone|iPad|Android|Mobile/i.test(ua) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(ua) && innerWidth < 1100);
  let gpu = "";
  try { const gl = renderer.getContext(); const d = gl.getExtension("WEBGL_debug_renderer_info"); gpu = d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); } catch { /* ignore */ }
  let name = "high";
  if (mobile) name = "low";
  else if (/SwiftShader|llvmpipe|Software|Intel\(R\) (UHD|HD)/i.test(gpu)) name = "med";
  return { name, gpu, ...TIERS[name] };
}
