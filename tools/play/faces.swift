import AppKit
import Foundation
import Vision

// Face count for a still, plus the text Vision reads (so a plate can be dropped).
// Prints one JSON line: {"faces":0,"text":["..."]}
// Usage: swift tools/play/faces.swift path/to/image.jpg

let args = Array(CommandLine.arguments.dropFirst())
if args.count != 1 {
  fputs("usage: faces.swift <image>\n", stderr)
  exit(2)
}

let url = URL(fileURLWithPath: args[0])
guard let image = NSImage(contentsOf: url) else {
  fputs("unreadable\n", stderr)
  exit(2)
}
var rect = NSRect(origin: .zero, size: image.size)
guard let cg = image.cgImage(forProposedRect: &rect, context: nil, hints: nil) else {
  fputs("unreadable\n", stderr)
  exit(2)
}

let faces = VNDetectFaceRectanglesRequest()
let text = VNRecognizeTextRequest()
text.recognitionLevel = .fast
text.usesLanguageCorrection = false
text.recognitionLanguages = ["ja-JP", "en-US"]

let handler = VNImageRequestHandler(cgImage: cg, options: [:])
do {
  try handler.perform([faces, text])
} catch {
  fputs("vision\n", stderr)
  exit(2)
}

let n = faces.results?.count ?? 0
let lines = (text.results ?? []).compactMap { $0.topCandidates(1).first?.string }
let payload: [String: Any] = ["faces": n, "text": lines]
guard let data = try? JSONSerialization.data(withJSONObject: payload),
      let line = String(data: data, encoding: .utf8) else {
  fputs("json\n", stderr)
  exit(2)
}
print(line)
