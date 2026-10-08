// [mobile-perf] HSR micro-benchmark: does a fragment shader that CAN discard (but never does) cost shading on an Apple GPU?
// L opaque full-screen layers, depth-tested, back to front and front to back, with a moderately heavy fragment shader. Two
// pipelines: plain, and the same shader with `if (u.never > 0.5) discard_fragment();` (u.never = 0 at run time). GPU ms from the
// command buffers' gpuStartTime/gpuEndTime, median of R runs. Why: world/explore/sbatch.js's fades put such a discard in every
// stream pool's program (WebGL's discard becomes discard_fragment() under ANGLE's Metal backend), and an iPhone's GPU is the same
// tile-based family with the same hidden-surface removal.
//   swiftc -O tools/perf/hsr-discard.swift -o /tmp/hsr && /tmp/hsr 585 1266      (the phone's 1.5x scene; 1170 2532: the screen)
// the build machine (Apple M2 Max), 2026-10-08, 6 layers: plain 0.19 ms either order; discard back to front 1.09 ms (5.7x: every layer
// shaded), front to back 0.19 ms. At 1170 x 2532: 0.69 / 4.12 / 0.69 / 0.69.
import Metal
import Foundation

let src = """
#include <metal_stdlib>
using namespace metal;
struct V { float4 pos [[position]]; float layer; };
struct U { float never; float layers; };
vertex V vs(uint vid [[vertex_id]], uint iid [[instance_id]], constant U& u [[buffer(0)]], constant uint& order [[buffer(1)]]) {
  float2 p = float2((vid << 1) & 2, vid & 2) * 2.0 - 1.0;            // a full-screen triangle
  float k = order == 0 ? float(iid) : (u.layers - 1.0 - float(iid));   // 0: back to front (far first), 1: front to back
  V o; o.pos = float4(p, 0.9 - 0.8 * k / max(1.0, u.layers - 1.0), 1.0); o.layer = k; return o;
}
fragment half4 fs_plain(V in [[stage_in]], constant U& u [[buffer(0)]]) {
  float a = in.layer * 0.37 + in.pos.x * 0.001;
  for (int i = 0; i < 48; i++) { a = fract(sin(a * 12.9898 + float(i)) * 43758.5453); }
  return half4(a, a * 0.5, 1.0 - a, 1.0);
}
fragment half4 fs_discard(V in [[stage_in]], constant U& u [[buffer(0)]]) {
  if (u.never > 0.5) discard_fragment();
  float a = in.layer * 0.37 + in.pos.x * 0.001;
  for (int i = 0; i < 48; i++) { a = fract(sin(a * 12.9898 + float(i)) * 43758.5453); }
  return half4(a, a * 0.5, 1.0 - a, 1.0);
}
"""
let dev = MTLCreateSystemDefaultDevice()!
let lib = try! dev.makeLibrary(source: src, options: nil)
let q = dev.makeCommandQueue()!
func pipe(_ fs: String) -> MTLRenderPipelineState {
  let d = MTLRenderPipelineDescriptor()
  d.vertexFunction = lib.makeFunction(name: "vs"); d.fragmentFunction = lib.makeFunction(name: fs)
  d.colorAttachments[0].pixelFormat = .rgba16Float; d.depthAttachmentPixelFormat = .depth32Float
  return try! dev.makeRenderPipelineState(descriptor: d)
}
let plain = pipe("fs_plain"), disc = pipe("fs_discard")
let dsd = MTLDepthStencilDescriptor(); dsd.depthCompareFunction = .less; dsd.isDepthWriteEnabled = true
let ds = dev.makeDepthStencilState(descriptor: dsd)!
let W = Int(CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "585")!, H = Int(CommandLine.arguments.count > 2 ? CommandLine.arguments[2] : "1266")!
let L = 6, FRAMES = 20, R = 7
func tex(_ f: MTLPixelFormat) -> MTLTexture { let t = MTLTextureDescriptor.texture2DDescriptor(pixelFormat: f, width: W, height: H, mipmapped: false); t.usage = .renderTarget; t.storageMode = .private; return dev.makeTexture(descriptor: t)! }
let color = tex(.rgba16Float), depth = tex(.depth32Float)
func run(_ p: MTLRenderPipelineState, order: UInt32) -> Double {
  var times: [Double] = []
  for _ in 0..<R {
    let cb = q.makeCommandBuffer()!
    for _ in 0..<FRAMES {
      let rp = MTLRenderPassDescriptor()
      rp.colorAttachments[0].texture = color; rp.colorAttachments[0].loadAction = .clear; rp.colorAttachments[0].storeAction = .store
      rp.depthAttachment.texture = depth; rp.depthAttachment.loadAction = .clear; rp.depthAttachment.clearDepth = 1.0; rp.depthAttachment.storeAction = .dontCare
      let e = cb.makeRenderCommandEncoder(descriptor: rp)!
      e.setRenderPipelineState(p); e.setDepthStencilState(ds)
      var u: (Float, Float) = (0, Float(L)); var o = order
      e.setVertexBytes(&u, length: 8, index: 0); e.setFragmentBytes(&u, length: 8, index: 0); e.setVertexBytes(&o, length: 4, index: 1)
      e.drawPrimitives(type: .triangle, vertexStart: 0, vertexCount: 3, instanceCount: L)
      e.endEncoding()
    }
    cb.commit(); cb.waitUntilCompleted()
    times.append((cb.gpuEndTime - cb.gpuStartTime) * 1000 / Double(FRAMES))
  }
  times.sort(); return times[R / 2]
}
_ = run(plain, order: 0); _ = run(disc, order: 0)   // warm
let r = [("plain back-to-front", run(plain, order: 0)), ("discard back-to-front", run(disc, order: 0)),
         ("plain front-to-back", run(plain, order: 1)), ("discard front-to-back", run(disc, order: 1))]
print("\(dev.name) \(W)x\(H), \(L) layers, ms per frame (median of \(R) x \(FRAMES) frames):")
for (k, v) in r { print(String(format: "  %-24@ %.3f", k as NSString, v)) }
